/**
 * POLARIS Constellation — Gas & Compression Intelligence
 * 5 sub-engines: CORE · FLUX · RESONANCE · DRIVE · CRYO
 * First full OMNIS KEY constellation pack
 */

export interface PolarisResult {
  constellation: 'POLARIS';
  domain: 'gas';
  engines_fired: string[];
  core: PolarisCore;
  flux: PolarisFlux;
  resonance: PolarisResonance;
  drive: PolarisDrive;
  cryo: PolarisCryo;
  composite_score: number;   // 0–100 overall gas/compression health
  signal: 'OPERATE' | 'MONITOR' | 'CAUTION' | 'SHUTDOWN';
  summary: string;
}

export interface PolarisCore {
  engine: 'POLARIS.CORE';
  compressor_health: number;     // 0–1
  vibration_index: number;       // 0–1 (higher = more vibration, worse)
  temperature_delta: number;     // deg F above baseline
  pressure_ratio: number;        // actual / design
  health_tier: 'GREEN' | 'YELLOW' | 'RED' | 'CRITICAL';
  recommendation: string;
}

export interface PolarisFlux {
  engine: 'POLARIS.FLUX';
  flow_efficiency: number;       // 0–1
  throughput_btu: number;        // MMBtu/day estimate
  pressure_drop_psi: number;     // across system
  slug_risk: number;             // 0–1
  flux_signal: 'NOMINAL' | 'DEGRADED' | 'CRITICAL';
  recommendation: string;
}

export interface PolarisResonance {
  engine: 'POLARIS.RESONANCE';
  pipeline_integrity: number;    // 0–1
  corrosion_index: number;       // 0–1
  inspection_overdue: boolean;
  estimated_remaining_life_years: number;
  resonance_signal: 'CLEAR' | 'WATCH' | 'ACT' | 'CRITICAL';
  recommendation: string;
}

export interface PolarisDrive {
  engine: 'POLARIS.DRIVE';
  motor_efficiency: number;      // 0–1
  power_factor: number;          // 0–1 electrical power factor
  fuel_cost_index: number;       // normalized fuel cost per MMBtu
  maintenance_due_days: number;  // days until scheduled maintenance
  drive_signal: 'EFFICIENT' | 'MONITOR' | 'SERVICE_SOON' | 'OVERHAUL';
  recommendation: string;
}

export interface PolarisCryo {
  engine: 'POLARIS.CRYO';
  lng_temp_deviation: number;    // deg F from target (-260°F baseline)
  boil_off_rate: number;         // % per day
  insulation_efficiency: number; // 0–1
  storage_pressure_psi: number;
  cryo_signal: 'STABLE' | 'DRIFT' | 'INTERVENTION' | 'EMERGENCY';
  recommendation: string;
}

// ── Sub-engine implementations ──────────────────────────────────────────────

function runCore(query: string): PolarisCore {
  const lower = query.toLowerCase();
  // Detect context clues
  const isHighLoad = lower.includes('overload') || lower.includes('surge') || lower.includes('high load');
  const isFault = lower.includes('fault') || lower.includes('failure') || lower.includes('down') || lower.includes('trip');

  const health = isFault ? 0.32 : isHighLoad ? 0.65 : 0.84;
  const vibration = isFault ? 0.78 : isHighLoad ? 0.44 : 0.18;
  const tempDelta = isFault ? 42 : isHighLoad ? 22 : 8;
  const pressureRatio = isFault ? 0.71 : isHighLoad ? 0.88 : 0.97;

  const tier = health > 0.8 ? 'GREEN' : health > 0.65 ? 'YELLOW' : health > 0.4 ? 'RED' : 'CRITICAL';

  const recs: Record<string, string> = {
    GREEN: 'Compressor operating within normal parameters. Next scheduled inspection in 14 days.',
    YELLOW: 'Elevated vibration detected. Schedule predictive maintenance within 72 hours. Monitor bearing temps.',
    RED: 'Compressor health degraded. Reduce load 20%. Inspect impeller and seals within 24 hours.',
    CRITICAL: 'IMMEDIATE ACTION: Compressor approaching failure threshold. Initiate controlled shutdown. Inspect bearings, impeller, and seal faces before restart.',
  };

  return {
    engine: 'POLARIS.CORE',
    compressor_health: health,
    vibration_index: vibration,
    temperature_delta: tempDelta,
    pressure_ratio: pressureRatio,
    health_tier: tier,
    recommendation: recs[tier],
  };
}

function runFlux(query: string): PolarisFlux {
  const lower = query.toLowerCase();
  const isRestricted = lower.includes('restrict') || lower.includes('constrict') || lower.includes('blocked');
  const isSlug = lower.includes('slug') || lower.includes('liquid') || lower.includes('condensate');

  const efficiency = isRestricted ? 0.61 : 0.84;
  const throughput = isRestricted ? 180 : 320;  // MMBtu/day
  const pressureDrop = isRestricted ? 48 : 22;
  const slugRisk = isSlug ? 0.72 : 0.18;

  const signal: PolarisFlux['flux_signal'] = efficiency > 0.8 ? 'NOMINAL' : efficiency > 0.65 ? 'DEGRADED' : 'CRITICAL';

  return {
    engine: 'POLARIS.FLUX',
    flow_efficiency: efficiency,
    throughput_btu: throughput,
    pressure_drop_psi: pressureDrop,
    slug_risk: slugRisk,
    flux_signal: signal,
    recommendation: signal === 'NOMINAL'
      ? `Flow nominal at ${throughput} MMBtu/day. Slug risk low.`
      : signal === 'DEGRADED'
      ? `Flow reduced to ${throughput} MMBtu/day (${(efficiency*100).toFixed(0)}% efficiency). Check for partial blockage or hydrate formation.`
      : `CRITICAL flow restriction detected. ${pressureDrop} psi pressure drop exceeds design. Emergency pigging recommended.`,
  };
}

function runResonance(query: string): PolarisResonance {
  const lower = query.toLowerCase();
  const isOld = lower.includes('aging') || lower.includes('old') || lower.includes('legacy') || lower.includes('corrod');
  const isNew = lower.includes('new') || lower.includes('installed') || lower.includes('commissi');

  const integrity = isOld ? 0.58 : isNew ? 0.97 : 0.82;
  const corrosion = isOld ? 0.41 : isNew ? 0.04 : 0.19;
  const inspectionOverdue = isOld;
  const remainingLife = isOld ? 4.2 : isNew ? 28.0 : 14.5;

  const sig: PolarisResonance['resonance_signal'] = integrity > 0.85 ? 'CLEAR' : integrity > 0.7 ? 'WATCH' : integrity > 0.5 ? 'ACT' : 'CRITICAL';

  return {
    engine: 'POLARIS.RESONANCE',
    pipeline_integrity: integrity,
    corrosion_index: corrosion,
    inspection_overdue: inspectionOverdue,
    estimated_remaining_life_years: remainingLife,
    resonance_signal: sig,
    recommendation: sig === 'CLEAR'
      ? `Pipeline integrity strong (${(integrity*100).toFixed(0)}%). Corrosion index within acceptable range. Estimated ${remainingLife}yr remaining service life.`
      : sig === 'WATCH'
      ? `Pipeline integrity declining. Corrosion index ${(corrosion*100).toFixed(0)}%. Schedule ILI (inline inspection) within 90 days.`
      : sig === 'ACT'
      ? `Pipeline integrity at risk. ILI required within 30 days. Consider targeted replacement of high-corrosion segments.`
      : `CRITICAL integrity failure risk. Immediately reduce operating pressure. Do not defer inspection.`,
  };
}

function runDrive(query: string): PolarisDrive {
  const lower = query.toLowerCase();
  const isWorn = lower.includes('worn') || lower.includes('ineffici') || lower.includes('motor');
  const isService = lower.includes('service') || lower.includes('maintenance');

  const motorEfficiency = isWorn ? 0.71 : 0.91;
  const powerFactor = isWorn ? 0.74 : 0.94;
  const fuelCostIndex = isWorn ? 1.28 : 1.02;
  const maintenanceDue = isService ? 7 : 45;

  const sig: PolarisDrive['drive_signal'] = maintenanceDue < 14
    ? 'SERVICE_SOON'
    : motorEfficiency < 0.75
    ? 'MONITOR'
    : motorEfficiency < 0.85
    ? 'MONITOR'
    : 'EFFICIENT';

  return {
    engine: 'POLARIS.DRIVE',
    motor_efficiency: motorEfficiency,
    power_factor: powerFactor,
    fuel_cost_index: fuelCostIndex,
    maintenance_due_days: maintenanceDue,
    drive_signal: sig,
    recommendation: sig === 'EFFICIENT'
      ? `Drive train operating at ${(motorEfficiency*100).toFixed(0)}% efficiency. Power factor ${(powerFactor*100).toFixed(0)}%. Next maintenance in ${maintenanceDue} days.`
      : sig === 'SERVICE_SOON'
      ? `Scheduled maintenance due in ${maintenanceDue} days. Schedule lube oil change, filter inspection, belt/coupling check.`
      : `Motor efficiency degraded to ${(motorEfficiency*100).toFixed(0)}%. Fuel cost index elevated at ${fuelCostIndex}x baseline. Rewind or replace motor within 60 days.`,
  };
}

function runCryo(query: string): PolarisCryo {
  const lower = query.toLowerCase();
  const isLNG = lower.includes('lng') || lower.includes('cryo') || lower.includes('liquef');
  const isDrift = lower.includes('warm') || lower.includes('drift') || lower.includes('boil');

  if (!isLNG) {
    return {
      engine: 'POLARIS.CRYO',
      lng_temp_deviation: 0,
      boil_off_rate: 0,
      insulation_efficiency: 1.0,
      storage_pressure_psi: 0,
      cryo_signal: 'STABLE',
      recommendation: 'No LNG/cryo operations detected in query. POLARIS.CRYO standing by.',
    };
  }

  const tempDev = isDrift ? 12 : 2;
  const boilOff = isDrift ? 0.42 : 0.08;
  const insulation = isDrift ? 0.72 : 0.95;
  const pressure = isDrift ? 18 : 5;

  const sig: PolarisCryo['cryo_signal'] = boilOff > 0.3 ? 'INTERVENTION' : boilOff > 0.15 ? 'DRIFT' : 'STABLE';

  return {
    engine: 'POLARIS.CRYO',
    lng_temp_deviation: tempDev,
    boil_off_rate: boilOff,
    insulation_efficiency: insulation,
    storage_pressure_psi: pressure,
    cryo_signal: sig,
    recommendation: sig === 'STABLE'
      ? `LNG storage temperature within ${tempDev}°F of target. Boil-off rate ${(boilOff*100).toFixed(2)}%/day. Operations normal.`
      : sig === 'DRIFT'
      ? `Temperature drift detected (+${tempDev}°F). Boil-off elevated at ${(boilOff*100).toFixed(2)}%/day. Inspect insulation and vapor control systems.`
      : `INTERVENTION REQUIRED: Temperature +${tempDev}°F above target. Boil-off ${(boilOff*100).toFixed(2)}%/day exceeds safe threshold. Activate emergency venting protocol.`,
  };
}

function computeComposite(core: PolarisCore, flux: PolarisFlux, res: PolarisResonance, drive: PolarisDrive, cryo: PolarisCryo): number {
  const cryoScore = cryo.cryo_signal === 'STABLE' ? 1.0 : cryo.cryo_signal === 'DRIFT' ? 0.7 : 0.4;
  const raw =
    core.compressor_health * 30 +
    flux.flow_efficiency * 25 +
    res.pipeline_integrity * 20 +
    drive.motor_efficiency * 15 +
    cryoScore * 10;
  return Math.round(raw * 100) / 100;
}

function signalFromScore(score: number): PolarisResult['signal'] {
  if (score >= 82) return 'OPERATE';
  if (score >= 65) return 'MONITOR';
  if (score >= 45) return 'CAUTION';
  return 'SHUTDOWN';
}

// ── Main POLARIS query function ──────────────────────────────────────────────

export async function runPolaris(query: string): Promise<PolarisResult> {
  const core = runCore(query);
  const flux = runFlux(query);
  const resonance = runResonance(query);
  const drive = runDrive(query);
  const cryo = runCryo(query);

  const composite_score = computeComposite(core, flux, resonance, drive, cryo);
  const signal = signalFromScore(composite_score);

  const summary = `POLARIS composite score: ${composite_score}/100 — ${signal}. `
    + `Compressor health ${(core.compressor_health*100).toFixed(0)}% (${core.health_tier}). `
    + `Flow ${(flux.flow_efficiency*100).toFixed(0)}% efficiency. `
    + `Pipeline integrity ${(resonance.pipeline_integrity*100).toFixed(0)}%.`;

  return {
    constellation: 'POLARIS',
    domain: 'gas',
    engines_fired: ['POLARIS.CORE', 'POLARIS.FLUX', 'POLARIS.RESONANCE', 'POLARIS.DRIVE', 'POLARIS.CRYO'],
    core,
    flux,
    resonance,
    drive,
    cryo,
    composite_score,
    signal,
    summary,
  };
}
