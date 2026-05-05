import type { KybData, ComplianceResult } from "../lib/types";
import { requirePayment, payX402 } from "../lib/x402";
import { scoreKyb } from "../lib/bedrock";
import { shouldCallCompliance } from "./decide";

const RECIPIENT = (process.env.AGENT_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
const MAX_MICRO = 50_000n; // $0.05 USDC ceiling
const COMPLIANCE_AGENT_URL = process.env.COMPLIANCE_AGENT_URL || "";
const ORCHESTRATOR_PK = (process.env.AGENT_PRIVATE_KEY || "0x") as `0x${string}`;

/**
 * Risk Agent Lambda handler.
 *
 * Accepts a KYB submission, decides whether to call the Compliance Sub-Agent
 * (economic decision), scores the submission, and returns a KYR score.
 *
 * Gated by x402 — callers must pay USDC on Base Sepolia.
 */
export const handler = requirePayment(
  {
    recipient: RECIPIENT,
    maxMicro: MAX_MICRO,
    description: "PayMate KYR risk score",
  },
  async (event, actuallyChargeMicro) => {
    const kyb = JSON.parse(event.body!) as KybData;

    // 1. Decide whether to call compliance (economic reasoning)
    const decision = shouldCallCompliance(kyb);

    let complianceResult: ComplianceResult | undefined;
    let actualPaidMicro = 5_000n; // base charge $0.005

    if (decision.call) {
      // 2. Pay compliance sub-agent via x402
      const result = await payX402<ComplianceResult>({
        url: COMPLIANCE_AGENT_URL,
        payerPrivateKey: ORCHESTRATOR_PK,
        body: kyb,
        maxMicro: 20_000n, // $0.02 ceiling for compliance
      });
      if (result.ok) {
        complianceResult = result.data;
        actualPaidMicro += result.settlement.paidMicro / 2n; // pass through portion
      }
    }

    // 3. Score with Bedrock (stubbed in 2b)
    const score = await scoreKyb(kyb, complianceResult);
    score.complianceCalled = decision.call;
    score.complianceResult = complianceResult;

    // 4. Add base + token-based variable charge
    actualPaidMicro += 7_000n; // ~$0.007 for Bedrock work
    if (actualPaidMicro > MAX_MICRO) actualPaidMicro = MAX_MICRO;
    actuallyChargeMicro(actualPaidMicro);

    return {
      statusCode: 200,
      body: { ok: true, data: score, decision: decision.reason },
    };
  },
);
