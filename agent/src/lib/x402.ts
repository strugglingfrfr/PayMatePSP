// x402 Facilitator-backed middleware (server) + signing client.
//
// Implements the canonical "exact" scheme on Base Sepolia. Real USDC moves
// between agent wallets via Coinbase's hosted facilitator — the facilitator
// submits the EIP-3009 signed authorization to the USDC contract and pays
// the gas. Our agents only need USDC, not ETH.
//
// Spec: https://github.com/coinbase/x402

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  createWalletClient,
  http as viemHttp,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { X402Settlement } from "./types";

// Base Sepolia USDC mint (Circle).
const USDC_BASE_SEPOLIA =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// Coinbase's public x402 facilitator. Submits EIP-3009 to chain, pays gas.
const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

const NETWORK = "base-sepolia" as const;
const X402_VERSION = 1;

// ---------------------------------------------------------------------------
// Server side — requirePayment
// ---------------------------------------------------------------------------

export type X402Config = {
  recipient: `0x${string}`;
  /** Exact amount to charge in micro-USDC (6 decimals). e.g. 50000n = $0.05 */
  amountMicro: bigint;
  description: string;
};

type LambdaHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>;

type HandlerFn = (
  event: APIGatewayProxyEventV2,
) => Promise<{ statusCode: number; body: unknown }>;

/**
 * Wraps a Lambda handler with x402 payment gating.
 *
 * No header → 402 with payment requirements JSON.
 * Header present → verify with facilitator → run handler → settle (real USDC tx).
 */
export function requirePayment(
  config: X402Config,
  handler: HandlerFn,
): LambdaHandler {
  return async (event) => {
    const paymentHeader =
      event.headers?.["x-payment"] || event.headers?.["X-PAYMENT"];

    const requirements = paymentRequirementsFor(config);

    // No payment → 402 challenge per spec
    if (!paymentHeader) {
      return {
        statusCode: 402,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x402Version: X402_VERSION,
          accepts: [requirements],
          error: "Payment required",
        }),
      };
    }

    // Decode the signed payload
    let paymentPayload: unknown;
    try {
      paymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf8"),
      );
    } catch {
      return errorResponse(400, "Malformed X-PAYMENT header");
    }

    // Verify with facilitator
    const verify = await postFacilitator("/verify", {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements: requirements,
    });
    if (!verify.ok || !verify.body?.isValid) {
      return errorResponse(
        401,
        verify.body?.invalidReason ?? `Verify failed: ${verify.error}`,
      );
    }

    // Run user handler
    const result = await handler(event);

    // Settle (the actual on-chain transfer)
    const settle = await postFacilitator("/settle", {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements: requirements,
    });

    const settlementHeader = Buffer.from(
      JSON.stringify({
        success: settle.ok && settle.body?.success !== false,
        transaction: settle.body?.transaction ?? null,
        network: NETWORK,
        payer: settle.body?.payer ?? null,
      }),
    ).toString("base64");

    return {
      statusCode: result.statusCode,
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT-RESPONSE": settlementHeader,
      },
      body: JSON.stringify(result.body, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    };
  };
}

function paymentRequirementsFor(config: X402Config) {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: config.amountMicro.toString(),
    asset: USDC_BASE_SEPOLIA,
    payTo: config.recipient,
    description: config.description,
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
    resource: "agent",
    extra: {
      name: "USDC",
      version: "2",
    },
  };
}

async function postFacilitator(
  path: "/verify" | "/settle",
  body: unknown,
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  try {
    const r = await fetch(`${FACILITATOR_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    return { ok: r.ok, status: r.status, body: parsed };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function errorResponse(
  status: number,
  message: string,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: false, error: message }),
  };
}

// ---------------------------------------------------------------------------
// Client side — payX402
// ---------------------------------------------------------------------------

export type PayX402Options<T = unknown> = {
  url: string;
  payerPrivateKey: `0x${string}`;
  body: unknown;
};

export type PayX402Result<T> =
  | { ok: true; data: T; settlement: X402Settlement }
  | { ok: false; error: string };

/**
 * Pay-and-call helper. Performs the canonical x402 retry dance:
 * 1. POST → expect 402 with payment requirements
 * 2. Sign EIP-3009 transferAuthorization for the required amount
 * 3. Re-POST with X-PAYMENT header → server verifies + runs + settles
 * 4. Parse settlement details from X-PAYMENT-RESPONSE header
 */
export async function payX402<T>(
  opts: PayX402Options<T>,
): Promise<PayX402Result<T>> {
  try {
    // Step 1 — pre-flight to get requirements
    const initial = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
    });

    if (initial.status !== 402) {
      return {
        ok: false,
        error: `Expected 402, got ${initial.status}: ${(await initial.text()).slice(0, 120)}`,
      };
    }

    const challenge = (await initial.json()) as {
      x402Version: number;
      accepts: Array<{
        scheme: string;
        network: string;
        maxAmountRequired: string;
        asset: `0x${string}`;
        payTo: `0x${string}`;
        extra?: { name?: string; version?: string };
      }>;
    };

    const req = challenge.accepts?.find(
      (r) => r.scheme === "exact" && r.network === NETWORK,
    );
    if (!req) {
      return {
        ok: false,
        error: "Server doesn't accept exact / base-sepolia",
      };
    }

    // Step 2 — sign EIP-3009 transferAuthorization
    const account = privateKeyToAccount(opts.payerPrivateKey);
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600); // 10-minute window
    const nonce = randomNonce();

    const signature = await account.signTypedData({
      domain: {
        name: req.extra?.name ?? "USDC",
        version: req.extra?.version ?? "2",
        chainId: baseSepolia.id,
        verifyingContract: req.asset,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: account.address,
        to: req.payTo,
        value: BigInt(req.maxAmountRequired),
        validAfter,
        validBefore,
        nonce,
      },
    });

    const paymentPayload = {
      x402Version: X402_VERSION,
      scheme: "exact",
      network: NETWORK,
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: req.payTo,
          value: req.maxAmountRequired,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    };

    const xPaymentHeader = Buffer.from(
      JSON.stringify(paymentPayload),
    ).toString("base64");

    // Step 3 — re-call with payment
    const paid = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": xPaymentHeader,
      },
      body: JSON.stringify(opts.body),
    });

    if (!paid.ok) {
      const errorText = await paid.text();
      return {
        ok: false,
        error: `Paid call failed ${paid.status}: ${errorText.slice(0, 120)}`,
      };
    }

    const responseBody = (await paid.json()) as { ok?: boolean; data?: T } & T;

    // Step 4 — parse settlement from response header
    const settlementHeader = paid.headers.get("x-payment-response");
    let settlement: X402Settlement = {
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      paidMicro: BigInt(req.maxAmountRequired),
      payer: account.address,
    };
    if (settlementHeader) {
      try {
        const parsed = JSON.parse(
          Buffer.from(settlementHeader, "base64").toString("utf8"),
        );
        if (parsed.transaction) {
          settlement = {
            txHash: parsed.transaction,
            paidMicro: BigInt(req.maxAmountRequired),
            payer: parsed.payer ?? account.address,
          };
        }
      } catch {
        // ignore — settlement still happened, just couldn't parse
      }
    }

    const data =
      "data" in (responseBody as object)
        ? ((responseBody as { data: T }).data as T)
        : (responseBody as T);

    return { ok: true, data, settlement };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;
}
