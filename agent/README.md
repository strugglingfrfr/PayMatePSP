# PayMate x402 Risk Agents

Two paid AI agents that assess KYB (Know Your Business) submissions and produce KYR (Know Your Risk) scores for PayMate's Solana-based credit pool. Monetized via Coinbase's x402 Facilitator on Base Sepolia.

## Architecture

```
Caller (orchestrator)
  │
  ├─ POST /agent/risk  ──────────────────────────────────────┐
  │   (pays $0.005-$0.05 USDC via x402)                      │
  │                                                           ▼
  │                                              ┌─────────────────────┐
  │                                              │   Risk Agent        │
  │                                              │   (Lambda)          │
  │                                              │                     │
  │                                              │ 1. Economic decide  │
  │                                              │ 2. Maybe call       │
  │                                              │    compliance ──────┼──┐
  │                                              │ 3. Score via        │  │
  │                                              │    Bedrock (stub)   │  │
  │                                              └─────────────────────┘  │
  │                                                                       │
  │                                              ┌─────────────────────┐  │
  │                                              │ Compliance Agent    │◄─┘
  │                                              │ (Lambda)            │
  │                                              │                     │
  │                                              │ Sanctions/AML/PEP/  │
  │                                              │ Adverse media       │
  │                                              │ ($0.007 via x402)   │
  │                                              └─────────────────────┘
  │
  ◄── KYR Score (rating, breakdown, reasoning)
```

## How the Two Agents Relate

The **Risk Agent** is the primary entry point. It receives a KYB submission and makes an **economic decision**: is it worth paying $0.01 to call the Compliance Sub-Agent?

- High-volume PSPs (>$1M/month) or high-risk jurisdictions → pays for compliance
- Low-risk profiles → skips compliance to save cost

This economic reasoning between agents is the core of the x402 demonstration.

## x402 Payment Flow

Both agents are gated by the x402 protocol:
1. Caller hits the endpoint → gets HTTP 402 with a USDC price quote
2. Caller signs an EIP-3009 `transferAuthorization` for the quoted amount
3. Caller retries with `X-PAYMENT` header containing the signed authorization
4. Agent verifies via Coinbase Facilitator, executes, settles actual amount

Pricing is **variable** ("upto" mode) — the agent declares a ceiling but charges based on actual work done.

## Deploy

```bash
# Prerequisites: AWS CLI configured, bun installed, lambda/.secrets/agent-keys.json exists
bun install
bun run deploy
```

This builds both agents, packages them as zips, creates/updates Lambda functions, and adds API Gateway routes.

## Teardown

```bash
bash infra/teardown.sh
```

Removes agent Lambdas and routes. Preserves the shared API Gateway and IAM role.

## Project Structure

```
agent/
├── src/
│   ├── lib/           # Shared utilities
│   │   ├── x402.ts           # x402 middleware + client
│   │   ├── bedrock.ts        # Bedrock scoring (stub → Phase 2c)
│   │   ├── types.ts          # KYB/KYR/Compliance types
│   │   └── compliance-data.ts # Mock sanctions/AML/PEP lists
│   ├── risk/          # Risk Agent
│   │   ├── index.ts          # Lambda handler
│   │   ├── decide.ts         # Economic decision logic
│   │   └── prompt.ts         # Bedrock prompt template
│   └── compliance/    # Compliance Sub-Agent
│       ├── index.ts          # Lambda handler
│       └── checks.ts         # Sanctions/AML/PEP/adverse-media checks
└── infra/
    ├── deploy.sh      # Create/update Lambdas + routes
    └── teardown.sh    # Cleanup
```

## Phase Status

- **Phase 2b** (current): Deployed skeleton with stub Bedrock scoring and stub x402 facilitator calls. Agents return deterministic placeholder data.
- **Phase 2c** (next): Real Bedrock Claude Haiku integration, real x402 facilitator HTTP calls with EIP-3009 signing.
- **Phase 2d**: On-chain `set_credit_limit` calls from orchestrator based on KYR score.

## Provenance

Scaffolded by Kiro from `kiro-spec/x402-risk-agent.md`.
