use anchor_lang::prelude::*;

#[derive(InitSpace, Clone, AnchorSerialize, AnchorDeserialize, Copy)]
pub struct Player {
    pub player: Pubkey,
    pub paid: bool,
    pub refunded: bool,
    pub recieved_rewards: bool,
}
