# PayMate

**Mobile credit infrastructure for stablecoin payments.**

Solana mobile dApp that gives Payment Service Providers instant USDC credit, priced by AI underwriting agents. LPs earn yield. PSPs draw and repay on-chain.

Built at **EasyA Consensus Miami 2026**.

## Architecture

```
[ Mobile App on Solana ]            [ x402 Risk Agent on Base ]
         (Seeker, MWA)                    (AWS Bedrock + Kiro)
              │                                    ▲
              ▼                                    │ $0.05 / call
  [ Anchor Program ]  ◄──────────  [ AWS Lambda ]  ┘
   (Pool, LP/PSP accounts)               │
                                         ▼
                              [ DynamoDB ]
```

## Tracks

- **Solana** — Mobile-first dApp on Solana Seeker, Anchor program, MWA wallet integration
- **Coinbase × AWS Agentic** — x402 Facilitator on Base monetizing the AI risk agent, AWS Bedrock for intelligence, Kiro for spec-driven scaffolding

## Repo Layout

```
PayMatePSP/
├── mobile/          # Expo React Native app (Solana dApp Store target)
├── program/         # Anchor program (Solana credit pool)
├── lambda/          # AWS Lambda orchestrator (mobile ↔ agent ↔ Solana)
├── agent/           # x402 risk-scoring agent on Base (Bedrock-powered)
├── kiro-spec/       # Kiro specs used to scaffold the agent service
├── infra/           # Deploy scripts, seed data, demo state setup
└── docs/            # Architecture, demo walkthrough, submission notes
```

## Status

Active build — submitting Thursday May 7, 2026.
