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
import { Platform } from "react-native";
import idl from "../idl/paymate.json";

// SPL Token program ID — hardcoded so we don't need @solana/spl-token at
// module init (it transitively loads spl-token-metadata which uses Buffer
// at init time and breaks web preview).
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

// Lazy ATA helpers — these only get called from within signAndSend paths,
// which throw on web. So the dynamic import never runs on web.
async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  const [pda] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return pda;
}

async function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
) {
  // Lazy import — only loads on Android when on-chain ops actually run.
  const spl = await import("@solana/spl-token");
  return spl.createAssociatedTokenAccountIdempotentInstruction(
    payer,
    ata,
    owner,
    mint,
  );
}

const RPC_URL = "https://api.devnet.solana.com";
export const DEVNET = new Connection(RPC_URL, "confirmed");

const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
// Use TextEncoder to avoid relying on Buffer at module init (web compatibility).
// PublicKey.findProgramAddressSync accepts Uint8Array seeds directly.
const _enc = new TextEncoder();
const POOL_SEED = _enc.encode("pool");
const VAULT_SEED = _enc.encode("vault");
const LP_SEED = _enc.encode("lp");
const PSP_SEED = _enc.encode("psp");

// Circle's official Solana devnet USDC mint. Same logo + UI as mainnet
// USDC in Phantom / Solflare / Coinbase Wallet. Faucet at faucet.circle.com.
// Mainnet swap: change to EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
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
 *
 * MWA `transact()` opens a fresh session every time. We pass the auth_token
 * stored at initial connect to `reauthorize()` so the wallet recognizes us
 * silently and only shows a sign prompt, not a connect prompt. If the token
 * is missing or expired, we fall back to fresh authorize.
 */
async function signAndSend(
  payer: PublicKey,
  ixs: any[],
): Promise<TransactResult> {
  if (Platform.OS !== "android") {
    throw new Error(
      "On-chain transactions require Android with a wallet (MWA). Run the app on the Seeker phone.",
    );
  }

  const { transact } = await import(
    "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
  );
  const { getAuthToken, DAPP_IDENTITY } = await import("./wallet");
  const cachedToken = getAuthToken();

  const { blockhash } = await DEVNET.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: ixs as any,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  return transact(async (wallet) => {
    let authedOk = false;
    if (cachedToken) {
      try {
        await wallet.reauthorize({
          auth_token: cachedToken,
          identity: DAPP_IDENTITY,
        });
        authedOk = true;
      } catch {
        // Token expired or wallet evicted it. Fall through to fresh authorize.
      }
    }
    if (!authedOk) {
      await wallet.authorize({
        chain: "solana:devnet",
        identity: DAPP_IDENTITY,
      });
    }
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
  const ataIx = await createAssociatedTokenAccountIdempotentInstruction(
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

  const ataIx = await createAssociatedTokenAccountIdempotentInstruction(
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
