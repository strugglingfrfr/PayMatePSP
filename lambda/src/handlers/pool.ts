// Pool state endpoint. Reads on-chain Solana state and returns it as JSON.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { fetchPoolState } from "../lib/solana";
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
