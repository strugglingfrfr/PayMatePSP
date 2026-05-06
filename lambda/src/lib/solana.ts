// Read-only Solana RPC client. Phase 2d adds tx-signing for set_credit_limit.

import { Connection, PublicKey } from "@solana/web3.js";
import type { PoolState } from "../types";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID ?? "5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg",
);

const connection = new Connection(RPC_URL, "confirmed");

const POOL_SEED = Buffer.from("pool");

function findPoolPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([POOL_SEED], PROGRAM_ID);
  return pda;
}

// Pool account layout (matches Anchor program/src/lib.rs):
//  8 (anchor discriminator)
//  + 32 admin
//  + 32 usdc_mint
//  + 32 vault
//  + 8  total_liquidity
//  + 8  available_liquidity
//  + 8  fee_reserve
//  + 8  drawdown_limit
//  + 2  default_psp_rate_bps
//  + 2  lp_apy_bps
//  + 1  bump
function decodePool(buf: Buffer): Omit<PoolState, "programId" | "poolPda"> {
  const readU64 = (offset: number): number =>
    Number(buf.readBigUInt64LE(offset));
  const readU16 = (offset: number): number => buf.readUInt16LE(offset);

  // Skip 8 + 32 + 32 + 32 = 104
  const o = 104;
  return {
    totalLiquidity: readU64(o),
    availableLiquidity: readU64(o + 8),
    feeReserve: readU64(o + 16),
    drawdownLimit: readU64(o + 24),
    defaultPspRateBps: readU16(o + 32),
    lpApyBps: readU16(o + 34),
  };
}

export async function fetchPoolState(): Promise<PoolState | null> {
  const poolPda = findPoolPda();
  const account = await connection.getAccountInfo(poolPda);
  if (!account) return null;
  const decoded = decodePool(account.data as Buffer);
  return {
    programId: PROGRAM_ID.toBase58(),
    poolPda: poolPda.toBase58(),
    ...decoded,
  };
}
