// PHASE 2C: replace with real Bedrock invoke using @aws-sdk/client-bedrock-runtime
// TODO PHASE 2C: import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import type { KybData, KyrScore, KyrRating, ComplianceResult } from "./types";

/**
 * Score a KYB submission using AI analysis.
 *
 * 2b STUB — returns deterministic scores from simple heuristics so the
 * deployed agent is testable end-to-end without needing Bedrock yet.
 *
 * Phase 2c replaces this with a real Bedrock Claude Haiku invocation.
 */
export async function scoreKyb(
  kyb: KybData,
  complianceResult?: ComplianceResult,
): Promise<KyrScore> {
  // TODO PHASE 2C: replace with real Bedrock invoke
  // const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  // const prompt = buildPrompt(kyb, complianceResult);
  // const response = await client.send(new InvokeModelCommand({ ... }));

  // Deterministic stub scoring
  const hasAml = kyb.amlPolicyInPlace;
  const mature = kyb.yearsInOperation >= 3;
  const goodRevenue = kyb.annualRevenue > 1_000_000;
  const highRevenue = kyb.annualRevenue > 10_000_000;

  let rating: KyrRating;
  let baseScore: number;

  if (highRevenue && hasAml && mature) {
    rating = "AA";
    baseScore = 82;
  } else if (hasAml && mature && goodRevenue) {
    rating = "A";
    baseScore = 70;
  } else {
    rating = "B/C";
    baseScore = 50;
  }

  // Adjust if compliance flagged issues
  if (complianceResult?.overallStatus === "FLAGGED") {
    baseScore = Math.max(30, baseScore - 15);
    if (rating === "AA") rating = "A";
    else if (rating === "A") rating = "B/C";
  }

  const scores = distributeScores(baseScore);
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  const reasoning = buildReasoning(kyb, rating, complianceResult);

  return {
    scores,
    totalScore,
    rating,
    reasoning,
    complianceCalled: false, // caller sets this
    complianceResult,
  };
}

/**
 * Distribute a target total across the 14 KYR criteria proportionally
 * to their max values.
 */
function distributeScores(
  target: number,
): Record<string, number> {
  const maxScores: Record<string, number> = {
    incorporationRegulatory: 5,
    businessAgeTrackRecord: 5,
    transactionVolumeVelocity: 10,
    settlementPartnerQuality: 10,
    corridorRemittanceRisk: 8,
    prefundingCycleLiquidity: 8,
    historicalDataAuditTrail: 8,
    bankFloatManagement: 7,
    financialStrength: 10,
    amlComplianceHealth: 8,
    technologyIntegration: 5,
    guarantorsCollateral: 5,
    previousFinancingPayback: 7,
    creditBureau: 4,
  };

  const totalMax = 100;
  const ratio = target / totalMax;

  const result: Record<string, number> = {};
  for (const [key, max] of Object.entries(maxScores)) {
    result[key] = Math.round(max * ratio);
  }
  return result;
}

function buildReasoning(
  kyb: KybData,
  rating: KyrRating,
  complianceResult?: ComplianceResult,
): string {
  const parts: string[] = [];

  parts.push(
    `${kyb.companyName} is a ${kyb.businessType} operating in ${kyb.jurisdiction} for ${kyb.yearsInOperation} years.`,
  );

  if (rating === "AA" || rating === "AAA") {
    parts.push(
      "Strong financial profile with established track record and robust compliance framework.",
    );
  } else if (rating === "A") {
    parts.push(
      "Adequate financial standing with room for improvement in operational maturity.",
    );
  } else {
    parts.push(
      "Limited track record or financial indicators suggest elevated risk profile.",
    );
  }

  if (complianceResult?.overallStatus === "FLAGGED") {
    parts.push(
      `Compliance screening raised flags: ${complianceResult.amlFlags.length} AML, ${complianceResult.pepMatches.length} PEP, ${complianceResult.adverseMedia.length} adverse media hits.`,
    );
  }

  return parts.join(" ");
}
