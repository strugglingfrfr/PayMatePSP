// AWS Bedrock client — Claude Haiku 4.5 KYR scoring.
//
// Uses Lambda's IAM execution role (paymate-lambda-exec has
// AmazonBedrockFullAccess) — no API keys needed in env.
//
// On any Bedrock failure (timeout, parse error, throttle), falls back to
// the deterministic heuristic so the agent never returns a 500.

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { KybData, KyrScore, KyrRating, ComplianceResult } from "./types";
import { buildRiskPrompt } from "../risk/prompt";

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ??
  "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const bedrock = new BedrockRuntimeClient({});

const KYR_KEYS = [
  "incorporationRegulatory",
  "businessAgeTrackRecord",
  "transactionVolumeVelocity",
  "settlementPartnerQuality",
  "corridorRemittanceRisk",
  "prefundingCycleLiquidity",
  "historicalDataAuditTrail",
  "bankFloatManagement",
  "financialStrength",
  "amlComplianceHealth",
  "technologyIntegration",
  "guarantorsCollateral",
  "previousFinancingPayback",
  "creditBureau",
] as const;

const MAX_BY_KEY: Record<(typeof KYR_KEYS)[number], number> = {
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

export async function scoreKyb(
  kyb: KybData,
  complianceResult?: ComplianceResult,
): Promise<KyrScore> {
  try {
    const prompt = buildRiskPrompt(kyb, complianceResult);
    const cmd = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: {
        maxTokens: 800,
        temperature: 0.2,
      },
    });

    const response = await bedrock.send(cmd);
    const text = response.output?.message?.content?.[0]?.text;
    if (!text) throw new Error("empty Bedrock response");

    const parsed = parseKyrJson(text);
    return clampAndValidate(parsed, complianceResult);
  } catch (err) {
    // Fallback so the agent never 500s on Bedrock hiccups.
    console.error(
      "Bedrock scoring failed, using heuristic fallback:",
      err instanceof Error ? err.message : err,
    );
    return heuristicScore(kyb, complianceResult);
  }
}

// Strip preamble/markdown fences if Claude added any, then JSON.parse.
function parseKyrJson(text: string): {
  scores: Record<string, number>;
  totalScore: number;
  rating: KyrRating;
  reasoning: string;
} {
  let s = text.trim();
  // Strip ```json ... ``` fences if present
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Find first { and last } to be tolerant of any preamble
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

function clampAndValidate(
  raw: {
    scores: Record<string, number>;
    totalScore: number;
    rating: KyrRating;
    reasoning: string;
  },
  complianceResult?: ComplianceResult,
): KyrScore {
  // Clamp each score to its max so the model can't over-assign.
  const scores = {} as KyrScore["scores"];
  for (const key of KYR_KEYS) {
    const raw_v = Number(raw.scores?.[key] ?? 0);
    const max = MAX_BY_KEY[key];
    scores[key] = Math.max(0, Math.min(max, Math.round(raw_v)));
  }
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  // Recompute rating from totalScore (don't trust the model's rating field —
  // anchor it to the bands we use on-chain for personal_rate_bps).
  const rating: KyrRating =
    totalScore >= 90 ? "AAA"
    : totalScore >= 80 ? "AA"
    : totalScore >= 65 ? "A"
    : "B/C";

  return {
    scores,
    totalScore,
    rating,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
    complianceCalled: false, // caller sets this
    complianceResult,
  };
}

// ----------------------------------------------------------------------------
// Heuristic fallback (originally the Phase 2b stub) — kept as last-resort.
// ----------------------------------------------------------------------------

function heuristicScore(
  kyb: KybData,
  complianceResult?: ComplianceResult,
): KyrScore {
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

  if (complianceResult?.overallStatus === "FLAGGED") {
    baseScore = Math.max(30, baseScore - 15);
    if (rating === "AA") rating = "A";
    else if (rating === "A") rating = "B/C";
  }

  const ratio = baseScore / 100;
  const scores = {} as KyrScore["scores"];
  for (const key of KYR_KEYS) {
    scores[key] = Math.round(MAX_BY_KEY[key] * ratio);
  }
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  return {
    scores,
    totalScore,
    rating,
    reasoning: `Heuristic fallback (Bedrock unavailable). ${kyb.companyName} (${kyb.businessType}, ${kyb.jurisdiction}, ${kyb.yearsInOperation}y) — ${rating} rating from amlPolicy=${hasAml}, mature=${mature}, revenue=$${kyb.annualRevenue}.`,
    complianceCalled: false,
    complianceResult,
  };
}
