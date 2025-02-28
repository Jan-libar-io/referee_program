use anchor_lang::prelude::*;

use crate::state::*;

use crate::errors::ProgramConfigCode;

#[derive(Accounts)]
pub struct UpdateProgramConfig<'info> {
    #[account(
        mut,
        constraint = authority.key() == ADMIN_PUBKEY
    )]
    authority: Signer<'info>,
    game: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"program_config", game.key().as_ref()],
        bump,
    )]
    program_config: Account<'info, ProgramConfig>,
    system_program: Program<'info, System>
}

impl<'info> UpdateProgramConfig<'info> {
    pub fn update_program_config(
        &mut self,
        fee_basis_points: u64
    ) -> Result<()> {
        require!(fee_basis_points < 10000, ProgramConfigCode::FeeBasisPointsTooHigh);

        self.program_config.fee_basis_points = fee_basis_points;
        
        Ok(())
    }
}
