// Solana transaction helpers — admin-side ops on the PayMate Pool program.
//
// Used by the orchestrator Lambda to:
//   - initialize_pool() once per deployment
//   - set_credit_limit() after admin approves a KYB
//
// Admin keypair comes from env (SOLANA_ADMIN_PRIVATE_KEY, base58-encoded).
// In production, swap to KMS-managed key. For hackathon, env-var is fine.

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import idl from "../idl/paymate.json" assert { type: "json" };

const PROGRAM_ID = new PublicKey(idl.address);
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const PSP_SEED = Buffer.from("psp");

// ---- Admin keypair ----------------------------------------------------------

let cachedAdmin: Keypair | null = null;

function adminKeypair(): Keypair {
  if (cachedAdmin) return cachedAdmin;
  const raw = process.env.SOLANA_ADMIN_PRIVATE_KEY;
  if (!raw) throw new Error("SOLANA_ADMIN_PRIVATE_KEY not set");
  const bytes = bs58.decode(raw);
  cachedAdmin = Keypair.fromSecretKey(bytes);
  return cachedAdmin;
}

// ---- Program instance -------------------------------------------------------

function getProgram() {
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(adminKeypair());
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as any, provider);
}

// ---- PDAs -------------------------------------------------------------------

export function findPoolPda(): PublicKey {
  return PublicKey.findProgramAddressSync([POOL_SEED], PROGRAM_ID)[0];
}
export function findVaultPda(): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID)[0];
}
export function findPspAccountPda(pspOwner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [PSP_SEED, pspOwner.toBuffer()],
    PROGRAM_ID,
  )[0];
}

// ---- Calls ------------------------------------------------------------------

export async function initializePool(args: {
  usdcMint: string; // base58 mint address
  drawdownLimit: number; // micro-USDC
  defaultPspRateBps: number;
  lpApyBps: number;
}): Promise<{ txSignature: string; pool: string; vault: string }> {
  const program = getProgram();
  const admin = adminKeypair();
  const pool = findPoolPda();
  const vault = findVaultPda();
  const usdcMint = new PublicKey(args.usdcMint);

  const txSignature = await (program.methods as any)
    .initializePool(
      new BN(args.drawdownLimit),
      args.defaultPspRateBps,
      args.lpApyBps,
    )
    .accounts({
      pool,
      vault,
      usdcMint,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  return { txSignature, pool: pool.toBase58(), vault: vault.toBase58() };
}

export async function setCreditLimit(args: {
  pspOwnerAddress: string; // base58 PSP wallet
  creditLimit: number; // micro-USDC
  personalRateBps: number; // e.g. 30 for AAA
}): Promise<{ txSignature: string; pspAccount: string }> {
  const program = getProgram();
  const admin = adminKeypair();
  const pool = findPoolPda();
  const pspOwner = new PublicKey(args.pspOwnerAddress);
  const pspAccount = findPspAccountPda(pspOwner);

  const txSignature = await (program.methods as any)
    .setCreditLimit(new BN(args.creditLimit), args.personalRateBps)
    .accounts({
      pool,
      pspOwner,
      pspAccount,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { txSignature, pspAccount: pspAccount.toBase58() };
}

// ---- Rating → personal_rate_bps mapping -------------------------------------

export function ratingToRateBps(rating: "AAA" | "AA" | "A" | "B/C"): number {
  switch (rating) {
    case "AAA":
      return 30;
    case "AA":
      return 45;
    case "A":
      return 60;
    case "B/C":
      return 85;
  }
}

// Credit limit derived from rating + business volume.
// Cap at min(2× monthly_volume × 0.05, drawdown_limit).
// For hackathon demo: simple flat by rating.
export function ratingToCreditLimit(
  rating: "AAA" | "AA" | "A" | "B/C",
): number {
  switch (rating) {
    case "AAA":
      return 50_000_000; // $50 USDC
    case "AA":
      return 30_000_000; // $30
    case "A":
      return 20_000_000; // $20
    case "B/C":
      return 10_000_000; // $10
  }
}
