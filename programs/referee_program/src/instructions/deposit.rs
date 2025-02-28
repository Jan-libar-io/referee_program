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

use crate::{errors::DepositError, state::*};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    player: Signer<'info>,
    game: SystemAccount<'info>,
    mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = player
    )]
    player_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"game_session", game.key().as_ref(), game_session.seed.to_le_bytes().as_ref()],
        bump = game_session.bump,
    )]
    game_session: Account<'info, GameSession>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = game_session,
    )]
    vault: InterfaceAccount <'info, TokenAccount>,
    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
}

impl<'info> Deposit<'info> {
    pub fn deposit_entry_fee(&mut self) -> Result<()> {
        let mut updated_teams = [[Player {
            player: Pubkey::default(),
            paid: false,
            refunded: false,
            recieved_rewards: false
        }; MAX_PLAYERS_PER_TEAM]; MAX_TEAMS_LENGTH];

        for i in 0..(self.game_session.amount_of_teams as usize) {
            for j in 0..(self.game_session.players_per_team as usize) {
                if self.game_session.teams[i][j].player == *self.player.to_account_info().key {
                    require!(!self.game_session.teams[i][j].paid, DepositError::PlayerAlreadyPaid);
                    
                    let cpi_program = self.token_program.to_account_info();

                    let cpi_accounts = TransferChecked {
                        from: self.player_ata.to_account_info(),
                        to: self.vault.to_account_info(),
                        authority: self.player.to_account_info(),
                        mint: self.mint.to_account_info(),
                    };
            
                    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            
                    transfer_checked(cpi_ctx, self.game_session.session_entry_cost_per_player, self.mint.decimals)?;
                    updated_teams[i][j] = Player {
                            player: self.game_session.teams[i][j].player,
                            paid: true,
                            refunded: false,
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
