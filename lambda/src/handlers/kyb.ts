// KYB endpoints. Phase 2a: write/read DDB only — AI scoring lands in Phase 2c.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Tables, putItem, queryByPartition } from "../lib/ddb";
import type { KybSubmission, ApiResponse } from "../types";

const json = (
  status: number,
  body: ApiResponse<unknown>,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// POST /kyb/submit
// Body: { walletAddress, kybData: { ... 8 fields } }
// Response: { ok: true, data: { walletAddress, submittedAt, status: "pending" } }
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
    "yearsInOperation",
    "businessType",
    "monthlyTransactionVolume",
    "annualRevenue",
    "amlPolicyInPlace",
    "primaryCorridor",
  ] as const;
  for (const k of required) {
    if (kybData[k] === undefined || kybData[k] === null) {
      return json(400, { ok: false, error: `kybData.${k} required` });
    }
  }

  const submittedAt = Date.now();
  const submission: KybSubmission = {
    walletAddress,
    submittedAt,
    kybData,
    status: "pending",
  };

  await putItem(Tables.KybSubmissions, submission);
  await putItem(Tables.Users, {
    walletAddress,
    role: "PSP",
    lastKybSubmittedAt: submittedAt,
  });

  return json(200, {
    ok: true,
    data: { walletAddress, submittedAt, status: "pending" },
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
