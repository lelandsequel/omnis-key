/**
 * GAIA Constellation — Food Security, Water Stress & Conflict Intelligence
 * 5 sub-engines: HARVEST · DENSITY · RIVER · FRONTIER · PRISM
 */

export interface GaiaInput {
  region?: string;
  population_millions?: number;
  food_production_index?: number;   // 0–100 (100 = adequate for population)
  water_stress_pct?: number;        // % of freshwater withdrawn vs available
  conflict_intensity?: number;      // 0–10
  supply_chain_disruption?: number; // 0–1
  climate_shock?: number;           // 0–1 (drought/flood severity)
  timestamp?: number;
}

export interface GaiaOutput {
  constellation: 'GAIA';
  composite_score: number;          // 0–100 (higher = more stable)
  stability_tier: 'STABLE' | 'WATCH' | 'STRESS' | 'CRISIS';
  engines: {
    HARVEST: HarvestOutput;
    DENSITY: DensityOutput;
    RIVER: RiverOutput;
    FRONTIER: FrontierOutput;
    PRISM: GaiaPrismOutput;
  };
  primary_threat: string;
  intervention_priority: string[];
  timestamp: number;
}

// ── HARVEST — Agricultural production & food supply analysis ─────────────────
interface HarvestOutput {
  engine: 'HARVEST';
  production_adequacy: number;    // 0–1 (1 = fully adequate)
  climate_vulnerability: number;  // 0–1
  supply_buffer: number;          // months of reserve
  score: number;
  signals: string[];
}

function runHarvest(input: GaiaInput): HarvestOutput {
  const fpi = input.food_production_index ?? 75;
  const climateShock = input.climate_shock ?? 0.1;
  const signals: string[] = [];

  // Production adequacy
  const adequacy = Math.min(fpi / 100, 1.0);

  // Climate vulnerability compounds food insecurity
  const climateVulnerability = climateShock;

  // Supply buffer in months: rough proxy from FPI and climate
  const supplyBuffer = Math.max(0, (fpi / 100) * 6 * (1 - climateShock));

  if (adequacy < 0.70) signals.push('PRODUCTION_DEFICIT — below population requirement');
  if (climateShock > 0.5) signals.push('CLIMATE_SHOCK — harvest disruption likely');
  if (supplyBuffer < 2) signals.push('CRITICAL: <2 months supply buffer');
  if (supplyBuffer < 1) signals.push('EMERGENCY: <1 month buffer — acute shortage imminent');

  const score = (adequacy * 0.5 + (1 - climateVulnerability) * 0.3 + Math.min(supplyBuffer / 6, 1) * 0.2) * 100;

  return {
    engine: 'HARVEST',
    production_adequacy: parseFloat(adequacy.toFixed(3)),
    climate_vulnerability: parseFloat(climateVulnerability.toFixed(3)),
    supply_buffer: parseFloat(supplyBuffer.toFixed(1)),
    score: parseFloat(score.toFixed(1)),
    signals,
  };
}

// ── DENSITY — Population pressure & distribution stress ──────────────────────
interface DensityOutput {
  engine: 'DENSITY';
  per_capita_index: number;      // food per capita relative to need
  urban_rural_stress: number;    // 0–1
  distribution_efficiency: number; // 0–1
  score: number;
  signals: string[];
}

function runDensity(input: GaiaInput): DensityOutput {
  const pop = input.population_millions ?? 10;
  const fpi = input.food_production_index ?? 75;
  const chainDisruption = input.supply_chain_disruption ?? 0.1;
  const signals: string[] = [];

  // Per capita: FPI adjusted for population (higher pop = more stress)
  const popPressure = Math.min(pop / 100, 1.0); // normalize to 0-1 at 100M
  const perCapitaIndex = Math.max(0, (fpi / 100) * (1 - popPressure * 0.3));

  // Urban/rural: supply chain disruption hits urban food access hardest
  const urbanRuralStress = chainDisruption * 0.8;

  // Distribution efficiency degraded by disruption
  const distributionEfficiency = Math.max(0, 1 - chainDisruption);

  if (perCapitaIndex < 0.6) signals.push('PER_CAPITA_DEFICIT — population outpacing food access');
  if (chainDisruption > 0.4) signals.push('SUPPLY_CHAIN_DISRUPTED — distribution breakdown');
  if (urbanRuralStress > 0.5) signals.push('URBAN_FOOD_ACCESS_STRESS');

  const score = (perCapitaIndex * 0.5 + distributionEfficiency * 0.3 + (1 - urbanRuralStress) * 0.2) * 100;

  return {
    engine: 'DENSITY',
    per_capita_index: parseFloat(perCapitaIndex.toFixed(3)),
    urban_rural_stress: parseFloat(urbanRuralStress.toFixed(3)),
    distribution_efficiency: parseFloat(distributionEfficiency.toFixed(3)),
    score: parseFloat(score.toFixed(1)),
    signals,
  };
}

// ── RIVER — Water stress & freshwater security ────────────────────────────────
interface RiverOutput {
  engine: 'RIVER';
  withdrawal_stress: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  aquifer_depletion_risk: number; // 0–1
  irrigation_dependency: number;  // 0–1
  score: number;
  signals: string[];
}

function runRiver(input: GaiaInput): RiverOutput {
  const waterStress = input.water_stress_pct ?? 20; // % withdrawn
  const climateShock = input.climate_shock ?? 0.1;
  const signals: string[] = [];

  // Water stress tiers (based on UN/FAO definitions)
  // <25%: low, 25-50%: medium, 50-75%: high, >75%: extreme
  const stressTier: RiverOutput['withdrawal_stress'] =
    waterStress >= 75 ? 'EXTREME'
    : waterStress >= 50 ? 'HIGH'
    : waterStress >= 25 ? 'MEDIUM'
    : 'LOW';

  // Aquifer depletion risk compounded by climate
  const aquiferRisk = Math.min((waterStress / 100) * (1 + climateShock), 1.0);

  // Irrigation dependency: high withdrawal = high agriculture-water linkage
  const irrigationDep = Math.min(waterStress / 75, 1.0);

  if (stressTier === 'HIGH' || stressTier === 'EXTREME') {
    signals.push(`WATER_STRESS_${stressTier} — ${waterStress}% withdrawal rate`);
  }
  if (aquiferRisk > 0.7) signals.push('AQUIFER_DEPLETION_RISK — groundwater unsustainable');
  if (climateShock > 0.4 && irrigationDep > 0.6) signals.push('DROUGHT_IRRIGATION_NEXUS — compound risk');

  const stressScore = stressTier === 'LOW' ? 1.0 : stressTier === 'MEDIUM' ? 0.7 : stressTier === 'HIGH' ? 0.4 : 0.15;
  const score = (stressScore * 0.5 + (1 - aquiferRisk) * 0.3 + (1 - irrigationDep * 0.5) * 0.2) * 100;

  return {
    engine: 'RIVER',
    withdrawal_stress: stressTier,
    aquifer_depletion_risk: parseFloat(aquiferRisk.toFixed(3)),
    irrigation_dependency: parseFloat(irrigationDep.toFixed(3)),
    score: parseFloat(score.toFixed(1)),
    signals,
  };
}

// ── FRONTIER — Conflict & access denial intelligence ─────────────────────────
interface FrontierOutput {
  engine: 'FRONTIER';
  conflict_level: 'PEACE' | 'TENSION' | 'ACTIVE' | 'WAR';
  humanitarian_access: number;   // 0–1 (1 = full access)
  food_weaponization_risk: number; // 0–1
  score: number;
  signals: string[];
}

function runFrontier(input: GaiaInput): FrontierOutput {
  const conflict = input.conflict_intensity ?? 1; // 0-10
  const signals: string[] = [];

  // Conflict tiers
  const conflictLevel: FrontierOutput['conflict_level'] =
    conflict >= 8 ? 'WAR'
    : conflict >= 5 ? 'ACTIVE'
    : conflict >= 3 ? 'TENSION'
    : 'PEACE';

  // Humanitarian access degrades sharply with conflict
  const humanitarianAccess = conflict >= 8 ? 0.15
    : conflict >= 5 ? 0.40
    : conflict >= 3 ? 0.75
    : 0.95;

  // Food weaponization: blockades, siege tactics (historically: 70% of hungriest in conflict zones)
  const weaponizationRisk = conflict >= 7 ? 0.8
    : conflict >= 5 ? 0.5
    : conflict >= 3 ? 0.2
    : 0.05;

  if (conflictLevel === 'WAR') signals.push('WAR_ZONE — food access as weapon, civilian starvation risk');
  if (conflictLevel === 'ACTIVE') signals.push('ACTIVE_CONFLICT — humanitarian corridors restricted');
  if (weaponizationRisk > 0.5) signals.push('FOOD_WEAPONIZATION_RISK — siege/blockade pattern detected');
  if (humanitarianAccess < 0.3) signals.push('HUMANITARIAN_ACCESS_DENIED — aid cannot reach population');

  const score = (humanitarianAccess * 0.4 + (1 - weaponizationRisk) * 0.35 + (1 - conflict / 10) * 0.25) * 100;

  return {
    engine: 'FRONTIER',
    conflict_level: conflictLevel,
    humanitarian_access: parseFloat(humanitarianAccess.toFixed(3)),
    food_weaponization_risk: parseFloat(weaponizationRisk.toFixed(3)),
    score: parseFloat(score.toFixed(1)),
    signals,
  };
}

// ── PRISM — Composite food stability score (0–100) ────────────────────────────
interface GaiaPrismOutput {
  engine: 'PRISM';
  food_stability_score: number;  // 0–100 composite
  acute_risk: boolean;
  top_threat: string;
}

function runGaiaPrism(
  harvest: HarvestOutput,
  density: DensityOutput,
  river: RiverOutput,
  frontier: FrontierOutput
): GaiaPrismOutput {
  // Weighted composite
  const foodStabilityScore =
    harvest.score * 0.30 +
    density.score * 0.25 +
    river.score * 0.20 +
    frontier.score * 0.25;

  // Acute risk: any single engine in crisis zone
  const acuteRisk = harvest.score < 30 || density.score < 30
    || river.score < 25 || frontier.score < 20;

  // Top threat: lowest scoring engine
  const engines = [
    { name: 'Agricultural production collapse', score: harvest.score },
    { name: 'Population density / distribution failure', score: density.score },
    { name: 'Water system stress', score: river.score },
    { name: 'Conflict blocking food access', score: frontier.score },
  ];
  const worst = engines.sort((a, b) => a.score - b.score)[0];

  return {
    engine: 'PRISM',
    food_stability_score: parseFloat(foodStabilityScore.toFixed(1)),
    acute_risk: acuteRisk,
    top_threat: worst.name,
  };
}

// ── GAIA main ─────────────────────────────────────────────────────────────────
export function runGaia(input: GaiaInput): GaiaOutput {
  const harvest = runHarvest(input);
  const density = runDensity(input);
  const river = runRiver(input);
  const frontier = runFrontier(input);
  const prism = runGaiaPrism(harvest, density, river, frontier);

  const composite = prism.food_stability_score;

  const stabilityTier: GaiaOutput['stability_tier'] =
    composite >= 70 ? 'STABLE'
    : composite >= 50 ? 'WATCH'
    : composite >= 30 ? 'STRESS'
    : 'CRISIS';

  // All signals combined, sorted by severity
  const allSignals = [
    ...frontier.signals,
    ...harvest.signals,
    ...river.signals,
    ...density.signals,
  ];

  // Primary threat
  const primaryThreat = allSignals[0] || prism.top_threat;

  // Intervention priority
  const interventions: string[] = [];
  if (frontier.conflict_level === 'WAR' || frontier.conflict_level === 'ACTIVE') {
    interventions.push('1. Humanitarian access — negotiate corridors (highest leverage: 95/100)');
  }
  if (harvest.supply_buffer < 2) {
    interventions.push('2. Emergency food aid — pre-position WFP stocks');
  }
  if (river.withdrawal_stress === 'HIGH' || river.withdrawal_stress === 'EXTREME') {
    interventions.push('3. Water infrastructure — irrigation efficiency + aquifer management');
  }
  if (density.distribution_efficiency < 0.6) {
    interventions.push('4. Supply chain restoration — cold storage + logistics corridors');
  }
  if (interventions.length === 0) {
    interventions.push('Maintain current monitoring cadence');
  }

  return {
    constellation: 'GAIA',
    composite_score: composite,
    stability_tier: stabilityTier,
    engines: { HARVEST: harvest, DENSITY: density, RIVER: river, FRONTIER: frontier, PRISM: prism },
    primary_threat: primaryThreat,
    intervention_priority: interventions,
    timestamp: input.timestamp || Date.now(),
  };
}
