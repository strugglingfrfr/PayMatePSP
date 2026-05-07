// Pre-stage the pool's fee_reserve with visible LP yield by running N
// drawdown → over-repayment cycles. All-on-chain, no API calls — faster
// and more reliable than going through the Lambda.
//
// Steps:
//   1. Admin deposits as a background LP (only if pool empty).
//   2. Generate fresh prep PSP, fund with SOL + USDC.
//   3. Admin signs set_credit_limit on prep PSP (direct, not via API).
//   4. Loop N cycles: drawdown then over-repay; excess → fee_reserve.
//
// Run with: bun run infra/prep-demo-pool.ts

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  transfer as splTransfer,
  getAccount,
} from "@solana/spl-token";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import idl from "../src/idl/paymate.json" assert { type: "json" };

// ------- Config ------------------------------------------------------------

const CYCLES = 5; // 5 cycles → ~$0.50 in fee_reserve
const DRAWDOWN_PER_CYCLE_USDC = 1; // $1 drawn each cycle
const OVERPAY_PER_CYCLE_USDC = 0.10; // adds $0.10 to fee_reserve each cycle
const PSP_SEED_USDC = 2; // fund prep PSP with this much USDC
const ADMIN_LP_DEPOSIT_USDC = 5; // admin deposits this much if pool empty

// ------- Setup -------------------------------------------------------------

const RPC = "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const POOL_PDA = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID)[0];
const VAULT_PDA = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID)[0];

const findLpAccountPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("lp"), owner.toBuffer()], PROGRAM_ID)[0];
const findPspAccountPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("psp"), owner.toBuffer()], PROGRAM_ID)[0];

const sx = (sig: string) => `https://solscan.io/tx/${sig}?cluster=devnet`;
const fmt = (microUsdc: number) => `$${(microUsdc / 1e6).toFixed(4)}`;

const adminBytes = JSON.parse(
  readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"),
) as number[];
const admin = Keypair.fromSecretKey(Uint8Array.from(adminBytes));

const adminAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  USDC_MINT,
  admin.publicKey,
);

const adminProvider = new AnchorProvider(conn, new Wallet(admin), { commitment: "confirmed" });
const adminProgram = new Program(idl as any, adminProvider);
const ADMIN_LP_PDA = findLpAccountPda(admin.publicKey);

const fetchPool = async () => (await (adminProgram.account as any).pool.fetch(POOL_PDA));
const showFeeReserve = async () => Number((await fetchPool()).feeReserve);

console.log(`\n  admin: ${admin.publicKey.toBase58()}`);
console.log(`  admin USDC: ${fmt(Number((await getAccount(conn, adminAta.address)).amount))}\n`);

// ------- Step 1: Top up pool if empty --------------------------------------

const poolBefore = await fetchPool();
const availableMicro = Number(poolBefore.availableLiquidity);
const requiredMicro = (DRAWDOWN_PER_CYCLE_USDC + 0.1) * 1_000_000; // small buffer

if (availableMicro < requiredMicro) {
  console.log(
    `  pool too low (avail ${fmt(availableMicro)}). Admin depositing ${ADMIN_LP_DEPOSIT_USDC} USDC as background LP…`,
  );
  const depositSig = await (adminProgram.methods as any)
    .deposit(new BN(ADMIN_LP_DEPOSIT_USDC * 1_000_000))
    .accounts({
      pool: POOL_PDA,
      vault: VAULT_PDA,
      lpAccount: ADMIN_LP_PDA,
      lpTokenAccount: adminAta.address,
      lp: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`    ✓ background LP deposit: ${sx(depositSig)}`);
}

// ------- Step 2: Fresh prep PSP --------------------------------------------

const psp = Keypair.generate();
console.log(`\n  prep PSP: ${psp.publicKey.toBase58()}`);

console.log(`  → seeding 0.05 SOL…`);
const solSig = await conn.sendTransaction(
  new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: psp.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    }),
  ),
  [admin],
);
await conn.confirmTransaction(solSig);

console.log(`  → seeding ${PSP_SEED_USDC} USDC…`);
const pspAta = await getOrCreateAssociatedTokenAccount(conn, admin, USDC_MINT, psp.publicKey);
await splTransfer(conn, admin, adminAta.address, pspAta.address, admin, PSP_SEED_USDC * 1_000_000);

const PSP_ACCOUNT_PDA = findPspAccountPda(psp.publicKey);

// ------- Step 3: Admin signs set_credit_limit on-chain --------------------
// Bypasses the API/Lambda (which times out on slower RPC days).

console.log(`  → admin signs set_credit_limit (5 USDC limit, 45 bps/day)…`);
const setLimitSig = await (adminProgram.methods as any)
  .setCreditLimit(new BN(5_000_000), 45)
  .accounts({
    pool: POOL_PDA,
    pspOwner: psp.publicKey,
    pspAccount: PSP_ACCOUNT_PDA,
    admin: admin.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log(`    ✓ ${sx(setLimitSig)}`);

// ------- Step 4: Run cycles ------------------------------------------------

const pspProvider = new AnchorProvider(conn, new Wallet(psp), { commitment: "confirmed" });
const pspProgram = new Program(idl as any, pspProvider);

console.log(`\n  fee_reserve before cycles: ${fmt(await showFeeReserve())}`);

const drawMicro = DRAWDOWN_PER_CYCLE_USDC * 1_000_000;
const repayMicro = (DRAWDOWN_PER_CYCLE_USDC + OVERPAY_PER_CYCLE_USDC) * 1_000_000;

for (let i = 1; i <= CYCLES; i++) {
  console.log(`\n  ━━━━ Cycle ${i}/${CYCLES} ━━━━`);

  const drawSig = await (pspProgram.methods as any)
    .requestDrawdown(new BN(drawMicro))
    .accounts({
      pool: POOL_PDA,
      vault: VAULT_PDA,
      pspAccount: PSP_ACCOUNT_PDA,
      pspTokenAccount: pspAta.address,
      psp: psp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`    drew ${fmt(drawMicro)}: ${sx(drawSig)}`);

  await new Promise((r) => setTimeout(r, 1500));

  const repaySig = await (pspProgram.methods as any)
    .repay(new BN(repayMicro))
    .accounts({
      pool: POOL_PDA,
      vault: VAULT_PDA,
      pspAccount: PSP_ACCOUNT_PDA,
      pspTokenAccount: pspAta.address,
      psp: psp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`    repaid ${fmt(repayMicro)} (excess ${fmt(repayMicro - drawMicro)} → fee_reserve): ${sx(repaySig)}`);
}

const finalFeeReserve = await showFeeReserve();
const finalPool = await fetchPool();

console.log(`\n=== POOL READY FOR DEMO ===`);
console.log(`  totalLiquidity:    ${fmt(Number(finalPool.totalLiquidity))}`);
console.log(`  availableLiquidity:${fmt(Number(finalPool.availableLiquidity))}`);
console.log(`  fee_reserve:       ${fmt(finalFeeReserve)} ✓`);
console.log(`  This will distribute pro-rata to LPs at next withdraw.\n`);
