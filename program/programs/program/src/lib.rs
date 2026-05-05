use anchor_lang::prelude::*;

declare_id!("6Shf4n6CqC2Wyt21YK6Kfw5rtDn2GWKGURvRdysqV92h");

// Phase 0 sanity-check program. Replaced by the real Pool program in Phase 1.
#[program]
pub mod paymate {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        msg!("PayMate scaffold deployed.");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
