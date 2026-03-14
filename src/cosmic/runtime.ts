import { generateCausalChain, CausalLink } from './novaEngine';
import { generateTimeArcs, TimeArc } from './eclipseEngine';
import { generateStressTests, StressTest } from './pulsarEngine';
import { generateAuditTrace, AuditTrace } from './auroraEngine';
import { runHeimdall, HeimdallReport } from './heimdall';
import { enrichDecision } from './ollama';
import { getConstellationForDomain } from '../constellations/registry';
import { getConfig } from '../config';

export interface TrustStack {
  decision: string;
  confidence: number;
  domain: string;
  causal_chain: CausalLink[];
  time_arcs: TimeArc[];
  stress_tests: StressTest[];
  engines_fired: string[];
  audit_trace: AuditTrace;
  heimdall: HeimdallReport;
  ollama_enriched?: boolean;
  constellation_signal?: any;
  timestamp: string;
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  mineral:     ['mineral', 'royalt', 'lease', 'o&g', 'oil', 'gas', 'drilling', 'permian', 'basin', 'county', 'acre', 'nri', 'working interest'],
  civic:       ['municipal', 'city', 'zoning', 'infrastructure', 'budget', 'bond', 'permit', 'council'],
  agriculture: ['crop', 'soil', 'farm', 'yield', 'irrigation', 'drought', 'usda', 'commodity', 'grain'],
  water:       ['aquifer', 'water', 'groundwater', 'flood', 'riparian'],
  defense:     ['defense', 'military', 'ndaa', 'contractor', 'procurement', 'dod', 'weapon', 'readiness'],
  gas:         ['compressor', 'compression', 'pipeline pressure', 'gas flow', 'cryo', 'lng', 'midstream'],
  spatial:     ['right of way', 'easement', 'corridor', 'row', 'survey'],
  logistics:   ['supply chain', 'transport', 'route', 'logistics', 'distribution'],
};

const DOMAIN_ENGINES: Record<string, string[]> = {
  mineral:     ['CHRONOS', 'METEOR', 'COMET', 'NOVA', 'ECLIPSE', 'NEBULA', 'PULSAR', 'ASTRAL', 'QUASAR', 'AURORA', 'CRUCIBLE'],
  civic:       ['CHRONOS', 'COMET', 'NOVA', 'ECLIPSE', 'PULSAR', 'ASTRAL', 'AURORA'],
  agriculture: ['CHRONOS', 'NEBULA', 'NOVA', 'ECLIPSE', 'PULSAR', 'QUASAR', 'AURORA'],
  water:       ['CHRONOS', 'QUASAR', 'NOVA', 'ECLIPSE', 'PULSAR', 'AURORA'],
  defense:     ['CHRONOS', 'METEOR', 'NOVA', 'ECLIPSE', 'PULSAR', 'HEIMDALL', 'AURORA'],
  gas:         ['CHRONOS', 'POLARIS.CORE', 'POLARIS.FLUX', 'POLARIS.RESONANCE', 'NOVA', 'ECLIPSE', 'PULSAR', 'AURORA'],
  spatial:     ['CHRONOS', 'ASTRAL', 'NOVA', 'ECLIPSE', 'PULSAR', 'AURORA'],
  logistics:   ['CHRONOS', 'QUASAR', 'NEXUS', 'NOVA', 'ECLIPSE', 'PULSAR', 'AURORA'],
};

function detectDomain(query: string): string {
  const lower = query.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = keywords.filter(kw => lower.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'mineral';
}

function computeConfidence(causal_chain: CausalLink[], stress_tests: StressTest[]): number {
  const avgCausal = causal_chain.reduce((s, c) => s + c.weight, 0) / (causal_chain.length || 1);
  const highRisk = stress_tests.filter(s => s.impact === 'high' || s.impact === 'critical');
  const riskPenalty = highRisk.reduce((s, t) => s + t.probability, 0) * 0.15;
  return Math.round(Math.max(0.3, Math.min(0.97, avgCausal - riskPenalty)) * 100) / 100;
}

function buildDecision(domain: string, query: string, confidence: number, constellationSignal?: any): string {
  const labels: Record<string, string> = {
    mineral:     'METEOR mineral intelligence',
    civic:       'COMET civic intelligence',
    agriculture: 'NEBULA agricultural intelligence',
    water:       'QUASAR aquifer analytics',
    defense:     'HEIMDALL defense integrity',
    gas:         'POLARIS compression intelligence',
    spatial:     'ASTRAL spatial mapping',
    logistics:   'QUASAR/NEXUS logistics optimization',
  };
  const signal = confidence > 0.75 ? 'BUY' : confidence > 0.55 ? 'HOLD' : 'WATCH';

  let base = `${labels[domain] || 'COSMIC intelligence'} analysis for: "${query.slice(0, 60)}". Signal: ${signal}. Confidence: ${(confidence * 100).toFixed(0)}%.`;

  if (constellationSignal?.polaris_signal?.recommendation) {
    base += ` ${constellationSignal.polaris_signal.recommendation}`;
  } else {
    base += ' Full causal chain and temporal arcs attached.';
  }

  return base;
}

export class CosmicRuntime {
  async query(text: string, domainHint?: string): Promise<TrustStack> {
    const domain = domainHint && domainHint !== 'auto' ? domainHint : detectDomain(text);
    const cfg = getConfig();

    // Check for constellation override
    const constellation = getConstellationForDomain(domain);
    let constellationSignal: any = undefined;
    if (constellation?.query) {
      try {
        constellationSignal = await constellation.query(text);
      } catch {}
    }

    let engines = DOMAIN_ENGINES[domain] || DOMAIN_ENGINES.mineral;
    if (constellation) {
      // Add constellation engines to the fired list
      engines = [...new Set([...engines, ...constellation.manifest.engines])];
    }

    const causal_chain = generateCausalChain(domain, text);
    const time_arcs = generateTimeArcs(domain, text, text);
    const stress_tests = generateStressTests(domain, text);
    const confidence = computeConfidence(causal_chain, stress_tests);

    // Optional Ollama enrichment
    let decision = buildDecision(domain, text, confidence, constellationSignal);
    let ollamaEnriched = false;

    if ((cfg as any).ollamaEnabled !== false) {
      try {
        const ollamaResult = await enrichDecision(text, domain, confidence, causal_chain);
        if (ollamaResult.enriched && ollamaResult.enhanced_decision) {
          decision = ollamaResult.enhanced_decision;
          ollamaEnriched = true;
          engines = [...engines, `OLLAMA(${ollamaResult.model_used})`];
        }
      } catch {}
    }

    const audit_trace = generateAuditTrace(text, domain, engines, confidence);

    // Run HEIMDALL
    const heimdall = runHeimdall({
      decision,
      confidence,
      domain,
      causal_chain,
      time_arcs,
      stress_tests,
      engines_fired: engines,
      audit_trace,
    });

    return {
      decision,
      confidence,
      domain,
      causal_chain,
      time_arcs,
      stress_tests,
      engines_fired: engines,
      audit_trace,
      heimdall,
      ollama_enriched: ollamaEnriched,
      constellation_signal: constellationSignal,
      timestamp: new Date().toISOString(),
    };
  }
}

export const cosmicRuntime = new CosmicRuntime();
