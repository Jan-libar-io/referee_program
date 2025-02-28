import * as anchor from "@coral-xyz/anchor";

export const logTransaction = (
  connection: anchor.web3.Connection,
  signature: string
): string => {
  console.log(
    "Your transaction signature: " +
      `https://explorer.solana.com/transaction/${signature}` +
      `?cluster=custom&customUrl=${connection.rpcEndpoint}`
  );

  return signature;
};

export const logError = (caller: string, error: Error): void => {
  console.error(`${caller} error:\n` + error.message + "\n");
};
