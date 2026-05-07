// Pool, LP, and PSP state endpoints. Reads on-chain Solana state via raw
// getAccountInfo + manual byte decode. We do this in Lambda (Node) instead
// of Anchor's account fetcher in mobile because Anchor's IDL-driven decoder
// is fragile on React Native Android (Buffer / BN / Uint8Array polyfill
// disagreements). Server-side Node has clean Buffer + BigInt support, so
// the raw byte decode is bulletproof.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { fetchPoolState, fetchLpAccount, fetchPspAccount } from "../lib/solana";
import type { ApiResponse } from "../types";

const json = (
  status: number,
  body: ApiResponse<unknown>,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "max-age=10",
  },
  body: JSON.stringify(body),
});

// GET /pool/state
// Returns live pool state from Solana devnet.
export async function getPoolState(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const state = await fetchPoolState();
    if (!state) {
      return json(404, {
        ok: false,
        error: "pool not initialized — call initialize_pool first",
      });
    }
    return json(200, { ok: true, data: state });
  } catch (err) {
    return json(500, {
      ok: false,
      error: `RPC error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// GET /lp/state/{wallet}
export async function getLpState(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const wallet = event.pathParameters?.wallet;
  if (!wallet) return json(400, { ok: false, error: "wallet path param required" });
  try {
    const state = await fetchLpAccount(wallet);
    return json(200, { ok: true, data: state });
  } catch (err) {
    return json(500, {
      ok: false,
      error: `RPC error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// GET /psp/state/{wallet}
export async function getPspState(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const wallet = event.pathParameters?.wallet;
  if (!wallet) return json(400, { ok: false, error: "wallet path param required" });
  try {
    const state = await fetchPspAccount(wallet);
    return json(200, { ok: true, data: state });
  } catch (err) {
    return json(500, {
      ok: false,
      error: `RPC error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
