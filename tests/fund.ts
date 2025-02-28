import * as anchor from "@coral-xyz/anchor";
import { logError } from "./log";
import { createMints } from "./create_mints";
import { sendTokens } from "./send_tokens";
import { sendSol } from "./send_sol";

export const fund =
  (
    connection: anchor.web3.Connection,
    provider: anchor.Provider,
    keypairs: Map<string, anchor.web3.Keypair>
  ) =>
  async () => {
    console.log("\x1b[43m        SETUP        ");
    await sendSol(provider, Array.from(keypairs.values()));

    const { mint_a_account, mint_b_account } = await createMints(
      connection,
      keypairs
    );

    try {
      console.log("\nfund admin\n");
      await sendTokens(connection, [
        {
          mint: mint_a_account,
          authority: keypairs.get("admin"),
          mint_signer: keypairs.get("game_a"),
        },
        {
          mint: mint_b_account,
          authority: keypairs.get("admin"),
          mint_signer: keypairs.get("game_b"),
        },
      ]);
    } catch (error) {
      logError("games funding", error);
    }

    try {
      console.log("\nfund games\n");
      await sendTokens(connection, [
        {
          mint: mint_a_account,
          authority: keypairs.get("game_a"),
          mint_signer: keypairs.get("game_a"),
        },
        {
          mint: mint_b_account,
          authority: keypairs.get("game_b"),
          mint_signer: keypairs.get("game_b"),
        },
      ]);
    } catch (error) {
      logError("games funding", error);
    }

    try {
      console.log("\nfund players a, b\n");
      await sendTokens(connection, [
        {
          mint: mint_a_account,
          authority: keypairs.get("player_a"),
          mint_signer: keypairs.get("game_a"),
        },
        {
          mint: mint_b_account,
          authority: keypairs.get("player_a"),
          mint_signer: keypairs.get("game_b"),
        },
        {
          mint: mint_a_account,
          authority: keypairs.get("player_b"),
          mint_signer: keypairs.get("game_a"),
        },
        {
          mint: mint_b_account,
          authority: keypairs.get("player_b"),
          mint_signer: keypairs.get("game_b"),
        },
      ]);
    } catch (error) {
      logError("players a, b funding", error);
    }

    try {
      console.log("\nfund players c, d\n");
      await sendTokens(connection, [
        {
          mint: mint_a_account,
          authority: keypairs.get("player_c"),
          mint_signer: keypairs.get("game_a"),
        },
        {
          mint: mint_b_account,
          authority: keypairs.get("player_c"),
          mint_signer: keypairs.get("game_b"),
        },
        {
          mint: mint_a_account,
          authority: keypairs.get("player_d"),
          mint_signer: keypairs.get("game_a"),
        },
        {
          mint: mint_b_account,
          authority: keypairs.get("player_d"),
          mint_signer: keypairs.get("game_b"),
        },
      ]);

      return { mint_a_account, mint_b_account };
    } catch (error) {
      logError("players c, d funding", error);
    }
    console.log("\x1b[0m");
  };
