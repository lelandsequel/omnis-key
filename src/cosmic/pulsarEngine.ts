export interface StressTest {
  scenario: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  mitigation: string;
}

export function generateStressTests(domain: string, query: string): StressTest[] {
  const lower = query.toLowerCase();

  if (domain === 'mineral') {
    const tests: StressTest[] = [
      { scenario: 'Federal mineral rights reclassification under new DOI rule', impact: 'high', probability: 0.11, mitigation: 'Accelerate lease execution before rulemaking window; consult federal mineral counsel' },
      { scenario: 'O&G price crash below $45/bbl makes extraction uneconomical', impact: 'high', probability: 0.17, mitigation: 'Evaluate royalty floor clauses; diversify across multiple operators' },
      { scenario: 'Water rights dispute triggers surface access injunction', impact: 'medium', probability: 0.22, mitigation: 'Conduct QUASAR water conflict analysis before acquisition close' },
      { scenario: 'Title defect discovered in county deed records', impact: 'critical', probability: 0.08, mitigation: 'Commission full title opinion from local O&G attorney; require title insurance' },
    ];
    if (lower.includes('ward') || lower.includes('reeves')) {
      tests.push({ scenario: 'Permian basin pipeline takeaway constraint (repeat of 2018–2019)', impact: 'medium', probability: 0.19, mitigation: 'Confirm operator has firm transport agreements before acquisition' });
    }
    return tests;
  }

  if (domain === 'civic') {
    return [
      { scenario: 'Municipal credit downgrade triggers bond covenant breach', impact: 'high', probability: 0.14, mitigation: 'Monitor Moody/S&P watch list; engage bondholder counsel proactively' },
      { scenario: 'Federal funding withdrawal from infrastructure program', impact: 'high', probability: 0.21, mitigation: 'Diversify funding sources; advance state-level alternatives' },
      { scenario: 'Legal challenge to zoning reclassification', impact: 'medium', probability: 0.33, mitigation: 'Robust public comment process; legal review of all major rezonings' },
    ];
  }

  if (domain === 'agriculture') {
    return [
      { scenario: 'Catastrophic drought (D4 classification) — crop failure >50%', impact: 'critical', probability: 0.09, mitigation: 'Crop insurance at maximum coverage; water storage contingency plan' },
      { scenario: 'USDA payment program eliminated in Farm Bill revision', impact: 'high', probability: 0.18, mitigation: 'Revenue hedging via futures; reduce fixed cost exposure' },
      { scenario: 'Commodity price collapse (-35% YoY)', impact: 'high', probability: 0.16, mitigation: 'Lock in forward contracts at current prices; cost structure review' },
      { scenario: 'Groundwater regulatory curtailment (state water board order)', impact: 'medium', probability: 0.27, mitigation: 'Convert to dryland farming capability; reduce aquifer dependency' },
    ];
  }

  if (domain === 'defense') {
    return [
      { scenario: 'Critical subsystem supplier insolvency during conflict period', impact: 'critical', probability: 0.07, mitigation: 'Dual-source qualification program; strategic inventory build' },
      { scenario: 'Export control restriction on allied component supply', impact: 'high', probability: 0.19, mitigation: 'ITAR/EAR compliance audit; domestic sourcing qualification' },
      { scenario: 'Cyber intrusion compromises production facility', impact: 'high', probability: 0.23, mitigation: 'Zero-trust architecture; airgap critical manufacturing systems' },
      { scenario: 'Congressional budget impasse delays obligated funds 6+ months', impact: 'medium', probability: 0.34, mitigation: 'Continuing resolution contingency planning; flexible contract structures' },
    ];
  }

  return [
    { scenario: 'Regulatory environment shift in core operating domain', impact: 'high', probability: 0.15, mitigation: 'Engage regulatory counsel; monitor agency rulemaking calendars' },
    { scenario: 'Macroeconomic contraction reduces demand baseline 20–30%', impact: 'medium', probability: 0.23, mitigation: 'Stress-test financials at -25% revenue; maintain liquidity buffer' },
    { scenario: 'Key counterparty insolvency', impact: 'medium', probability: 0.12, mitigation: 'Diversify counterparty exposure; require performance bonds on major contracts' },
  ];
}
