use std::collections::HashSet;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked
    }
};

use crate::errors::GameSessionInitializeError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct InitializeGameSession<'info> {
    #[account(mut)]
    game: Signer<'info>,
    mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = game
    )]
    game_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = game,
        space = 8 + GameSession::INIT_SPACE,
        //TODO: implement seed derived from the players
        seeds = [b"game_session", game.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump,
    )]
    game_session: Account<'info, GameSession>,
    #[account(
        init,
        payer = game,
        associated_token::mint = mint,
        associated_token::authority = game_session
    )]
    vault: InterfaceAccount <'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"program_config", game.key().as_ref()],
        bump = program_config.bump,
    )]
    program_config: Account<'info, ProgramConfig>,
    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>
}

impl<'info> InitializeGameSession<'info> {
    pub fn initialize_game_session(
        &mut self,
        seed: u64,
        session_entry_cost_per_team: u64,
        teams: Vec<Vec<Pubkey>>,
        bumps: &InitializeGameSessionBumps
    ) -> Result<()> {
        require!(
            teams.len() <= MAX_TEAMS_LENGTH,
            GameSessionInitializeError::TeamsToMany
        );
        require!(
            teams.iter().all(|team| team.len() <= MAX_PLAYERS_PER_TEAM),
            GameSessionInitializeError::TeamToBig
        );
        require!(
            teams.iter().all(|team| team.len() == teams[0].len()),
            GameSessionInitializeError::TeamsNotSameLength
        );
        require!(
            teams.iter().all(|team| team.len() != 0),
            GameSessionInitializeError::TeamNoPlayers
        );

        let set: HashSet<Pubkey> = teams.iter().flatten().cloned().collect();

        require!(
            set.len() == teams.iter().flatten().count(),
            GameSessionInitializeError::PlayersNotUnique
        );

        let mut teams_array: [[Player; MAX_PLAYERS_PER_TEAM]; MAX_TEAMS_LENGTH] = [[
            Player {
                player: Pubkey::default(),
                paid: false,
                refunded: false,
                recieved_rewards: false
            }
        ; MAX_PLAYERS_PER_TEAM]; MAX_TEAMS_LENGTH];

        for (i, team) in teams.iter().enumerate() {
            for (j, player) in team.iter().enumerate() {
                teams_array[i][j].player = *player;
            }
        }

        let termination_fee = session_entry_cost_per_team
            .checked_mul(10_u64.pow(self.mint.decimals as u32 - 4)) // - 4 for basis points adjustement
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_mul(teams.len() as u64)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_mul(self.program_config.fee_basis_points)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        let session_entry_cost_per_player = session_entry_cost_per_team
            .checked_mul(10_u64.pow(self.mint.decimals as u32))
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_div(teams[0].len() as u64)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        let entry_cost_per_team = session_entry_cost_per_team
            .checked_mul(10_u64.pow(self.mint.decimals as u32))
            .ok_or(ProgramError::ArithmeticOverflow)?;

        self.game_session.set_inner(GameSession {
            seed,
            game: self.game.key(),
            mint: self.mint.key(),
            session_entry_cost_per_team: entry_cost_per_team,
            session_entry_cost_per_player,
            amount_of_teams: teams.len() as u8,
            players_per_team: teams[0].len() as u8,
            teams: teams_array,
            termination_fee,
            termination_fee_paid: false,
            bump: bumps.game_session,
        });

        Ok(())
    }

    pub fn deposit_termination_fee(&mut self) -> Result<()> {
        let signer_seeds:[&[&[u8]]; 1] = [&[
            b"game_session",
            self.game.to_account_info().key.as_ref(),
            &self.game_session.seed.to_le_bytes()[..],
            &[self.game_session.bump]
        ]];

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked {
            from: self.game_ata.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.game.to_account_info(),
            mint: self.mint.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds);

        transfer_checked(cpi_ctx, self.game_session.termination_fee, self.mint.decimals)?;

        self.game_session.termination_fee_paid = true;

        Ok(())
    }
}
