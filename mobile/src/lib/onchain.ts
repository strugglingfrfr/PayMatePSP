// On-chain instruction builders + MWA tx signing.
//
// Pattern: build the Anchor instruction → wrap in a VersionedTransaction →
// pass to MWA's transact() / signAndSendTransactions(). MWA on Android
// hands the tx to the user's wallet (Phantom / Solflare / Coinbase Wallet)
// for the actual signature.
//
// In mock mode (no MWA), the helpers throw before signing — UI surfaces
// the error clearly.

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
  Wallet,
  BN,
  type Idl,
} from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Platform } from "react-native";
import idl from "../idl/paymate.json";

const RPC_URL = "https://api.devnet.solana.com";
export const DEVNET = new Connection(RPC_URL, "confirmed");

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const LP_SEED = Buffer.from("lp");
const PSP_SEED = Buffer.from("psp");

// Mock USDC mint on devnet (created in lambda/infra/create-mock-usdc.ts).
// Hardcoded for the demo. For prod swap to Circle's mainnet USDC.
export const USDC_MINT = new PublicKey(
  "Et1L9zCEd8Z4ZX1BJow8Q2DLVz5d7b6jXZid76fWfnQZ",
);

// ---- PDAs -------------------------------------------------------------------

export const POOL_PDA = PublicKey.findProgramAddressSync(
  [POOL_SEED],
  PROGRAM_ID,
)[0];
export const VAULT_PDA = PublicKey.findProgramAddressSync(
  [VAULT_SEED],
  PROGRAM_ID,
)[0];

export function findLpAccountPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [LP_SEED, owner.toBuffer()],
    PROGRAM_ID,
  )[0];
}
export function findPspAccountPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [PSP_SEED, owner.toBuffer()],
    PROGRAM_ID,
  )[0];
}

// ---- Read helpers (no signing) ----------------------------------------------

// Anchor Program needs a wallet, but we won't sign with it for reads.
// Provide a dummy. The IDL drives all the deserialization.
function readOnlyProgram(): Program {
  const dummyKey = PublicKey.default;
  const dummyWallet = {
    publicKey: dummyKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(
    DEVNET,
    dummyWallet as unknown as Wallet,
    { commitment: "confirmed" },
  );
  return new Program(idl as Idl, provider);
}

export async function fetchLpAccount(owner: PublicKey): Promise<{
  depositedAmount: number;
  lastDepositTs: number;
} | null> {
  const program = readOnlyProgram();
  const pda = findLpAccountPda(owner);
  try {
    const acct = await (program.account as any).lpAccount.fetch(pda);
    return {
      depositedAmount: acct.depositedAmount.toNumber(),
      lastDepositTs: acct.lastDepositTs.toNumber(),
    };
  } catch {
    return null;
  }
}

export async function fetchPspAccount(owner: PublicKey): Promise<{
  creditLimit: number;
  personalRateBps: number;
  activePositionAmount: number;
  activePositionDrawdownTs: number;
} | null> {
  const program = readOnlyProgram();
  const pda = findPspAccountPda(owner);
  try {
    const acct = await (program.account as any).pspAccount.fetch(pda);
    return {
      creditLimit: acct.creditLimit.toNumber(),
      personalRateBps: acct.personalRateBps,
      activePositionAmount: acct.activePositionAmount.toNumber(),
      activePositionDrawdownTs: acct.activePositionDrawdownTs.toNumber(),
    };
  } catch {
    return null;
  }
}

// ---- Yield calc (mirrors on-chain math) -------------------------------------

const SECONDS_PER_YEAR = 365 * 86_400;
export const LP_APY_BPS = 500; // 5%

/**
 * Compute pro-rata yield since last deposit.
 * Mirrors the Anchor program's withdraw() math exactly. The on-chain
 * payout is min(this, fee_reserve), so display this as a "projection".
 */
export function projectedYield(
  principalMicro: number,
  lastDepositTs: number,
  apyBps: number = LP_APY_BPS,
): number {
  if (principalMicro <= 0 || lastDepositTs <= 0) return 0;
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - lastDepositTs);
  return Math.floor(
    (principalMicro * apyBps * elapsed) / (SECONDS_PER_YEAR * 10_000),
  );
}

// ---- Build + send transactions via MWA --------------------------------------

type TransactResult = { signature: string };

/**
 * Wrapper around MWA `transact` that builds a versioned tx from a list of
 * instructions and asks the user's wallet to sign + send. Throws in non-Android
 * envs; UI should catch and surface to the user.
 */
async function signAndSend(
  payer: PublicKey,
  ixs: Awaited<ReturnType<Program["methods"]["deposit"]>>[],
): Promise<TransactResult> {
  if (Platform.OS !== "android") {
    throw new Error(
      "On-chain transactions require Android with a wallet (MWA). Run the app on the Seeker phone.",
    );
  }

  const { transact } = await import(
    "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
  );

  const { blockhash } = await DEVNET.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: ixs as any,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  return transact(async (wallet) => {
    await wallet.authorize({
      chain: "solana:devnet",
      identity: { name: "PayMate", uri: "https://paymate.app" },
    });
    const sigs = await wallet.signAndSendTransactions({ transactions: [tx] });
    // MWA returns base58-encoded signatures already.
    return { signature: String(sigs[0]) };
  });
}

// Helper to build a Program tied to a specific user pubkey for instruction-only
// composition (we extract the bare ix and feed our own MWA signer).
function programFor(owner: PublicKey): Program {
  const wallet = {
    publicKey: owner,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(DEVNET, wallet as unknown as Wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

// ---- LP: deposit ------------------------------------------------------------

export async function depositUsdc(args: {
  ownerPubkey: string;
  amountMicro: number;
}): Promise<TransactResult> {
  const owner = new PublicKey(args.ownerPubkey);
  const program = programFor(owner);
  const lpAta = await getAssociatedTokenAddress(USDC_MINT, owner);
  const lpAccount = findLpAccountPda(owner);

  // Belt-and-suspenders: ensure LP's USDC ATA exists. Idempotent.
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    owner,
    lpAta,
    owner,
    USDC_MINT,
  );

  const depositIx = await (program.methods as any)
    .deposit(new BN(args.amountMicro))
    .accounts({
      pool: POOL_PDA,
      vault: VAULT_PDA,
      lpAccount,
      lpTokenAccount: lpAta,
      lp: owner,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: PublicKey.default,
    })
    .instruction();

  return signAndSend(owner, [ataIx, depositIx]);
}

// ---- LP: withdraw -----------------------------------------------------------

export async function withdrawUsdc(args: {
  ownerPubkey: string;
}): Promise<TransactResult> {
  const owner = new PublicKey(args.ownerPubkey);
  const program = programFor(owner);
  const lpAta = await getAssociatedTokenAddress(USDC_MINT, owner);
  const lpAccount = findLpAccountPda(owner);

  const ix = await (program.methods as any)
    .withdraw()
    .accounts({
      pool: POOL_PDA,
      vault: VAULT_PDA,
      lpAccount,
      lpTokenAccount: lpAta,
      lp: owner,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return signAndSend(owner, [ix]);
}

// ---- PSP: drawdown ----------------------------------------------------------

export async function requestDrawdown(args: {
  ownerPubkey: string;
  amountMicro: number;
}): Promise<TransactResult> {
  const owner = new PublicKey(args.ownerPubkey);
  const program = programFor(owner);
  const pspAta = await getAssociatedTokenAddress(USDC_MINT, owner);
  const pspAccount = findPspAccountPda(owner);

  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    owner,
    pspAta,
    owner,
    USDC_MINT,
  );

  const drawIx = await (program.methods as any)
    .requestDrawdown(new BN(args.amountMicro))
    .accounts({
      pool: POOL_PDA,
      vault: VAULT_PDA,
      pspAccount,
      pspTokenAccount: pspAta,
      psp: owner,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return signAndSend(owner, [ataIx, drawIx]);
}

// ---- PSP: repay -------------------------------------------------------------

export async function repayDrawdown(args: {
  ownerPubkey: string;
  amountMicro: number;
}): Promise<TransactResult> {
  const owner = new PublicKey(args.ownerPubkey);
  const program = programFor(owner);
  const pspAta = await getAssociatedTokenAddress(USDC_MINT, owner);
  const pspAccount = findPspAccountPda(owner);

  const ix = await (program.methods as any)
    .repay(new BN(args.amountMicro))
    .accounts({
      pool: POOL_PDA,
      vault: VAULT_PDA,
      pspAccount,
      pspTokenAccount: pspAta,
      psp: owner,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return signAndSend(owner, [ix]);
}
