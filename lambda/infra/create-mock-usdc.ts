// Create a mock USDC mint on Solana devnet for the demo pool.
// Uses the local admin keypair as mint authority.
//
// Run once:  bun run infra/create-mock-usdc.ts
// Idempotent: if .secrets/mock-usdc-mint.txt exists, prints it and exits.

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RPC = "https://api.devnet.solana.com";
const SECRETS_DIR = join(import.meta.dir, "..", ".secrets");
const MINT_FILE = join(SECRETS_DIR, "mock-usdc-mint.txt");

mkdirSync(SECRETS_DIR, { recursive: true });

if (existsSync(MINT_FILE)) {
  const existing = readFileSync(MINT_FILE, "utf8").trim();
  console.log(`  ✓ mock USDC already exists: ${existing}`);
  console.log(`    (delete .secrets/mock-usdc-mint.txt to recreate)`);
  process.exit(0);
}

const keypairPath = `${homedir()}/.config/solana/id.json`;
const arr = JSON.parse(readFileSync(keypairPath, "utf8")) as number[];
const admin = Keypair.fromSecretKey(Uint8Array.from(arr));
console.log(`  → admin: ${admin.publicKey.toBase58()}`);

const conn = new Connection(RPC, "confirmed");
const balance = await conn.getBalance(admin.publicKey);
console.log(`  → admin SOL: ${(balance / LAMPORTS_PER_SOL).toFixed(4)}`);
if (balance < 0.05 * LAMPORTS_PER_SOL) {
  console.error(`  ❌ need at least 0.05 SOL on admin to create mint`);
  process.exit(1);
}

console.log(`  → creating mock USDC mint (6 decimals, admin = mint authority)`);
const mint = await createMint(
  conn,
  admin,
  admin.publicKey,
  null,
  6,
);
console.log(`  ✓ mint: ${mint.toBase58()}`);

console.log(`  → minting 1,000 mock USDC to admin's ATA`);
const adminAta = await getOrCreateAssociatedTokenAccount(
  conn,
  admin,
  mint,
  admin.publicKey,
);
await mintTo(conn, admin, mint, adminAta.address, admin, 1_000_000_000); // 1000 USDC (6 decimals)
console.log(`  ✓ minted to ${adminAta.address.toBase58()}`);

writeFileSync(MINT_FILE, mint.toBase58());
console.log(`  ✓ saved mint address to ${MINT_FILE}`);
console.log("");
console.log(`  Next: bun run infra/deploy.sh && curl ... /admin/init-pool`);
