import type { KybData } from "../lib/types";
import { HIGH_RISK_JURISDICTIONS } from "../lib/compliance-data";

/**
 * Economic decision: should the Risk Agent pay $0.005-$0.02 to call
 * the Compliance Sub-Agent?
 *
 * This is the agentic-economic-reasoning beat the hackathon track
 * explicitly judges on — the agent makes a cost/benefit decision
 * about whether additional compliance data is worth paying for.
 */
export function shouldCallCompliance(kyb: KybData): {
  call: boolean;
  reason: string;
} {
  // High-volume PSPs warrant the extra spend
  if (kyb.monthlyTransactionVolume > 1_000_000) {
    return {
      call: true,
      reason: `Monthly volume $${(kyb.monthlyTransactionVolume / 1_000_000).toFixed(1)}M exceeds $1M threshold — paying $0.01 for compliance verification is economically justified given the exposure.`,
    };
  }

  // High-risk jurisdictions always need compliance checks
  if (HIGH_RISK_JURISDICTIONS.includes(kyb.jurisdiction)) {
    return {
      call: true,
      reason: `Jurisdiction ${kyb.jurisdiction} is flagged as high-risk — compliance check ($0.01) is mandatory regardless of volume.`,
    };
  }

  // Low-risk, low-volume — save the money
  return {
    call: false,
    reason: `Volume $${(kyb.monthlyTransactionVolume / 1_000).toFixed(0)}K in ${kyb.jurisdiction} is below risk thresholds — skipping $0.01 compliance check to optimize cost.`,
  };
}
