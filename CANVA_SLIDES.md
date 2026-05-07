# PayMate, Canva slide deck

10 slides. Light on copy, heavy per word. Each slide block has:

- **Title** (slide headline)
- **Body** (short bullets, big numbers, contrast)
- **Visual** (what to put on the slide besides text)
- **Speaker note** (what you say out loud, ~25 seconds)

Workflow:

1. Generate this in Gamma.app (paste the slide blocks below as the prompt)
2. Export to PPTX
3. Import into Canva, share link, submit
4. Total time: 25 minutes

---

## Slide 1, Title

**Title**

> PayMate

**Subtitle**

> On-chain credit infrastructure for stablecoin payment operators

**Body**

- Muhammad Hamza Anjum
- EasyA Consensus Miami 2026
- Solana Mobile Track  ·  Coinbase × AWS Agentic Track

**Visual**

Big bold wordmark. Dark background. Two track logos along the bottom (Solana, Coinbase, AWS).

**Speaker note**

> Hi, I'm Hamza. I built PayMate, on-chain credit infrastructure for licensed stablecoin payment operators. Targeting two tracks today, Solana Mobile and Coinbase × AWS Agentic. Let me show you why both fit.

---

## Slide 2, The prefunding problem

**Title**

> Stablecoin PSPs move billions. Their working capital is locked.

**Body**

- A PSP serving the Nigeria, UK, or Mexico, US corridor settles in **T+1 to T+2**
- But customers expect instant
- So PSPs **front the USDC themselves** out of pocket
- Squeezed by off-chain credit lines charging **5 to 8 percent per drawdown**
- Or they turn down volume they could otherwise serve

**Visual**

A simple timeline graphic: customer pays at T+0, PSP fronts USDC, on-chain settlement clears at T+1 or T+2, gap shaded red.

Or a stat callout: "$X billion in monthly stablecoin payment volume, of which Y percent is constrained by liquidity, not demand."

**Speaker note**

> Every licensed payment service provider doing stablecoin remittance has the same problem. Customers want instant settlement. Their on-chain rail clears T+1 to T+2. Result, they front the USDC themselves. They go to off-chain credit lines charging 5 to 8 percent per drawdown, or they just say no to volume. This is real, this is now, and the only credit they can access is bad credit.

---

## Slide 3, Why existing solutions don't work

**Title**

> The credit market for PSPs is broken on both sides

**Body** (two-column contrast)

| Off-chain credit | DeFi credit |
|---|---|
| 5–8% per drawdown | Anonymous, no KYB |
| Slow underwriting (weeks) | Crypto-collateralized only |
| Manual, paper-heavy | Doesn't speak USDC-native |
| Built for legacy banking | Built for degens, not licensed operators |

**Visual**

Side-by-side comparison. Center column: "PayMate sits here." Arrow pointing in.

**Speaker note**

> The credit market for these operators is broken on both sides. Off-chain lenders charge 5 to 8 percent and take weeks to underwrite. DeFi credit protocols don't underwrite licensed businesses at all, they just collateralize crypto. Neither serves a regulated PSP that needs a 30-thousand-dollar credit line for a corridor that runs hot for a week.

---

## Slide 4, PayMate

**Title**

> An on-chain credit pool, priced by AI, native to Solana mobile

**Body** (3 short statements)

- **LPs deposit USDC.** Earn pro-rata yield from real PSP fees.
- **PSPs apply once.** AI underwrites in 3 seconds. Admin approves.
- **Credit limits live on-chain.** Drawdown, settle a customer, repay at T+1.

**Visual**

Three icons: vault, brain, phone. One arrow from each into a central "pool" symbol. Then a return arrow back labeled "yield."

**Speaker note**

> PayMate is an on-chain credit pool. LPs deposit USDC and earn the actual yield from PSP fees, pro-rata. PSPs apply once on their phone, AI underwrites in three seconds, an admin approves, their credit terms land on Solana. They draw, settle their customer, repay at T+1. Every step on-chain.

---

## Slide 5, How it works

**Title**

> Three actors, one phone, one pool

**Body** (a single visual, no bullets)

```
  LP                       PSP                      Admin
  │                         │                         │
  │  deposits USDC           │  applies + drawdown      │  reviews + approves
  ▼                         ▼                         ▼
       ┌──────────────────────────────────────────────┐
       │           PAYMATE POOL  (Solana)               │
       │  TVL · available · fee_reserve · LP/PSP PDAs   │
       └──────────────────────────────────────────────┘
                              │
                              ▼
       AI Risk Agent  ◀── x402 USDC ──  Orchestrator
              │
              ▼ x402 USDC
       AI Compliance Agent
```

**Visual**

Use Gamma's diagram generation, or paste the ASCII. In Canva, redraw it cleanly with three labeled actor nodes flowing into a central pool, and the AI agents off to the side with USDC arrows between them.

**Speaker note**

> One pool, three role lenses on a single mobile app. LPs see deposits and yield. PSPs see their credit limit and drawdown UI. Admins see the queue. Behind the scenes, every KYB submission triggers AI agents that pay each other in USDC over Coinbase x402. Real money, real on-chain transactions, every time.

---

## Slide 6, The underwriting moat

**Title**

> AI underwriting that gets paid per use, not per year

**Body** (contrast)

| Today's DeFi credit underwriting | PayMate |
|---|---|
| Subscription to Chainalysis / Elliptic / TRM | x402 micropayment per KYB |
| $50K–$500K per year | $0.012 per call (or $0.045 for borderline) |
| Pay even when nobody applies | Pay only when an agent does work |
| One-vendor lock-in | Multi-agent, swappable, on-chain audit trail |

**Visual**

Big-number comparison: "$200,000 / year" crossed out vs "$0.012 / call" highlighted in green. Below: "Same accuracy. 99.99% lower fixed cost."

**Speaker note**

> Here's the moat. Existing DeFi credit protocols pay six-figure annual subscriptions to compliance vendors, whether anybody's applying for credit that month or not. PayMate's risk and compliance agents charge per call over x402. A new PSP application costs us roughly one cent. A borderline one that needs sanctions screening costs four cents. We pay zero when nobody's applying. And every paid call has an on-chain receipt for audit.

---

## Slide 7, The on-chain credit moat

**Title**

> Credit terms aren't database rows. They're Solana state.

**Body**

- Every PSP's **credit limit, personal rate, active debt** lives in a Solana PDA
- Every drawdown, repayment, deposit, withdraw emits a **public, signed transaction**
- LPs see real yield flowing in real time, not a quarterly report
- Sub-cent transaction fees make this **viable at any scale**, where Ethereum gas would eat the yield

**Visual**

A live Solana transaction in Solscan as a screenshot, with arrows pointing at the credit_limit field highlighted.

Or: a side-by-side, "Goldfinch / TrueFi" with credit terms in their off-chain backend, "PayMate" with credit terms on-chain.

**Speaker note**

> The other moat is structural. Most on-chain credit protocols still hold credit terms in a database. We don't. Every PSP's credit limit, every interest rate, every drawdown, every repayment is on Solana. LPs see the yield flowing in real time, signed and verifiable. And Solana's fees make this affordable per drawdown. On Ethereum, you'd lose the yield to gas.

---

## Slide 8, The stack

**Title**

> Three sponsors, three load-bearing roles

**Body**

- **Solana**  ·  Anchor program, six instructions, on-chain credit primitive. Mobile Wallet Adapter on Seeker.
- **AWS Bedrock**  ·  Claude Haiku 4.5 underwrites every KYB across 14 weighted criteria. Sub-2-second p50 latency. Reasoning shown is the model's literal output.
- **Coinbase x402**  ·  Three agent wallets. EIP-3009, real facilitator, real USDC settlement on Base. Dynamic exact pricing, no Permit2 needed.

**Visual**

Three logo-anchored columns. Each column has 1 sentence on what was built and 1 sentence on why this sponsor's tech was uniquely required.

**Speaker note**

> The whole stack uses each sponsor's tech in a load-bearing way. Solana, because credit primitives need cheap, fast finality, and Mobile Wallet Adapter lets a Seeker user sign without leaving the app. Bedrock, because Haiku 4.5 is fast enough for production cadence and gives us structured reasoning, not a templated score. Coinbase x402, because that's the only protocol where autonomous services can demand stablecoin payment at the request boundary. None of these are checkbox integrations. Take any one out and the design collapses.

---

## Slide 9, What's live today

**Title**

> Verifiable, on-chain, end-to-end

**Body**

- ✅ Anchor program deployed: `5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg`
- ✅ Real Circle USDC flowing through the vault
- ✅ Bedrock scoring **3 demo PSPs** with reasoning citing their actual data
- ✅ x402 settlement: 3 agent wallets paying each other in USDC on Base
- ✅ Mobile app on **Solana Seeker**, MWA wallet connect working
- ✅ Admin control room with AI-scored applications + on-chain approvals

**Visual**

Six green checkmarks. Or three small screenshots: Solscan tx, Basescan tx, app KYB result screen.

**Speaker note**

> Everything you just heard, that's live right now on devnet and Base Sepolia. The Anchor program is upgradeable. Real USDC has moved between every actor. Bedrock has scored multiple PSPs. The mobile app is on the Seeker, you can scan a QR and install it after this. Three lookable, signable artifacts: the Solana program, the Base agent transactions, and the running app.

---

## Slide 10, Vision + ask

**Title**

> Stripe for stablecoin credit

**Body**

- This is the **infrastructure layer**, not the consumer product
- Any PSP can plug in. Any LP can deposit. Any compliance vendor can be a paid agent
- The pool grows with PSP volume, the moat grows with on-chain audit trail
- Looking for: feedback from Coinbase x402 team, Solana Mobile devs, RWA / private credit folks

**Visual**

Big closing wordmark. PayMate logo, a short one-liner, Hamza name + handle/email.

**Speaker note**

> Long term, PayMate is the credit infrastructure layer for stablecoin payments. Same role Stripe plays for fiat. Any PSP plugs in, any LP supplies capital, any compliance vendor becomes a paid agent. What I'd want from anybody in this room, especially the Coinbase x402 team and the Solana Mobile folks, is feedback. Tell me what's wrong. Tell me what to fix before mainnet. That's it. Thanks.

---

## How to actually generate this

### Path A: Gamma → Canva (recommended, ~25 min)

1. Go to https://gamma.app, sign up
2. **Generate** → choose **"From text"** or **"AI"** → paste **only the title + body sections** (skip "visual" and "speaker note") of all 10 slides as one chunk
3. Pick a dark, modern theme (Gamma calls them "Glassmorphic", "Mono", or "Bold")
4. Generate, then quickly review each slide — adjust any line that came out weird
5. Export → PowerPoint (.pptx)
6. Open Canva → Create a design → Upload PowerPoint → drop the file
7. Canva imports it editable
8. Top right → Share → "Anyone with the link can view" → copy URL
9. Paste URL into the EasyA submission form

### Path B: Direct in Canva (~75 min)

1. Canva.com → Templates → search "fintech presentation" or "tech startup deck"
2. Pick a dark / modern one
3. Slide by slide, paste the title and body
4. Use Canva's **Magic Edit** feature to auto-place text into the template
5. Add the comparison tables manually (Canva has a Tables block)
6. Share + copy URL

### What to do with the speaker notes

Canva has a **"Notes"** field per slide (bottom of the editor). Paste the speaker note into each slide's notes panel. When you open Presenter View during the demo or when the judges scrub through, they'll see the talking points.
