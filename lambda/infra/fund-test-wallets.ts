// Funds two test wallets so the user can test the full end-to-end flow
// on the live mobile app:
//
//   - Fresh LP wallet  : 0.1 SOL + 5 USDC  (for deposit)
//   - Approved PSP     : 0.1 SOL + 1 USDC  (for repay fee buffer)
//
// The PSP wallet (8jC6z1F...UEP) was previously approved on-chain with a
// $30 credit limit by the seed-approved-psp script. Funding it now means
// it can sign drawdown + repay txs immediately.

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer as splTransfer,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const APPROVED_PSP = new PublicKey("8jC6z1Fr8SG3gVUwrZs6B8Zg75KADGA9UXDsCS7oWUEP");
const APPROVED_PSP_SECRET =
  "2ebGvyowzXPa4B97ZveFneP5CsoZu8sBP8u8ba3vYD2SsyUBkz7EbmWc9x26GfufNNyxHfhVWGYkno1hiGH5piU3";

const admin = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")),
  ),
);
const adminAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  USDC,
  admin.publicKey,
);

console.log(`\n  admin: ${admin.publicKey.toBase58()}`);
console.log(
  `  admin USDC: ${Number((await getAccount(conn, adminAta.address)).amount) / 1e6}\n`,
);

// ───────────────────────────────────────────────────────────────────────
// 1. Fresh LP wallet
// ───────────────────────────────────────────────────────────────────────

const lp = Keypair.generate();
console.log(`\n  fresh LP: ${lp.publicKey.toBase58()}`);
console.log(`  secret  : ${bs58.encode(lp.secretKey)}`);

console.log(`\n  → seeding LP with 0.1 SOL…`);
const solSig = await conn.sendTransaction(
  new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: lp.publicKey,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    }),
  ),
  [admin],
);
await conn.confirmTransaction(solSig);
console.log(`    ✓ ${solSig}`);

console.log(`  → creating LP USDC ATA + transferring 5 USDC…`);
const lpAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  USDC,
  lp.publicKey,
);
const lpUsdcSig = await splTransfer(
  conn,
  admin,
  adminAta.address,
  lpAta.address,
  admin,
  5_000_000,
);
console.log(`    ✓ ${lpUsdcSig}`);

// ───────────────────────────────────────────────────────────────────────
// 2. Approved PSP wallet (already has $30 credit limit on-chain)
// ───────────────────────────────────────────────────────────────────────

console.log(`\n  approved PSP: ${APPROVED_PSP.toBase58()}`);
console.log(`  → topping up PSP with 0.1 SOL…`);
const pspSolSig = await conn.sendTransaction(
  new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: APPROVED_PSP,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    }),
  ),
  [admin],
);
await conn.confirmTransaction(pspSolSig);
console.log(`    ✓ ${pspSolSig}`);

console.log(`  → creating PSP USDC ATA + transferring 1 USDC (fee buffer)…`);
const pspAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  USDC,
  APPROVED_PSP,
);
const pspUsdcSig = await splTransfer(
  conn,
  admin,
  adminAta.address,
  pspAta.address,
  admin,
  1_000_000,
);
console.log(`    ✓ ${pspUsdcSig}`);

// ───────────────────────────────────────────────────────────────────────
// Final balances
// ───────────────────────────────────────────────────────────────────────

const lpSol = await conn.getBalance(lp.publicKey);
const lpUsdc = Number((await getAccount(conn, lpAta.address)).amount);
const pspSol = await conn.getBalance(APPROVED_PSP);
const pspUsdc = Number((await getAccount(conn, pspAta.address)).amount);

console.log(`\n=== TEST WALLETS READY ===`);
console.log(`\n  LP  ${lp.publicKey.toBase58()}`);
console.log(`      ${lpSol / 1e9} SOL  |  ${lpUsdc / 1e6} USDC`);
console.log(`      secret: ${bs58.encode(lp.secretKey)}`);
console.log(`\n  PSP ${APPROVED_PSP.toBase58()} (already approved, $30 limit)`);
console.log(`      ${pspSol / 1e9} SOL  |  ${pspUsdc / 1e6} USDC`);
console.log(`      secret: ${APPROVED_PSP_SECRET}\n`);
