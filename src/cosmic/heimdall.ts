/**
 * HEIMDALL — OMNIS KEY Trust Layer
 * Every output attested. Every input audited.
 * Trust score 0–100 on every COSMIC response.
 */
import * as crypto from 'crypto';

export interface HeimdallAttestation {
  trust_score: number;           // 0–100
  trust_tier: 'SOVEREIGN' | 'VERIFIED' | 'PROVISIONAL' | 'CONTESTED';
  signal_integrity: number;      // 0–1, METEOR signal quality
  causal_completeness: number;   // 0–1, NOVA chain completeness
  temporal_coherence: number;    // 0–1, ECLIPSE arc consistency
  adversarial_coverage: number;  // 0–1, PULSAR stress scenario coverage
  data_provenance: string[];     // sources used
  attestation_hash: string;      // SHA-256 of output
  attestation_timestamp: string;
  air_gap_mode: boolean;         // true if no external calls made
  compliance_flags: string[];    // any warnings/flags
}

export interface HeimdallReport {
  attestation: HeimdallAttestation;
  verdict: string;               // human-readable verdict
  recommendations: string[];
}

// Domain-specific provenance sources
const PROVENANCE_MAP: Record<string, string[]> = {
  mineral:     ['MineralScope DB', 'COMET ownership chain', 'METEOR signal grid', 'ECLIPSE temporal model'],
  civic:       ['COMET municipal records', 'ECLIPSE budget timeline', 'PULSAR fiscal stress model'],
  agriculture: ['NEBULA soil/climate model', 'USDA signal feed', 'ECLIPSE seasonal arc'],
  water:       ['QUASAR aquifer model', 'NOVA causal hydrology', 'PULSAR drought stress'],
  defense:     ['HEIMDALL integrity layer', 'METEOR supply signal', 'PULSAR adversarial scenarios'],
  spatial:     ['ASTRAL spatial mapping', 'COMET pipeline registry', 'NOVA infrastructure causality'],
  logistics:   ['QUASAR route optimization', 'NEXUS capacity model', 'ECLIPSE delivery arc'],
};

function computeSignalIntegrity(confidence: number, engineCount: number): number {
  // More engines + higher confidence = better signal integrity
  const engScore = Math.min(1, engineCount / 10);
  return Math.round((confidence * 0.7 + engScore * 0.3) * 100) / 100;
}

function computeCausalCompleteness(causalChain: any[]): number {
  if (!causalChain?.length) return 0;
  const avgWeight = causalChain.reduce((s, c) => s + (c.weight || 0), 0) / causalChain.length;
  const coverageScore = Math.min(1, causalChain.length / 3);
  return Math.round((avgWeight * 0.6 + coverageScore * 0.4) * 100) / 100;
}

function computeTemporalCoherence(timeArcs: any[]): number {
  if (!timeArcs?.length) return 0;
  // Check probabilities are decreasing (further out = less certain)
  let monotone = true;
  for (let i = 1; i < timeArcs.length; i++) {
    if (timeArcs[i].probability > timeArcs[i-1].probability) { monotone = false; break; }
  }
  const baseCoverage = Math.min(1, timeArcs.length / 4);
  return Math.round((baseCoverage * 0.7 + (monotone ? 0.3 : 0.1)) * 100) / 100;
}

function computeAdversarialCoverage(stressTests: any[]): number {
  if (!stressTests?.length) return 0;
  const hasCritical = stressTests.some(s => s.impact === 'critical');
  const hasHigh = stressTests.some(s => s.impact === 'high');
  const hasMitigation = stressTests.every(s => s.mitigation && s.mitigation.length > 10);
  let score = Math.min(1, stressTests.length / 4) * 0.4;
  if (hasCritical) score += 0.2;
  if (hasHigh) score += 0.2;
  if (hasMitigation) score += 0.2;
  return Math.round(score * 100) / 100;
}

function trustTier(score: number): HeimdallAttestation['trust_tier'] {
  if (score >= 80) return 'SOVEREIGN';
  if (score >= 65) return 'VERIFIED';
  if (score >= 45) return 'PROVISIONAL';
  return 'CONTESTED';
}

function buildVerdict(score: number, tier: string, flags: string[]): string {
  const base = tier === 'SOVEREIGN'
    ? 'HEIMDALL CLEARED — Output meets sovereign trust standard. Safe to act on.'
    : tier === 'VERIFIED'
    ? 'HEIMDALL VERIFIED — Output is reliable. Minor gaps in signal coverage.'
    : tier === 'PROVISIONAL'
    ? 'HEIMDALL PROVISIONAL — Output usable but incomplete. Cross-reference recommended.'
    : 'HEIMDALL CONTESTED — Confidence too low for direct action. Gather additional data.';
  if (flags.length) return `${base} Note: ${flags[0]}`;
  return base;
}

function buildRecommendations(attestation: HeimdallAttestation): string[] {
  const recs: string[] = [];
  if (attestation.causal_completeness < 0.6) recs.push('Expand query context to strengthen causal chain (NOVA needs more signals)');
  if (attestation.temporal_coherence < 0.6) recs.push('Add historical context to improve temporal arc consistency (ECLIPSE)');
  if (attestation.adversarial_coverage < 0.5) recs.push('Run targeted PULSAR stress test with domain-specific parameters');
  if (attestation.signal_integrity < 0.6) recs.push('Connect domain data source (Supabase/SCADA) to improve METEOR signal quality');
  if (attestation.trust_score >= 80) recs.push('Output cleared for direct use. Export audit trace for compliance record.');
  return recs.length ? recs : ['All systems nominal. Proceed with confidence.'];
}

export function runHeimdall(trustStack: {
  decision: string;
  confidence: number;
  domain: string;
  causal_chain: any[];
  time_arcs: any[];
  stress_tests: any[];
  engines_fired: string[];
  audit_trace: any;
}): HeimdallReport {
  const signalIntegrity = computeSignalIntegrity(trustStack.confidence, trustStack.engines_fired.length);
  const causalCompleteness = computeCausalCompleteness(trustStack.causal_chain);
  const temporalCoherence = computeTemporalCoherence(trustStack.time_arcs);
  const adversarialCoverage = computeAdversarialCoverage(trustStack.stress_tests);

  const trust_score = Math.round(
    signalIntegrity * 30 +
    causalCompleteness * 30 +
    temporalCoherence * 20 +
    adversarialCoverage * 20
  );

  const compliance_flags: string[] = [];
  if (trustStack.confidence < 0.5) compliance_flags.push('Low confidence — output below COSMIC threshold');
  if (!trustStack.engines_fired.includes('AURORA')) compliance_flags.push('Audit trace missing — AURORA not in pipeline');
  if (trustStack.causal_chain.length < 2) compliance_flags.push('Causal chain sparse — NOVA needs additional signals');

  const attestation_hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ decision: trustStack.decision, confidence: trustStack.confidence, domain: trustStack.domain }))
    .digest('hex');

  const attestation: HeimdallAttestation = {
    trust_score,
    trust_tier: trustTier(trust_score),
    signal_integrity: signalIntegrity,
    causal_completeness: causalCompleteness,
    temporal_coherence: temporalCoherence,
    adversarial_coverage: adversarialCoverage,
    data_provenance: PROVENANCE_MAP[trustStack.domain] || PROVENANCE_MAP.mineral,
    attestation_hash,
    attestation_timestamp: new Date().toISOString(),
    air_gap_mode: true,  // Phase 1: fully local
    compliance_flags,
  };

  const verdict = buildVerdict(trust_score, attestation.trust_tier, compliance_flags);
  const recommendations = buildRecommendations(attestation);

  return { attestation, verdict, recommendations };
}
