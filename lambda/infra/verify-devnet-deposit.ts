// End-to-end devnet test: a fresh LP wallet deposits mock USDC into the
// PayMate Pool program. This is the path the mobile app will execute.
// If this works, the program's non-admin instructions are confirmed
// invocable on devnet.
//
// Run with:  bun run infra/verify-devnet-deposit.ts

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
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import idl from "../src/idl/paymate.json" assert { type: "json" };

const RPC = "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");

// Admin (= mint authority + program upgrade authority)
const adminBytes = JSON.parse(
  readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"),
) as number[];
const admin = Keypair.fromSecretKey(Uint8Array.from(adminBytes));

const mintStr = readFileSync(
  `${import.meta.dir}/../.secrets/mock-usdc-mint.txt`,
  "utf8",
).trim();
const usdcMint = new PublicKey(mintStr);

const PROGRAM_ID = new PublicKey(idl.address);
const POOL_PDA = PublicKey.findProgramAddressSync(
  [Buffer.from("pool")],
  PROGRAM_ID,
)[0];
const VAULT_PDA = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  PROGRAM_ID,
)[0];

// Fresh LP wallet
const lp = Keypair.generate();
console.log(`\n  → fresh LP: ${lp.publicKey.toBase58()}`);

// Step 1: admin sends LP some SOL for tx fees
console.log(`  → funding LP with 0.1 SOL from admin`);
const fundTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: admin.publicKey,
    toPubkey: lp.publicKey,
    lamports: 0.1 * LAMPORTS_PER_SOL,
  }),
);
const fundSig = await conn.sendTransaction(fundTx, [admin]);
await conn.confirmTransaction(fundSig);
console.log(`    ✓ ${fundSig.slice(0, 16)}...`);

// Step 2: admin creates LP's USDC ATA + mints 10 USDC
console.log(`  → minting 10 mock USDC to LP`);
const lpAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  usdcMint,
  lp.publicKey,
);
await mintTo(conn, admin, usdcMint, lpAta.address, admin, 10_000_000); // 10 USDC (6 decimals)
console.log(`    ✓ LP ATA: ${lpAta.address.toBase58()}`);

const beforeAta = await getAccount(conn, lpAta.address);
const beforeVault = await getAccount(conn, VAULT_PDA);
console.log(
  `  → before: LP ATA = ${Number(beforeAta.amount) / 1e6} USDC, vault = ${Number(beforeVault.amount) / 1e6} USDC`,
);

// Step 3: build the Anchor program instance with LP as signer
const lpWallet = new Wallet(lp);
const provider = new AnchorProvider(conn, lpWallet, { commitment: "confirmed" });
const program = new Program(idl as any, provider);

const [LP_ACCOUNT_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("lp"), lp.publicKey.toBuffer()],
  PROGRAM_ID,
);

console.log(`  → calling deposit(5_000_000) — LP signs`);
const depositSig = await (program.methods as any)
  .deposit(new BN(5_000_000)) // 5 USDC
  .accounts({
    pool: POOL_PDA,
    vault: VAULT_PDA,
    lpAccount: LP_ACCOUNT_PDA,
    lpTokenAccount: lpAta.address,
    lp: lp.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log(`    ✓ deposit tx: ${depositSig.slice(0, 16)}...`);
console.log(`    https://solscan.io/tx/${depositSig}?cluster=devnet`);

// Step 4: verify on-chain state matches
const afterAta = await getAccount(conn, lpAta.address);
const afterVault = await getAccount(conn, VAULT_PDA);
console.log(
  `\n  → after:  LP ATA = ${Number(afterAta.amount) / 1e6} USDC, vault = ${Number(afterVault.amount) / 1e6} USDC`,
);

const lpAccount = await (program.account as any).lpAccount.fetch(LP_ACCOUNT_PDA);
console.log(`\n  → LpAccount on-chain:`);
console.log(`      owner:            ${lpAccount.owner.toBase58()}`);
console.log(`      depositedAmount:  ${lpAccount.depositedAmount.toNumber() / 1e6} USDC`);
console.log(`      lastDepositTs:    ${lpAccount.lastDepositTs.toNumber()}`);

const pool = await (program.account as any).pool.fetch(POOL_PDA);
console.log(`\n  → Pool on-chain:`);
console.log(`      totalLiquidity:     ${pool.totalLiquidity.toNumber() / 1e6} USDC`);
console.log(`      availableLiquidity: ${pool.availableLiquidity.toNumber() / 1e6} USDC`);

// Assertions
const ok =
  Number(afterAta.amount) === Number(beforeAta.amount) - 5_000_000 &&
  Number(afterVault.amount) === Number(beforeVault.amount) + 5_000_000 &&
  lpAccount.depositedAmount.toNumber() === 5_000_000 &&
  pool.totalLiquidity.toNumber() === 5_000_000;

console.log(
  ok
    ? "\n  ✅ DEPOSIT FLOW WORKS ON DEVNET — mobile app's path is verified.\n"
    : "\n  ❌ MISMATCH between expected and on-chain state.\n",
);
process.exit(ok ? 0 : 1);
