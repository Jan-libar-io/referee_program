use anchor_lang::prelude::*;

use super::Player;

pub const MAX_TEAMS_LENGTH: usize = 2;
pub const MAX_PLAYERS_PER_TEAM: usize = 5;

#[account]
#[derive(InitSpace)]
pub struct GameSession {
    pub seed: u64,
    pub game: Pubkey,
    pub mint: Pubkey,
    pub session_entry_cost_per_team: u64,
    pub session_entry_cost_per_player: u64,
    pub amount_of_teams: u8,
    pub players_per_team: u8,
    pub teams: [[Player; MAX_PLAYERS_PER_TEAM]; MAX_TEAMS_LENGTH],
    pub termination_fee: u64,
    pub termination_fee_paid: bool,
    pub bump: u8,
    //TODO: add field for game_status = INITIATED, STARTED, ENDED, CLOSED
}
