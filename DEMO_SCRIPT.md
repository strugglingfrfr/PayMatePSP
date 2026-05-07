# PayMate — 90-second demo video script

**Target length: 90 seconds. Don't rush, don't drag.**

Read the *Voiceover* lines naturally over the recording. The *On-screen*
column is what your phone screen should show / what you should tap.

---

## Pre-recording checklist (do BEFORE hitting record)

1. ✅ **Run prep script** to seed pool yield:
   ```
   cd lambda
   bun run infra/prep-demo-pool.ts
   ```
   Confirms in console: `fee_reserve: $0.50xxx ✓`

2. ✅ **Phone setup**:
   - Solflare open in background, PSP wallet `8jC6z1F…UEP` set as active account
   - PayMate app installed, but closed (we'll open fresh on camera)
   - Notifications silenced (do-not-disturb on)
   - Screen brightness high
   - Battery > 30%

3. ✅ **Two clips strategy**:
   - **Clip A** (live): PSP applies, gets scored, draws funds
   - **Clip B** (separately recorded): LP withdraws with visible yield
   - Edit together in CapCut / iMovie — total 90s

4. ✅ **Optional laptop second screen** (for cuts to Solscan/Basescan):
   - Open Solscan tab on the program: `https://solscan.io/account/5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg?cluster=devnet`
   - Open Basescan tab on the orchestrator agent wallet (any of your 3 agent wallets)

---

## The script

### CLIP A — phone, live recording

| Time | On-screen | Voiceover |
|---|---|---|
| **0:00–0:08** | Open PayMate from home screen → splash loads | *"Licensed payment operators move billions in stablecoin remittances. But every transaction, they prefund out of their own pocket — locking working capital for days. PayMate fixes that."* |
| **0:08–0:22** | Tap **PSP** → Connect Wallet → Solflare opens → tap Approve → returns to PayMate | *"A PSP applies once. Sixteen-field KYB form. AI underwrites in three seconds — AWS Bedrock Claude Haiku, scoring on fourteen weighted criteria."* |
| **0:22–0:35** | Show the PSP screen with **AA / 86 / 100**, scroll to show AI Reasoning section | *"This is the model's actual reasoning — citing their FCA jurisdiction, settlement partners by name, and the corridor risk profile. Not a template. Live Bedrock output."* |
| **0:35–0:48** | Tap "Draw Funds" → enter `3` → tap submit → Solflare opens → Approve → return to PayMate, green success banner shows | *"Approved PSP draws three USDC against their on-chain credit limit. Funds in their wallet instantly. The Solana program enforces the cap."* |
| **0:48–0:55** | *(optional cut to laptop)* Solscan tab refreshes the request_drawdown tx | *"There's the on-chain drawdown — every PSP credit term, every fund movement, public and signed."* |

### CLIP B — separately recorded, LP role

| Time | On-screen | Voiceover |
|---|---|---|
| **0:55–1:15** | LP role pre-connected, Withdraw tab open, Principal $5.00 + accumulated yield visible. Tap Withdraw → Solflare → Approve → success banner | *"On the supply side: LPs deposit USDC, earn yield from PSP repayment fees. Real-world yield from licensed payment operators — not anonymous DeFi credit. The pool's fee reserve distributes pro-rata."* |
| **1:15–1:25** | *(optional cut to laptop)* Basescan tab showing the agent-to-agent x402 USDC payments | *"And under the hood, every KYB submission triggers Coinbase x402 micropayments between AI agents — orchestrator pays Risk Agent, Risk Agent pays Compliance Sub-Agent. Real USDC, real settlement, real recursive paid AI workflows."* |
| **1:25–1:30** | Closing card: PayMate logo + GitHub URL + track logos | *"PayMate. On-chain prefunding for stablecoin payments. Live on Solana devnet and Base Sepolia."* |

**Total: 90 seconds.**

---

## Tips for clean delivery

- **Don't read in monotone.** Pause briefly after "PayMate fixes that" and after each track-relevant line ("AWS Bedrock", "Coinbase x402", "Solana"). Lets each beat land.
- **Don't apologize** for any UI imperfection. Judges expect demos to be slightly rough.
- **Pace yourself.** 90 seconds feels short, but your voice will rush to fill it. Aim to finish the script with 2-3 seconds of silence at the end — better than rushing.
- **Multiple takes are fine.** Record the live clip 3-4 times, pick the cleanest. The pre-recorded LP clip can be retaken offline.

---

## Backup phrases if you flub a line

If you mess up a take, here's a shorter version of each beat you can use as a recovery:

- *"PayMate is on-chain prefunding for stablecoin payment operators."*
- *"AI underwrites in three seconds. The reasoning is the model's actual output."*
- *"PSPs draw on-chain credit. Funds arrive instantly."*
- *"LPs earn real-world yield from PSP fees."*
- *"x402 micropayments between AI agents. Real USDC settling on Base."*
- *"Live on Solana devnet."*

Stitch any subset together; you'll still hit the moats.

---

## Closing slide content (the last 5s)

```
              PayMate
On-chain prefunding for stablecoin payments

  github.com/strugglingfrfr/PayMatePSP

   [Solana Mobile]   [Coinbase × AWS Agentic]
```

Make a quick Canva slide (1080p, dark background, blue PayMate accent) with this content. Drop in as the last 5 seconds of your edited video.

---

## Walkthrough video script (separate, ~4 min, on laptop with audio)

**This is rule 7d — the audio walkthrough explaining repo structure + how it works. Different from the demo above.**

### 0:00–0:30 — Intro
> *"Hi, I'm Hamza. PayMate is on-chain prefunding infrastructure for stablecoin payment operators. I built it solo for EasyA Consensus Miami 2026, targeting two tracks: Solana Mobile and Coinbase × AWS Agentic. Let me walk you through how it works."*

[Show: title slide of Canva deck]

### 0:30–1:30 — Slide deck pass
Walk through slides 1–10. Don't read every word. Hit:
- Slide 2: the prefunding problem (the killer pain)
- Slide 4: the solution one-liner
- Slide 7: the flow of funds (5 steps, 4 on-chain)
- Slide 8: the stack (Solana / Bedrock / x402)

> *"The flow of funds is the easiest way to understand it. LPs deposit USDC into a Solana pool. PSPs apply for credit, AI scores them, admin approves, credit terms land on-chain. PSPs draw, settle their customer off-chain, repay next day. Fees go to LPs. Five state changes, four of them on-chain Solana transactions."*

### 1:30–2:30 — Repo walkthrough (in VSCode)
Open VSCode, navigate the file explorer:

> *"The repo has four parts. The Anchor program in `program/programs/program/src/lib.rs` — six instructions, six hundred lines of Rust. Here's request_drawdown — it reverts if amount exceeds credit_limit, that's the on-chain enforcement."*

[Scroll briefly through `request_drawdown` and `repay`]

> *"The lambda backend in `lambda/src/`. The KYB submit handler is where the agent flow starts — it pays the Risk Agent over x402. The admin approve handler signs `set_credit_limit` on-chain with the admin keypair."*

[Open `kyb.ts` and `admin.ts` briefly]

> *"The mobile app in `mobile/app/`. Three role groups — LP, PSP, Admin. Each has its own tabs. Mobile Wallet Adapter handles signing. The screens read on-chain state via Lambda endpoints because Anchor's client-side decoder is flaky on Android."*

[Show the directory structure]

### 2:30–3:45 — Embed the 90s demo video
> *"Here's the running app, end-to-end."*

**Drag the demo video file into a fullscreen video player. Hit play. Stop talking, let the demo's own voiceover play.**

### 3:45–4:30 — On-chain proofs + close
Switch to browser. Open Solscan with the program ID:

> *"Live on devnet. Program five-cuj-seven. Every state change is a public, signed transaction. Here's the latest pro-rata yield upgrade."*

[Click on a recent tx to show details]

Switch to Basescan, show one of the agent wallets:

> *"And on Base Sepolia, the agents pay each other in real USDC over Coinbase's x402 facilitator. Every KYB submission produces one or two of these micropayments."*

> *"GitHub link's in the description. Submission text and slide deck are in the repo. Thanks!"*

### Total: ~4:30
