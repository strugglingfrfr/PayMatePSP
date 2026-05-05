// Anchor TypeScript tests for the PayMate Pool program.
//
// Run with `anchor test` from program/. Spins up a local validator,
// deploys the program, and walks through the full LP/PSP lifecycle plus
// the negative paths (auth, limits, double-init, etc.).

import * as anchor from "@anchor-lang/core";
import { Program, BN, AnchorError } from "@anchor-lang/core";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { Paymate } from "../target/types/paymate";

const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const LP_SEED = Buffer.from("lp");
const PSP_SEED = Buffer.from("psp");

describe("paymate", () => {
  // Boilerplate: pick provider from env (anchor test sets it).
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Paymate as Program<Paymate>;
  const connection = provider.connection;

  // Actors: admin pays for inits and signs admin-only ops.
  // The provider wallet IS the admin. lp and psp are fresh keypairs.
  const admin = (provider.wallet as anchor.Wallet).payer;
  const lp = Keypair.generate();
  const psp = Keypair.generate();
  const stranger = Keypair.generate(); // for unauthorized-call tests

  let usdcMint: PublicKey;
  let lpAta: PublicKey;
  let pspAta: PublicKey;

  // Pool params
  const DRAWDOWN_LIMIT = new BN(100_000_000); // 100 USDC (6 decimals)
  const DEFAULT_PSP_RATE_BPS = 60; // 0.6% / day
  const LP_APY_BPS = 500; // 5%

  // Demo amounts
  const LP_DEPOSIT = new BN(100_000_000); // 100 USDC
  const PSP_LIMIT = new BN(50_000_000); // 50 USDC
  const PSP_RATE_BPS = 60; // 0.6% / day (A-rated PSP)
  const DRAW_AMOUNT = new BN(40_000_000); // 40 USDC

  const [poolPda] = PublicKey.findProgramAddressSync(
    [POOL_SEED],
    program.programId,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED],
    program.programId,
  );
  const [lpAccountPda] = PublicKey.findProgramAddressSync(
    [LP_SEED, lp.publicKey.toBuffer()],
    program.programId,
  );
  const [pspAccountPda] = PublicKey.findProgramAddressSync(
    [PSP_SEED, psp.publicKey.toBuffer()],
    program.programId,
  );

  before(async () => {
    // Fund LP and PSP wallets so they can sign txs and pay rent for ATAs.
    for (const kp of [lp, psp, stranger]) {
      const sig = await connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig);
    }

    // Mock USDC: standard SPL mint, 6 decimals, admin is authority.
    usdcMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      6,
    );

    // Pre-mint USDC to LP (for deposit) and PSP (for repayment fee headroom).
    const lpAtaAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      usdcMint,
      lp.publicKey,
    );
    lpAta = lpAtaAccount.address;
    await mintTo(connection, admin, usdcMint, lpAta, admin, 200_000_000); // 200 USDC

    const pspAtaAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      usdcMint,
      psp.publicKey,
    );
    pspAta = pspAtaAccount.address;
    await mintTo(connection, admin, usdcMint, pspAta, admin, 50_000_000); // 50 USDC fee buffer
  });

  it("initializes the pool", async () => {
    await program.methods
      .initializePool(DRAWDOWN_LIMIT, DEFAULT_PSP_RATE_BPS, LP_APY_BPS)
      .accounts({
        pool: poolPda,
        vault: vaultPda,
        usdcMint,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const pool = await program.account.pool.fetch(poolPda);
    expect(pool.admin.toBase58()).to.eq(admin.publicKey.toBase58());
    expect(pool.usdcMint.toBase58()).to.eq(usdcMint.toBase58());
    expect(pool.totalLiquidity.toNumber()).to.eq(0);
    expect(pool.lpApyBps).to.eq(LP_APY_BPS);
  });

  it("rejects double initialization", async () => {
    try {
      await program.methods
        .initializePool(DRAWDOWN_LIMIT, DEFAULT_PSP_RATE_BPS, LP_APY_BPS)
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          usdcMint,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      throw new Error("Should have failed");
    } catch (err) {
      // Pool PDA already exists, system program rejects re-init
      expect(String(err)).to.match(/already in use|custom program error/i);
    }
  });

  it("admin sets PSP credit limit and rate", async () => {
    await program.methods
      .setCreditLimit(PSP_LIMIT, PSP_RATE_BPS)
      .accounts({
        pool: poolPda,
        pspOwner: psp.publicKey,
        pspAccount: pspAccountPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const pspAccount = await program.account.pspAccount.fetch(pspAccountPda);
    expect(pspAccount.creditLimit.toString()).to.eq(PSP_LIMIT.toString());
    expect(pspAccount.personalRateBps).to.eq(PSP_RATE_BPS);
  });

  it("rejects credit limit set by non-admin", async () => {
    try {
      await program.methods
        .setCreditLimit(new BN(99_000_000), 30)
        .accounts({
          pool: poolPda,
          pspOwner: psp.publicKey,
          pspAccount: pspAccountPda,
          admin: stranger.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      throw new Error("Should have failed");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect((err as AnchorError).error.errorCode.code).to.eq("Unauthorized");
    }
  });

  it("LP deposits USDC", async () => {
    await program.methods
      .deposit(LP_DEPOSIT)
      .accounts({
        pool: poolPda,
        vault: vaultPda,
        lpAccount: lpAccountPda,
        lpTokenAccount: lpAta,
        lp: lp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lp])
      .rpc();

    const lpAccount = await program.account.lpAccount.fetch(lpAccountPda);
    expect(lpAccount.depositedAmount.toString()).to.eq(LP_DEPOSIT.toString());

    const pool = await program.account.pool.fetch(poolPda);
    expect(pool.totalLiquidity.toString()).to.eq(LP_DEPOSIT.toString());
    expect(pool.availableLiquidity.toString()).to.eq(LP_DEPOSIT.toString());

    const vault = await getAccount(connection, vaultPda);
    expect(vault.amount.toString()).to.eq(LP_DEPOSIT.toString());
  });

  it("rejects double deposit by same LP", async () => {
    try {
      await program.methods
        .deposit(new BN(10_000_000))
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          lpAccount: lpAccountPda,
          lpTokenAccount: lpAta,
          lp: lp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lp])
        .rpc();
      throw new Error("Should have failed");
    } catch (err) {
      expect((err as AnchorError).error.errorCode.code).to.eq(
        "ExistingDeposit",
      );
    }
  });

  it("rejects PSP drawdown above credit limit", async () => {
    try {
      await program.methods
        .requestDrawdown(new BN(60_000_000)) // 60 > 50 limit
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          pspAccount: pspAccountPda,
          pspTokenAccount: pspAta,
          psp: psp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([psp])
        .rpc();
      throw new Error("Should have failed");
    } catch (err) {
      expect((err as AnchorError).error.errorCode.code).to.eq(
        "ExceedsCreditLimit",
      );
    }
  });

  it("PSP draws within limit", async () => {
    await program.methods
      .requestDrawdown(DRAW_AMOUNT)
      .accounts({
        pool: poolPda,
        vault: vaultPda,
        pspAccount: pspAccountPda,
        pspTokenAccount: pspAta,
        psp: psp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([psp])
      .rpc();

    const pspAccount = await program.account.pspAccount.fetch(pspAccountPda);
    expect(pspAccount.activePositionAmount.toString()).to.eq(
      DRAW_AMOUNT.toString(),
    );

    const pool = await program.account.pool.fetch(poolPda);
    const expectedAvailable = LP_DEPOSIT.sub(DRAW_AMOUNT);
    expect(pool.availableLiquidity.toString()).to.eq(
      expectedAvailable.toString(),
    );

    const pspBalance = await getAccount(connection, pspAta);
    // PSP started with 50 USDC, now has 50 + 40 = 90 USDC (got drawdown)
    expect(pspBalance.amount.toString()).to.eq("90000000");
  });

  it("rejects second drawdown while position is active", async () => {
    try {
      await program.methods
        .requestDrawdown(new BN(5_000_000))
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          pspAccount: pspAccountPda,
          pspTokenAccount: pspAta,
          psp: psp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([psp])
        .rpc();
      throw new Error("Should have failed");
    } catch (err) {
      expect((err as AnchorError).error.errorCode.code).to.eq(
        "ActivePosition",
      );
    }
  });

  it("rejects repayment that doesn't cover principal+fee", async () => {
    try {
      await program.methods
        .repay(new BN(40_000_000)) // exact principal, fee not covered (1+ sec elapsed)
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          pspAccount: pspAccountPda,
          pspTokenAccount: pspAta,
          psp: psp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([psp])
        .rpc();
      throw new Error("Should have failed");
    } catch (err) {
      expect((err as AnchorError).error.errorCode.code).to.eq(
        "InsufficientRepayment",
      );
    }
  });

  it("PSP repays principal + sufficient fee", async () => {
    // Pay principal + 1 USDC fee buffer (way more than computed fee for ~seconds)
    const repayAmount = DRAW_AMOUNT.add(new BN(1_000_000));
    await program.methods
      .repay(repayAmount)
      .accounts({
        pool: poolPda,
        vault: vaultPda,
        pspAccount: pspAccountPda,
        pspTokenAccount: pspAta,
        psp: psp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([psp])
      .rpc();

    const pspAccount = await program.account.pspAccount.fetch(pspAccountPda);
    expect(pspAccount.activePositionAmount.toNumber()).to.eq(0);

    const pool = await program.account.pool.fetch(poolPda);
    expect(pool.availableLiquidity.toString()).to.eq(LP_DEPOSIT.toString()); // principal back
    expect(pool.feeReserve.toString()).to.eq("1000000"); // 1 USDC fee
  });

  it("LP withdraws principal + yield (capped by fee_reserve)", async () => {
    const lpBefore = await getAccount(connection, lpAta);

    await program.methods
      .withdraw()
      .accounts({
        pool: poolPda,
        vault: vaultPda,
        lpAccount: lpAccountPda,
        lpTokenAccount: lpAta,
        lp: lp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lp])
      .rpc();

    const lpAfter = await getAccount(connection, lpAta);
    const received = Number(lpAfter.amount - lpBefore.amount);

    // LP gets principal (100 USDC) + some yield (very small over a few seconds)
    expect(received).to.be.gte(100_000_000);
    expect(received).to.be.lte(101_000_000); // capped by 1 USDC fee_reserve

    const pool = await program.account.pool.fetch(poolPda);
    expect(pool.totalLiquidity.toNumber()).to.eq(0);
    expect(pool.availableLiquidity.toNumber()).to.eq(0);

    const lpAccount = await program.account.lpAccount.fetch(lpAccountPda);
    expect(lpAccount.depositedAmount.toNumber()).to.eq(0);
  });
});
