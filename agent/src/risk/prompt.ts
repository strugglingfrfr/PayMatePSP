import type { KybData, ComplianceResult } from "../lib/types";

/**
 * Build the Bedrock Claude Haiku prompt for KYR scoring.
 *
 * Returns a strict-JSON-output prompt asking Claude to score the PSP
 * against the 14-criteria KYR matrix. The same matrix used in PayMate v1
 * (EthGlobal Cannes 2026) — proven scoring framework.
 *
 * Rating bands match v1: AAA ≥90, AA 80-89, A 65-79, B/C <65.
 * These bands feed into the on-chain personal_rate_bps via the admin
 * approval flow (AAA → 30 bps/day, AA → 45, A → 60, B/C → 85).
 */
export function buildRiskPrompt(
  kyb: KybData,
  complianceResult?: ComplianceResult,
): string {
  const complianceSection = complianceResult
    ? `
## Compliance Screening Results (specialized sub-agent output)
- Sanctions clear: ${complianceResult.sanctionsClear}
- AML flags: ${complianceResult.amlFlags.length > 0 ? complianceResult.amlFlags.join(", ") : "none"}
- PEP matches: ${complianceResult.pepMatches.length > 0 ? complianceResult.pepMatches.join(", ") : "none"}
- Adverse media: ${complianceResult.adverseMedia.length > 0 ? complianceResult.adverseMedia.join(", ") : "none"}
- Overall: ${complianceResult.overallStatus} (confidence ${complianceResult.confidence})

Use this to inform amlComplianceHealth and creditBureau scores. FLAGGED status caps the rating at A.
`
    : `
## Compliance Screening
Not performed (low-volume profile, sub-$1M monthly, low-risk corridor — cost-optimization decision by the agent). Score amlComplianceHealth based on stated AML policy alone.
`;

  return `You are a senior credit underwriter at PayMate — a Solana-based stablecoin credit pool for Payment Service Providers (PSPs). You score PSP applicants on a 14-criteria KYR matrix that determines their on-chain credit terms.

Analyze the KYB submission below and return a strict-JSON KYR assessment.

## KYB Submission
- Company name: ${kyb.companyName}
- Jurisdiction: ${kyb.jurisdiction}
- Years in operation: ${kyb.yearsInOperation}
- Business type: ${kyb.businessType}
- Monthly transaction volume: $${kyb.monthlyTransactionVolume.toLocaleString()} USD
- Annual revenue: $${kyb.annualRevenue.toLocaleString()} USD
- AML policy in place: ${kyb.amlPolicyInPlace}
- Primary corridor: ${kyb.primaryCorridor}
${complianceSection}
## Scoring Rubric (each criterion graded out of its max; total = 100)

| # | Criterion | Max | What you're judging |
|---|-----------|-----|---------------------|
| 1 | incorporationRegulatory | 5 | Quality of jurisdiction's regulatory regime (FATF-compliant > offshore) |
| 2 | businessAgeTrackRecord | 5 | Years operating; >5y = full marks, <2y = low |
| 3 | transactionVolumeVelocity | 10 | Volume scale + velocity stability |
| 4 | settlementPartnerQuality | 10 | Quality of settlement banks/PSPs (inferred from volume + jurisdiction) |
| 5 | corridorRemittanceRisk | 8 | Risk of the corridor (e.g. NG-GB higher than GB-FR) |
| 6 | prefundingCycleLiquidity | 8 | Ability to handle T+1/T+2 prefunding gaps |
| 7 | historicalDataAuditTrail | 8 | Operational maturity proxy (years × volume) |
| 8 | bankFloatManagement | 7 | Cash management sophistication |
| 9 | financialStrength | 10 | Revenue scale + likely margins |
| 10 | amlComplianceHealth | 8 | AML policy + compliance screening result |
| 11 | technologyIntegration | 5 | API/SDK readiness (assumed mid-tier unless flagged) |
| 12 | guarantorsCollateral | 5 | Default 3 unless info suggests better |
| 13 | previousFinancingPayback | 7 | Default 5 if no flags from compliance |
| 14 | creditBureau | 4 | Default 3 unless adverse media |

## Rating Bands (apply strictly)
- **AAA**: totalScore ≥ 90 (premium, lowest borrowing rate)
- **AA**: totalScore 80–89
- **A**: totalScore 65–79
- **B/C**: totalScore < 65 (highest borrowing rate)

## Output Schema
Return ONLY this JSON, no preamble, no markdown fences, no trailing text:

{
  "scores": {
    "incorporationRegulatory": <int 0-5>,
    "businessAgeTrackRecord": <int 0-5>,
    "transactionVolumeVelocity": <int 0-10>,
    "settlementPartnerQuality": <int 0-10>,
    "corridorRemittanceRisk": <int 0-8>,
    "prefundingCycleLiquidity": <int 0-8>,
    "historicalDataAuditTrail": <int 0-8>,
    "bankFloatManagement": <int 0-7>,
    "financialStrength": <int 0-10>,
    "amlComplianceHealth": <int 0-8>,
    "technologyIntegration": <int 0-5>,
    "guarantorsCollateral": <int 0-5>,
    "previousFinancingPayback": <int 0-7>,
    "creditBureau": <int 0-4>
  },
  "totalScore": <int — sum of scores>,
  "rating": "AAA" | "AA" | "A" | "B/C",
  "reasoning": "<2-3 sentences citing the strongest positive and the most material concern>"
}`;
}
