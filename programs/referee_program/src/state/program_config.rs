use anchor_lang::prelude::*;

pub const ADMIN_PUBKEY: Pubkey = pubkey!("janrWJ8kCUrwkQEfgaPtzK3ZLE5HnBzrCA6KaW5f6rH");

#[account]
#[derive(InitSpace)]
pub struct ProgramConfig {
    pub admin: Pubkey,
    pub protocol_ata: Pubkey,
    pub fee_basis_points: u64,
    pub bump: u8,
}
