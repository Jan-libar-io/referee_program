use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        Mint, TokenAccount,
        TokenInterface
    }
};
use crate::state::*;
use crate::errors::ProgramConfigCode;

#[derive(Accounts)]
pub struct InitializeProgramConfig<'info> {
    #[account(
        mut,
        constraint = authority.key() == ADMIN_PUBKEY
    )]
    authority: Signer<'info>,
    #[account(mut)]
    game: SystemAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ProgramConfig::INIT_SPACE,
        seeds = [b"program_config", game.key().as_ref()],
        bump,
    )]
    program_config: Account<'info, ProgramConfig>,
    mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = game,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    protocol_ata: InterfaceAccount<'info, TokenAccount>,
    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>
}

impl<'info> InitializeProgramConfig<'info> {
    pub fn initialize_program_config(
        &mut self,
        fee_basis_points: u64,
        bumps: &InitializeProgramConfigBumps
    ) -> Result<()> {
        require!(fee_basis_points < 10000, ProgramConfigCode::FeeBasisPointsTooHigh);

        self.program_config.set_inner(ProgramConfig {
            admin: self.authority.key(),
            protocol_ata: self.protocol_ata.key(),
            fee_basis_points,
            bump: bumps.program_config
        });

        Ok(())
    }
}
