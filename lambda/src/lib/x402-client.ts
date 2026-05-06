// x402 client (orchestrator side). Mirrors agent/src/lib/x402.ts payX402.
// Signs an EIP-3009 transferAuthorization on Base Sepolia USDC and POSTs
// it to an x402-gated agent.

import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const NETWORK = "base-sepolia";
const X402_VERSION = 1;

export type X402PaidResult<T> =
  | {
      ok: true;
      data: T;
      decision?: string;
      txHash: string;
      paidMicro: bigint;
    }
  | { ok: false; error: string };

export async function callPaidAgent<T>(opts: {
  url: string;
  payerPrivateKey: `0x${string}`;
  body: unknown;
}): Promise<X402PaidResult<T>> {
  try {
    // Step 1 — pre-flight to get 402 with payment requirements
    const initial = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
    });
    if (initial.status !== 402) {
      return {
        ok: false,
        error: `Expected 402, got ${initial.status}`,
      };
    }
    const challenge = (await initial.json()) as {
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
    if (!req) return { ok: false, error: "agent doesn't accept exact/base-sepolia" };

    // Step 2 — sign EIP-3009 transferAuthorization
    const account = privateKeyToAccount(opts.payerPrivateKey);
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600);
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
      return {
        ok: false,
        error: `Paid call failed ${paid.status}: ${(await paid.text()).slice(0, 120)}`,
      };
    }

    const responseBody = (await paid.json()) as {
      ok?: boolean;
      data?: T;
      decision?: string;
    };

    // Step 4 — parse settlement from response header
    const settlementHeader = paid.headers.get("x-payment-response");
    let txHash =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    if (settlementHeader) {
      try {
        const parsed = JSON.parse(
          Buffer.from(settlementHeader, "base64").toString("utf8"),
        );
        if (parsed.transaction) txHash = parsed.transaction;
      } catch {
        /* ignore */
      }
    }

    return {
      ok: true,
      data: (responseBody.data ?? (responseBody as unknown as T)) as T,
      decision: responseBody.decision,
      txHash,
      paidMicro: BigInt(req.maxAmountRequired),
    };
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
