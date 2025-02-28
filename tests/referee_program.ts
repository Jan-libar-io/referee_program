const fs = require("fs");
const path = require("path");

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import {
  getAssociatedTokenAddressSync,
  getMint,
  Mint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";
import { randomBytes } from "crypto";

import { RefereeProgram } from "../target/types/referee_program";

import { fund } from "./fund";
import { getConfigData, getGameSessionData } from "./helpers";

describe("referee_program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.RefereeProgram as Program<RefereeProgram>;

  const connection = provider.connection;

  const adminKeypairPath = path.resolve(
    __dirname,
    "..",
    "janrWJ8kCUrwkQEfgaPtzK3ZLE5HnBzrCA6KaW5f6rH.json"
  );
  const adminKeypairData = JSON.parse(
    fs.readFileSync(adminKeypairPath, "utf8")
  );
  const admin = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(adminKeypairData)
  );

  const [
    game_a,
    game_b,
    mint_a,
    mint_b,
    player_a,
    player_b,
    player_c,
    player_d,
  ] = Array.from({ length: 8 }, () => anchor.web3.Keypair.generate());

  let created_mint_a_account: Mint;
  let created_mint_b_account: Mint;

  const PROGRAM_CONFIG_SEED = "program_config";
  const GAME_SESSION_SEED = "game_session";

  const SEED = new BN(12345678);

  const game_a_game_session_1_address = PublicKey.findProgramAddressSync(
    [
      Buffer.from(GAME_SESSION_SEED),
      game_a.publicKey.toBuffer(),
      SEED.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  )[0];

  before(async () => {
    const { mint_a_account, mint_b_account } = await fund(
      connection,
      provider,
      new Map([
        ["admin", admin],
        ["game_a", game_a],
        ["game_b", game_b],
        ["mint_a", mint_a],
        ["mint_b", mint_b],
        ["player_a", player_a],
        ["player_b", player_b],
        ["player_c", player_c],
        ["player_d", player_d],
      ])
    )();

    created_mint_a_account = mint_a_account;
    created_mint_b_account = mint_b_account;
  });

  describe("initialize_program_config", () => {
    it("should throw error if fee basis points are higher than 10000", async () => {
      const mint_a_account = await getMint(
        connection,
        created_mint_a_account.address
      );

      try {
        await program.methods
          .initializeProgramConfig(new BN(10001))
          .accounts({
            authority: admin.publicKey,
            game: game_a.publicKey,
            mint: mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Fee basis points too high");
      }
    });
    it("should initialize a program configuration for a game", async () => {
      const mint_a_account = await getMint(
        connection,
        created_mint_a_account.address
      );

      const FEE = new BN(100);

      expect(
        await program.methods
          .initializeProgramConfig(FEE)
          .accounts({
            authority: admin.publicKey,
            game: game_a.publicKey,
            mint: mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc()
      ).to.not.throw;

      const config_data = await getConfigData(
        program,
        game_a,
        PROGRAM_CONFIG_SEED
      );

      assert.strictEqual(
        admin.publicKey.toBase58(),
        config_data.admin.toBase58()
      );
      assert.strictEqual(FEE.toString(), config_data.feeBasisPoints.toString());
    });
    it("should throw error if program configuration for a game already exists", async () => {
      const mint_a_account = await getMint(
        connection,
        created_mint_a_account.address
      );

      try {
        await program.methods
          .initializeProgramConfig(new BN(200))
          .accounts({
            authority: admin.publicKey,
            game: game_a.publicKey,
            mint: mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc();
      } catch (error) {
        expect(error).to.exist;

        const config_data = await getConfigData(
          program,
          game_a,
          PROGRAM_CONFIG_SEED
        );

        assert.strictEqual(
          admin.publicKey.toBase58(),
          config_data.admin.toBase58()
        );

        assert.strictEqual("100", config_data.feeBasisPoints.toString());
      }
    });
    it("should not initialize a program configuration for a user that is not the admin", async () => {
      const mint_b_account = await getMint(
        connection,
        created_mint_b_account.address
      );

      const FEE = new BN(200);

      try {
        await program.methods
          .initializeProgramConfig(FEE)
          .accounts({
            authority: player_a.publicKey,
            game: game_b.publicKey,
            mint: mint_b_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([player_a])
          .rpc();
      } catch (error) {
        expect(error).to.exist;
      }
    });
    it("should initialize two separate program configurations for two different games", async () => {
      const mint_b_account = await getMint(
        connection,
        created_mint_b_account.address
      );

      const FEE = new BN(200);

      expect(
        await program.methods
          .initializeProgramConfig(FEE)
          .accounts({
            authority: admin.publicKey,
            game: game_b.publicKey,
            mint: mint_b_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([admin])
          .rpc()
      ).to.not.throw;

      const config_data_game_a = await getConfigData(
        program,
        game_a,
        PROGRAM_CONFIG_SEED
      );

      const config_data_game_b = await getConfigData(
        program,
        game_b,
        PROGRAM_CONFIG_SEED
      );

      assert.strictEqual(
        admin.publicKey.toBase58(),
        config_data_game_a.admin.toBase58()
      );
      assert.strictEqual("100", config_data_game_a.feeBasisPoints.toString());

      assert.strictEqual(
        admin.publicKey.toBase58(),
        config_data_game_b.admin.toBase58()
      );
      assert.strictEqual(
        FEE.toString(),
        config_data_game_b.feeBasisPoints.toString()
      );
    });
  });
  describe("update_program_config", () => {
    it("should throw error if fee basis points are higher than 10000", async () => {
      try {
        await program.methods
          .updateProgramConfig(new BN(10001))
          .accounts({
            authority: admin.publicKey,
            game: game_a.publicKey,
          })
          .signers([admin])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Fee basis points too high.");
      }
    });
    it("should update the program configuration", async () => {
      const FEE = new BN(200);

      expect(
        await program.methods
          .updateProgramConfig(FEE)
          .accounts({
            authority: admin.publicKey,
            game: game_a.publicKey,
          })
          .signers([admin])
          .rpc()
      ).to.not.throw;

      const config_data = await getConfigData(
        program,
        game_a,
        PROGRAM_CONFIG_SEED
      );

      assert.strictEqual(
        admin.publicKey.toBase58(),
        config_data.admin.toBase58()
      );
      assert.strictEqual(FEE.toString(), config_data.feeBasisPoints.toString());
    });
    it("should not update configurations for other games", async () => {
      const FEE = new BN(300);

      expect(
        await program.methods
          .updateProgramConfig(FEE)
          .accounts({
            authority: admin.publicKey,
            game: game_a.publicKey,
          })
          .signers([admin])
          .rpc()
      ).to.not.throw;

      const config_data_game_a = await getConfigData(
        program,
        game_a,
        PROGRAM_CONFIG_SEED
      );

      const config_data_game_b = await getConfigData(
        program,
        game_b,
        PROGRAM_CONFIG_SEED
      );

      assert.strictEqual(
        admin.publicKey.toBase58(),
        config_data_game_a.admin.toBase58()
      );
      assert.strictEqual(
        FEE.toString(),
        config_data_game_a.feeBasisPoints.toString()
      );

      assert.strictEqual(
        admin.publicKey.toBase58(),
        config_data_game_b.admin.toBase58()
      );
      assert.strictEqual("200", config_data_game_b.feeBasisPoints.toString());
    });
    it("should not update configurations for non-admin users", () => {
      const FEE = new BN(500);

      try {
        program.methods
          .updateProgramConfig(FEE)
          .accounts({
            authority: player_a.publicKey,
            game: game_a.publicKey,
          })
          .signers([player_a])
          .rpc();
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
  describe("initialize_game_session", () => {
    it("should throw if there are too many teams", async () => {
      try {
        await program.methods
          .initializeSession(
            new BN(1),
            new BN(100),
            Array.from({ length: 3 }, () => [])
          )
          .accounts({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Cannot initialize, too many teams");
      }
    });
    it("should throw if there are too many players in the teams", async () => {
      let team_a = Array.from(
        { length: 6 },
        () => anchor.web3.Keypair.generate().publicKey
      );
      let team_b = Array.from(
        { length: 6 },
        () => anchor.web3.Keypair.generate().publicKey
      );

      try {
        await program.methods
          .initializeSession(new BN(1), new BN(100), [team_a, team_b])
          .accounts({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain(
          "Cannot initialize, team has to many players"
        );
      }
    });
    it("should throw if there is a different amount of players in teams", async () => {
      let team_a = [player_a.publicKey, player_b.publicKey];
      let team_b = [player_c.publicKey];
      try {
        await program.methods
          .initializeSession(new BN(1), new BN(100), [team_a, team_b])
          .accounts({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain(
          "Cannot initialize, teams are not the same length"
        );
      }
    });
    it("should throw if there are no players in a team", async () => {
      let team_a = [];
      let team_b = [];

      try {
        await program.methods
          .initializeSession(new BN(1), new BN(100), [team_a, team_b])
          .accounts({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain(
          "Cannot initialize, team has no players"
        );
      }
    });
    it("should throw if any players are not unique accros the teams", async () => {
      let team_a = [player_a.publicKey, player_b.publicKey];
      let team_b = [player_a.publicKey, player_c.publicKey];

      try {
        await program.methods
          .initializeSession(new BN(1), new BN(100), [team_a, team_b])
          .accounts({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain(
          "Cannot initialize, players not unique"
        );
      }
    });
    it("should initialize a game session with proper fees", async () => {
      let team_a = [player_a.publicKey, player_b.publicKey];
      let team_b = [player_c.publicKey, player_d.publicKey];

      const SESSION_ENTRY_COST_PER_TEAM = new BN(10);

      const game_a_mint_a_ata = await getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      expect(
        await program.methods
          .initializeSession(SEED, SESSION_ENTRY_COST_PER_TEAM, [
            team_a,
            team_b,
          ])
          .accountsPartial({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc()
      ).to.not.throw;

      const game_a_program_config = await getConfigData(
        program,
        game_a,
        PROGRAM_CONFIG_SEED
      );

      const game_a_game_session_1 = await getGameSessionData(
        program,
        game_a,
        GAME_SESSION_SEED,
        SEED
      );

      assert.strictEqual(game_a_game_session_1.amountOfTeams, 2);
      assert.strictEqual(game_a_game_session_1.playersPerTeam, 2);

      assert.strictEqual(
        game_a_game_session_1.sessionEntryCostPerTeam.toNumber(),
        SESSION_ENTRY_COST_PER_TEAM.toNumber() *
          Math.pow(10, created_mint_a_account.decimals)
      );

      assert.strictEqual(
        game_a_game_session_1.sessionEntryCostPerPlayer.toNumber(),
        (SESSION_ENTRY_COST_PER_TEAM.toNumber() *
          Math.pow(10, created_mint_a_account.decimals)) /
          game_a_game_session_1.playersPerTeam
      );

      assert.strictEqual(
        game_a_game_session_1.terminationFee.toNumber(),
        SESSION_ENTRY_COST_PER_TEAM.toNumber() *
          game_a_game_session_1.amountOfTeams *
          game_a_program_config.feeBasisPoints.toNumber() *
          Math.pow(10, created_mint_a_account.decimals - 4) // - 4 for basis points adjustement
      );

      assert.isTrue(
        Array.isArray(game_a_game_session_1.teams[0]) &&
          !!game_a_game_session_1.teams[0].find(
            (player) =>
              player.player.toBase58() === player_a.publicKey.toBase58()
          ) &&
          !!game_a_game_session_1.teams[0].find(
            (player) =>
              player.player.toBase58() === player_b.publicKey.toBase58()
          )
      );

      assert.isTrue(
        Array.isArray(game_a_game_session_1.teams[1]) &&
          !!game_a_game_session_1.teams[1].find(
            (player) =>
              player.player.toBase58() === player_c.publicKey.toBase58()
          ) &&
          !!game_a_game_session_1.teams[1].find(
            (player) =>
              player.player.toBase58() === player_d.publicKey.toBase58()
          )
      );

      let game_a_mint_a_ata_account = await connection.getTokenAccountBalance(
        game_a_mint_a_ata
      );

      const game_a_game_session_1_address = PublicKey.findProgramAddressSync(
        [
          Buffer.from(GAME_SESSION_SEED),
          game_a.publicKey.toBuffer(),
          SEED.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0];

      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );

      let session_vault_account = await connection.getTokenAccountBalance(
        session_vault
      );

      assert.strictEqual(
        session_vault_account.value.amount,
        game_a_game_session_1.terminationFee.toString()
      );

      assert.strictEqual(
        game_a_mint_a_ata_account.value.amount,
        (
          10000 * Math.pow(10, created_mint_a_account.decimals) -
          game_a_game_session_1.terminationFee.toNumber()
        ).toString()
      );

      assert.strictEqual(game_a_game_session_1.terminationFeePaid, true);
    });
    it("should throw error if game session is already initialized", async () => {
      let team_a = [player_a.publicKey, player_b.publicKey];
      let team_b = [player_c.publicKey, player_d.publicKey];

      const SESSION_ENTRY_COST_PER_TEAM = new BN(10);

      try {
        await program.methods
          .initializeSession(SEED, SESSION_ENTRY_COST_PER_TEAM, [
            team_a,
            team_b,
          ])
          .accountsPartial({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error).to.exist;
      }
    });
    it("should allow a game to initialize multiple game sessions", async () => {
      let team_a = [player_a.publicKey, player_b.publicKey];
      let team_b = [player_c.publicKey, player_d.publicKey];

      const SESSION_ENTRY_COST_PER_TEAM = new BN(100);

      const SEED_2 = new BN(randomBytes(8));

      expect(
        await program.methods
          .initializeSession(SEED_2, SESSION_ENTRY_COST_PER_TEAM, [
            team_a,
            team_b,
          ])
          .accountsPartial({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([game_a])
          .rpc()
      ).to.not.throw;
    });
  });
  describe("deposit", () => {
    it("should deposit entry fee for player and set their 'paid' flag to true", async () => {
      await program.methods
        .deposit()
        .accountsPartial({
          player: player_a.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_1_address,
        })
        .signers([player_a])
        .rpc();

      const game_a_game_session_1 = await getGameSessionData(
        program,
        game_a,
        GAME_SESSION_SEED,
        SEED
      );

      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );

      let session_vault_account = await connection.getTokenAccountBalance(
        session_vault
      );

      assert.strictEqual(
        session_vault_account.value.amount,
        (
          game_a_game_session_1.terminationFee.toNumber() +
          game_a_game_session_1.sessionEntryCostPerPlayer.toNumber()
        ).toString()
      );

      let player = game_a_game_session_1.teams
        .find((team) =>
          team.find(
            (player) =>
              player.player.toBase58() === player_a.publicKey.toBase58()
          )
        )
        .find(
          (player) => player.player.toBase58() === player_a.publicKey.toBase58()
        );

      assert.strictEqual(player.paid, true);
    });
    it("should throw if player already deposited entry fee", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_a_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_a.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_a_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      try {
        await program.methods
          .deposit()
          .accountsPartial({
            player: player_a.publicKey,
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_1_address,
          })
          .signers([player_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Player already paid");
      }

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      let player_a_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      assert.strictEqual(
        player_a_ata_balance_after_tx,
        player_a_ata_balance_before_tx
      );

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
  });
  describe("payout and refund", () => {
    it("should refund a player that paid entry fee", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_a_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_a.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_a_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      await program.methods
        .refund()
        .accountsPartial({
          player: player_a.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_1_address,
        })
        .signers([game_a])
        .rpc();

      const game_a_game_session_1 = await getGameSessionData(
        program,
        game_a,
        GAME_SESSION_SEED,
        SEED
      );

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      let player_a_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      assert.strictEqual(
        player_a_ata_balance_after_tx,
        (
          parseInt(player_a_ata_balance_before_tx) +
          game_a_game_session_1.sessionEntryCostPerPlayer.toNumber()
        ).toString()
      );

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        (
          parseInt(session_vault_account_balance_before_tx) -
          game_a_game_session_1.sessionEntryCostPerPlayer.toNumber()
        ).toString()
      );

      let player = game_a_game_session_1.teams
        .find((team) =>
          team.find(
            (player) =>
              player.player.toBase58() === player_a.publicKey.toBase58()
          )
        )
        .find(
          (player) => player.player.toBase58() === player_a.publicKey.toBase58()
        );

      assert.strictEqual(player.refunded, true);
    });
    it("should throw during refund if a player was already refunded", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_a_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_a.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_a_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      try {
        await program.methods
          .refund()
          .accountsPartial({
            player: player_a.publicKey,
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_1_address,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Player not eligible for refund");
      }

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      let player_a_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      assert.strictEqual(
        player_a_ata_balance_after_tx,
        player_a_ata_balance_before_tx
      );

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
    it("should throw during payout if a player was already refunded", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_a_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_a.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_a_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      try {
        await program.methods
          .payout()
          .accountsPartial({
            player: player_a.publicKey,
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_1_address,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Player not eligible for payout");
      }

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      let player_a_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_a_ata_address)
      ).value.amount;

      assert.strictEqual(
        player_a_ata_balance_after_tx,
        player_a_ata_balance_before_tx
      );

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
    it("should throw during refund if a player didn't pay entry fee", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_b.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      try {
        await program.methods
          .refund()
          .accountsPartial({
            player: player_b.publicKey,
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_1_address,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Player not eligible for refund");
      }
      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      let player_b_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      assert.strictEqual(
        player_b_ata_balance_after_tx,
        player_b_ata_balance_before_tx
      );
      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
    it("should throw during payout if a player didn't pay entry fee", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_b.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      try {
        await program.methods
          .payout()
          .accountsPartial({
            player: player_b.publicKey,
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_1_address,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Player not eligible for payout");
      }
      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      let player_b_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      assert.strictEqual(
        player_b_ata_balance_after_tx,
        player_b_ata_balance_before_tx
      );
      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
    it("paying entry fee for all players", async () => {
      const game_a_game_session_1 = await getGameSessionData(
        program,
        game_a,
        GAME_SESSION_SEED,
        SEED
      );

      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );
      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      await program.methods
        .deposit()
        .accountsPartial({
          player: player_a.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_1_address,
        })
        .signers([player_a])
        .rpc();
      await program.methods
        .deposit()
        .accountsPartial({
          player: player_b.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_1_address,
        })
        .signers([player_b])
        .rpc();
      await program.methods
        .deposit()
        .accountsPartial({
          player: player_c.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_1_address,
        })
        .signers([player_c])
        .rpc();
      await program.methods
        .deposit()
        .accountsPartial({
          player: player_d.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_1_address,
        })
        .signers([player_d])
        .rpc();

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        (
          parseInt(session_vault_account_balance_before_tx) +
          4 * game_a_game_session_1.sessionEntryCostPerPlayer.toNumber()
        ).toString()
      );
    });
    it("should payout winnigs to a player that paid entry fee", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_b.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      let player_b_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;

      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      await program.methods
        .payout()
        .accountsPartial({
          player: player_b.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_1_address,
        })
        .signers([game_a])
        .rpc();

      const game_a_game_session_1 = await getGameSessionData(
        program,
        game_a,
        GAME_SESSION_SEED,
        SEED
      );

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      let player_b_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;

      const winnigs =
        (parseInt(session_vault_account_balance_before_tx) -
          2 * game_a_game_session_1.terminationFee.toNumber()) /
        game_a_game_session_1.playersPerTeam;

      assert.strictEqual(
        player_b_ata_balance_after_tx,
        (parseInt(player_b_ata_balance_before_tx) + winnigs).toString()
      );

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        (parseInt(session_vault_account_balance_before_tx) - winnigs).toString()
      );

      let player = game_a_game_session_1.teams
        .find((team) =>
          team.find(
            (player) =>
              player.player.toBase58() === player_b.publicKey.toBase58()
          )
        )
        .find(
          (player) => player.player.toBase58() === player_b.publicKey.toBase58()
        );

      assert.strictEqual(player.recievedRewards, true);
    });
    it("should throw during refund if a player recieved winnings", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_b.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      try {
        await program.methods
          .refund()
          .accountsPartial({
            player: player_b.publicKey,
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_1_address,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Player not eligible for refund");
      }
      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      let player_b_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      assert.strictEqual(
        player_b_ata_balance_after_tx,
        player_b_ata_balance_before_tx
      );
      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
    it("should throw during payout if a player recieved winnings", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_1_address,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_address = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        player_b.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );
      let player_b_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      try {
        await program.methods
          .payout()
          .accountsPartial({
            player: player_b.publicKey,
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_1_address,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Player not eligible for payout");
      }
      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;
      let player_b_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(player_b_ata_address)
      ).value.amount;
      assert.strictEqual(
        player_b_ata_balance_after_tx,
        player_b_ata_balance_before_tx
      );
      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
  });
  describe("close", () => {
    const SEED_1 = new BN(11112222);
    const SEED_2 = new BN(33334444);

    const game_a_game_session_11112222_address =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from(GAME_SESSION_SEED),
          game_a.publicKey.toBuffer(),
          SEED_1.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0];

    const game_a_game_session_33334444_address =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from(GAME_SESSION_SEED),
          game_a.publicKey.toBuffer(),
          SEED_2.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0];
    it("create game session", async () => {
      let team_a = [player_a.publicKey];
      let team_b = [player_b.publicKey];

      const SESSION_ENTRY_COST_PER_TEAM = new BN(150);

      await program.methods
        .initializeSession(SEED_1, SESSION_ENTRY_COST_PER_TEAM, [
          team_a,
          team_b,
        ])
        .accountsPartial({
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([game_a])
        .rpc();

      await program.methods
        .deposit()
        .accountsPartial({
          player: player_a.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_11112222_address,
        })
        .signers([player_a])
        .rpc();

      await program.methods
        .deposit()
        .accountsPartial({
          player: player_b.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_11112222_address,
        })
        .signers([player_b])
        .rpc();
    });
    it("should throw if not all players were refunded", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_11112222_address,
        true,
        TOKEN_PROGRAM_ID
      );

      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      try {
        await program.methods
          .close()
          .accountsPartial({
            game: game_a.publicKey,
            mint: created_mint_a_account.address,
            tokenProgram: TOKEN_PROGRAM_ID,
            gameSession: game_a_game_session_11112222_address,
          })
          .signers([game_a])
          .rpc();
      } catch (error) {
        expect(error.message).to.contain("Cannot close, players not paid out");
      }

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        session_vault_account_balance_before_tx
      );
    });
    it("refund players", async () => {
      let session_vault = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a_game_session_11112222_address,
        true,
        TOKEN_PROGRAM_ID
      );

      let session_vault_account_balance_before_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      await program.methods
        .refund()
        .accountsPartial({
          player: player_a.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_11112222_address,
        })
        .signers([game_a])
        .rpc();

      await program.methods
        .refund()
        .accountsPartial({
          player: player_b.publicKey,
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_11112222_address,
        })
        .signers([game_a])
        .rpc();

      let session_vault_account_balance_after_tx = (
        await connection.getTokenAccountBalance(session_vault)
      ).value.amount;

      const game_session = await getGameSessionData(
        program,
        game_a,
        GAME_SESSION_SEED,
        SEED_1
      );

      assert.strictEqual(
        session_vault_account_balance_after_tx,
        (
          parseInt(session_vault_account_balance_before_tx) -
          2 * game_session.sessionEntryCostPerPlayer.toNumber()
        ).toString()
      );
    });
    it("should close the game session if all players are refunded", async () => {
      const game_ata = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      const game_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(game_ata)
      ).value.amount;

      const admin_ata = getAssociatedTokenAddressSync(
        created_mint_a_account.address,
        game_a.publicKey,
        true,
        TOKEN_PROGRAM_ID
      );

      const admin_ata_balance_before_tx = (
        await connection.getTokenAccountBalance(admin_ata)
      ).value.amount;

      const game_session = await getGameSessionData(
        program,
        game_a,
        GAME_SESSION_SEED,
        SEED_1
      );

      await program.methods
        .close()
        .accountsPartial({
          game: game_a.publicKey,
          mint: created_mint_a_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          gameSession: game_a_game_session_11112222_address,
        })
        .signers([game_a])
        .rpc();

      const game_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(game_ata)
      ).value.amount;

      assert.strictEqual(game_ata_balance_after_tx, game_ata_balance_before_tx);

      const admin_ata_balance_after_tx = (
        await connection.getTokenAccountBalance(admin_ata)
      ).value.amount;

      console.log({
        before: admin_ata_balance_before_tx,
        after: admin_ata_balance_after_tx,
      });

      //wait 30 seconds
      await new Promise((resolve) => setTimeout(resolve, 30000));

      assert.strictEqual(
        admin_ata_balance_after_tx,
        (
          parseInt(admin_ata_balance_before_tx) +
          game_session.terminationFee.toNumber()
        ).toString()
      );
    });
    // it("create game session", async () => {
    //   let team_a = [player_a.publicKey, player_c.publicKey];
    //   let team_b = [player_b.publicKey, player_d.publicKey];

    //   const SESSION_ENTRY_COST_PER_TEAM = new BN(250);

    //   await program.methods
    //     .initializeSession(SEED_2, SESSION_ENTRY_COST_PER_TEAM, [
    //       team_a,
    //       team_b,
    //     ])
    //     .accountsPartial({
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //     })
    //     .signers([game_a])
    //     .rpc();

    //   await program.methods
    //     .deposit()
    //     .accountsPartial({
    //       player: player_a.publicKey,
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       gameSession: game_a_game_session_33334444_address,
    //     })
    //     .signers([player_a])
    //     .rpc();

    //   await program.methods
    //     .deposit()
    //     .accountsPartial({
    //       player: player_b.publicKey,
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       gameSession: game_a_game_session_33334444_address,
    //     })
    //     .signers([player_b])
    //     .rpc();

    //   await program.methods
    //     .deposit()
    //     .accountsPartial({
    //       player: player_c.publicKey,
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       gameSession: game_a_game_session_33334444_address,
    //     })
    //     .signers([player_c])
    //     .rpc();

    //   await program.methods
    //     .deposit()
    //     .accountsPartial({
    //       player: player_d.publicKey,
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       gameSession: game_a_game_session_33334444_address,
    //     })
    //     .signers([player_d])
    //     .rpc();
    // });
    // it("should throw if not all eligible players recieved winnings", async () => {
    //   await program.methods
    //     .payout()
    //     .accountsPartial({
    //       player: player_a.publicKey,
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       gameSession: game_a_game_session_33334444_address,
    //     })
    //     .signers([game_a])
    //     .rpc();

    //   let session_vault = getAssociatedTokenAddressSync(
    //     created_mint_a_account.address,
    //     game_a_game_session_33334444_address,
    //     true,
    //     TOKEN_PROGRAM_ID
    //   );

    //   let session_vault_account_balance_before_tx = (
    //     await connection.getTokenAccountBalance(session_vault)
    //   ).value.amount;

    //   try {
    //     await program.methods
    //       .close()
    //       .accountsPartial({
    //         game: game_a.publicKey,
    //         mint: created_mint_a_account.address,
    //         tokenProgram: TOKEN_PROGRAM_ID,
    //         gameSession: game_a_game_session_33334444_address,
    //       })
    //       .signers([game_a])
    //       .rpc();
    //   } catch (error) {
    //     expect(error.message).to.contain("Cannot close, players not paid out");
    //   }

    //   let session_vault_account_balance_after_tx = (
    //     await connection.getTokenAccountBalance(session_vault)
    //   ).value.amount;

    //   assert.strictEqual(
    //     session_vault_account_balance_after_tx,
    //     session_vault_account_balance_before_tx
    //   );
    // });
    // it("should close the game session if all eligible players recieved winnings", async () => {
    //   await program.methods
    //     .payout()
    //     .accountsPartial({
    //       player: player_c.publicKey,
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       gameSession: game_a_game_session_33334444_address,
    //     })
    //     .signers([game_a])
    //     .rpc();

    //   const game_ata = getAssociatedTokenAddressSync(
    //     created_mint_a_account.address,
    //     game_a.publicKey,
    //     true,
    //     TOKEN_PROGRAM_ID
    //   );

    //   const game_ata_balance_before_tx = (
    //     await connection.getTokenAccountBalance(game_ata)
    //   ).value.amount;

    //   const game_session = await getGameSessionData(
    //     program,
    //     game_a,
    //     GAME_SESSION_SEED,
    //     SEED_2
    //   );

    //   let session_vault = getAssociatedTokenAddressSync(
    //     created_mint_a_account.address,
    //     game_a_game_session_33334444_address,
    //     true,
    //     TOKEN_PROGRAM_ID
    //   );

    //   let session_vault_account_balance_before_tx = (
    //     await connection.getTokenAccountBalance(session_vault)
    //   ).value.amount;

    //   let a = getAssociatedTokenAddressSync(
    //     created_mint_a_account.address,
    //     player_a.publicKey,
    //     true,
    //     TOKEN_PROGRAM_ID
    //   );

    //   let a_b = (await connection.getTokenAccountBalance(a)).value.amount;

    //   let c = getAssociatedTokenAddressSync(
    //     created_mint_a_account.address,
    //     player_c.publicKey,
    //     true,
    //     TOKEN_PROGRAM_ID
    //   );

    //   let c_b = (await connection.getTokenAccountBalance(a)).value.amount;

    //   console.log(session_vault_account_balance_before_tx, a_b, c_b);

    //   await program.methods
    //     .close()
    //     .accountsPartial({
    //       game: game_a.publicKey,
    //       mint: created_mint_a_account.address,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       gameSession: game_a_game_session_33334444_address,
    //     })
    //     .signers([game_a])
    //     .rpc();

    //   const game_ata_balance_after_tx = (
    //     await connection.getTokenAccountBalance(game_ata)
    //   ).value.amount;

    //   assert.strictEqual(
    //     game_ata_balance_after_tx,
    //     (
    //       parseInt(game_ata_balance_before_tx) +
    //       game_session.terminationFee.toNumber()
    //     ).toString()
    //   );
    // });
  });
});
