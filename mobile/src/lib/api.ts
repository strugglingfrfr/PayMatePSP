// Typed API client for the PayMate Lambda orchestrator.

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://wdex0emoga.execute-api.us-east-1.amazonaws.com";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, error: `non-JSON response from ${path}: ${text.slice(0, 100)}` };
    }
    if (typeof body !== "object" || body === null || !("ok" in body)) {
      return { ok: false, error: `unexpected shape from ${path}` };
    }
    return body as ApiResponse<T>;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

// ---- Types ------------------------------------------------------------------

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

export type KybData = {
  // Company (5)
  companyName: string;
  jurisdiction: string;
  dateOfIncorporation: string;
  yearsInOperation: number;
  businessType: "RSP" | "PSP" | "OTC";

  // Operations (4)
  monthlyTransactionVolume: number;
  primaryCorridor: string;
  settlementPartners: string;
  settlementCycle: "T+0" | "T+1" | "T+2";

  // Financial (4)
  annualRevenue: number;
  netIncome: number;
  totalEquity: number;
  debtRatio: number;

  // Compliance (3)
  amlPolicyInPlace: boolean;
  sanctionsScreeningProvider: string;
  lastRegulatoryAuditDate: string;
};

export type KyrScore = {
  scores: Record<string, number>;
  totalScore: number;
  rating: "AAA" | "AA" | "A" | "B/C";
  reasoning: string;
  complianceCalled: boolean;
  complianceResult?: {
    sanctionsClear: boolean;
    amlFlags: string[];
    pepMatches: string[];
    adverseMedia: string[];
    overallStatus: "CLEAR" | "FLAGGED";
    confidence: number;
  };
};

export type KybSubmission = {
  walletAddress: string;
  submittedAt: number;
  kybData: KybData;
  status: "pending" | "scoring" | "approved" | "rejected" | "error";
  kyrScore?: KyrScore;
  reasoning?: string;
  creditLimit?: number;
  personalRateBps?: number;
  approvalTxSignature?: string;
};

// ---- Endpoints --------------------------------------------------------------

export const api = {
  poolState: () => call<PoolState>("/pool/state"),

  kybSubmit: (walletAddress: string, kybData: KybData) =>
    call<{
      walletAddress: string;
      submittedAt: number;
      kyrScore?: KyrScore;
      decision?: string;
      status: string;
    }>("/kyb/submit", {
      method: "POST",
      body: JSON.stringify({ walletAddress, kybData }),
    }),

  kybStatus: (wallet: string) =>
    call<KybSubmission>(`/kyb/status/${wallet}`),

  adminListPsps: () => call<KybSubmission[]>("/admin/psps"),

  adminInitPool: (args: {
    usdcMint: string;
    drawdownLimit?: number;
    defaultPspRateBps?: number;
    lpApyBps?: number;
  }) =>
    call<{ txSignature: string; pool: string; vault: string; explorerUrl: string }>(
      "/admin/init-pool",
      { method: "POST", body: JSON.stringify(args) },
    ),

  adminApprove: (walletAddress: string) =>
    call<{
      walletAddress: string;
      rating: string;
      creditLimit: number;
      personalRateBps: number;
      txSignature: string;
      pspAccount: string;
      explorerUrl: string;
    }>("/admin/approve", {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    }),
};
