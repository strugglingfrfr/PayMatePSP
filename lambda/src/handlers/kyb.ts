// KYB endpoints. Phase 2d wires the orchestrator → Risk Agent x402 call.

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { Tables, putItem, queryByPartition } from "../lib/ddb";
import type {
  ApiResponse,
  KybSubmission,
  KyrScore,
} from "../types";

const json = (
  status: number,
  body: ApiResponse<unknown>,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

import { callPaidAgent } from "../lib/x402-client";

const RISK_AGENT_URL = process.env.RISK_AGENT_URL ?? "";
const ORCHESTRATOR_PK = (process.env.ORCHESTRATOR_PRIVATE_KEY ?? "0x") as `0x${string}`;

// POST /kyb/submit
// Body: { walletAddress, kybData }
// Calls the Risk Agent, stores the full KYR result (or pending+error if agent fails).
export async function submitKyb(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) return json(400, { ok: false, error: "missing body" });

  let payload: { walletAddress?: string; kybData?: KybSubmission["kybData"] };
  try {
    payload = JSON.parse(event.body);
  } catch {
    return json(400, { ok: false, error: "invalid json" });
  }

  const { walletAddress, kybData } = payload;
  if (!walletAddress || !kybData) {
    return json(400, { ok: false, error: "walletAddress and kybData required" });
  }

  const required = [
    "companyName",
    "jurisdiction",
    "dateOfIncorporation",
    "yearsInOperation",
    "businessType",
    "monthlyTransactionVolume",
    "primaryCorridor",
    "settlementPartners",
    "settlementCycle",
    "annualRevenue",
    "netIncome",
    "totalEquity",
    "debtRatio",
    "amlPolicyInPlace",
    "sanctionsScreeningProvider",
    "lastRegulatoryAuditDate",
  ] as const;
  for (const k of required) {
    if (kybData[k] === undefined || kybData[k] === null) {
      return json(400, { ok: false, error: `kybData.${k} required` });
    }
  }

  const submittedAt = Date.now();

  // Optimistically write a pending row first so the mobile app can poll
  // immediately and see "scoring".
  const initial: KybSubmission = {
    walletAddress,
    submittedAt,
    kybData,
    status: "scoring",
  };
  await putItem(Tables.KybSubmissions, initial);

  // Call the Risk Agent. This is where the AI scoring happens.
  let kyrScore: KyrScore | undefined;
  let decision: string | undefined;
  let error: string | undefined;

  if (!RISK_AGENT_URL || !ORCHESTRATOR_PK || ORCHESTRATOR_PK === "0x") {
    error = "RISK_AGENT_URL or ORCHESTRATOR_PRIVATE_KEY not configured";
  } else {
    // Real x402 — sign EIP-3009 transferAuthorization, pay the Risk Agent
    // in USDC on Base Sepolia. Coinbase facilitator settles on chain.
    const result = await callPaidAgent<KyrScore>({
      url: RISK_AGENT_URL,
      payerPrivateKey: ORCHESTRATOR_PK,
      body: kybData,
    });
    if (result.ok) {
      kyrScore = result.data;
      decision = result.decision;
    } else {
      error = result.error;
    }
  }

  // Persist the final result.
  const final: KybSubmission = {
    ...initial,
    status: kyrScore ? "scoring" : "error", // "scoring" until admin approves; "error" if agent failed
    kyrScore,
    reasoning: kyrScore?.reasoning,
    creditLimit: undefined, // set on approval
    personalRateBps: undefined,
  };
  await putItem(Tables.KybSubmissions, final);
  await putItem(Tables.Users, {
    walletAddress,
    role: "PSP",
    lastKybSubmittedAt: submittedAt,
  });

  if (error) {
    return json(502, {
      ok: false,
      error: `risk agent: ${error}`,
    });
  }

  return json(200, {
    ok: true,
    data: {
      walletAddress,
      submittedAt,
      kyrScore,
      decision,
      status: "scored — awaiting admin approval",
    },
  });
}

// GET /kyb/status/{wallet}
// Returns the latest KYB submission for the given wallet.
export async function getKybStatus(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const wallet = event.pathParameters?.wallet;
  if (!wallet) return json(400, { ok: false, error: "wallet required" });

  const items = await queryByPartition<KybSubmission>(
    Tables.KybSubmissions,
    "walletAddress",
    wallet,
    { limit: 1, descending: true },
  );

  if (items.length === 0) {
    return json(404, { ok: false, error: "no submission found" });
  }

  return json(200, { ok: true, data: items[0] });
}
