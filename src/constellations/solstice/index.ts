/**
 * SOLSTICE Constellation — Refinery Operations & Logistics Intelligence
 * 5 sub-engines: REFINE · ROUTE · SURGE · VEIL · PRISM
 */

export interface SolsticeInput {
  facility?: string;
  crude_slate?: { api_gravity: number; sulfur_pct: number; throughput_bpd: number };
  logistics?: { mode: string; origin: string; destination: string; volume_bbl: number };
  market_spread?: number; // crack spread $/bbl
  timestamp?: number;
}

export interface SolsticeOutput {
  constellation: 'SOLSTICE';
  composite_score: number;        // 0–100
  tier: 'OPTIMAL' | 'NOMINAL' | 'STRESSED' | 'CRITICAL';
  engines: {
    REFINE: RefineOutput;
    ROUTE: RouteOutput;
    SURGE: SurgeOutput;
    VEIL: VeilOutput;
    PRISM: PrismOutput;
  };
  recommendation: string;
  timestamp: number;
}

// ── REFINE — Crude slate optimization & unit performance ──────────────────────
interface RefineOutput {
  engine: 'REFINE';
  crude_compatibility: number;   // 0–1
  unit_utilization: number;      // 0–1
  yield_efficiency: number;      // 0–1
  score: number;
  flags: string[];
}

function runRefine(input: SolsticeInput): RefineOutput {
  const slate = input.crude_slate || { api_gravity: 35, sulfur_pct: 0.5, throughput_bpd: 100000 };

  // API gravity sweet spot: 30–42 (light/medium crude)
  const apiScore = slate.api_gravity >= 30 && slate.api_gravity <= 42
    ? 1.0
    : slate.api_gravity < 25 || slate.api_gravity > 45
      ? 0.5
      : 0.75;

  // Sulfur tolerance: <1% = sweet, 1-2% = medium sour, >2% = heavy sour
  const sulfurScore = slate.sulfur_pct < 1.0 ? 1.0 : slate.sulfur_pct < 2.0 ? 0.7 : 0.45;

  // Throughput: assume 200kbpd max
  const utilizationRate = Math.min(slate.throughput_bpd / 200000, 1.0);
  const utilizationScore = utilizationRate > 0.95 ? 0.7  // overloaded
    : utilizationRate > 0.85 ? 1.0
    : utilizationRate > 0.70 ? 0.85
    : 0.6; // underutilized

  const flags: string[] = [];
  if (slate.sulfur_pct > 2.0) flags.push('HIGH_SULFUR_CRUDE — desulfurization capacity may be limiting');
  if (slate.api_gravity < 25) flags.push('HEAVY_CRUDE — coker capacity required');
  if (utilizationRate > 0.95) flags.push('THROUGHPUT_CEILING — constraint risk');

  const score = (apiScore * 0.3 + sulfurScore * 0.35 + utilizationScore * 0.35) * 100;

  return {
    engine: 'REFINE',
    crude_compatibility: parseFloat((apiScore * sulfurScore).toFixed(3)),
    unit_utilization: parseFloat(utilizationRate.toFixed(3)),
    yield_efficiency: parseFloat(((apiScore + sulfurScore) / 2).toFixed(3)),
    score: parseFloat(score.toFixed(1)),
    flags,
  };
}

// ── ROUTE — Logistics pathway optimization ────────────────────────────────────
interface RouteOutput {
  engine: 'ROUTE';
  mode: string;
  cost_efficiency: number;       // 0–1
  transit_risk: number;          // 0–1 (higher = more risk)
  bottleneck_probability: number;
  score: number;
  flags: string[];
}

function runRoute(input: SolsticeInput): RouteOutput {
  const logistics = input.logistics || { mode: 'pipeline', origin: 'Cushing', destination: 'Gulf Coast', volume_bbl: 50000 };
  const flags: string[] = [];

  // Mode scoring
  const modeScores: Record<string, { cost: number; risk: number }> = {
    pipeline:  { cost: 0.95, risk: 0.1 },
    rail:      { cost: 0.65, risk: 0.35 },
    barge:     { cost: 0.80, risk: 0.20 },
    truck:     { cost: 0.40, risk: 0.15 },
    tanker:    { cost: 0.85, risk: 0.25 },
  };
  const mode = modeScores[logistics.mode.toLowerCase()] || { cost: 0.70, risk: 0.30 };

  // Volume risk: large volumes over non-pipeline = higher risk
  const volumeRisk = logistics.volume_bbl > 100000 && logistics.mode !== 'pipeline' ? 0.2 : 0.0;
  const transitRisk = Math.min(mode.risk + volumeRisk, 1.0);

  if (logistics.mode === 'rail' && logistics.volume_bbl > 50000) flags.push('HIGH_VOLUME_RAIL — consider pipeline alternatives');
  if (transitRisk > 0.4) flags.push('TRANSIT_RISK_ELEVATED');

  // Bottleneck: Gulf Coast export terminals often congested
  const bottleneck = logistics.destination.toLowerCase().includes('gulf') ? 0.35 : 0.15;

  const score = (mode.cost * 0.5 + (1 - transitRisk) * 0.3 + (1 - bottleneck) * 0.2) * 100;

  return {
    engine: 'ROUTE',
    mode: logistics.mode,
    cost_efficiency: parseFloat(mode.cost.toFixed(3)),
    transit_risk: parseFloat(transitRisk.toFixed(3)),
    bottleneck_probability: parseFloat(bottleneck.toFixed(3)),
    score: parseFloat(score.toFixed(1)),
    flags,
  };
}

// ── SURGE — Demand surge & throughput stress detection ────────────────────────
interface SurgeOutput {
  engine: 'SURGE';
  demand_delta: number;          // % change implied
  surge_probability: number;     // 0–1
  capacity_headroom: number;     // 0–1
  score: number;
  flags: string[];
}

function runSurge(input: SolsticeInput): SurgeOutput {
  const slate = input.crude_slate || { throughput_bpd: 100000, api_gravity: 35, sulfur_pct: 0.5 };
  const spread = input.market_spread ?? 12; // typical crack spread $/bbl
  const flags: string[] = [];

  // High crack spread → demand pull → surge risk
  const surgeProb = spread > 20 ? 0.75
    : spread > 15 ? 0.50
    : spread > 10 ? 0.30
    : 0.15;

  const utilizationRate = Math.min(slate.throughput_bpd / 200000, 1.0);
  const headroom = Math.max(0, 1 - utilizationRate);

  // Demand delta: inferred from spread
  const demandDelta = parseFloat(((spread - 12) / 12 * 100).toFixed(1));

  if (surgeProb > 0.5) flags.push('DEMAND_SURGE_LIKELY — crack spread elevated');
  if (headroom < 0.1) flags.push('CAPACITY_CONSTRAINED — <10% headroom');
  if (headroom < 0.05 && surgeProb > 0.5) flags.push('CRITICAL: surge demand meets capacity ceiling');

  const score = ((1 - surgeProb) * 0.5 + headroom * 0.5) * 100;

  return {
    engine: 'SURGE',
    demand_delta: demandDelta,
    surge_probability: parseFloat(surgeProb.toFixed(3)),
    capacity_headroom: parseFloat(headroom.toFixed(3)),
    score: parseFloat(score.toFixed(1)),
    flags,
  };
}

// ── VEIL — Opacity & regulatory risk layer ────────────────────────────────────
interface VeilOutput {
  engine: 'VEIL';
  regulatory_exposure: number;   // 0–1
  opacity_score: number;         // 0–1 (higher = more opaque/risky)
  compliance_risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number;
  flags: string[];
}

function runVeil(input: SolsticeInput): VeilOutput {
  const flags: string[] = [];
  const logistics = input.logistics;

  // Cross-border logistics increases regulatory exposure
  const crossBorder = logistics &&
    !['Cushing', 'Gulf Coast', 'Midland', 'Houston', 'Beaumont'].includes(logistics.destination);
  const regulatoryExposure = crossBorder ? 0.6 : 0.25;

  // Heavy sour crude has higher EPA/refinery opacity
  const slateSulfur = input.crude_slate?.sulfur_pct ?? 0.5;
  const opacityScore = slateSulfur > 2.0 ? 0.7 : slateSulfur > 1.0 ? 0.45 : 0.2;

  const combined = (regulatoryExposure + opacityScore) / 2;
  const complianceRisk: VeilOutput['compliance_risk'] =
    combined > 0.65 ? 'CRITICAL'
    : combined > 0.50 ? 'HIGH'
    : combined > 0.30 ? 'MEDIUM'
    : 'LOW';

  if (complianceRisk === 'HIGH' || complianceRisk === 'CRITICAL') {
    flags.push(`COMPLIANCE_RISK_${complianceRisk} — environmental and import/export scrutiny`);
  }
  if (crossBorder) flags.push('CROSS_BORDER_LOGISTICS — additional regulatory layer');

  const score = (1 - combined) * 100;

  return {
    engine: 'VEIL',
    regulatory_exposure: parseFloat(regulatoryExposure.toFixed(3)),
    opacity_score: parseFloat(opacityScore.toFixed(3)),
    compliance_risk: complianceRisk,
    score: parseFloat(score.toFixed(1)),
    flags,
  };
}

// ── PRISM — Composite refinery opportunity score ──────────────────────────────
interface PrismOutput {
  engine: 'PRISM';
  margin_opportunity: number;    // 0–100
  risk_adjusted_score: number;   // 0–100
  verdict: string;
}

function runPrism(
  refine: RefineOutput,
  route: RouteOutput,
  surge: SurgeOutput,
  veil: VeilOutput,
  spread: number
): PrismOutput {
  // Margin opportunity: crack spread + refinery efficiency
  const marginBase = Math.min((spread / 25) * 100, 100);
  const efficiencyMult = (refine.yield_efficiency + route.cost_efficiency) / 2;
  const marginOpportunity = marginBase * efficiencyMult;

  // Risk adjustment: penalize for surge risk, transit risk, compliance
  const riskPenalty = (surge.surge_probability * 0.3 + route.transit_risk * 0.4 + (1 - veil.score / 100) * 0.3);
  const riskAdjustedScore = Math.max(0, marginOpportunity * (1 - riskPenalty * 0.5));

  const verdict = riskAdjustedScore >= 75 ? 'OPTIMIZE — strong margin, deploy capacity'
    : riskAdjustedScore >= 55 ? 'PROCEED — acceptable margin, monitor logistics'
    : riskAdjustedScore >= 35 ? 'CAUTION — margin thin, cost control required'
    : 'HOLD — risk-adjusted margin insufficient';

  return {
    engine: 'PRISM',
    margin_opportunity: parseFloat(marginOpportunity.toFixed(1)),
    risk_adjusted_score: parseFloat(riskAdjustedScore.toFixed(1)),
    verdict,
  };
}

// ── SOLSTICE main ─────────────────────────────────────────────────────────────
export function runSolstice(input: SolsticeInput): SolsticeOutput {
  const spread = input.market_spread ?? 12;

  const refine = runRefine(input);
  const route = runRoute(input);
  const surge = runSurge(input);
  const veil = runVeil(input);
  const prism = runPrism(refine, route, surge, veil, spread);

  // Composite: weighted average of all 5 engines
  const composite = (
    refine.score * 0.25 +
    route.score * 0.20 +
    surge.score * 0.20 +
    veil.score * 0.15 +
    prism.risk_adjusted_score * 0.20
  );

  const tier: SolsticeOutput['tier'] =
    composite >= 75 ? 'OPTIMAL'
    : composite >= 55 ? 'NOMINAL'
    : composite >= 35 ? 'STRESSED'
    : 'CRITICAL';

  const allFlags = [
    ...refine.flags,
    ...route.flags,
    ...surge.flags,
    ...veil.flags,
  ];

  const topFlag = allFlags[0] || null;
  const recommendation = tier === 'OPTIMAL'
    ? `Run at capacity. ${prism.verdict}.`
    : tier === 'NOMINAL'
    ? `Proceed with monitoring. ${topFlag ? topFlag.split('—')[0].trim() + ' noted.' : ''} ${prism.verdict}.`
    : tier === 'STRESSED'
    ? `Reduce throughput or address: ${topFlag || 'multiple risk factors'}. ${prism.verdict}.`
    : `Immediate intervention required. ${allFlags.slice(0, 2).join(' | ')}.`;

  return {
    constellation: 'SOLSTICE',
    composite_score: parseFloat(composite.toFixed(1)),
    tier,
    engines: { REFINE: refine, ROUTE: route, SURGE: surge, VEIL: veil, PRISM: prism },
    recommendation,
    timestamp: input.timestamp || Date.now(),
  };
}
