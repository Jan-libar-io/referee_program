import { Account } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export const getConfigData = (program, game_a, PROGRAM_CONFIG_SEED) => {
  const game_a_program_config = PublicKey.findProgramAddressSync(
    [Buffer.from(PROGRAM_CONFIG_SEED), game_a.publicKey.toBuffer()],
    program.programId
  )[0];

  return program.account.programConfig.fetch(game_a_program_config);
};

export const getGameSessionData = (
  program,
  game_a,
  GAME_SESSION_SEED,
  SEED
) => {
  const game_a_game_session_1 = PublicKey.findProgramAddressSync(
    [
      Buffer.from(GAME_SESSION_SEED),
      game_a.publicKey.toBuffer(),
      SEED.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  )[0];

  return program.account.gameSession.fetch(game_a_game_session_1);
};
