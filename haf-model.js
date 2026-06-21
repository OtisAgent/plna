/* =============================================================================
 * HAF KNECT + PLNA — SHARED MODEL  (window.HAFModel)
 * -----------------------------------------------------------------------------
 * Single source of truth for the connective spine of the Master Build Spec:
 *   §3  Compliance gate (6 states -> what a driver may access)
 *   §6  KNECT membership (Free vs Activated Member)
 *   §10 PLNA plans (Lite £0 / Plus £10 / Pro £50) + their rate/fee benefits
 *
 * BOTH KNECT and PLNA load this file, so the two "separate but connected"
 * systems share ONE identity, ONE compliance gate and ONE benefit table.
 * The pricing engine consumes resolveBenefits() so paid tiers earn more and
 * pay lower network fees — exactly as §7.5 requires.
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
  // 2. KNECT MEMBERSHIP  (§6) — Free vs Activated Member (one-off fee)
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

  // ---------------------------------------------------------------------------
  // 3. PLNA PLANS  (§10) — Lite £0 / Plus £10 / Pro £50
  // ---------------------------------------------------------------------------
  var PLAN = {
    LITE: {
      code: "LITE", name: "PLNA Lite", priceGbpMonth: 0, price: "£0/month",
      tagline: "Plan your courier work.",
      rateUpliftPct: 0, feeReductionPts: 0,
      ai: "none", landingPage: false,
      features: [
        "Driver + vehicle profile", "Availability", "Basic route planner",
        "Compliance view", "KNECT connection", "Basic area preferences"
      ]
    },
    PLUS: {
      code: "PLUS", name: "PLNA Plus", priceGbpMonth: 10, price: "£10/month",
      tagline: "Plan better. Earn better.",
      rateUpliftPct: 2, feeReductionPts: 2,
      ai: "basic", landingPage: false,
      features: [
        "Everything in Lite", "Better route planning", "Return-route alerts",
        "Area demand hints", "Basic AI teaser", "Weekly planning view",
        "Basic earnings estimate"
      ]
    },
    PRO: {
      code: "PRO", name: "PLNA Pro", priceGbpMonth: 50, price: "£50/month",
      tagline: "Build your local courier brand with HAF behind you.",
      rateUpliftPct: 5, feeReductionPts: 5,
      ai: "full", landingPage: true, requiresOwnDomain: true,
      features: [
        "Everything in Plus", "Full HAFFEE AI support", "Higher base-rate %",
        "Best network fee reduction", "Landing page support",
        "Local marketing support", "Missed-job funnel into HAF KNECT",
        "Priority KNECT visibility"
      ]
    }
  };

  // ---------------------------------------------------------------------------
  // 4. BENEFIT RESOLVER — membership + plan stack into pricing levers (§7.5)
  // The pricing engine calls this so paid tiers earn more and pay lower fees.
  // Floors keep the trial sane: fee never below FEE_FLOOR_PTS, uplift capped.
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
    if (p.ai === "full") n.push("Full HAFFEE AI");
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
  root.HAFModel = {
    AREAS: AREAS,
    COMPLIANCE: COMPLIANCE,
    MEMBERSHIP: MEMBERSHIP,
    PLAN: PLAN,
    canAccess: canAccess,
    gate: gate,
    resolveBenefits: resolveBenefits,
    isEligible: isEligible,
    FEE_FLOOR_PCT: FEE_FLOOR_PCT
  };
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).HAFModel;
}
