import * as anchor from "@coral-xyz/anchor";
import { createMint, getMint, Mint } from "@solana/spl-token";

import { logError } from "./log";
import { MINT_DECIMALS } from "./constants";

export const createMints = async (
  connection: anchor.web3.Connection,
  keypairs: Map<string, anchor.web3.Keypair>
): Promise<{
  mint_a_account: Mint;
  mint_b_account: Mint;
}> => {
  try {
    const mint_a_pubkey = await createMint(
      connection,
      keypairs.get("game_a"),
      keypairs.get("game_a").publicKey,
      null,
      MINT_DECIMALS,
      undefined,
      { commitment: "confirmed" }
    );

    console.log(`Mint A created: ${mint_a_pubkey.toBase58()}`);

    const mint_b_pubkey = await createMint(
      connection,
      keypairs.get("game_b"),
      keypairs.get("game_b").publicKey,
      null,
      MINT_DECIMALS,
      undefined,
      { commitment: "confirmed" }
    );

    console.log(`Mint B created: ${mint_b_pubkey.toBase58()}`);

    return {
      mint_a_account: await getMint(connection, mint_a_pubkey),
      mint_b_account: await getMint(connection, mint_b_pubkey),
    };
  } catch (error) {
    logError("mint accounts creation", error);
  }
};
