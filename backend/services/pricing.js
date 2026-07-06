// Pricing helpers for AWS Lambda cost estimation.
//
// AWS publishes a single global on-demand price for the "standard" pricing tier, which covers
// the vast majority of commercial regions. A small set of regions (South America, Africa,
// Middle East and a few Asia Pacific regions) use different, generally higher, pricing that
// AWS does not expose through a stable public API. For those we fall back to the standard tier
// and clearly flag the estimate as a fallback so it is never presented as an exact value.
//
// Docs: https://aws.amazon.com/lambda/pricing/

const STANDARD_TIER = {
  requestPrice: 0.20 / 1_000_000, // USD per request
  gbSecondPrice: 0.0000166667 // USD per GB-second
};

const STANDARD_TIER_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1', 'ca-west-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
  'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-4',
  'ap-south-1', 'ap-south-2',
  'il-central-1'
];

const resolvePricing = (region) => {
  const normalizedRegion = (region || '').toString().toLowerCase().trim();

  if (STANDARD_TIER_REGIONS.includes(normalizedRegion)) {
    return {
      pricingRegion: normalizedRegion,
      pricingSource: 'standard',
      ...STANDARD_TIER
    };
  }

  return {
    pricingRegion: normalizedRegion || 'us-east-2',
    pricingSource: 'fallback',
    ...STANDARD_TIER
  };
};

const calculateCostEstimate = ({ invocations, avgDurationMs, memoryMb, region, periodLabel }) => {
  const pricing = resolvePricing(region);
  const memoryMB = memoryMb || 128;
  const avgDurationSeconds = (avgDurationMs || 0) / 1000;
  const memoryGB = memoryMB / 1024;
  const safeInvocations = Number.isFinite(invocations) ? invocations : 0;
  const totalGBSeconds = safeInvocations * avgDurationSeconds * memoryGB;

  const requestCost = safeInvocations * pricing.requestPrice;
  const computeCost = totalGBSeconds * pricing.gbSecondPrice;

  return {
    totalInvocations: safeInvocations,
    totalGBSeconds,
    requestCost,
    computeCost,
    totalCost: requestCost + computeCost,
    currency: 'USD',
    period: periodLabel,
    pricingRegion: pricing.pricingRegion,
    pricingSource: pricing.pricingSource
  };
};

module.exports = {
  STANDARD_TIER_REGIONS,
  resolvePricing,
  calculateCostEstimate
};
