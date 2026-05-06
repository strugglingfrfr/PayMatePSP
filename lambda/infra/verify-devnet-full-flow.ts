// Devnet full-flow verification.
// Proves every Anchor instruction works on the live program with Circle's
// real Solana devnet USDC.
//
// Sequence:
//   1. admin (LP) deposits USDC into pool
//   2. admin sets PSP's credit limit (set_credit_limit)
//   3. PSP requests drawdown
//   4. PSP repays principal + fee
//   5. admin (LP) withdraws principal + yield
//
// Each step prints the tx signature + a Solscan devnet link. Run only
// after admin has Circle USDC (faucet from faucet.circle.com).
//
// Run with:  bun run infra/verify-devnet-full-flow.ts

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  transfer as splTransfer,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import idl from "../src/idl/paymate.json" assert { type: "json" };

const RPC = "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");

// Circle's official Solana devnet USDC.
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const POOL_PDA = PublicKey.findProgramAddressSync(
  [Buffer.from("pool")],
  PROGRAM_ID,
)[0];
const VAULT_PDA = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  PROGRAM_ID,
)[0];

const findLpAccountPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), owner.toBuffer()],
    PROGRAM_ID,
  )[0];

const findPspAccountPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("psp"), owner.toBuffer()],
    PROGRAM_ID,
  )[0];

const sx = (sig: string) =>
  `https://solscan.io/tx/${sig}?cluster=devnet`;
const fmt = (n: number) => `${(n / 1e6).toFixed(4)} USDC`;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const adminBytes = JSON.parse(
  readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"),
) as number[];
const admin = Keypair.fromSecretKey(Uint8Array.from(adminBytes));
console.log(`\n  admin: ${admin.publicKey.toBase58()}`);

// Admin's USDC ATA — must exist + have funds before this script runs.
const adminAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  USDC_MINT,
  admin.publicKey,
);
const adminUsdc = await getAccount(conn, adminAta.address);
console.log(`  admin USDC: ${fmt(Number(adminUsdc.amount))}`);
if (Number(adminUsdc.amount) < 6_000_000) {
  console.error(
    `\n  ❌ admin needs at least 6 USDC for this test. Faucet at https://faucet.circle.com (Solana Devnet → USDC) to ${admin.publicKey.toBase58()}.\n`,
  );
  process.exit(1);
}

// Generate fresh PSP wallet for this run.
const psp = Keypair.generate();
console.log(`  fresh PSP: ${psp.publicKey.toBase58()}`);

// Admin sends PSP a bit of SOL for tx fees.
const fundSig = await conn.sendTransaction(
  new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: psp.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    }),
  ),
  [admin],
);
await conn.confirmTransaction(fundSig);
console.log(`  → funded PSP with 0.05 SOL: ${sx(fundSig)}`);

// Create PSP's USDC ATA + transfer 1 USDC for the repayment fee buffer.
const pspAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  USDC_MINT,
  psp.publicKey,
);
const xferSig = await splTransfer(
  conn,
  admin,
  adminAta.address,
  pspAta.address,
  admin,
  1_000_000, // 1 USDC
);
console.log(`  → seeded PSP with 1 USDC: ${sx(xferSig)}`);

// Anchor program scoped to admin (LP + admin signer).
const adminProvider = new AnchorProvider(conn, new Wallet(admin), {
  commitment: "confirmed",
});
const adminProgram = new Program(idl as any, adminProvider);

// Anchor program scoped to PSP.
const pspProvider = new AnchorProvider(conn, new Wallet(psp), {
  commitment: "confirmed",
});
const pspProgram = new Program(idl as any, pspProvider);

const LP_ACCOUNT_PDA = findLpAccountPda(admin.publicKey);
const PSP_ACCOUNT_PDA = findPspAccountPda(psp.publicKey);

const showPool = async () => {
  const p = await (adminProgram.account as any).pool.fetch(POOL_PDA);
  console.log(
    `      pool: tvl=${fmt(p.totalLiquidity.toNumber())} avail=${fmt(p.availableLiquidity.toNumber())} reserve=${fmt(p.feeReserve.toNumber())}`,
  );
};

// ---------------------------------------------------------------------------
// 1. LP deposit (admin acts as LP)
// ---------------------------------------------------------------------------

console.log(`\n  ━━━━ 1. LP deposit ━━━━`);
const depositSig = await (adminProgram.methods as any)
  .deposit(new BN(5_000_000)) // 5 USDC
  .accounts({
    pool: POOL_PDA,
    vault: VAULT_PDA,
    lpAccount: LP_ACCOUNT_PDA,
    lpTokenAccount: adminAta.address,
    lp: admin.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log(`    ✓ deposited 5 USDC: ${sx(depositSig)}`);
await showPool();

// ---------------------------------------------------------------------------
// 2. Admin sets credit limit on PSP
// ---------------------------------------------------------------------------

console.log(`\n  ━━━━ 2. Admin sets credit limit ━━━━`);
const setLimitSig = await (adminProgram.methods as any)
  .setCreditLimit(
    new BN(3_000_000), // 3 USDC credit limit
    60, // 0.6%/day rate
  )
  .accounts({
    pool: POOL_PDA,
    pspOwner: psp.publicKey,
    pspAccount: PSP_ACCOUNT_PDA,
    admin: admin.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log(
  `    ✓ PSP credit limit = 3 USDC @ 60 bps/day: ${sx(setLimitSig)}`,
);

// ---------------------------------------------------------------------------
// 3. PSP requests drawdown
// ---------------------------------------------------------------------------

console.log(`\n  ━━━━ 3. PSP drawdown ━━━━`);
const drawSig = await (pspProgram.methods as any)
  .requestDrawdown(new BN(2_000_000)) // 2 USDC
  .accounts({
    pool: POOL_PDA,
    vault: VAULT_PDA,
    pspAccount: PSP_ACCOUNT_PDA,
    pspTokenAccount: pspAta.address,
    psp: psp.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log(`    ✓ PSP drew 2 USDC: ${sx(drawSig)}`);
await showPool();
console.log(
  `      psp ata: ${fmt(Number((await getAccount(conn, pspAta.address)).amount))}`,
);

// Wait a couple of seconds so accrued fee is non-zero.
console.log(`\n  ⏳ waiting 3s so the fee accrues…`);
await new Promise((r) => setTimeout(r, 3000));

// ---------------------------------------------------------------------------
// 4. PSP repays
// ---------------------------------------------------------------------------

console.log(`\n  ━━━━ 4. PSP repay ━━━━`);
// Repay principal + buffer for fee. Excess goes to fee_reserve.
const repaySig = await (pspProgram.methods as any)
  .repay(new BN(2_050_000)) // 2.05 USDC (principal + fee buffer)
  .accounts({
    pool: POOL_PDA,
    vault: VAULT_PDA,
    pspAccount: PSP_ACCOUNT_PDA,
    pspTokenAccount: pspAta.address,
    psp: psp.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log(`    ✓ PSP repaid 2.05 USDC: ${sx(repaySig)}`);
await showPool();

// ---------------------------------------------------------------------------
// 5. LP withdraw
// ---------------------------------------------------------------------------

console.log(`\n  ━━━━ 5. LP withdraw ━━━━`);
const adminBefore = Number(
  (await getAccount(conn, adminAta.address)).amount,
);
const withdrawSig = await (adminProgram.methods as any)
  .withdraw()
  .accounts({
    pool: POOL_PDA,
    vault: VAULT_PDA,
    lpAccount: LP_ACCOUNT_PDA,
    lpTokenAccount: adminAta.address,
    lp: admin.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
const adminAfter = Number((await getAccount(conn, adminAta.address)).amount);
console.log(
  `    ✓ LP received ${fmt(adminAfter - adminBefore)} (principal + accrued yield): ${sx(withdrawSig)}`,
);
await showPool();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n  ✅ ALL 6 INSTRUCTIONS VERIFIED ON DEVNET\n`);
console.log(`  Solscan transaction trail:`);
console.log(`    1. seed PSP SOL    ${sx(fundSig)}`);
console.log(`    2. seed PSP USDC   ${sx(xferSig)}`);
console.log(`    3. LP deposit      ${sx(depositSig)}`);
console.log(`    4. set credit lim  ${sx(setLimitSig)}`);
console.log(`    5. PSP drawdown    ${sx(drawSig)}`);
console.log(`    6. PSP repay       ${sx(repaySig)}`);
console.log(`    7. LP withdraw     ${sx(withdrawSig)}\n`);
console.log(`  PSP wallet: ${psp.publicKey.toBase58()}`);
console.log(`  Pool PDA:   ${POOL_PDA.toBase58()}`);
console.log(`  Vault PDA:  ${VAULT_PDA.toBase58()}`);
