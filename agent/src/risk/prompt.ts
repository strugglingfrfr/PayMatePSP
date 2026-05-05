import type { KybData, ComplianceResult } from "../lib/types";

/**
 * Build the Bedrock Claude Haiku prompt for KYR scoring.
 *
 * Phase 2b: placeholder template.
 * Phase 2c: real prompt engineering with structured output format.
 */
// TODO PHASE 2C: refine prompt with few-shot examples and structured JSON output format
export function buildRiskPrompt(
  kyb: KybData,
  complianceResult?: ComplianceResult,
): string {
  const complianceSection = complianceResult
    ? `
## Compliance Screening Results
- Sanctions clear: ${complianceResult.sanctionsClear}
- AML flags: ${complianceResult.amlFlags.length > 0 ? complianceResult.amlFlags.join(", ") : "None"}
- PEP matches: ${complianceResult.pepMatches.length > 0 ? complianceResult.pepMatches.join(", ") : "None"}
- Adverse media: ${complianceResult.adverseMedia.length > 0 ? complianceResult.adverseMedia.join(", ") : "None"}
- Overall status: ${complianceResult.overallStatus}
- Confidence: ${complianceResult.confidence}
`
    : "\n## Compliance Screening\nNot performed (low-risk profile, cost optimization).\n";

  return `You are a credit risk analyst for PayMate, a Solana-based credit pool for Payment Service Providers.

Analyze the following KYB (Know Your Business) submission and produce a KYR (Know Your Risk) score.

## KYB Data
- Company: ${kyb.companyName}
- Jurisdiction: ${kyb.jurisdiction}
- Years in operation: ${kyb.yearsInOperation}
- Business type: ${kyb.businessType}
- Monthly transaction volume: $${kyb.monthlyTransactionVolume.toLocaleString()}
- Annual revenue: $${kyb.annualRevenue.toLocaleString()}
- AML policy in place: ${kyb.amlPolicyInPlace}
- Primary corridor: ${kyb.primaryCorridor}
${complianceSection}
## Scoring Criteria (total max = 100)
Score each criterion on its scale:
1. incorporationRegulatory (max 5)
2. businessAgeTrackRecord (max 5)
3. transactionVolumeVelocity (max 10)
4. settlementPartnerQuality (max 10)
5. corridorRemittanceRisk (max 8)
6. prefundingCycleLiquidity (max 8)
7. historicalDataAuditTrail (max 8)
8. bankFloatManagement (max 7)
9. financialStrength (max 10)
10. amlComplianceHealth (max 8)
11. technologyIntegration (max 5)
12. guarantorsCollateral (max 5)
13. previousFinancingPayback (max 7)
14. creditBureau (max 4)

## Output Format
Respond with valid JSON only:
{
  "scores": { "<criterion>": <number>, ... },
  "totalScore": <number>,
  "rating": "AAA" | "AA" | "A" | "B/C",
  "reasoning": "<2-4 sentences>"
}

Rating thresholds:
- AAA: 85-100
- AA: 70-84
- A: 55-69
- B/C: 0-54
`;
}
