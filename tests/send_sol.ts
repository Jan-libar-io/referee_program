import * as anchor from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const sendSol = async (
  provider: anchor.Provider,
  keypairs: anchor.web3.Keypair[]
) => {
  for (const keypair of keypairs) {
    let token_airdrop = await provider.connection.requestAirdrop(
      keypair.publicKey,
      10000 * LAMPORTS_PER_SOL
    );

    const latestBlockHash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: token_airdrop,
    });

    console.log(`Airdropped 10'000 SOL to ${keypair.publicKey.toBase58()}`);
  }
};
