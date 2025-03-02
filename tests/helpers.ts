import { PublicKey } from "@solana/web3.js";

export const getConfigData = (program, game, PROGRAM_CONFIG_SEED) => {
  const program_config = PublicKey.findProgramAddressSync(
    [Buffer.from(PROGRAM_CONFIG_SEED), game.publicKey.toBuffer()],
    program.programId
  )[0];

  return program.account.programConfig.fetch(program_config);
};

export const getGameSessionData = (program, game, GAME_SESSION_SEED, SEED) => {
  const game_session = PublicKey.findProgramAddressSync(
    [
      Buffer.from(GAME_SESSION_SEED),
      game.publicKey.toBuffer(),
      SEED.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  )[0];

  return program.account.gameSession.fetch(game_session);
};
