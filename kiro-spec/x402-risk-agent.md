# Kiro Spec — PayMate x402 Agents

> This spec is the source of truth for the `agent/` package. Kiro reads this and generates the scaffolding (file layout, types, route handlers, x402 middleware glue, deploy script). A human (Claude Code) finishes the domain-specific logic — Bedrock prompt engineering, decision rules, x402 client calls — on top of what Kiro produces.

## Context

PayMate is a Solana-based credit pool for Payment Service Providers (PSPs). When a PSP applies for credit, an off-chain pipeline assesses their KYB submission and produces a Know-Your-Risk score that drives an on-chain interest rate. This package implements two **paid AI agents** that handle that assessment, monetized via Coinbase's x402 Facilitator on Base Sepolia.

**Track context:** This package is the core of PayMate's submission to the Coinbase × AWS Agentic Hackathon track. The track requires:
- Coinbase x402 Facilitator on Base
- AWS cloud infrastructure (Bedrock, Lambda)
- Kiro used in the build
- Visible economic decision-making between agents

## Package layout (Kiro: scaffold this exact structure)

```
agent/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── src/
│   ├── lib/
│   │   ├── x402.ts              # x402 facilitator middleware (server side) + client helper
│   │   ├── bedrock.ts           # AWS Bedrock Claude Haiku client (stubbed for 2b, real in 2c)
│   │   ├── types.ts             # shared KYB / KYR / Compliance types
│   │   └── compliance-data.ts   # mock sanctions / AML / PEP / adverse-media lists
│   ├── risk/
│   │   ├── index.ts             # Lambda handler — entry point for risk agent
│   │   ├── decide.ts            # economic decision: should we call compliance?
│   │   └── prompt.ts            # Bedrock prompt template (returns string)
│   └── compliance/
│       ├── index.ts             # Lambda handler — entry point for compliance sub-agent
│       └── checks.ts            # sanctions/AML/PEP/adverse-media check functions
└── infra/
    ├── deploy.sh                # bash script: bundle, zip, create/update Lambdas + routes
    └── teardown.sh              # cleanup script
```

## package.json

- Name: `paymate-agent`
- Private, version 0.1.0
- Scripts:
  - `build:risk`: `esbuild src/risk/index.ts --bundle --platform=node --target=node20 --outfile=dist/risk.js --external:@aws-sdk/* --minify`
  - `build:compliance`: `esbuild src/compliance/index.ts --bundle --platform=node --target=node20 --outfile=dist/compliance.js --external:@aws-sdk/* --minify`
  - `build`: `bun run build:risk && bun run build:compliance`
  - `package`: `bun run build && cd dist && zip -q risk.zip risk.js && zip -q compliance.zip compliance.js && cd ..`
  - `deploy`: `bun run package && bash infra/deploy.sh`
- Dependencies:
  - `@aws-sdk/client-bedrock-runtime` (for Phase 2c — Bedrock invoke)
  - `viem` (for verifying x402 EIP-3009 signatures and submitting to facilitator)
  - `@noble/hashes` (transitive — fine)
- Dev deps:
  - `@types/aws-lambda`, `@types/node`, `esbuild`, `typescript`

## tsconfig.json

Same shape as the existing `lambda/tsconfig.json`. Target ES2022, module ESNext, strict mode, no unused locals enforcement, types include `node` and `aws-lambda`.

## src/lib/types.ts

Define and export:

```ts
export type KybData = {
  companyName: string;
  jurisdiction: string;          // ISO-3166 alpha-2, e.g. "NG", "GB"
  yearsInOperation: number;
  businessType: "RSP" | "PSP" | "OTC";
  monthlyTransactionVolume: number;  // USD
  annualRevenue: number;             // USD
  amlPolicyInPlace: boolean;
  primaryCorridor: string;           // e.g. "NG-GB"
};

export type KyrCriterion =
  | "incorporationRegulatory"        // max 5
  | "businessAgeTrackRecord"         // max 5
  | "transactionVolumeVelocity"      // max 10
  | "settlementPartnerQuality"       // max 10
  | "corridorRemittanceRisk"         // max 8
  | "prefundingCycleLiquidity"       // max 8
  | "historicalDataAuditTrail"       // max 8
  | "bankFloatManagement"            // max 7
  | "financialStrength"              // max 10
  | "amlComplianceHealth"            // max 8
  | "technologyIntegration"          // max 5
  | "guarantorsCollateral"           // max 5
  | "previousFinancingPayback"       // max 7
  | "creditBureau";                  // max 4
                                     // total max = 100

export type KyrRating = "AAA" | "AA" | "A" | "B/C";

export type KyrScore = {
  scores: Record<KyrCriterion, number>;
  totalScore: number;     // 0-100, sum of scores
  rating: KyrRating;
  reasoning: string;      // 2-4 sentences
  complianceCalled: boolean;
  complianceResult?: ComplianceResult;
};

export type ComplianceResult = {
  sanctionsClear: boolean;
  amlFlags: string[];
  pepMatches: string[];
  adverseMedia: string[];
  overallStatus: "CLEAR" | "FLAGGED";
  confidence: number;    // 0-1
};

export type X402PriceQuote = {
  asset: "USDC";
  network: "base-sepolia";
  amountMicro: bigint;   // 6 decimals; e.g. 50000n = 0.05 USDC
  recipient: `0x${string}`;
  description: string;
};

export type X402Settlement = {
  txHash: `0x${string}`;
  paidMicro: bigint;
  payer: `0x${string}`;
};
```

## src/lib/x402.ts

Two halves:

### Server side — `requirePayment` middleware

Behavior on incoming request:
1. Inspect headers for `X-PAYMENT` (the EIP-3009 transferAuthorization, base64-encoded).
2. If missing → return HTTP 402 with body containing the price quote (asset, network, amount, recipient, description). Use `upto` mode: response declares `mode: "upto"` and `maxAmountMicro` as the cap.
3. If present → pass authorization to Coinbase's hosted facilitator at `https://x402.facilitator.coinbase.com/verify` (use canonical x402 spec). Get a settlement promise back.
4. Run the actual handler; handler decides the **actual amount** within the cap.
5. Submit settlement to facilitator's `/settle` endpoint with the actual amount.
6. Return handler's response with `X-PAYMENT-Settlement` header containing the tx hash.

Treat as black-box for 2b — generate a SKELETON with TODO comments where Coinbase facilitator HTTP calls go. Phase 2c+ will fill in the real facilitator integration.

```ts
export type X402Config = {
  recipient: `0x${string}`;       // who gets paid (this agent's wallet)
  maxMicro: bigint;               // upper bound (5_000_000n = $5? no — 6 decimals: 50000n = $0.05)
  description: string;
};

export function requirePayment(config: X402Config, handler: (event, actuallyChargeMicro: (amountMicro: bigint) => void) => Promise<{ statusCode: number; body: unknown }>): LambdaHandler {
  // returns a wrapped Lambda handler
}
```

### Client side — `payX402`

```ts
export async function payX402(opts: {
  url: string;                    // e.g. risk agent's API Gateway URL
  payerPrivateKey: `0x${string}`;
  body: unknown;
  maxMicro: bigint;               // ceiling we authorize
}): Promise<{ ok: true; data: T; settlement: X402Settlement } | { ok: false; error: string }>
```

Used by Risk Agent to call Compliance Sub-Agent. Wraps:
1. First call → expect 402, parse the price quote.
2. Sign EIP-3009 transferAuthorization for `maxMicro` to recipient.
3. Re-call with `X-PAYMENT` header.
4. Return the data + settlement.

Use viem's `walletClient.signTypedData` for the EIP-3009 signature. USDC Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

## src/lib/bedrock.ts

For 2b: stub. Returns hardcoded reasonable values based on rough KYB heuristics (so the deployed agent is testable end-to-end without needing Bedrock yet).

```ts
export async function scoreKyb(kyb: KybData, complianceResult?: ComplianceResult): Promise<KyrScore> {
  // 2b STUB — returns deterministic scores from a simple rule:
  //   - if amlPolicyInPlace + yearsInOperation >= 3 + revenue > 1M: rating A, score 70
  //   - if any of those fail: rating B/C, score 50
  //   - high revenue (>10M) bumps to AA
  // This stub is replaced in Phase 2c with the real Bedrock invoke.
}
```

Mark with a `// PHASE 2C: replace with real Bedrock invoke` comment.

## src/lib/compliance-data.ts

Static mock data — small lists, stored in code.

```ts
export const SANCTIONED_ENTITIES = ["EvilCorp Ltd", "Sanction Holdings", "OFAC Test Entity"];
export const AML_WATCHLIST = ["Suspicious Trading Co", "Cash Mule Inc"];
export const PEP_NAMES = ["John Test PEP", "Politically Exposed Sample"];
export const ADVERSE_MEDIA_KEYWORDS = ["fraud allegations", "money laundering", "regulatory action", "ponzi"];
export const HIGH_RISK_JURISDICTIONS = ["NG", "PK", "AF", "MM", "VE", "IR", "RU", "BY", "SY", "CU", "KP"];
```

These exist only for the demo. Real compliance providers (ComplyAdvantage, Refinitiv) hit real lists; we mock for demo speed.

## src/risk/decide.ts

Economic decision: should the Risk Agent pay $0.005-$0.02 to call the Compliance Sub-Agent?

```ts
export function shouldCallCompliance(kyb: KybData): { call: boolean; reason: string } {
  // Returns call=true if either:
  //   - monthlyTransactionVolume > 1_000_000 (high-volume → worth $0.01 to verify)
  //   - HIGH_RISK_JURISDICTIONS.includes(kyb.jurisdiction)
  // Otherwise call=false (low-risk, save the $0.01)
  // Reason string is human-readable for the demo narration.
}
```

This is the agentic-economic-reasoning beat the track explicitly judges on.

## src/risk/prompt.ts

A function returning the Bedrock prompt as a string, given the KYB. For 2b, this can be a stub — the actual prompt template is filled in Phase 2c. Generate the function signature and a placeholder template.

## src/risk/index.ts

Lambda handler. Skeleton:

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { requirePayment } from "../lib/x402";
import { scoreKyb } from "../lib/bedrock";
import { shouldCallCompliance } from "./decide";
import { payX402 } from "../lib/x402";
import type { KybData, KyrScore, ComplianceResult } from "../lib/types";

const RECIPIENT = process.env.AGENT_WALLET_ADDRESS as `0x${string}`;
const MAX_MICRO = 50_000n;  // $0.05 USDC ceiling
const COMPLIANCE_AGENT_URL = process.env.COMPLIANCE_AGENT_URL!;
const ORCHESTRATOR_PK = process.env.AGENT_PRIVATE_KEY as `0x${string}`;

export const handler = requirePayment(
  { recipient: RECIPIENT, maxMicro: MAX_MICRO, description: "PayMate KYR risk score" },
  async (event, actuallyChargeMicro) => {
    const kyb = JSON.parse(event.body!) as KybData;

    // 1. Decide whether to call compliance
    const decision = shouldCallCompliance(kyb);

    let complianceResult: ComplianceResult | undefined;
    let actualPaidMicro = 5_000n;  // base charge $0.005

    if (decision.call) {
      // 2. Pay compliance sub-agent
      const result = await payX402<ComplianceResult>({
        url: COMPLIANCE_AGENT_URL,
        payerPrivateKey: ORCHESTRATOR_PK,
        body: kyb,
        maxMicro: 20_000n,  // $0.02 ceiling for compliance
      });
      if (result.ok) {
        complianceResult = result.data;
        actualPaidMicro += result.settlement.paidMicro / 2n;  // pass through portion
      }
    }

    // 3. Score with Bedrock (stubbed in 2b)
    const score = await scoreKyb(kyb, complianceResult);
    score.complianceCalled = decision.call;
    score.complianceResult = complianceResult;

    // 4. Add base + token-based variable charge
    actualPaidMicro += 7_000n;  // ~$0.007 for Bedrock work
    if (actualPaidMicro > MAX_MICRO) actualPaidMicro = MAX_MICRO;
    actuallyChargeMicro(actualPaidMicro);

    return {
      statusCode: 200,
      body: { ok: true, data: score, decision: decision.reason },
    };
  },
);
```

## src/compliance/checks.ts

```ts
import type { ComplianceResult, KybData } from "../lib/types";
import { SANCTIONED_ENTITIES, AML_WATCHLIST, PEP_NAMES, ADVERSE_MEDIA_KEYWORDS } from "../lib/compliance-data";

export function runComplianceChecks(kyb: KybData): ComplianceResult {
  // For each of: sanctions, AML, PEP, adverse media:
  //   - Substring/case-insensitive match company name against the corresponding list
  // Compute overallStatus = FLAGGED if any list has hits, otherwise CLEAR
  // Confidence = 0.95 if no hits, 0.7 if hits (mock — real providers have real confidence)
}
```

## src/compliance/index.ts

```ts
export const handler = requirePayment(
  { recipient: RECIPIENT, maxMicro: 20_000n, description: "Compliance check" },
  async (event, actuallyChargeMicro) => {
    const kyb = JSON.parse(event.body!) as KybData;
    const result = runComplianceChecks(kyb);

    // Variable charge: 0.003 base + 0.001 per category checked
    const charge = 3_000n + 4_000n;  // 4 checks * $0.001 = $0.004
    actuallyChargeMicro(charge);

    return { statusCode: 200, body: { ok: true, data: result } };
  },
);
```

## infra/deploy.sh

Same shape as `lambda/infra/deploy.sh` but:
- Loads private keys from `lambda/.secrets/agent-keys.json` (relative path)
- Creates two Lambdas (`paymate-risk-agent`, `paymate-compliance-agent`) with the respective bundle
- Sets env vars per Lambda:
  - Risk: `AGENT_WALLET_ADDRESS`, `AGENT_PRIVATE_KEY` (from risk-agent key), `COMPLIANCE_AGENT_URL` (filled after compliance Lambda is created), `BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0`
  - Compliance: `AGENT_WALLET_ADDRESS`, `AGENT_PRIVATE_KEY` (from compliance-agent key)
- Reuses the existing `paymate-lambda-exec` IAM role (already has Bedrock + DDB perms)
- Adds two routes to the existing API Gateway:
  - `POST /agent/risk` → risk Lambda
  - `POST /agent/compliance` → compliance Lambda

Idempotent: re-runnable.

## infra/teardown.sh

Reverse of deploy. Deletes both Lambdas and the two API Gateway routes (but not the API Gateway itself, since it's shared with the orchestrator).

## .gitignore

```
node_modules/
dist/
*.zip
*.log
```

## README.md

Brief — 50-100 lines explaining:
- What the package does (KYR risk scoring + compliance, both paid via x402 on Base Sepolia)
- How the two agents relate (Risk pays Compliance when economic threshold is hit)
- How to deploy: `bun install && bun run deploy`
- The Kiro provenance: "Scaffolded by Kiro from `kiro-spec/x402-risk-agent.md`."

---

## Out of scope for Kiro

These are explicitly NOT for Kiro to write — Claude Code handles them after Kiro generates the scaffold:
- Real Bedrock prompt engineering (Phase 2c)
- Real x402 facilitator HTTP integration (the wire format is stable but I want a human to verify the EIP-3009 signing)
- The orchestrator-side x402 client wiring in `lambda/` (Phase 2c)
- On-chain `set_credit_limit` calls from orchestrator (Phase 2d)

## What "good" looks like

When Kiro is done generating, we should have:
- All files listed in the layout, with the right shapes
- TypeScript compiles cleanly (no errors)
- esbuild can bundle each entry point
- The 2b stubs (Bedrock client, x402 facilitator HTTP) have clear `// TODO PHASE 2C` markers
- The deploy script structure works end-to-end (creates Lambdas, sets env vars, adds routes) even if the agent logic is still stubs

The goal is a deployable skeleton that Phase 2c+ can fill in without restructuring.
