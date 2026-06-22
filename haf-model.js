/* =============================================================================
 * HAF KNECT + PLNA — SHARED MODEL  (window.HAFModel)
 * -----------------------------------------------------------------------------
 * Single source of truth for the connective spine of the Master Build Spec AND
 * the KNECT/PLNA/Freight/Business tier framework (doc: HAF_KNECT_PLNA_FREIGHT_
 * TIER_FRAMEWORK_FOR_OTIS):
 *   §3  Compliance gate (6 states -> what a driver may access)
 *   §6  KNECT membership (Free vs Activated Member) + milestone activation price
 *   §10 PLNA plans (Lite £0 / Plus £10 / Pro £50) + their rate/fee benefits
 *   Account types (driver | business | freight_forward | customer)
 *   Freight Forward tiers (Free / Plus / Pro) — poster-side fees, users, teams
 *   Business Accounts (free, internal-only, discounted fees + usage rebates)
 *   Poster-side network-fee resolver + job-post validation + rebate bands
 *
 * BOTH KNECT and PLNA load this file, so the two "separate but connected"
 * systems share ONE identity, ONE compliance gate, ONE tier table and ONE set
 * of pricing levers. The pricing engine consumes resolveBenefits() (driver side)
 * and resolvePosterFee() (poster side) so paid tiers earn more / pay less and
 * the correct network fee is applied by account type — exactly as the framework
 * requires.
 *
 * NOTHING is hard-coded into UI only: every price, fee level, modifier, user
 * limit and rebate band lives here as a configurable record (and is mirrored
 * into the DB config tables in hub/db/migrations/0003_accounts_and_tiers.sql).
 *
 * TRIAL STRUCTURE: every number below is illustrative and tunable. These are
 * eligibility/benefit settings for testing — NOT guaranteed returns. Wording is
 * deliberately "access / eligibility / opportunity", never "guaranteed".
 * ===========================================================================*/
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // 1. COMPLIANCE GATE  (§3)
  // Clever Check status decides what the one shared account may reach.
  // ---------------------------------------------------------------------------
  // Every gated area in either system maps to one of these keys.
  var AREAS = [
    "profile",            // driver / vehicle / compliance profile
    "complianceUpload",   // upload + renew documents, Clever Check progress
    "onboarding",         // onboarding checklist
    "support",            // support / messages
    "plnaPlanner",        // PLNA route/availability/return-route tools
    "jobBoard",           // see available jobs
    "jobMatching",        // live PLNA<->KNECT job matching
    "newJobAccept",       // accept a new job
    "backload",           // backload / return-route matching
    "relay",              // relay / groupage board (also needs eligibility)
    "profitShare",        // profit-share eligibility view (also needs eligibility)
    "containerCollective",// Container Collective opportunities (also needs eligibility)
    "rewards"             // driver / referral rewards
  ];

  var COMPLIANCE = {
    PENDING: {
      label: "Pending", tone: "s-warn",
      message: "Finish Clever Check to unlock the network.",
      allow: ["profile", "complianceUpload", "onboarding", "support"]
    },
    ACTIVE: {
      label: "Active", tone: "s-good",
      message: "Compliant — full access.",
      allow: AREAS.slice()           // everything (subject to eligibility/tier)
    },
    EXPIRING_SOON: {
      label: "Expiring Soon", tone: "s-warn", warn: true,
      message: "Compliance expires soon — renew to avoid losing access.",
      allow: AREAS.slice()           // still fully working, but warned + reminded
    },
    EXPIRED: {
      label: "Expired", tone: "s-bad",
      message: "Compliance expired — renew to restore jobs and PLNA tools.",
      allow: ["profile", "complianceUpload", "onboarding", "support"]
    },
    FAILED: {
      label: "Failed", tone: "s-bad",
      message: "Clever Check failed — fix documents to restore access.",
      allow: ["profile", "complianceUpload", "support"]
    },
    SUSPENDED: {
      label: "Suspended", tone: "s-bad",
      message: "Account suspended — contact HAF support.",
      allow: ["profile", "support"]
    }
  };

  // Is `area` reachable for a driver in compliance `state`?
  function canAccess(state, area) {
    var s = COMPLIANCE[state] || COMPLIANCE.PENDING;
    return s.allow.indexOf(area) !== -1;
  }
  // The whole gate for a state: { state, label, tone, warn, message, allow{}, locked }
  function gate(state) {
    var key = (state || "PENDING").toUpperCase();
    var s = COMPLIANCE[key] || COMPLIANCE.PENDING;
    var allow = {};
    AREAS.forEach(function (a) { allow[a] = s.allow.indexOf(a) !== -1; });
    return {
      state: key, label: s.label, tone: s.tone, warn: !!s.warn,
      message: s.message, allow: allow,
      // "locked" = the driver cannot work right now (no planner, no jobs)
      locked: !(allow.plnaPlanner && allow.jobBoard)
    };
  }

  // ---------------------------------------------------------------------------
  // 2. KNECT MEMBERSHIP  (§6) — Free vs Activated Member (one-off activation)
  // ---------------------------------------------------------------------------
  var MEMBERSHIP = {
    FREE: {
      code: "FREE", name: "KNECT Free", fee: "Free to join",
      message: "Join the network.",
      // benefit deltas (illustrative, trial)
      rateUpliftPct: 0,        // extra % the driver keeps on base pay
      feeReductionPts: 0,      // points knocked off the HAF network fee %
      relay: false, profitShare: false, containerCollective: false,
      priorityVisibility: false
    },
    ACTIVATED: {
      code: "ACTIVATED", name: "KNECT Activated Member", fee: "One-off activation fee",
      message: "Activated members help build the network and keep more of what they earn.",
      rateUpliftPct: 3,
      feeReductionPts: 3,
      relay: true, profitShare: true, containerCollective: true,
      priorityVisibility: true
    }
  };

  // 2.1 KNECT ACTIVATION MILESTONE PRICING (§2.3, §14)
  // Free to JOIN, paid to ACTIVATE. The one-off activation price climbs as the
  // network proves value. `currentMilestone` is the single switch admin changes;
  // every "activation price" read flows through activationPrice() so the UI is
  // never hard-coded. Prices are in whole GBP, one-off.
  var KNECT_ACTIVATION = {
    currentMilestone: "LAUNCH",            // LAUNCH | M1 | M2 | M3  (admin-set)
    milestones: [
      { code: "LAUNCH", name: "Launch",      priceGbp: 100,  note: "Early driver growth phase" },
      { code: "M1",     name: "Milestone 1", priceGbp: 250,  note: "More live work, stronger driver value" },
      { code: "M2",     name: "Milestone 2", priceGbp: 500,  note: "Network has proven job flow" },
      { code: "M3",     name: "Milestone 3", priceGbp: 1000, note: "Established HAF KNECT ecosystem" }
    ],
    facingWording: "Join HAF KNECT for free. Full activation starts at £100 during launch and increases as the network grows."
  };

  // The active activation milestone record (defaults to LAUNCH if mis-set).
  function activationMilestone() {
    var code = (KNECT_ACTIVATION.currentMilestone || "LAUNCH").toUpperCase();
    return KNECT_ACTIVATION.milestones.find(function (m) { return m.code === code; })
        || KNECT_ACTIVATION.milestones[0];
  }
  // Current one-off activation price in GBP.
  function activationPrice() { return activationMilestone().priceGbp; }

  // ---------------------------------------------------------------------------
  // 3. PLNA PLANS  (§3, §14) — Lite £0 / Plus £10 / Pro £50
  // PLNA is the DRIVER improvement layer: better network fee, better base rate,
  // and AI capability (full only on Pro). JUDD is the driver-side AI brand.
  // ---------------------------------------------------------------------------
  var PLAN = {
    LITE: {
      code: "LITE", name: "PLNA Lite", priceGbpMonth: 0, price: "£0/month",
      tagline: "Plan your courier work.",
      rateUpliftPct: 0, feeReductionPts: 0,
      ai: "none", landingPage: false, priorityMatch: false,
      features: [
        "Driver + vehicle profile", "Availability", "Basic route planner",
        "Compliance view", "KNECT connection", "Basic area preferences"
      ],
      facingWording: "Use PLNA Lite to tell HAF where you are, when you are available and what routes you want."
    },
    PLUS: {
      code: "PLUS", name: "PLNA Plus", priceGbpMonth: 10, price: "£10/month",
      tagline: "Plan better. Earn better.",
      rateUpliftPct: 2, feeReductionPts: 2,
      ai: "basic", landingPage: false, priorityMatch: true,
      features: [
        "Everything in Lite", "Better route planning", "Return-route alerts",
        "Priority job alerts", "Improved fee/base-rate on eligible jobs",
        "Basic AI support", "Driver earning suggestions"
      ],
      facingWording: "PLNA Plus helps drivers plan better days, reduce wasted miles and unlock better job economics."
    },
    PRO: {
      code: "PRO", name: "PLNA Pro", priceGbpMonth: 50, price: "£50/month",
      tagline: "Build your local courier brand with HAF behind you.",
      rateUpliftPct: 5, feeReductionPts: 5,
      ai: "full", landingPage: true, requiresOwnDomain: true, priorityMatch: true,
      features: [
        "Everything in Plus", "Full JUDD AI support", "Best base-rate % on eligible jobs",
        "Best network fee reduction", "Route planning assistance", "Job pricing guidance",
        "First 5 clients playbook", "Landing page support", "Customer pipeline support",
        "Weekly driver growth actions", "Priority KNECT visibility"
      ],
      facingWording: "PLNA Pro helps drivers plan, price, promote and grow their courier business with full AI support."
    }
  };

  // ---------------------------------------------------------------------------
  // 4. BENEFIT RESOLVER — membership + plan stack into DRIVER pricing levers (§4)
  // The pricing engine calls this so paid tiers earn more and pay lower fees.
  // Floors keep the trial sane: fee never below FEE_FLOOR_PCT, uplift capped.
  // These improvements apply ONLY on eligible jobs and never break HAF margin
  // (the engine enforces feeFloorPct; eligibility is checked per job type).
  // ---------------------------------------------------------------------------
  var FEE_FLOOR_PCT = 8;       // HAF network fee never trimmed below this
  var MAX_RATE_UPLIFT_PCT = 12; // combined driver uplift cap

  function resolveBenefits(membershipCode, planCode) {
    var m = MEMBERSHIP[(membershipCode || "FREE").toUpperCase()] || MEMBERSHIP.FREE;
    var p = PLAN[(planCode || "LITE").toUpperCase()] || PLAN.LITE;
    var rateUpliftPct = Math.min(MAX_RATE_UPLIFT_PCT, m.rateUpliftPct + p.rateUpliftPct);
    var feeReductionPts = m.feeReductionPts + p.feeReductionPts;
    return {
      membership: m.code, plan: p.code,
      rateUpliftPct: rateUpliftPct,       // driver keeps this much extra on base pay
      feeReductionPts: feeReductionPts,   // points off the HAF network fee
      feeFloorPct: FEE_FLOOR_PCT,
      relay: m.relay,                     // relay is a MEMBERSHIP benefit
      profitShare: m.profitShare,
      containerCollective: m.containerCollective,
      priorityVisibility: m.priorityVisibility || p.code === "PRO",
      ai: p.ai, landingPage: p.landingPage,
      // human-readable benefit lines for UI
      notes: buildBenefitNotes(m, p, rateUpliftPct, feeReductionPts)
    };
  }

  function buildBenefitNotes(m, p, uplift, feeCut) {
    var n = [];
    if (uplift > 0) n.push("+" + uplift + "% kept on base rate");
    if (feeCut > 0) n.push("-" + feeCut + " pts network fee");
    if (m.relay) n.push("Relay access");
    if (m.profitShare) n.push("Profit-share eligible");
    if (p.ai === "full") n.push("Full JUDD AI");
    else if (p.ai === "basic") n.push("Basic AI support");
    return n;
  }

  // ---------------------------------------------------------------------------
  // 5. RELAY / PROFIT-SHARE / CONTAINER ELIGIBILITY (§7.6/§7.7/§7.8)
  // Eligibility = paid member + compliant + active + not suspended.
  // This is ELIGIBILITY only — never a guarantee of work or returns.
  // ---------------------------------------------------------------------------
  function isEligible(opportunity, driver) {
    var membership = (driver && driver.membership) || "FREE";
    var state = (driver && driver.complianceStatus) || "PENDING";
    var m = MEMBERSHIP[membership.toUpperCase()] || MEMBERSHIP.FREE;
    var compliantNow = state === "ACTIVE" || state === "EXPIRING_SOON";
    var base = m[opportunity] === true && compliantNow;
    if (!base) return false;
    if (opportunity === "relay") {
      // §7.6 also wants an active PLNA profile + good record
      return !!(driver && driver.plnaActive !== false && (driver.score == null || driver.score >= 3.5));
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // 6. ACCOUNT TYPES  (framework §7) — who may post what.
  // The hard separation the framework demands: Business = own goods only,
  // Freight Forward = third-party allowed, Driver = driver-side, Customer = guest.
  // ---------------------------------------------------------------------------
  var ACCOUNT_TYPES = {
    driver: {
      code: "driver", name: "Driver Account",
      canMoveOwnGoods: false, canPostThirdParty: false,
      monthlyFee: "Optional PLNA monthly", note: "Driver-side account"
    },
    business: {
      code: "business", name: "Business Account",
      canMoveOwnGoods: true, canPostThirdParty: false,
      monthlyFee: "Free", note: "Own consignments only"
    },
    freight_forward: {
      code: "freight_forward", name: "Freight Forward Account",
      canMoveOwnGoods: true, canPostThirdParty: true,
      monthlyFee: "Free / £50 / £100 by tier", note: "Third-party load posting"
    },
    customer: {
      code: "customer", name: "Customer / Guest",
      canMoveOwnGoods: true, canPostThirdParty: false,
      monthlyFee: "None", note: "One-off / guest quote use"
    }
  };

  // ---------------------------------------------------------------------------
  // 7. FREIGHT FORWARD TIERS  (§5) — load-poster accounts for third-party freight.
  // posterFeeAdjPts = points ADDED to the job-type base network fee. Free pays
  // the HIGHEST fee (positive), Plus reduced, Pro the best (most negative). This
  // is the POSTER side of the network fee, separate from the DRIVER side above.
  // ---------------------------------------------------------------------------
  var FREIGHT_TIERS = {
    FREE: {
      code: "FREE", name: "Freight Forward Free", priceGbpMonth: 0, price: "Free",
      posterFeeAdjPts: 4, networkFeeLevel: "Highest per live post",
      baseUserLimit: 1, extraUsersAllowed: false, extraUserPriceGbpMonth: 0,
      multiTeam: false, savedLanes: false, priorityMatching: "none",
      features: [
        "Create freight forward account", "Post live work into HAF KNECT",
        "1 user", "Basic dashboard", "Standard job visibility", "Basic support"
      ],
      facingWording: "Post into the HAF KNECT network with no monthly fee. Pay higher network fees per live post."
    },
    PLUS: {
      code: "PLUS", name: "Freight Forward Plus", priceGbpMonth: 50, price: "£50/month",
      posterFeeAdjPts: 0, networkFeeLevel: "Reduced",
      baseUserLimit: 1, extraUsersAllowed: true, extraUserPriceGbpMonth: 10,
      multiTeam: false, savedLanes: true, priorityMatching: "standard",
      features: [
        "Everything in Free", "Reduced network fees", "Better dashboard",
        "Saved lanes/routes", "Repeat posting tools", "Extra users £10/mo each",
        "Better support", "Monthly activity view"
      ],
      facingWording: "Freight Forward Plus gives regular load posters reduced network fees, saved lanes and extra user options."
    },
    PRO: {
      code: "PRO", name: "Freight Forward Pro", priceGbpMonth: 100, price: "£100/month",
      posterFeeAdjPts: -3, networkFeeLevel: "Best freight-forward rate",
      baseUserLimit: 99, extraUsersAllowed: true, extraUserPriceGbpMonth: 10,
      multiTeam: true, savedLanes: true, priorityMatching: "priority",
      features: [
        "Everything in Plus", "Best freight-forward network fee", "Multi-team use",
        "Multi-user access", "Team/branch separation", "Priority posting",
        "Priority matching", "Better reporting", "Regular lane management",
        "Priority HAF support"
      ],
      facingWording: "Freight Forward Pro is built for freight teams that need multi-team access, better reporting and the best HAF KNECT posting rates."
    }
  };

  // ---------------------------------------------------------------------------
  // 8. BUSINESS ACCOUNTS  (§6) — free, internal-only, discounted fees + rebates.
  // A business moves ITS OWN goods only. It may NOT post third-party freight or
  // resell KNECT capacity (that needs a Freight Forward tier). It pays a fee
  // discounted against one-off/guest use and earns usage-based account credit.
  // ---------------------------------------------------------------------------
  var BUSINESS_ACCOUNT = {
    price: "Free",
    internalOnly: true,
    thirdPartyBlocked: true,
    networkFeeDiscountPts: 3,        // points OFF the job-type base fee vs guest use
    rebateType: "account_credit",    // configurable account credit, never cash payout
    // Usage-based rebate bands on monthly spend through HAF (§6.4). Configurable.
    rebateBands: [
      { minGbp: 0,    maxGbp: 500,      ratePct: 0,   label: "No rebate" },
      { minGbp: 500,  maxGbp: 2000,     ratePct: 1,   label: "1% account credit" },
      { minGbp: 2000, maxGbp: 5000,     ratePct: 2.5, label: "2.5% account credit" },
      { minGbp: 5000, maxGbp: Infinity, ratePct: 5,   label: "5% account credit" }
    ],
    allowedUse: [
      "Internal consignments (warehouse to branch)", "Own customer deliveries",
      "Supplier collections", "Stock transfers", "Repeat business movements"
    ],
    notAllowedUse: [
      "Posting loads for other companies", "Reselling HAF KNECT capacity",
      "Using business discounts for client freight", "Adding unrelated third-party consignments"
    ],
    facingWording: "Create a free HAF Business Account to move your own consignments through the HAF KNECT network. Business Accounts can unlock discounted network fees and usage rebates, but they cannot be used to post third-party freight or resell HAF KNECT capacity.",
    thirdPartyResponse: "This Business Account is for your own consignments only. To post work on behalf of another business or client, please use a Freight Forwarding account."
  };

  // ---------------------------------------------------------------------------
  // 9. POSTER-SIDE FEE RESOLVER (§4 margin rule, §5 freight fees, §6 business)
  // Returns the points to apply to a job-type base network fee for the POSTER
  // side, by account type + plan. Positive = poster pays more; negative = less.
  // The pricing engine applies this to baseFeePct BEFORE driver reductions and
  // never lets the final fee fall below FEE_FLOOR_PCT (HAF margin protected).
  // ---------------------------------------------------------------------------
  function resolvePosterFee(accountType, planTier, opts) {
    opts = opts || {};
    var type = (accountType || "customer").toLowerCase();
    var adjPts = 0, level = "Standard", label = "Guest / one-off network fee";

    if (type === "freight_forward") {
      var t = FREIGHT_TIERS[(planTier || "FREE").toUpperCase()] || FREIGHT_TIERS.FREE;
      adjPts = t.posterFeeAdjPts; level = t.networkFeeLevel;
      label = t.name + " network fee";
    } else if (type === "business") {
      // Discount applies only to approved internal/own-business consignments.
      if (opts.internalConfirmed !== false) {
        adjPts = -BUSINESS_ACCOUNT.networkFeeDiscountPts;
        level = "Discounted (business own-goods)";
        label = "Business Account discounted network fee";
      }
    }
    // driver / customer => standard fee, no adjustment.
    return { accountType: type, plan: (planTier || null), feeAdjPts: adjPts, level: level, label: label };
  }

  // ---------------------------------------------------------------------------
  // 10. REBATE RESOLVER (§6.4) — usage-based account credit for business accounts.
  // ---------------------------------------------------------------------------
  function resolveRebate(monthlySpendGbp) {
    var spend = Math.max(0, Number(monthlySpendGbp) || 0);
    var band = BUSINESS_ACCOUNT.rebateBands.find(function (b) {
      return spend >= b.minGbp && spend < b.maxGbp;
    }) || BUSINESS_ACCOUNT.rebateBands[0];
    var amount = Math.round((spend * band.ratePct / 100) * 100) / 100;
    return {
      monthlySpendGbp: spend, ratePct: band.ratePct, label: band.label,
      rebateAmountGbp: amount, rebateType: BUSINESS_ACCOUNT.rebateType
    };
  }

  // ---------------------------------------------------------------------------
  // 11. JOB-POST VALIDATION (§9) — the gate OTIS/JAKO run BEFORE a job is posted.
  // account: { type, plan, internalConfirmed?, complianceStatus?, membership?,
  //            knectActivated?, cleverpayStatus? }
  // job:     { thirdParty?, internalConsignment? }
  // Returns { allowed, code, message, action } so the UI can block + prompt.
  // ---------------------------------------------------------------------------
  function validateJobPost(account, job) {
    account = account || {}; job = job || {};
    var type = (account.type || "customer").toLowerCase();
    var isThirdParty = !!job.thirdParty;

    // 9.1 Business Account: own consignments only; block third-party freight.
    if (type === "business") {
      if (isThirdParty) {
        return {
          allowed: false, code: "BUSINESS_THIRD_PARTY_BLOCKED",
          message: BUSINESS_ACCOUNT.thirdPartyResponse,
          action: "UPGRADE_TO_FREIGHT_FORWARD"
        };
      }
      if (account.internalConfirmed === false) {
        return {
          allowed: false, code: "BUSINESS_OWN_GOODS_UNCONFIRMED",
          message: "Confirm this is your own business's consignment before posting.",
          action: "CONFIRM_OWN_GOODS"
        };
      }
    }

    // 9.2 Freight Forward: third-party allowed; tier limits enforced at account level.
    if (type === "freight_forward") {
      return { allowed: true, code: "OK_FREIGHT_FORWARD", message: "Third-party posting allowed.", action: null };
    }

    // 9.3 Driver: check KNECT activation + compliance before working a job.
    if (type === "driver") {
      var compliant = account.complianceStatus === "ACTIVE" || account.complianceStatus === "EXPIRING_SOON";
      if (!compliant) {
        return { allowed: false, code: "DRIVER_NOT_COMPLIANT", message: "Finish Clever Check to work jobs.", action: "COMPLETE_COMPLIANCE" };
      }
      if (account.knectActivated === false) {
        return { allowed: false, code: "DRIVER_NOT_ACTIVATED", message: "Activate your KNECT membership for full job access.", action: "ACTIVATE_KNECT" };
      }
    }

    return { allowed: true, code: "OK", message: "Allowed.", action: null };
  }

  // ---------------------------------------------------------------------------
  // VERSION — single one-line bump point for the whole HAF X build. Rendered
  // verbatim in the KNECT topbar badge + system-settings footer line.
  var VERSION = "HAF X V2.1.0";

  root.HAFModel = {
    VERSION: VERSION,
    AREAS: AREAS,
    COMPLIANCE: COMPLIANCE,
    MEMBERSHIP: MEMBERSHIP,
    KNECT_ACTIVATION: KNECT_ACTIVATION,
    PLAN: PLAN,
    ACCOUNT_TYPES: ACCOUNT_TYPES,
    FREIGHT_TIERS: FREIGHT_TIERS,
    BUSINESS_ACCOUNT: BUSINESS_ACCOUNT,
    canAccess: canAccess,
    gate: gate,
    activationMilestone: activationMilestone,
    activationPrice: activationPrice,
    resolveBenefits: resolveBenefits,
    isEligible: isEligible,
    resolvePosterFee: resolvePosterFee,
    resolveRebate: resolveRebate,
    validateJobPost: validateJobPost,
    FEE_FLOOR_PCT: FEE_FLOOR_PCT
  };
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).HAFModel;
}
