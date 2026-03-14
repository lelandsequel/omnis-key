export interface TimeArc {
  horizon: '30d' | '90d' | '1y' | '3y';
  probability: number;
  scenario: string;
}

export function generateTimeArcs(domain: string, decision: string, query: string): TimeArc[] {
  const lower = query.toLowerCase();

  if (domain === 'mineral') {
    if (lower.includes('ward') || lower.includes('permian')) {
      return [
        { horizon: '30d', probability: 0.84, scenario: 'Lease auction activity continues at elevated pace; no macro headwinds detected' },
        { horizon: '90d', probability: 0.71, scenario: 'Federal permitting review window opens; potential 6–8 week delay on new approvals' },
        { horizon: '1y', probability: 0.58, scenario: 'O&G price cycle inflection (WTI $68–$74 range) creates acquisition opportunity window' },
        { horizon: '3y', probability: 0.43, scenario: 'Energy transition pressure begins compressing Permian royalty multiples; diversification advised' },
      ];
    }
    return [
      { horizon: '30d', probability: 0.79, scenario: 'Current mineral rights market stable; no near-term regulatory triggers' },
      { horizon: '90d', probability: 0.64, scenario: 'Seasonal drilling slowdown may depress lease bonus activity 15–20%' },
      { horizon: '1y', probability: 0.51, scenario: 'Basin-wide production plateau possible; monitor operator capex guidance' },
      { horizon: '3y', probability: 0.38, scenario: 'Structural demand shift creates bifurcation between tier-1 and tier-2 acreage' },
    ];
  }

  if (domain === 'civic') {
    return [
      { horizon: '30d', probability: 0.88, scenario: 'Municipal budget cycle on track; no immediate service disruption risk' },
      { horizon: '90d', probability: 0.67, scenario: 'Q2 budget revision may trigger infrastructure deferrals in 3 key districts' },
      { horizon: '1y', probability: 0.52, scenario: 'Bond rating review window; potential downgrade risk if deficit persists' },
      { horizon: '3y', probability: 0.41, scenario: 'Population stabilization contingent on economic development incentive execution' },
    ];
  }

  if (domain === 'agriculture') {
    return [
      { horizon: '30d', probability: 0.82, scenario: 'Planting season on schedule; weather pattern neutral to positive' },
      { horizon: '90d', probability: 0.61, scenario: 'Mid-season drought probability 34% based on La Niña persistence pattern' },
      { horizon: '1y', probability: 0.47, scenario: 'USDA commodity price support maintains floor; net income stable if yield -15% or better' },
      { horizon: '3y', probability: 0.35, scenario: 'Aquifer depletion forces irrigation reduction; transition to dryland crop mix advised' },
    ];
  }

  if (domain === 'defense') {
    return [
      { horizon: '30d', probability: 0.91, scenario: 'No immediate supply chain disruption signal; existing inventory buffer adequate' },
      { horizon: '90d', probability: 0.72, scenario: 'Allied production ramp-up reduces single-source exposure by estimated 18%' },
      { horizon: '1y', probability: 0.54, scenario: 'NDAA Section 889 compliance review may delay procurement cycle by 2 quarters' },
      { horizon: '3y', probability: 0.39, scenario: 'Re-shoring initiatives reduce foreign dependency below threshold; full readiness restored' },
    ];
  }

  return [
    { horizon: '30d', probability: 0.80, scenario: 'Near-term conditions stable; no major disruption signals detected' },
    { horizon: '90d', probability: 0.65, scenario: 'Moderate volatility window; recommend monitoring key indicators' },
    { horizon: '1y', probability: 0.50, scenario: 'Medium-term outlook balanced; multiple scenarios within tolerable variance' },
    { horizon: '3y', probability: 0.37, scenario: 'Long-term structural shift underway; position accordingly' },
  ];
}
