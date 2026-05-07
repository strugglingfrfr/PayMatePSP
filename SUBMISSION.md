# PayMate, EasyA Consensus Miami 2026 Submission

This file holds the canonical text for the EasyA submission form. Each
section below maps to one form field. Copy-paste verbatim.

---

## 1. Short summary (≤150 characters)

> PayMate prefunds stablecoin payment operators on Solana. AI agents on AWS Bedrock underwrite KYB risk and pay each other in USDC over Coinbase x402.

*(148 characters)*

---

## 2. Full description

**The problem.** Licensed payment service providers (PSPs) and remittance
companies move billions in stablecoins across corridors like Nigeria to
the UK, Mexico to the US, and Philippines to Singapore. But their
working capital is locked. A PSP that promises an end-customer instant
settlement has to front the USDC themselves, even though the on-chain
rail they receive funds on takes T+1 to T+2 to clear. Result: PSPs turn
down volume they could otherwise serve, or they get squeezed by
predatory off-chain credit lines that take 5 to 8 percent per drawdown.

**The solution.** PayMate is an on-chain credit pool, native to Solana,
that prefunds licensed PSPs against their incoming settlement flow. LPs
deposit USDC and earn pro-rata yield from PSP fees. PSPs apply through a
KYB form that AI agents underwrite in seconds. Approved PSPs get a
personalized credit limit and rate set on-chain. They draw USDC, settle
their customer, then repay principal plus a small fee on T+1. The pool
recycles. The protocol is 100 percent on-chain at the credit layer:
every deposit, drawdown, repayment, withdraw, and credit-limit change
emits a verifiable Solana transaction.

**How the blockchain is used.** Three blockchains, each pulling its
weight.

**Solana (devnet).** The credit primitive itself. An Anchor program
(`5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg`) holds the Pool, a USDC
vault PDA, per-LP and per-PSP state accounts, and six instructions:
`init_pool`, `deposit`, `withdraw`, `set_credit_limit`,
`request_drawdown`, `repay`. PSP credit terms (limit, rate, debt) are
first-class on-chain state, not database rows. Real Circle USDC
(`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) flows through the
vault. Mobile users sign with the Solana Mobile Wallet Adapter on
Seeker.

**Base Sepolia and Coinbase x402.** Agent-to-agent settlement layer.
Every time a PSP submits a KYB application, our orchestrator Lambda pays
the Risk Agent in USDC over x402. If the application looks borderline,
the Risk Agent recursively pays the Compliance Sub-Agent. Three
independently-funded wallets, three real on-chain payments per recursive
call, settled via Coinbase's facilitator at `x402.org/facilitator`.
EIP-3009 `transferWithAuthorization`, signed with viem, no Permit2 setup
required.

**AWS Bedrock.** The intelligence layer. Claude Haiku 4.5 underwrites
every KYB application across 14 weighted criteria (jurisdiction,
financial health, AML posture, settlement track record, etc.) and
returns a KYB rating, score, structured reasoning, and an explicit
economic decision. Sub-2-second p50 latency. The reasoning shown in the
UI is the model's literal output, not a template.

**The end-user moment.** A PSP applies once on their phone (16-field
form, AI-underwritten in 3 seconds). An admin reviews the AI's call and
taps Approve. Credit terms land on Solana. The PSP draws USDC against
their limit, settles their customer instantly, repays at T+1. LPs
deposit once, watch the pool flow, withdraw when they want: principal
plus their pro-rata share of accumulated PSP fees. The whole loop runs
on a single phone with three role lenses: LP, PSP, Admin.

---

## 2a. Why users want this

**For Payment Service Providers (the demand side).** A licensed PSP
running a NG–GB or MX–US corridor today has three choices when their
working capital is locked: front USDC out of pocket, take a 5-to-8
percent off-chain credit line, or turn the volume down. PayMate gives
them a fourth option that's better than all three. They get an AI-priced
credit limit on-chain in three seconds (versus weeks of paper-heavy
underwriting). They self-serve drawdowns up to that limit (versus
calling their bank). They pay basis points per day, not percent per
drawdown (~30× cheaper at typical hold times). And the rate is set
fairly by their KYR rating, not by a relationship manager. For a PSP
who'd otherwise turn down a $10K daily volume because they can't front
it, PayMate converts that decline into revenue at a cost they can
underwrite.

**For Liquidity Providers (the supply side).** USDC parked on Aave,
Compound, or Solend earns 3-6 percent against anonymous over-
collateralized borrowers. The yield is real but the counterparty story
is weak. PayMate offers real-world yield against KYB-rigorous regulated
payment operators. LPs can see the exact PSPs in the pool, their KYR
ratings, and their personal rates. Duration is short (T+1 settlement
cycles turn over fast), so capital stays liquid. Yield is denominated
in USDC and flows pro-rata to the LP's deposit share. A USDC holder
who wants real-world yield exposure but isn't comfortable with anon
DeFi credit gets a regulated alternative that's as capital-efficient
as the DeFi version because it's on Solana.

**For the Solana ecosystem.** This is the kind of primitive Solana
Mobile + cheap fees were designed for. A credit pool with frequent
drawdown/repayment cycles, where each cycle costs sub-cent in fees, is
viable on Solana and not on Ethereum. The whole product is mobile-first
because PSPs in emerging-market corridors are mobile-first. MWA on
Seeker gives us hardware-backed signing for free. Real-world payment
volume comes on-chain via Solana, and the ecosystem gets a credit
infrastructure layer that other protocols can build on (e.g. tranches,
secondary markets, secured variants).

**For the Coinbase x402 ecosystem.** PayMate is one of the first
non-trivial agent-to-agent x402 deployments: an orchestrator pays a
Risk Agent, which recursively pays a Compliance Sub-Agent, all in real
USDC on Base. This proves the protocol's design intent — services
demanding stablecoin settlement at the request boundary — works for
real, recursive, autonomous workflows. Every KYB submission produces
verifiable on-chain payment activity Coinbase can point at as a case
study.

---

## 3. Technical description

PayMate is an integrated stack of Solana on-chain logic, AWS-hosted AI
agents, and x402-settled inter-agent payments. Each sponsor's technology
appears in a load-bearing role, not as a checkbox.

**Solana, what made it uniquely possible.** Anchor 1.0 was the right
abstraction for a credit primitive. Strict account validation, PDAs for
the Pool, Vault, LP, and PSP state, and zero-copy serialization let us
model the entire credit relationship in roughly 600 lines of Rust. The
pro-rata yield math runs at withdraw time on-chain, mirroring how
Uniswap-style LP fees flow. Solana Mobile Wallet Adapter
(`@solana-mobile/mobile-wallet-adapter-protocol-web3js`) lets a Seeker
user authorize transactions through their Seed Vault or Phantom without
leaving the app. The fee economics, sub-cent per tx and sub-second
confirmation, make a credit pool with frequent drawdown / repayment
cycles actually viable, where Ethereum-class fees would eat the LP
yield.

**AWS Bedrock, what made it uniquely possible.** Claude Haiku 4.5 is
the sweet spot for structured underwriting at production cadence. Sonnet
quality on the reasoning task is marginally better. Haiku's latency and
per-call cost are not marginal: 4× faster, roughly 12× cheaper, which
compounds across every KYB submission. Bedrock's bearer-token auth flow
lets each of our three Lambdas hold its own Bedrock client without IAM
acrobatics. The structured output mode is what gives us a parseable KYB
matrix (rating, totalScore, sub-scores, reasoning) instead of having to
regex a free-form LLM response. We deliberately left the upgrade path
open: if a KYB is borderline, the Risk Agent recursively calls a
Compliance Sub-Agent that does sanctions screening. Same Bedrock,
narrower prompt, billed separately over x402.

**Coinbase x402, what made it uniquely possible.** x402 is the only
HTTP-native payment protocol that lets autonomous services demand
settlement at the request boundary. Every paid agent endpoint (Risk
Agent, Compliance Sub-Agent) runs middleware that calls the Coinbase
facilitator's `/verify` and `/settle` endpoints synchronously around the
work. We chose **exact** mode with **dynamic per-request pricing**: the
Risk Agent inspects the KYB payload (volume, jurisdiction, corridor)
before quoting, and prices $0.012 for clean profiles vs $0.045 for
borderline ones that will need Compliance escalation. This gives us
upto's expressiveness without the Permit2 onboarding step, important for
a system where new agent wallets get spun up frequently. EIP-3009
`transferWithAuthorization` is signed with viem on the orchestrator
side and verified by the facilitator on the agent side. No API keys, no
Stripe webhooks, no monthly invoices. Just per-request micropayments in
real USDC.

**SDKs and libraries used.**

| Concern | SDK | Role |
|---|---|---|
| Solana program | `@coral-xyz/anchor` 0.32.1 | Anchor program, account derivation, IDL-driven client |
| Solana RPC | `@solana/web3.js` 1.98 | Transaction construction, signature confirmation |
| SPL token | `@solana/spl-token` 0.4.14 | USDC ATA management, vault transfers |
| Mobile wallet | `@solana-mobile/mobile-wallet-adapter-protocol-web3js` 2.2.8 | Seeker MWA integration |
| Bedrock | `@aws-sdk/client-bedrock-runtime` | Direct Claude Haiku 4.5 invocation |
| Lambda runtime | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` | Auditable agent-call log |
| x402 client | `viem` `signTypedData` (EIP-3009) | Inter-agent payment authorization |
| Mobile UI | Expo SDK 54 + Expo Router 6 + React Native 0.81 | Three role-themed surfaces (LP, PSP, Admin) |
| State | DynamoDB on-demand, three tables | Users, KybSubmissions, AgentCallLog |

**Architecture in one diagram.**

```
       ┌────────────────────┐
       │  Seeker / Mobile   │
       │  (Expo + MWA)      │
       └─────────┬──────────┘
                 │ HTTPS
                 ▼
   ┌──────────────────────────────────┐
   │  AWS API Gateway HTTP API v2     │
   │  /kyb/submit   /admin/psps       │
   │  /admin/approve   /pool/state    │
   │  /agent/risk    /agent/compliance│
   └─────────┬────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────┐
  │ Lambda (Node 20)                                │
  │                                                 │
  │   Orchestrator ── x402 USDC ──▶ Risk Agent      │
  │                                       │         │
  │                                       │ x402    │
  │                                       ▼         │
  │                              Compliance Agent   │
  │                                                 │
  │   All three: Bedrock Claude Haiku 4.5           │
  └──┬───────────────────────────────────────┬─────┘
     │                                        │
     │ DynamoDB                               │ Solana RPC (admin signs)
     ▼                                        ▼
  3 tables                          ┌───────────────────┐
  (Users, KYB, AgentLog)            │  Anchor program   │
                                    │  Pool / Vault /   │
                                    │  LP / PSP PDAs    │
                                    └───────────────────┘
                                            ▲
                                            │ MWA-signed txs
                                  (mobile users for deposit, withdraw, drawdown, repay)
```

**Verifiable on chain.**

- Anchor program (devnet): `5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg`
- Latest pro-rata yield upgrade tx: `HTRAdDE7TKRCTvvUxjJv5ss9Sykdboop5qdiqNqV3SVMDpDFrwmdN2hNnLnn19ZKFLga3HD69Jq7mciDqoJADr6`
- Sample x402 flow: every KYB submission produces 1 to 2 USDC transfers between agent wallets on Base Sepolia, logged in `PayMate_AgentCallLog` with txHash

---

## 4. Required submission links (filled in once they exist)

- **GitHub repo:** https://github.com/strugglingfrfr/PayMatePSP
- **Canva slides:** _(TODO, required by submission rules)_
- **Demo video:** _(TODO, embedded in README)_
- **Loom walkthrough video (audio):** _(TODO, repo structure plus how it works)_

---

## 5. Tracks targeted

- **Solana**: Native Solana mobile dApp, Anchor program with on-chain credit primitive, MWA on Seeker.
- **Coinbase × AWS Agentic**: Real x402 settlement at the Coinbase facilitator, AWS Bedrock Claude Haiku 4.5 for underwriting, multi-agent topology with recursive paid calls.
