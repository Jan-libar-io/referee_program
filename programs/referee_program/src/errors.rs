use anchor_lang::prelude::*;

#[error_code]
pub enum GameSessionInitializeError {
    #[msg("Cannot initialize, too many teams")]
    TeamsToMany,
    #[msg("Cannot initialize, teams are not the same length")]
    TeamsNotSameLength,
    #[msg("Cannot initialize, team has to many players")]
    TeamToBig,
    #[msg("Cannot initialize, team has no players")]
    TeamNoPlayers,
    #[msg("Cannot initialize, players not unique")]
    PlayersNotUnique,
    #[msg("Termination fee transfer failed")]
    TerminationFeeDepositFailed
}

#[error_code]
pub enum DepositError {
    #[msg("Player already paid")]
    PlayerAlreadyPaid,
}

#[error_code]
pub enum GameSessionCloseError {
    #[msg("Cannot close, players not paid out")]
    PlayersNotPaidOut,
}

#[error_code]
pub enum TransferError {
    #[msg("Player not eligible for refund")]
    PlayerNotEligibleForRefund,
    #[msg("Player not eligible for payout")]
    PlayerNotEligibleForPayout,
}

#[error_code]
pub enum ProgramConfigCode {
    #[msg("Fee basis points too high")]
    FeeBasisPointsTooHigh,
}
