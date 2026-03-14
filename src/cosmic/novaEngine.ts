export interface CausalLink {
  cause: string;
  effect: string;
  weight: number;
}

const MINERAL_CHAINS: Record<string, CausalLink[]> = {
  default: [
    { cause: 'Permian Basin proximity', effect: 'High mineral density (87th percentile)', weight: 0.91 },
    { cause: 'Active O&G lease activity (2023–2025)', effect: 'Elevated surface rights risk', weight: 0.74 },
    { cause: 'Royalty rate compression in basin', effect: 'Net revenue interest below historical avg', weight: 0.61 },
  ],
  ward: [
    { cause: 'Ward County sits in Permian Delaware sub-basin', effect: 'Wolfcamp/Bone Spring stacked pay (top 5% nationally)', weight: 0.94 },
    { cause: 'Operator density: 14 active permits Q1 2026', effect: 'Drilling velocity accelerating', weight: 0.82 },
    { cause: 'Water table depth avg 340ft', effect: 'Reduced QUASAR conflict risk', weight: 0.63 },
  ],
  reeves: [
    { cause: 'Reeves County — highest Delaware Basin production', effect: 'Mineral values at 30-year peak', weight: 0.96 },
    { cause: 'Pioneer/Exxon mega-operator presence', effect: 'Low counterparty default risk', weight: 0.88 },
    { cause: 'Surface pipeline infrastructure saturated', effect: 'Marginal takeaway risk elevated', weight: 0.57 },
  ],
};

const CIVIC_CHAINS: CausalLink[] = [
  { cause: 'Municipal budget deficit trend (-8% YoY)', effect: 'Elevated infrastructure maintenance risk', weight: 0.78 },
  { cause: 'Zoning reclassification activity +23%', effect: 'Land use volatility increasing', weight: 0.65 },
  { cause: 'Population outflow from core districts', effect: 'Tax base erosion risk in 18-month window', weight: 0.71 },
];

const AGRICULTURE_CHAINS: CausalLink[] = [
  { cause: 'Soil moisture deficit 3rd consecutive season', effect: 'Crop yield forecast -18% below 10yr avg', weight: 0.83 },
  { cause: 'Aquifer drawdown rate 2.3ft/yr (Ogallala)', effect: 'Irrigated agriculture viability declining', weight: 0.77 },
  { cause: 'USDA payment program eligibility maintained', effect: 'Near-term revenue floor intact', weight: 0.69 },
];

const DEFENSE_CHAINS: CausalLink[] = [
  { cause: 'Supply chain concentration in single-source components', effect: 'Production halt risk under adversarial disruption', weight: 0.88 },
  { cause: 'Lead time for critical subsystems averaging 14 months', effect: 'Readiness gap within 24-month window', weight: 0.79 },
  { cause: 'Allied production capacity constrained post-Ukraine surge', effect: 'Stockpile replenishment timeline extended', weight: 0.72 },
];

function detectCounty(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('ward')) return 'ward';
  if (lower.includes('reeves')) return 'reeves';
  return 'default';
}

export function generateCausalChain(domain: string, query: string): CausalLink[] {
  if (domain === 'mineral') return MINERAL_CHAINS[detectCounty(query)] || MINERAL_CHAINS.default;
  if (domain === 'civic') return CIVIC_CHAINS;
  if (domain === 'agriculture') return AGRICULTURE_CHAINS;
  if (domain === 'defense') return DEFENSE_CHAINS;
  return MINERAL_CHAINS.default;
}
