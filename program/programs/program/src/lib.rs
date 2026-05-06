// PayMate Pool — on-chain credit pool for Payment Service Providers.
//
// LPs deposit USDC and earn a fixed APY (5% target). PSPs are approved
// off-chain via an AI-driven KYB risk scoring agent (AWS Bedrock + Coinbase
// x402 on Base). The admin then writes the approved credit limit AND a
// PSP-specific borrowing rate on-chain — this is the "AI doesn't just gate
// access, it prices risk" moment.
//
// Spread between PSP rate and LP yield = protocol revenue, accumulates in
// `fee_reserve`. LP yield is paid out from `fee_reserve` and capped by it,
// so the contract can never overpay yield it has not collected.
//
// Single-file by design — Anchor 1.0's `#[program]` macro has known
// collisions with multi-file scaffolds at certain module names; flat layout
// avoids that and keeps the math/logic readable end-to-end.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg");

// ===== Constants =====

const BPS_DIVISOR: u128 = 10_000;
const SECONDS_PER_YEAR: u128 = 365 * 86_400;
const SECONDS_PER_DAY: u128 = 86_400;

const POOL_SEED: &[u8] = b"pool";
const VAULT_SEED: &[u8] = b"vault";
const LP_SEED: &[u8] = b"lp";
const PSP_SEED: &[u8] = b"psp";

// ===== Program =====

#[program]
pub mod paymate {
    use super::*;

    /// Admin one-shot. Sets pool params and creates the USDC vault.
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        drawdown_limit: u64,
        default_psp_rate_bps: u16,
        lp_apy_bps: u16,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.admin = ctx.accounts.admin.key();
        pool.usdc_mint = ctx.accounts.usdc_mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.total_liquidity = 0;
        pool.available_liquidity = 0;
        pool.fee_reserve = 0;
        pool.drawdown_limit = drawdown_limit;
        pool.default_psp_rate_bps = default_psp_rate_bps;
        pool.lp_apy_bps = lp_apy_bps;
        pool.bump = ctx.bumps.pool;
        emit!(PoolInitialized {
            admin: pool.admin,
            drawdown_limit,
            default_psp_rate_bps,
            lp_apy_bps,
        });
        Ok(())
    }

    /// Admin-only. Approves a PSP for credit at a personal rate derived from
    /// the AI KYR rating (e.g. AAA → 30 bps/day, B/C → 85 bps/day).
    /// Idempotent — can be called again to update credit limit / rate.
    pub fn set_credit_limit(
        ctx: Context<SetCreditLimit>,
        credit_limit: u64,
        personal_rate_bps: u16,
    ) -> Result<()> {
        require!(personal_rate_bps > 0, PoolError::ZeroRate);
        let psp = &mut ctx.accounts.psp_account;
        psp.owner = ctx.accounts.psp_owner.key();
        psp.credit_limit = credit_limit;
        psp.personal_rate_bps = personal_rate_bps;
        psp.bump = ctx.bumps.psp_account;
        emit!(CreditLimitSet {
            psp: psp.owner,
            credit_limit,
            personal_rate_bps,
        });
        Ok(())
    }

    /// LP deposits USDC into the pool. One open deposit per LP at a time:
    /// to add more, withdraw first then re-deposit.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, PoolError::ZeroAmount);
        require!(
            ctx.accounts.lp_account.deposited_amount == 0,
            PoolError::ExistingDeposit
        );

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.lp_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.lp.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;

        let now = Clock::get()?.unix_timestamp;
        let lp_account = &mut ctx.accounts.lp_account;
        lp_account.owner = ctx.accounts.lp.key();
        lp_account.deposited_amount = amount;
        lp_account.last_deposit_ts = now;
        lp_account.bump = ctx.bumps.lp_account;

        let pool = &mut ctx.accounts.pool;
        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(PoolError::MathOverflow)?;
        pool.available_liquidity = pool
            .available_liquidity
            .checked_add(amount)
            .ok_or(PoolError::MathOverflow)?;

        emit!(Deposited {
            lp: lp_account.owner,
            amount,
        });
        Ok(())
    }

    /// LP withdraws full principal + accrued yield, capped by what the pool
    /// has actually collected in fees. Yield is computed pro-rata to the
    /// second since last deposit.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let principal = ctx.accounts.lp_account.deposited_amount;
        require!(principal > 0, PoolError::NothingToWithdraw);

        let now = Clock::get()?.unix_timestamp;
        let elapsed = (now - ctx.accounts.lp_account.last_deposit_ts).max(0) as u128;

        // raw_yield = principal * apy_bps * elapsed / (SECONDS_PER_YEAR * BPS_DIVISOR)
        let raw_yield: u128 = (principal as u128)
            .checked_mul(ctx.accounts.pool.lp_apy_bps as u128)
            .ok_or(PoolError::MathOverflow)?
            .checked_mul(elapsed)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(SECONDS_PER_YEAR)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(BPS_DIVISOR)
            .ok_or(PoolError::MathOverflow)?;
        let yield_paid: u64 = raw_yield.min(ctx.accounts.pool.fee_reserve as u128) as u64;
        let total_payout = principal
            .checked_add(yield_paid)
            .ok_or(PoolError::MathOverflow)?;

        // Vault → LP, signed by the pool PDA.
        let pool_bump = ctx.accounts.pool.bump;
        let pool_seeds: &[&[u8]] = &[POOL_SEED, std::slice::from_ref(&pool_bump)];
        let signer_seeds = &[pool_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.lp_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, total_payout)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_liquidity = pool
            .total_liquidity
            .checked_sub(principal)
            .ok_or(PoolError::MathOverflow)?;
        pool.available_liquidity = pool
            .available_liquidity
            .checked_sub(principal)
            .ok_or(PoolError::MathOverflow)?;
        pool.fee_reserve = pool
            .fee_reserve
            .checked_sub(yield_paid)
            .ok_or(PoolError::MathOverflow)?;

        let lp_account = &mut ctx.accounts.lp_account;
        let lp_owner = lp_account.owner;
        lp_account.deposited_amount = 0;
        lp_account.last_deposit_ts = 0;

        emit!(Withdrawn {
            lp: lp_owner,
            principal,
            yield_paid,
        });
        Ok(())
    }

    /// PSP requests to draw `amount` USDC. Must be approved (credit_limit > 0),
    /// within their limit, within the global drawdown limit, and the pool must
    /// have available liquidity. One active position at a time.
    pub fn request_drawdown(ctx: Context<RequestDrawdown>, amount: u64) -> Result<()> {
        require!(amount > 0, PoolError::ZeroAmount);

        {
            let pool = &ctx.accounts.pool;
            let psp = &ctx.accounts.psp_account;
            require!(amount <= pool.drawdown_limit, PoolError::ExceedsDrawdownLimit);
            require!(psp.credit_limit > 0, PoolError::PspNotApproved);
            require!(amount <= psp.credit_limit, PoolError::ExceedsCreditLimit);
            require!(
                psp.active_position_amount == 0,
                PoolError::ActivePosition
            );
            require!(
                amount <= pool.available_liquidity,
                PoolError::InsufficientLiquidity
            );
        }

        let pool_bump = ctx.accounts.pool.bump;
        let pool_seeds: &[&[u8]] = &[POOL_SEED, std::slice::from_ref(&pool_bump)];
        let signer_seeds = &[pool_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.psp_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        let now = Clock::get()?.unix_timestamp;
        let psp_account = &mut ctx.accounts.psp_account;
        psp_account.active_position_amount = amount;
        psp_account.active_position_drawdown_ts = now;

        let pool = &mut ctx.accounts.pool;
        pool.available_liquidity = pool
            .available_liquidity
            .checked_sub(amount)
            .ok_or(PoolError::MathOverflow)?;

        emit!(DrawdownExecuted {
            psp: psp_account.owner,
            amount,
        });
        Ok(())
    }

    /// PSP repays. `amount` must cover principal + computed fee.
    /// Fee = position * personal_rate_bps * elapsed_secs / (SECONDS_PER_DAY * BPS_DIVISOR).
    /// Anything above principal goes to fee_reserve (overpayment is donated to LPs).
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require!(amount > 0, PoolError::ZeroAmount);

        let principal: u64;
        let owed: u128;
        {
            let psp = &ctx.accounts.psp_account;
            require!(psp.active_position_amount > 0, PoolError::NoActivePosition);
            principal = psp.active_position_amount;

            let now = Clock::get()?.unix_timestamp;
            let elapsed = (now - psp.active_position_drawdown_ts).max(1) as u128;

            let computed_fee: u128 = (principal as u128)
                .checked_mul(psp.personal_rate_bps as u128)
                .ok_or(PoolError::MathOverflow)?
                .checked_mul(elapsed)
                .ok_or(PoolError::MathOverflow)?
                .checked_div(SECONDS_PER_DAY)
                .ok_or(PoolError::MathOverflow)?
                .checked_div(BPS_DIVISOR)
                .ok_or(PoolError::MathOverflow)?;
            owed = (principal as u128)
                .checked_add(computed_fee)
                .ok_or(PoolError::MathOverflow)?;
        }

        require!((amount as u128) >= owed, PoolError::InsufficientRepayment);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.psp_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.psp.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;

        let actual_fee: u64 = amount
            .checked_sub(principal)
            .ok_or(PoolError::MathOverflow)?;

        let pool = &mut ctx.accounts.pool;
        pool.available_liquidity = pool
            .available_liquidity
            .checked_add(principal)
            .ok_or(PoolError::MathOverflow)?;
        pool.fee_reserve = pool
            .fee_reserve
            .checked_add(actual_fee)
            .ok_or(PoolError::MathOverflow)?;

        let psp_account = &mut ctx.accounts.psp_account;
        let psp_owner = psp_account.owner;
        psp_account.active_position_amount = 0;
        psp_account.active_position_drawdown_ts = 0;

        emit!(RepaymentProcessed {
            psp: psp_owner,
            principal,
            fee: actual_fee,
        });
        Ok(())
    }
}

// ===== Account contexts =====

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [POOL_SEED],
        bump,
        space = 8 + Pool::SIZE,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetCreditLimit<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump,
        has_one = admin @ PoolError::Unauthorized,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: PSP owner pubkey, used only to derive the PspAccount PDA.
    pub psp_owner: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        seeds = [PSP_SEED, psp_owner.key().as_ref()],
        bump,
        space = 8 + PspAccount::SIZE,
    )]
    pub psp_account: Account<'info, PspAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = vault.key() == pool.vault @ PoolError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = lp,
        seeds = [LP_SEED, lp.key().as_ref()],
        bump,
        space = 8 + LpAccount::SIZE,
    )]
    pub lp_account: Account<'info, LpAccount>,

    #[account(
        mut,
        constraint = lp_token_account.owner == lp.key() @ PoolError::Unauthorized,
        constraint = lp_token_account.mint == pool.usdc_mint @ PoolError::InvalidMint,
    )]
    pub lp_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = vault.key() == pool.vault @ PoolError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LP_SEED, lp.key().as_ref()],
        bump = lp_account.bump,
        constraint = lp_account.owner == lp.key() @ PoolError::Unauthorized,
    )]
    pub lp_account: Account<'info, LpAccount>,

    #[account(
        mut,
        constraint = lp_token_account.owner == lp.key() @ PoolError::Unauthorized,
        constraint = lp_token_account.mint == pool.usdc_mint @ PoolError::InvalidMint,
    )]
    pub lp_token_account: Account<'info, TokenAccount>,

    pub lp: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RequestDrawdown<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = vault.key() == pool.vault @ PoolError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PSP_SEED, psp.key().as_ref()],
        bump = psp_account.bump,
        constraint = psp_account.owner == psp.key() @ PoolError::Unauthorized,
    )]
    pub psp_account: Account<'info, PspAccount>,

    #[account(
        mut,
        constraint = psp_token_account.owner == psp.key() @ PoolError::Unauthorized,
        constraint = psp_token_account.mint == pool.usdc_mint @ PoolError::InvalidMint,
    )]
    pub psp_token_account: Account<'info, TokenAccount>,

    pub psp: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = vault.key() == pool.vault @ PoolError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PSP_SEED, psp.key().as_ref()],
        bump = psp_account.bump,
        constraint = psp_account.owner == psp.key() @ PoolError::Unauthorized,
    )]
    pub psp_account: Account<'info, PspAccount>,

    #[account(
        mut,
        constraint = psp_token_account.owner == psp.key() @ PoolError::Unauthorized,
        constraint = psp_token_account.mint == pool.usdc_mint @ PoolError::InvalidMint,
    )]
    pub psp_token_account: Account<'info, TokenAccount>,

    pub psp: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ===== State =====

#[account]
pub struct Pool {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    pub total_liquidity: u64,
    pub available_liquidity: u64,
    pub fee_reserve: u64,
    pub drawdown_limit: u64,
    pub default_psp_rate_bps: u16,
    pub lp_apy_bps: u16,
    pub bump: u8,
}

impl Pool {
    pub const SIZE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 2 + 2 + 1;
}

#[account]
pub struct LpAccount {
    pub owner: Pubkey,
    pub deposited_amount: u64,
    pub last_deposit_ts: i64,
    pub bump: u8,
}

impl LpAccount {
    pub const SIZE: usize = 32 + 8 + 8 + 1;
}

#[account]
pub struct PspAccount {
    pub owner: Pubkey,
    pub credit_limit: u64,
    pub personal_rate_bps: u16,
    pub active_position_amount: u64,
    pub active_position_drawdown_ts: i64,
    pub bump: u8,
}

impl PspAccount {
    pub const SIZE: usize = 32 + 8 + 2 + 8 + 8 + 1;
}

// ===== Events =====

#[event]
pub struct PoolInitialized {
    pub admin: Pubkey,
    pub drawdown_limit: u64,
    pub default_psp_rate_bps: u16,
    pub lp_apy_bps: u16,
}

#[event]
pub struct CreditLimitSet {
    pub psp: Pubkey,
    pub credit_limit: u64,
    pub personal_rate_bps: u16,
}

#[event]
pub struct Deposited {
    pub lp: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub lp: Pubkey,
    pub principal: u64,
    pub yield_paid: u64,
}

#[event]
pub struct DrawdownExecuted {
    pub psp: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RepaymentProcessed {
    pub psp: Pubkey,
    pub principal: u64,
    pub fee: u64,
}

// ===== Errors =====

#[error_code]
pub enum PoolError {
    #[msg("Only the admin can perform this action")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Personal rate must be greater than zero")]
    ZeroRate,
    #[msg("Amount exceeds the global drawdown limit")]
    ExceedsDrawdownLimit,
    #[msg("Amount exceeds your approved credit limit")]
    ExceedsCreditLimit,
    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,
    #[msg("PSP has an active drawdown; repay first")]
    ActivePosition,
    #[msg("PSP not approved for credit (credit_limit is zero)")]
    PspNotApproved,
    #[msg("No active position to repay")]
    NoActivePosition,
    #[msg("Repayment amount must cover principal + fee")]
    InsufficientRepayment,
    #[msg("LP has an existing deposit; withdraw first")]
    ExistingDeposit,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Invalid vault account for this pool")]
    InvalidVault,
    #[msg("Token account mint does not match pool USDC mint")]
    InvalidMint,
    #[msg("Math overflow")]
    MathOverflow,
}
