use anchor_lang::prelude::*;

use crate::instructions::*;

pub mod errors;
pub mod state;
pub mod instructions;

declare_id!("6f4JGkiVCkyLm7gReznbihsRaFv1bTwSaiftGLB4UFVm");

#[program]
pub mod referee_program {
    use super::*;

    pub fn initialize_session(
        ctx: Context<InitializeGameSession>,
        seed: u64,
        session_entry_cost_per_team: u64,
        teams: Vec<Vec<Pubkey>>
    ) -> Result<()> {
        ctx.accounts.initialize_game_session(seed, session_entry_cost_per_team, teams, &ctx.bumps)?;
        ctx.accounts.deposit_termination_fee()?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        ctx.accounts.deposit_entry_fee()
    }

    pub fn refund(ctx: Context<Transfer>) -> Result<()> {
        ctx.accounts.payout_refund()
    }

    pub fn payout(ctx: Context<Transfer>) -> Result<()> {
        ctx.accounts.payout_winning()
    }

    pub fn close(ctx: Context<Close>) -> Result<()> {
        ctx.accounts.close_game_session()
    }

    pub fn initialize_program_config(ctx: Context<InitializeProgramConfig>, fee_basis_points: u64) -> Result<()> {
        ctx.accounts.initialize_program_config(fee_basis_points, &ctx.bumps)
    }

    pub fn update_program_config(ctx: Context<UpdateProgramConfig>, fee_basis_points: u64) -> Result<()> {
        ctx.accounts.update_program_config(fee_basis_points)
    }
}
