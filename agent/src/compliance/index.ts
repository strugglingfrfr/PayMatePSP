import type { KybData } from "../lib/types";
import { requirePayment } from "../lib/x402";
import { runComplianceChecks } from "./checks";

const RECIPIENT = (process.env.AGENT_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

/**
 * Compliance Sub-Agent Lambda handler.
 * Runs sanctions/AML/PEP/adverse-media checks. Flat $0.01 USDC fee.
 */
export const handler = requirePayment(
  {
    recipient: RECIPIENT,
    amountMicro: 10_000n, // $0.01
    description: "Compliance screening — sanctions, AML, PEP, adverse media",
  },
  async (event) => {
    const kyb = JSON.parse(event.body!) as KybData;
    const result = runComplianceChecks(kyb);
    return { statusCode: 200, body: { ok: true, data: result } };
  },
);
