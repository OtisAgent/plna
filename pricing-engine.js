/* ============================================================================
 * HAF KNECT — Pricing Zone Engine V1
 * The dynamic, market-responsive pricing brain that runs behind KNECT + PLNA.
 *
 * Source of truth: HAF_KNECT_Pricing_Zone_Formula_V1.
 * Principle: price by LANE, not by town. Keep three things in balance on every
 * quote — a fair customer price, fair driver pay, and HAF's network margin.
 *
 * Nothing here is hard-coded into logic: every rate, factor, fee and band lives
 * in HAFPricing.config and is meant to be edited from admin (and, later, tuned
 * automatically by the weekly review loop). Swap the config, the maths follows.
 *
 * Exposes window.HAFPricing — both KNECT and PLNA load this same file so there
 * is ONE pricing brain, not two.
 * ========================================================================== */
window.HAFPricing = (function () {
  "use strict";

  // ===========================================================================
  // 1. EDITABLE CONFIG  (the whole pricing policy lives here)
  // ===========================================================================
  const config = {
    // --- Global money rules ---
    vatPct: 20,
    minCustomerChargeExVat: 50,        // £50 + VAT floor (doc §1.4)
    hafNetworkFeeDefaultPct: 20,       // used if a job type doesn't set its own

    // --- Guardrails so "dynamic" never becomes "chaotic" (doc §10) ---
    guardrails: {
      minLaneMultiplier: 0.95,         // never discount a lane below this
      maxAutoLaneMultiplier: 1.60,     // above this => manual approval
      manualPressureScore: 3.51,       // pressure this high => manual / surge
    },

    // --- Vehicle base rate card, £/loaded mile (doc §3). Editable in admin. ---
    vehicles: [
      { code: "SMALL_VAN", name: "Small Van",          baseRate: 1.20, manual: false },
      { code: "SWB_VAN",   name: "SWB Van",            baseRate: 1.30, manual: false },
      { code: "MWB_VAN",   name: "MWB Van",            baseRate: 1.40, manual: false },
      { code: "LWB_VAN",   name: "LWB Van",            baseRate: 1.50, manual: false },
      { code: "LUTON",     name: "Luton / Specialist", baseRate: 1.60, manual: true  },
    ],

    // --- Job types: urgency factor (min/default/max) + its own HAF fee (doc §4) ---
    jobTypes: [
      { code: "TIME_CRITICAL",   name: "Time Critical / Urgent", factorMin: 1.25, factorDefault: 1.375, factorMax: 1.50, feePct: 30 },
      { code: "SAMEDAY_DIRECT",  name: "Sameday Direct",         factorMin: 1.10, factorDefault: 1.175, factorMax: 1.25, feePct: 20 },
      { code: "SAMEDAY_FLEX",    name: "Sameday Flexible",       factorMin: 1.00, factorDefault: 1.05,  factorMax: 1.10, feePct: 20 },
      { code: "COLOAD",          name: "Co-load Available",      factorMin: 0.95, factorDefault: 1.00,  factorMax: 1.05, feePct: 20 },
      { code: "GROUPAGE",        name: "Groupage Flexible",      factorMin: 0.85, factorDefault: 0.90,  factorMax: 0.95, feePct: 10 },
      { code: "RETURN_ROUTE",    name: "Return-Route Service",   factorMin: 1.00, factorDefault: 1.00,  factorMax: 1.00, feePct: 15, returnRoute: true, minPerMileExVat: 0.80 },
    ],

    // --- Lane pressure: how demand÷supply turns into a multiplier (doc §6–7) ---
    demandWeights: { urgent: 3, sameday: 2, flexible: 1, liveQuote: 0.5 },
    supplyWeights: { available: 1, returnRoute: 0.75, coload: 0.5, nearby: 0.25 },
    pressureBands: [
      { maxScore: 0.75,     status: "Driver surplus",      mult: 0.95, reason: "DRIVER_SURPLUS", manual: false },
      { maxScore: 1.25,     status: "Balanced",            mult: 1.00, reason: "BALANCED_LANE",  manual: false },
      { maxScore: 1.75,     status: "Tight",               mult: 1.10, reason: "LOW_SUPPLY",     manual: false },
      { maxScore: 2.50,     status: "High pressure",       mult: 1.20, reason: "HIGH_DEMAND",    manual: false },
      { maxScore: 3.50,     status: "Very high pressure",  mult: 1.35, reason: "HIGH_DEMAND",    manual: false },
      { maxScore: Infinity, status: "Manual / surge",      mult: 1.50, reason: "MANUAL_SURGE",   manual: true  },
    ],

    // --- Destination recovery: how easy is onward work after the drop (doc §8) ---
    recovery: [
      { code: "HOT",    name: "Hot Destination",    factor: 1.00, reason: null },
      { code: "NORMAL", name: "Normal Destination", factor: 1.05, reason: null },
      { code: "COLD",   name: "Cold Destination",   factor: 1.10, reason: "COLD_DESTINATION" },
      { code: "DEAD",   name: "Dead Zone",          factor: 1.20, reason: "DEAD_ZONE" },
    ],

    // --- Route direction: do drivers actually want this direction (doc §9) ---
    direction: [
      { code: "STRONG",   name: "Strong Driver Interest", factor: 0.95, reason: null },
      { code: "NORMAL",   name: "Normal Route",           factor: 1.00, reason: null },
      { code: "WEAK",     name: "Weak Driver Interest",   factor: 1.10, reason: null },
      { code: "AWKWARD",  name: "Awkward Route",          factor: 1.20, reason: null },
      { code: "CRITICAL", name: "Critical Shortage",      factor: 1.35, reason: "LOW_SUPPLY" },
    ],

    // --- Zone types (reference for the UI / lane setup, doc §5) ---
    zoneTypes: [
      { code: "CORE",   name: "Core Zone",   note: "Strong HAF driver coverage" },
      { code: "ACTIVE", name: "Active Zone", note: "Regular jobs and driver supply" },
      { code: "GROWTH", name: "Growth Zone", note: "Some demand, supply still building" },
      { code: "COLD",   name: "Cold Zone",   note: "Weak supply or low repeat work" },
      { code: "SURGE",  name: "Surge Zone",  note: "High demand, low supply" },
      { code: "MANUAL", name: "Manual Zone", note: "Human approval before quote confirms" },
    ],
  };

  // Human-readable labels for reason codes (doc §14)
  const REASON_LABELS = {
    BALANCED_LANE:    "Balanced lane — normal demand and supply",
    DRIVER_SURPLUS:   "Driver surplus — more drivers than jobs",
    LOW_SUPPLY:       "Low supply — not enough drivers on this lane",
    HIGH_DEMAND:      "High demand — lots of live jobs/quotes",
    COLD_DESTINATION: "Cold destination — weak onward work",
    DEAD_ZONE:        "Dead zone — likely unpaid return mileage",
    RETURN_ROUTE_MATCH: "Return-route match — points the driver home",
    URGENT_JOB:       "Urgent job — time critical",
    MANUAL_SURGE:     "Manual surge — above the auto limit",
    MIN_CHARGE:       "Minimum customer charge applied",
    LANE_CAPPED:      "Lane uplift capped at the auto ceiling",
    TIER_RATE_UPLIFT: "Member/plan uplift — driver keeps a better base-rate %",
    TIER_FEE_REDUCTION: "Member/plan benefit — reduced HAF network fee",
    POSTER_FEE_HIGHER: "Freight-forward poster — higher network fee per live post",
    POSTER_FEE_DISCOUNT: "Business/Pro poster — discounted network fee",
  };

  // ===========================================================================
  // 2. SMALL HELPERS
  // ===========================================================================
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const money  = n => "£" + round2(n).toFixed(2);
  const num     = (v, d = 0) => { const n = parseFloat(v); return isFinite(n) ? n : d; };

  const getVehicle  = code => config.vehicles.find(v => v.code === code) || config.vehicles[0];
  const getJobType  = code => config.jobTypes.find(t => t.code === code) || config.jobTypes[0];
  const getRecovery = code => config.recovery.find(r => r.code === code) || config.recovery[1];
  const getDirection= code => config.direction.find(d => d.code === code) || config.direction[1];

  // ===========================================================================
  // 3. THE MODULAR PRICING FUNCTIONS  (doc §19)
  // ===========================================================================

  // Demand Units = urgent×3 + sameday×2 + flexible×1 + liveQuotes×0.5
  function calculateDemandUnits(d) {
    const w = config.demandWeights;
    return num(d.urgent) * w.urgent + num(d.sameday) * w.sameday +
           num(d.flexible) * w.flexible + num(d.liveQuotes) * w.liveQuote;
  }

  // Supply Units = available×1 + returnRoute×0.75 + coload×0.5 + nearby×0.25
  function calculateSupplyUnits(s) {
    const w = config.supplyWeights;
    return num(s.available) * w.available + num(s.returnRoute) * w.returnRoute +
           num(s.coload) * w.coload + num(s.nearby) * w.nearby;
  }

  // Lane Pressure Score = Demand ÷ Supply  (0 supply with demand => surge)
  function calculateLanePressureScore(demandUnits, supplyUnits) {
    if (supplyUnits <= 0) return demandUnits > 0 ? Infinity : 0;
    return demandUnits / supplyUnits;
  }

  function getPressureBand(score) {
    return config.pressureBands.find(b => score <= b.maxScore) ||
           config.pressureBands[config.pressureBands.length - 1];
  }

  // ===========================================================================
  // 4. THE FULL QUOTE  (doc §18 logic flow, §11 worked example)
  // ===========================================================================
  /**
   * quote(input) -> full breakdown object.
   * input: {
   *   pickup, delivery,                       // labels only
   *   loadedMiles, vehicleCode, jobTypeCode,
   *   jobTypeFactor?,                         // optional override within range
   *   demand: {urgent,sameday,flexible,liveQuotes},
   *   supply: {available,returnRoute,coload,nearby},
   *   recoveryCode, directionCode,
   *   networkFeePctOverride?                  // optional admin override
   * }
   */
  function quote(input) {
    const reasons = [];
    let manualApproval = false;

    const miles   = Math.max(0, num(input.loadedMiles));
    const vehicle = getVehicle(input.vehicleCode);
    const jobType = getJobType(input.jobTypeCode);

    // Job-type urgency factor (default unless an in-range override is passed)
    let jobFactor = jobType.factorDefault;
    if (input.jobTypeFactor != null) {
      jobFactor = Math.min(jobType.factorMax, Math.max(jobType.factorMin, num(input.jobTypeFactor, jobFactor)));
    }
    if (jobType.code === "TIME_CRITICAL") reasons.push("URGENT_JOB");
    if (jobType.returnRoute) reasons.push("RETURN_ROUTE_MATCH");

    // --- Lane pressure (the live market signal) ---
    const demandUnits = calculateDemandUnits(input.demand || {});
    const supplyUnits = calculateSupplyUnits(input.supply || {});
    const pressureScore = calculateLanePressureScore(demandUnits, supplyUnits);
    const band = getPressureBand(pressureScore);
    reasons.push(band.reason);
    if (band.manual) manualApproval = true;

    // --- Recovery + direction factors ---
    const recovery  = getRecovery(input.recoveryCode);
    const direction = getDirection(input.directionCode);
    if (recovery.reason)  reasons.push(recovery.reason);
    if (direction.reason) reasons.push(direction.reason);

    // --- Combined lane zone multiplier, with guardrails (doc §10) ---
    const laneMultRaw = band.mult * recovery.factor * direction.factor;
    const g = config.guardrails;
    let laneMult = laneMultRaw;
    let laneCapped = false;
    if (laneMult < g.minLaneMultiplier) laneMult = g.minLaneMultiplier;
    if (laneMultRaw > g.maxAutoLaneMultiplier) {
      laneMult = g.maxAutoLaneMultiplier;     // cap the auto price...
      laneCapped = true;
      manualApproval = true;                  // ...and flag for a human
      reasons.push("LANE_CAPPED");
    }
    if (pressureScore >= g.manualPressureScore) manualApproval = true;
    if (vehicle.manual) manualApproval = true;

    // --- Tier benefits: KNECT membership + PLNA plan (Master Spec §7.5) ---
    // Resolved from the shared HAFModel so KNECT and PLNA price identically.
    // Free + Lite => zero deltas => numbers are unchanged (backward compatible).
    const HM = (typeof HAFModel !== "undefined") ? HAFModel
             : (typeof window !== "undefined" && window.HAFModel) ? window.HAFModel
             : null;
    let benefits = input.benefits || null;
    if (!benefits && HM && (input.membership || input.plnaPlan)) {
      benefits = HM.resolveBenefits(input.membership, input.plnaPlan);
    }
    const rateUpliftPct   = benefits ? num(benefits.rateUpliftPct, 0)   : 0;
    const feeReductionPts = benefits ? num(benefits.feeReductionPts, 0) : 0;
    // Margin floor always applies (even for poster-only quotes with no driver tier).
    const modelFloor      = (HM && num(HM.FEE_FLOOR_PCT, 0)) || 0;
    const feeFloorPct     = benefits ? num(benefits.feeFloorPct, modelFloor) : modelFloor;

    // --- Driver Target Pay (doc §1.1) ---
    let driverTargetPay = miles * vehicle.baseRate * jobFactor * laneMult;
    // Return-route floor: never below £0.80+VAT-equivalent per mile (doc §4)
    if (jobType.returnRoute && jobType.minPerMileExVat) {
      driverTargetPay = Math.max(driverTargetPay, miles * jobType.minPerMileExVat);
    }
    // Tier uplift: paid members/plans keep a better % on base rate (§7.5).
    const driverBasePay = round2(driverTargetPay);
    if (rateUpliftPct > 0) driverTargetPay = driverTargetPay * (1 + rateUpliftPct / 100);
    driverTargetPay = round2(driverTargetPay);
    if (rateUpliftPct > 0) reasons.push("TIER_RATE_UPLIFT");

    // --- Customer price via the CORRECT margin method: ÷ (1 - fee%) (doc §2) ---
    const jobBaseFeePct = input.networkFeePctOverride != null
      ? num(input.networkFeePctOverride, jobType.feePct)
      : jobType.feePct;

    // POSTER-side network fee (framework §5/§6): freight-forward tier or business
    // account shifts the job-type base fee BEFORE driver reductions. Free freight
    // pays more (+pts), Pro/business pay less (-pts). Resolved from HAFModel so the
    // fee is config-driven, never hard-coded. Floored so HAF margin is protected.
    let posterAdjPts = 0;
    let posterFee = input.posterFee || null;
    if (!posterFee && HM && (input.posterAccountType || input.posterPlan)) {
      posterFee = HM.resolvePosterFee(input.posterAccountType, input.posterPlan, {
        internalConfirmed: input.posterInternalConfirmed
      });
    }
    if (posterFee) {
      posterAdjPts = num(posterFee.feeAdjPts, 0);
      if (posterAdjPts > 0) reasons.push("POSTER_FEE_HIGHER");
      else if (posterAdjPts < 0) reasons.push("POSTER_FEE_DISCOUNT");
    }
    const baseFeePct = Math.max(feeFloorPct, jobBaseFeePct + posterAdjPts);

    // Tier benefit: paid members/plans pay a LOWER network fee (§7.5),
    // never trimmed below the floor.
    let feePct = baseFeePct;
    if (feeReductionPts > 0) {
      feePct = Math.max(feeFloorPct, baseFeePct - feeReductionPts);
      reasons.push("TIER_FEE_REDUCTION");
    }
    const feeFraction = Math.min(0.95, Math.max(0, feePct / 100));

    let customerExVat = feeFraction < 1 ? driverTargetPay / (1 - feeFraction) : driverTargetPay;

    // --- Minimum customer charge floor (doc §1.4) ---
    let minApplied = false;
    if (customerExVat < config.minCustomerChargeExVat) {
      customerExVat = config.minCustomerChargeExVat;
      minApplied = true;
      reasons.push("MIN_CHARGE");
    }
    customerExVat = round2(customerExVat);

    const vatAmount      = round2(customerExVat * (config.vatPct / 100));
    const customerIncVat = round2(customerExVat + vatAmount);
    const hafGrossFee    = round2(customerExVat - driverTargetPay);
    const hafMarginPct   = customerExVat > 0 ? round2((hafGrossFee / customerExVat) * 100) : 0;

    // De-dupe reason codes, keep order
    const reasonCodes = reasons.filter((r, i) => r && reasons.indexOf(r) === i);

    return {
      // echo
      pickup: input.pickup || "", delivery: input.delivery || "",
      loadedMiles: miles, vehicle, jobType, jobTypeFactor: round2(jobFactor),
      // lane signal
      demandUnits: round2(demandUnits), supplyUnits: round2(supplyUnits),
      lanePressureScore: pressureScore === Infinity ? Infinity : round2(pressureScore),
      lanePressureStatus: band.status, lanePressureMultiplier: band.mult,
      recovery, direction,
      laneMultiplierRaw: round2(laneMultRaw), laneMultiplier: round2(laneMult), laneCapped,
      // money
      driverTargetPay,
      driverBasePay,                                  // pay before tier uplift
      tierRateUpliftPct: rateUpliftPct,
      tierFeeReductionPts: feeReductionPts,
      jobBaseNetworkFeePct: jobBaseFeePct,
      posterFeeAdjPts: posterAdjPts,
      posterFee: posterFee || null,
      baseNetworkFeePct: baseFeePct,        // after poster adjustment, before driver reduction
      tierBenefits: benefits || null,
      networkFeePct: feePct,
      customerPriceExVat: customerExVat, minChargeApplied: minApplied,
      vatAmount, customerPriceIncVat: customerIncVat,
      hafGrossFee, hafMarginPct,
      // governance
      reasonCodes,
      reasonText: reasonCodes.map(c => REASON_LABELS[c] || c).join(" · "),
      manualApprovalRequired: manualApproval,
    };
  }

  // ===========================================================================
  // 5. PUBLIC API
  // ===========================================================================
  return {
    config,
    REASON_LABELS,
    // helpers
    money, round2,
    getVehicle, getJobType, getRecovery, getDirection,
    // modular functions
    calculateDemandUnits, calculateSupplyUnits, calculateLanePressureScore, getPressureBand,
    // the one-call quote
    quote,
    version: "V1",
  };
})();
