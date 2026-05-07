export type KybData = {
  // Company (5)
  companyName: string;
  jurisdiction: string;              // ISO-3166 alpha-2, e.g. "NG", "GB"
  dateOfIncorporation: string;       // YYYY-MM-DD
  yearsInOperation: number;
  businessType: "RSP" | "PSP" | "OTC";

  // Operations (4)
  monthlyTransactionVolume: number;  // USD
  primaryCorridor: string;           // e.g. "NG-GB"
  settlementPartners: string;        // comma-separated for hackathon simplicity
  settlementCycle: "T+0" | "T+1" | "T+2";

  // Financial (4)
  annualRevenue: number;             // USD
  netIncome: number;                 // USD
  totalEquity: number;               // USD
  debtRatio: number;                 // 0..1+ ratio

  // Compliance (3)
  amlPolicyInPlace: boolean;
  sanctionsScreeningProvider: string;
  lastRegulatoryAuditDate: string;   // YYYY-MM-DD
};

export type KyrCriterion =
  | "incorporationRegulatory" // max 5
  | "businessAgeTrackRecord" // max 5
  | "transactionVolumeVelocity" // max 10
  | "settlementPartnerQuality" // max 10
  | "corridorRemittanceRisk" // max 8
  | "prefundingCycleLiquidity" // max 8
  | "historicalDataAuditTrail" // max 8
  | "bankFloatManagement" // max 7
  | "financialStrength" // max 10
  | "amlComplianceHealth" // max 8
  | "technologyIntegration" // max 5
  | "guarantorsCollateral" // max 5
  | "previousFinancingPayback" // max 7
  | "creditBureau"; // max 4
// total max = 100

export type KyrRating = "AAA" | "AA" | "A" | "B/C";

export type KyrScore = {
  scores: Record<KyrCriterion, number>;
  totalScore: number; // 0-100, sum of scores
  rating: KyrRating;
  reasoning: string; // 2-4 sentences
  complianceCalled: boolean;
  complianceResult?: ComplianceResult;
};

export type ComplianceResult = {
  sanctionsClear: boolean;
  amlFlags: string[];
  pepMatches: string[];
  adverseMedia: string[];
  overallStatus: "CLEAR" | "FLAGGED";
  confidence: number; // 0-1
};

export type X402PriceQuote = {
  asset: "USDC";
  network: "base-sepolia";
  amountMicro: bigint; // 6 decimals; e.g. 50000n = 0.05 USDC
  recipient: `0x${string}`;
  description: string;
};

export type X402Settlement = {
  txHash: `0x${string}`;
  paidMicro: bigint;
  payer: `0x${string}`;
};
