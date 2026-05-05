// Admin endpoints: pool initialization + KYB approval.
//
// Both write to Solana on-chain via the admin keypair. In production
// these would sit behind real auth; for the hackathon demo they're open
// (we narrate this as a known limitation).

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { Tables, getItem, putItem, queryByPartition } from "../lib/ddb";
import {
  initializePool,
  setCreditLimit,
  ratingToRateBps,
  ratingToCreditLimit,
} from "../lib/solana-tx";
import type { ApiResponse, KybSubmission } from "../types";

const json = (
  status: number,
  body: ApiResponse<unknown>,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// POST /admin/init-pool
// Body: { usdcMint: string, drawdownLimit?: number, defaultPspRateBps?: number, lpApyBps?: number }
// One-shot. Idempotent at the contract level (Pool PDA's `init` will fail if already initialized).
export async function initPoolHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  let body: {
    usdcMint?: string;
    drawdownLimit?: number;
    defaultPspRateBps?: number;
    lpApyBps?: number;
  } = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return json(400, { ok: false, error: "invalid json" });
    }
  }

  if (!body.usdcMint) {
    return json(400, { ok: false, error: "usdcMint required (devnet mint address)" });
  }

  try {
    const result = await initializePool({
      usdcMint: body.usdcMint,
      drawdownLimit: body.drawdownLimit ?? 100_000_000, // $100 USDC default
      defaultPspRateBps: body.defaultPspRateBps ?? 60, // 0.6%/day
      lpApyBps: body.lpApyBps ?? 500, // 5%
    });
    return json(200, {
      ok: true,
      data: {
        txSignature: result.txSignature,
        pool: result.pool,
        vault: result.vault,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}?cluster=devnet`,
      },
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// POST /admin/approve
// Body: { walletAddress: string }
// Reads latest KYB result for the wallet, maps rating → on-chain credit
// limit + personal rate, calls set_credit_limit. Updates DDB with status=approved.
export async function approvePspHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) return json(400, { ok: false, error: "missing body" });
  let body: { walletAddress?: string };
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, { ok: false, error: "invalid json" });
  }
  if (!body.walletAddress) {
    return json(400, { ok: false, error: "walletAddress required" });
  }

  const submissions = await queryByPartition<KybSubmission>(
    Tables.KybSubmissions,
    "walletAddress",
    body.walletAddress,
    { limit: 1, descending: true },
  );
  if (submissions.length === 0) {
    return json(404, { ok: false, error: "no KYB submission found" });
  }
  const submission = submissions[0]!;
  if (!submission.kyrScore) {
    return json(400, {
      ok: false,
      error: `KYR scoring incomplete (status: ${submission.status})`,
    });
  }
  if (submission.status === "approved") {
    return json(409, {
      ok: false,
      error: "already approved",
    });
  }

  const rating = submission.kyrScore.rating;
  const personalRateBps = ratingToRateBps(rating);
  const creditLimit = ratingToCreditLimit(rating);

  try {
    const result = await setCreditLimit({
      pspOwnerAddress: body.walletAddress,
      creditLimit,
      personalRateBps,
    });

    // Persist the approval to DDB
    const updated: KybSubmission = {
      ...submission,
      status: "approved",
      creditLimit,
      personalRateBps,
      approvalTxSignature: result.txSignature,
    };
    await putItem(Tables.KybSubmissions, updated);
    await putItem(Tables.Users, {
      walletAddress: body.walletAddress,
      role: "PSP",
      lastApprovedAt: Date.now(),
      creditLimit,
      personalRateBps,
      rating,
    });

    return json(200, {
      ok: true,
      data: {
        walletAddress: body.walletAddress,
        rating,
        creditLimit,
        personalRateBps,
        txSignature: result.txSignature,
        pspAccount: result.pspAccount,
        explorerUrl: `https://solscan.io/tx/${result.txSignature}?cluster=devnet`,
      },
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
