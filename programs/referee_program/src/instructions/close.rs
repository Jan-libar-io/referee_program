use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        Mint, TokenAccount,
        TokenInterface,
        TransferChecked,
        transfer_checked,
        CloseAccount,
        close_account
    }
};

use crate::errors::GameSessionCloseError;
use crate::state::*;

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    game: Signer<'info>,
    mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        close = game,
        has_one = mint,
        seeds = [b"game_session", game.key().as_ref(), game_session.seed.to_le_bytes().as_ref()],
        bump = game_session.bump
    )]
    game_session: Account<'info, GameSession>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = game_session,
    )]
    vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"program_config", game.key().as_ref()],
        bump = program_config.bump,
        has_one = protocol_ata
    )]
    program_config: Account<'info, ProgramConfig>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = program_config.admin
    )]
    protocol_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = game,
    )]
    game_ata: InterfaceAccount<'info, TokenAccount>,
    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>
}

impl<'info> Close<'info> {
    fn close_vault(&mut self) -> Result<()> {
        let signer_seeds:[&[&[u8]]; 1] = [&[
            b"game_session",
            self.game.to_account_info().key.as_ref(),
            &self.game_session.seed.to_le_bytes()[..],
            &[self.game_session.bump]
        ]];

        let close_accounts = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.game.to_account_info(),
            authority: self.game_session.to_account_info(),
        };

        let cpi_close_program = self.token_program.to_account_info();

        let cpi_close_tx = CpiContext::new_with_signer(cpi_close_program, close_accounts, &signer_seeds);

        close_account(cpi_close_tx)?;
        Ok(())
    }

    fn payout_protocol(&mut self) -> Result<()> {
        let signer_seeds:[&[&[u8]]; 1] = [&[
            b"game_session",
            self.game.to_account_info().key.as_ref(),
            &self.game_session.seed.to_le_bytes()[..],
            &[self.game_session.bump]
        ]];

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            to: self.protocol_ata.to_account_info(),
            authority: self.game_session.to_account_info(),
            mint: self.mint.to_account_info()
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds);

        transfer_checked(cpi_ctx, self.game_session.termination_fee, self.mint.decimals)?;

        Ok(())
    }

    fn payout_game(&mut self) -> Result<()> {
        let signer_seeds:[&[&[u8]]; 1] = [&[
            b"game_session",
            self.game.to_account_info().key.as_ref(),
            &self.game_session.seed.to_le_bytes()[..],
            &[self.game_session.bump]
        ]];

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            to: self.game_ata.to_account_info(),
            authority: self.game_session.to_account_info(),
            mint: self.mint.to_account_info()
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds);

        transfer_checked(cpi_ctx, self.game_session.termination_fee, self.mint.decimals)?;

        Ok(())
    }

    fn transfer_termination_fee(&mut self) -> Result<()> {
        if self.vault.amount == self.game_session.termination_fee * 2 {
            self.payout_protocol()?;
            self.payout_game()?;
        } else {
            self.payout_protocol()?;
        }

        Ok(())
    }

    pub fn close_game_session(&mut self) -> Result<()> {
        let mut all_refunded = true;
        for i in 0..(self.game_session.amount_of_teams as usize) {
            for j in 0..(self.game_session.players_per_team as usize) {
                if !self.game_session.teams[i][j].refunded {
                    all_refunded = false;
                    break;
                }
            }
        }

        let mut one_team_paid = false;
        for i in 0..(self.game_session.amount_of_teams as usize) {
            let mut all_paid = true;
            for j in 0..(self.game_session.players_per_team as usize) {
                if !self.game_session.teams[i][j].recieved_rewards {
                    all_paid = false;
                    break;
                }
            }
            if all_paid {
                one_team_paid = true;
                break;
            }
        }

        require!(all_refunded || one_team_paid, GameSessionCloseError::PlayersNotPaidOut);

        self.transfer_termination_fee()?;
        
        self.close_vault()?;

        Ok(())
    }
}
