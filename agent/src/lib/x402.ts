/**
 * x402 Facilitator middleware (server side) + client helper.
 *
 * Implements the x402 payment protocol for Lambda handlers:
 * - Server side: requirePayment wraps a handler with 402 payment gating
 * - Client side: payX402 handles the 402 → sign → retry flow
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import type { X402PriceQuote, X402Settlement } from "./types";

// USDC on Base Sepolia
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Coinbase x402 Facilitator endpoints
const FACILITATOR_BASE = "https://x402.facilitator.coinbase.com";

// ---------------------------------------------------------------------------
// Server side — requirePayment middleware
// ---------------------------------------------------------------------------

export type X402Config = {
  recipient: `0x${string}`; // who gets paid (this agent's wallet)
  maxMicro: bigint; // upper bound in USDC micro-units (6 decimals)
  description: string;
};

type HandlerFn = (
  event: APIGatewayProxyEventV2,
  actuallyChargeMicro: (amountMicro: bigint) => void,
) => Promise<{ statusCode: number; body: unknown }>;

type LambdaHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>;

/**
 * Wraps a Lambda handler with x402 payment gating.
 *
 * Flow:
 * 1. If no X-PAYMENT header → return 402 with price quote
 * 2. If X-PAYMENT present → verify with facilitator, run handler, settle
 */
export function requirePayment(
  config: X402Config,
  handler: HandlerFn,
): LambdaHandler {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const paymentHeader =
      event.headers?.["x-payment"] || event.headers?.["X-PAYMENT"];

    // No payment → return 402 with price quote
    if (!paymentHeader) {
      const quote: X402PriceQuote & { mode: string; maxAmountMicro: string } = {
        asset: "USDC",
        network: "base-sepolia",
        amountMicro: config.maxMicro,
        recipient: config.recipient,
        description: config.description,
        mode: "upto",
        maxAmountMicro: config.maxMicro.toString(),
      };

      return {
        statusCode: 402,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quote, (_key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      };
    }

    // Payment present → verify with facilitator
    // TODO PHASE 2C: verify the EIP-3009 transferAuthorization with Coinbase facilitator
    // const verifyResponse = await fetch(`${FACILITATOR_BASE}/verify`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     payment: paymentHeader,
    //     recipient: config.recipient,
    //     asset: USDC_BASE_SEPOLIA,
    //     network: "base-sepolia",
    //   }),
    // });
    // if (!verifyResponse.ok) {
    //   return { statusCode: 401, body: JSON.stringify({ error: "Payment verification failed" }) };
    // }

    // Track the actual charge amount
    let chargedMicro = 0n;
    const actuallyChargeMicro = (amountMicro: bigint) => {
      chargedMicro = amountMicro > config.maxMicro ? config.maxMicro : amountMicro;
    };

    // Run the actual handler
    const result = await handler(event, actuallyChargeMicro);

    // TODO PHASE 2C: settle with facilitator for the actual amount
    // const settleResponse = await fetch(`${FACILITATOR_BASE}/settle`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     payment: paymentHeader,
    //     amount: chargedMicro.toString(),
    //     recipient: config.recipient,
    //     asset: USDC_BASE_SEPOLIA,
    //     network: "base-sepolia",
    //   }),
    // });
    // const settlement = await settleResponse.json();

    // Stub settlement for 2b
    const stubTxHash =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

    return {
      statusCode: result.statusCode,
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT-Settlement": stubTxHash,
        "X-PAYMENT-Amount": chargedMicro.toString(),
      },
      body: JSON.stringify(result.body, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    };
  };
}

// ---------------------------------------------------------------------------
// Client side — payX402
// ---------------------------------------------------------------------------

export type PayX402Options = {
  url: string; // target agent's API Gateway URL
  payerPrivateKey: `0x${string}`; // private key for signing EIP-3009
  body: unknown; // request body to send
  maxMicro: bigint; // ceiling we authorize
};

export type PayX402Success<T> = {
  ok: true;
  data: T;
  settlement: X402Settlement;
};

export type PayX402Error = {
  ok: false;
  error: string;
};

export type PayX402Result<T> = PayX402Success<T> | PayX402Error;

/**
 * Client helper for calling an x402-gated endpoint.
 *
 * Flow:
 * 1. First call → expect 402, parse the price quote
 * 2. Sign EIP-3009 transferAuthorization for maxMicro to recipient
 * 3. Re-call with X-PAYMENT header
 * 4. Return the data + settlement
 */
export async function payX402<T>(
  opts: PayX402Options,
): Promise<PayX402Result<T>> {
  try {
    // Step 1: Initial call to get the 402 price quote
    const initialResponse = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
    });

    if (initialResponse.status !== 402) {
      // If not 402, maybe the endpoint doesn't require payment (shouldn't happen)
      if (initialResponse.ok) {
        const data = (await initialResponse.json()) as T;
        return {
          ok: true,
          data,
          settlement: {
            txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            paidMicro: 0n,
            payer: "0x0000000000000000000000000000000000000000",
          },
        };
      }
      return { ok: false, error: `Unexpected status: ${initialResponse.status}` };
    }

    // Parse the price quote from 402 response
    const _quote = await initialResponse.json();

    // TODO PHASE 2C: Sign EIP-3009 transferAuthorization using viem
    // const walletClient = createWalletClient({
    //   account: privateKeyToAccount(opts.payerPrivateKey),
    //   chain: baseSepolia,
    //   transport: http(),
    // });
    //
    // const authorization = await walletClient.signTypedData({
    //   domain: {
    //     name: "USD Coin",
    //     version: "2",
    //     chainId: 84532n, // Base Sepolia
    //     verifyingContract: USDC_BASE_SEPOLIA,
    //   },
    //   types: { TransferWithAuthorization: [...] },
    //   primaryType: "TransferWithAuthorization",
    //   message: {
    //     from: walletClient.account.address,
    //     to: quote.recipient,
    //     value: opts.maxMicro,
    //     validAfter: 0n,
    //     validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    //     nonce: randomBytes(32),
    //   },
    // });

    // Stub: create a fake payment header for 2b testing
    const stubPaymentHeader = Buffer.from(
      JSON.stringify({
        stub: true,
        maxMicro: opts.maxMicro.toString(),
        payer: "0x0000000000000000000000000000000000000000",
      }),
    ).toString("base64");

    // Step 3: Re-call with payment header
    const paidResponse = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": stubPaymentHeader,
      },
      body: JSON.stringify(opts.body),
    });

    if (!paidResponse.ok) {
      return {
        ok: false,
        error: `Payment call failed: ${paidResponse.status}`,
      };
    }

    const responseBody = await paidResponse.json();
    const settlementTxHash =
      (paidResponse.headers.get("X-PAYMENT-Settlement") as `0x${string}`) ||
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const paidAmount = BigInt(
      paidResponse.headers.get("X-PAYMENT-Amount") || "0",
    );

    return {
      ok: true,
      data: (responseBody as { data?: T }).data ?? (responseBody as T),
      settlement: {
        txHash: settlementTxHash,
        paidMicro: paidAmount,
        payer: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
