// Shared types across Lambda handlers.

export type KybStatus = "pending" | "scoring" | "approved" | "rejected" | "error";

export type KybSubmission = {
  walletAddress: string;
  submittedAt: number; // unix ms
  kybData: {
    companyName: string;
    jurisdiction: string;
    yearsInOperation: number;
    businessType: "RSP" | "PSP" | "OTC";
    monthlyTransactionVolume: number;
    annualRevenue: number;
    amlPolicyInPlace: boolean;
    primaryCorridor: string;
  };
  status: KybStatus;
  // Filled in by Phase 2c when Bedrock scoring is wired:
  kyrScore?: KyrScore;
  reasoning?: string;
  creditLimit?: number; // micro-USDC
  personalRateBps?: number;
  // Filled in by Phase 2d when on-chain set_credit_limit is wired:
  approvalTxSignature?: string;
};

export type KyrScore = {
  totalScore: number; // 0-100
  rating: "AAA" | "AA" | "A" | "B/C";
  // The 14 criteria (0-x range each, summing to <=100):
  incorporationRegulatory: number;
  businessAgeTrackRecord: number;
  transactionVolumeVelocity: number;
  settlementPartnerQuality: number;
  corridorRemittanceRisk: number;
  prefundingCycleLiquidity: number;
  historicalDataAuditTrail: number;
  bankFloatManagement: number;
  financialStrength: number;
  amlComplianceHealth: number;
  technologyIntegration: number;
  guarantorsCollateral: number;
  previousFinancingPayback: number;
  creditBureau: number;
};

export type AgentCallLog = {
  callId: string;
  ts: number;
  caller: string; // "lambda" | "risk-agent"
  callee: string; // "risk-agent" | "compliance-agent"
  amountUsdc: number; // x402 micropayment amount in USDC
  walletContext: string; // PSP wallet this call was about
  result: "success" | "failure";
};

export type PoolState = {
  programId: string;
  poolPda: string;
  totalLiquidity: number;
  availableLiquidity: number;
  feeReserve: number;
  drawdownLimit: number;
  defaultPspRateBps: number;
  lpApyBps: number;
};

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
