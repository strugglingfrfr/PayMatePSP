import type { KybData } from "../lib/types";
import { requirePayment } from "../lib/x402";
import { runComplianceChecks } from "./checks";

const RECIPIENT = (process.env.AGENT_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

/**
 * Compliance Sub-Agent Lambda handler.
 *
 * Runs sanctions/AML/PEP/adverse-media checks against a KYB submission.
 * Gated by x402 — the Risk Agent pays to call this.
 *
 * Variable pricing: $0.003 base + $0.001 per category checked (4 categories).
 */
export const handler = requirePayment(
  {
    recipient: RECIPIENT,
    maxMicro: 20_000n, // $0.02 ceiling
    description: "Compliance check",
  },
  async (event, actuallyChargeMicro) => {
    const kyb = JSON.parse(event.body!) as KybData;
    const result = runComplianceChecks(kyb);

    // Variable charge: $0.003 base + $0.001 per category checked (4 categories)
    const charge = 3_000n + 4_000n; // 4 checks * $0.001 = $0.004
    actuallyChargeMicro(charge);

    return { statusCode: 200, body: { ok: true, data: result } };
  },
);
