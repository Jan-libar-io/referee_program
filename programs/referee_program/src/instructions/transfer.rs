use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        Mint, TokenAccount,
        TokenInterface,
        TransferChecked,
        transfer_checked
    }
};

use crate::errors::TransferError;
use crate::state::*;

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(mut)]
    game: Signer<'info>,
    #[account(mut)]
    player: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = player
    )]
    player_ata: InterfaceAccount<'info, TokenAccount>,
    mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"game_session", game.key().as_ref(), game_session.seed.to_le_bytes().as_ref()],
        bump,
    )]
    game_session: Account<'info, GameSession>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = game_session
    )]
    vault: InterfaceAccount <'info, TokenAccount>,
    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>
}

impl<'info> Transfer<'info> {
    fn transfer(&mut self, amount: u64) -> Result<()> {
        let signer_seeds:[&[&[u8]]; 1] = [&[
            b"game_session",
            self.game.to_account_info().key.as_ref(),
            &self.game_session.seed.to_le_bytes()[..],
            &[self.game_session.bump]
        ]];

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            to: self.player_ata.to_account_info(),
            authority: self.game_session.to_account_info(),
            mint: self.mint.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            &signer_seeds
        );

        transfer_checked(cpi_ctx, amount, self.mint.decimals)?;

        Ok(())
    }

    //TODO: block payouts based on game session state
    pub fn payout_winning(&mut self) -> Result<()> {
        let mut updated_teams = [[Player {
            player: Pubkey::default(),
            paid: false,
            refunded: false,
            recieved_rewards: false
        }; MAX_PLAYERS_PER_TEAM]; MAX_TEAMS_LENGTH];

        for i in 0..(self.game_session.amount_of_teams as usize) {
            for j in 0..(self.game_session.players_per_team as usize) {
                if self.game_session.teams[i][j].player == *self.player.to_account_info().key {
                    require!(
                        self.game_session.teams[i][j].paid &&
                        !self.game_session.teams[i][j].refunded &&
                        !self.game_session.teams[i][j].recieved_rewards,
                        TransferError::PlayerNotEligibleForPayout
                    );

                    let winnings = self.game_session.session_entry_cost_per_team
                        .checked_mul(self.game_session.amount_of_teams as u64)
                        .ok_or(ProgramError::ArithmeticOverflow)?
                        .checked_sub(self.game_session.termination_fee)
                        .ok_or(ProgramError::ArithmeticOverflow)?
                        .checked_div(self.game_session.players_per_team as u64)
                        .ok_or(ProgramError::ArithmeticOverflow)?;

                    self.transfer( winnings)?;

                    updated_teams[i][j] = Player {
                        player: self.game_session.teams[i][j].player,
                        paid: false,
                        refunded: false,
                        recieved_rewards: true
                    };
                } else {
                    updated_teams[i][j] = Player {
                            player: self.game_session.teams[i][j].player,
                            paid: self.game_session.teams[i][j].paid,
                            refunded: self.game_session.teams[i][j].refunded,
                            recieved_rewards: self.game_session.teams[i][j].recieved_rewards
                        };
                }
            }
        }

        self.game_session.teams = updated_teams;

        Ok(())
    }

    //TODO: block refunds based on game session state
    pub fn payout_refund(&mut self) -> Result<()> {
        let mut updated_teams = [[Player {
            player: Pubkey::default(),
            paid: false,
            refunded: false,
            recieved_rewards: false
        }; MAX_PLAYERS_PER_TEAM]; MAX_TEAMS_LENGTH];

        for i in 0..(self.game_session.amount_of_teams as usize) {
            for j in 0..(self.game_session.players_per_team as usize) {
                if self.game_session.teams[i][j].player == *self.player.to_account_info().key {
                    require!(
                        self.game_session.teams[i][j].paid &&
                        !self.game_session.teams[i][j].refunded &&
                        !self.game_session.teams[i][j].recieved_rewards,
                        TransferError::PlayerNotEligibleForRefund
                    );

                    self.transfer(self.game_session.session_entry_cost_per_player)?;

                    updated_teams[i][j] = Player {
                        player: self.game_session.teams[i][j].player,
                        paid: false,
                        refunded: true,
                        recieved_rewards: false
                    };
                } else {
                    updated_teams[i][j] = Player {
                            player: self.game_session.teams[i][j].player,
                            paid: self.game_session.teams[i][j].paid,
                            refunded: self.game_session.teams[i][j].refunded,
                            recieved_rewards: self.game_session.teams[i][j].recieved_rewards
                        };
                }
            }
        }

        self.game_session.teams = updated_teams;

        Ok(())
    }
}
