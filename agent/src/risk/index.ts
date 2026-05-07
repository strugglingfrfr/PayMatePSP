import type { KybData, ComplianceResult } from "../lib/types";
import { requirePayment, payX402 } from "../lib/x402";
import { scoreKyb } from "../lib/bedrock";
import { shouldCallCompliance } from "./decide";

const RECIPIENT = (process.env.AGENT_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
const COMPLIANCE_AGENT_URL = process.env.COMPLIANCE_AGENT_URL || "";
const RISK_AGENT_PK = (process.env.AGENT_PRIVATE_KEY || "0x") as `0x${string}`;

// Dynamic-exact pricing: the agent inspects the request and quotes its
// price upfront based on the work it'll do. Simple low-risk KYB → cheaper.
// Complex case requiring sub-agent + heavier reasoning → more expensive.
function priceFor(kyb: KybData): bigint {
  const willCallCompliance = shouldCallCompliance(kyb).call;
  // Base $0.012 for Bedrock scoring + $0.033 if we'll also pay compliance
  return willCallCompliance ? 45_000n : 12_000n;
}

/**
 * Risk Agent Lambda handler.
 *
 * Accepts a KYB submission, decides whether to call the Compliance Sub-Agent
 * (economic decision), scores the submission, and returns a KYR score.
 *
 * Gated by x402 — callers must pay USDC on Base Sepolia.
 */
export const handler = (async (event: any) => {
  const kyb = JSON.parse(event.body || "{}") as KybData;
  const amount = priceFor(kyb);

  return requirePayment(
    {
      recipient: RECIPIENT,
      amountMicro: amount,
      description: "PayMate KYR risk score",
    },
    async (innerEvent) => {
      const innerKyb = JSON.parse(innerEvent.body || "{}") as KybData;
      const decision = shouldCallCompliance(innerKyb);

      let complianceResult: ComplianceResult | undefined;
      if (decision.call && COMPLIANCE_AGENT_URL) {
        const result = await payX402<ComplianceResult>({
          url: COMPLIANCE_AGENT_URL,
          payerPrivateKey: RISK_AGENT_PK,
          body: innerKyb,
        });
        if (result.ok) {
          complianceResult = result.data;
        }
      }

      const score = await scoreKyb(innerKyb, complianceResult);
      score.complianceCalled = decision.call;
      score.complianceResult = complianceResult;

      return {
        statusCode: 200,
        body: { ok: true, data: score, decision: decision.reason },
      };
    },
  )(event);
}) as any;
