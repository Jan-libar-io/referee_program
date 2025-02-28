import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  Mint,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { logError, logTransaction } from "./log";
import { MINT_DECIMALS } from "./constants";

export const sendTokens = async (
  connection: anchor.web3.Connection,
  accounts: {
    mint: Mint;
    authority: anchor.web3.Keypair;
    mint_signer: anchor.web3.Keypair;
  }[]
) => {
  for (const account of accounts) {
    try {
      const recipientAssociatedTokenAccount =
        await createAssociatedTokenAccount(
          connection,
          account.authority,
          account.mint.address,
          account.authority.publicKey,
          {
            commitment: "confirmed",
          },
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
          false
        );

      const transactionSignature = await mintTo(
        connection,
        account.authority,
        account.mint.address,
        recipientAssociatedTokenAccount,
        account.mint_signer,
        10000 * Math.pow(10, MINT_DECIMALS),
        undefined,
        {
          commitment: "confirmed",
        },
        TOKEN_PROGRAM_ID
      );

      const acc = await connection.getTokenAccountBalance(
        recipientAssociatedTokenAccount
      );

      console.log(
        "Funded " +
          acc.value.amount +
          " tokens to " +
          recipientAssociatedTokenAccount.toBase58()
      );
      logTransaction(connection, transactionSignature);
    } catch (error) {
      logError("send tokens", error);
    }
  }
};
