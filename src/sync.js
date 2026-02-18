import dotenv from 'dotenv';
import DiscordIntegration from './discord.js';
import { parseMultipleUpdates } from './parser.js';
import { decodeState, upsertPlayer, sortPlayers, validatePlayerData } from './storage.js';
import { renderLeaderboard, validateMessageLength, truncateIfNeeded } from './renderer.js';

dotenv.config();

/**
 * Main Sync Script
 * Message-as-Database Architecture
 */

class LeaderboardSync {
  constructor() {
    this.discord = null;
    this.games = [];
    this.persistentMessageIds = new Map(); // Track message IDs across runs
  }

  /**
   * Initialize connections and load game configurations
   */
  async initialize() {
    console.log('🚀 Initializing Discord Leaderboard Sync (Stateless Mode)...\n');

    // Validate environment variables
    this.validateEnvironment();

    // Connect to Discord
    this.discord = new DiscordIntegration(process.env.DISCORD_BOT_TOKEN);
    await this.discord.connect();

    // Load game configurations from environment
    this.loadGameConfigurations();

    console.log('✓ Initialization complete\n');
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const required = ['DISCORD_BOT_TOKEN'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Load game configurations from environment variables
   */
  loadGameConfigurations() {
    console.log('📋 Loading game configurations...');

    const gameConfigs = {};

    // Parse environment variables
    for (const [key, value] of Object.entries(process.env)) {
      const channelMatch = key.match(/^GAME_(.+)_CHANNEL_ID$/);
      if (channelMatch) {
        const gameName = channelMatch[1];
        if (!gameConfigs[gameName]) {
          gameConfigs[gameName] = {};
        }
        gameConfigs[gameName].channelId = value;
      }

      const webhookMatch = key.match(/^GAME_(.+)_WEBHOOK_URL$/);
      if (webhookMatch) {
        const gameName = webhookMatch[1];
        if (!gameConfigs[gameName]) {
          gameConfigs[gameName] = {};
        }
        gameConfigs[gameName].webhookUrl = value;
      }

      const messageIdMatch = key.match(/^GAME_(.+)_MESSAGE_ID$/);
      if (messageIdMatch) {
        const gameName = messageIdMatch[1];
        if (!gameConfigs[gameName]) {
          gameConfigs[gameName] = {};
        }
        gameConfigs[gameName].persistentMessageId = value;
      }
    }

    // Validate and register games
    for (const [gameName, config] of Object.entries(gameConfigs)) {
      if (!config.channelId || !config.webhookUrl) {
        console.warn(`⚠️  Incomplete configuration for game ${gameName}, skipping`);
        continue;
      }

      this.games.push({
        name: gameName,
        channelId: config.channelId,
        webhookUrl: config.webhookUrl,
        persistentMessageId: config.persistentMessageId || null
      });

      console.log(`  ✓ ${gameName}: Channel ${config.channelId}`);
    }

    if (this.games.length === 0) {
      throw new Error('No valid game configurations found. Please set GAME_*_CHANNEL_ID and GAME_*_WEBHOOK_URL');
    }

    console.log(`\n✓ Loaded ${this.games.length} game(s)\n`);
  }

  /**
   * Sync a single game's leaderboard
   */
  async syncGame(game) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎮 Syncing ${game.name}...`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Step 1: Fetch current leaderboard state from webhook message
    console.log(`📥 Fetching current leaderboard state...`);
    let currentState = { lastProcessedMessageId: null, players: [] };
    let persistentMessageId = game.persistentMessageId;

    if (persistentMessageId) {
      const messageContent = await this.discord.fetchWebhookMessage(
        game.webhookUrl,
        persistentMessageId
      );

      if (messageContent) {
        currentState = decodeState(messageContent);
        console.log(`   Found ${currentState.players.length} existing players`);
        console.log(`   Last processed message: ${currentState.lastProcessedMessageId || 'none'}`);
      } else {
        console.log(`   Leaderboard message not found, starting fresh`);
        persistentMessageId = null;
      }
    } else {
      console.log(`   No persistent message ID, starting fresh`);
    }

    // Step 2: Fetch new messages from Discord
    console.log(`\n📨 Fetching new messages from channel...`);
    const maxMessages = parseInt(process.env.MAX_MESSAGES_PER_SYNC || '100', 10);
    const messages = await this.discord.fetchMessages(
      game.channelId,
      currentState.lastProcessedMessageId,
      maxMessages
    );

    if (messages.length === 0) {
      console.log('   No new messages to process');
      return { processed: 0, updated: 0, failed: 0, skipped: 0 };
    }

    // Step 3: Parse messages
    console.log(`\n🔍 Parsing messages...`);
    const parseResults = parseMultipleUpdates(messages);
    
    console.log(`   Successful: ${parseResults.successful.length}`);
    console.log(`   Failed: ${parseResults.failed.length}`);
    console.log(`   Skipped: ${parseResults.skipped}\n`);

    // Step 4: Process successful updates
    let players = [...currentState.players];
    let updatedCount = 0;
    let lastMessageId = currentState.lastProcessedMessageId;

    for (const update of parseResults.successful) {
      try {
        // Resolve username
        const username = await this.discord.resolveUsername(update.data.userId);

        // Create player data object
        const playerData = {
          userId: update.data.userId,
          username,
          currentRank: update.data.currentRank,
          currentRankScore: update.data.currentRankScore,
          peakRank: update.data.peakRank,
          peakRankScore: update.data.peakRankScore,
          lastUpdated: update.data.lastUpdated
        };

        // Validate player data
        if (!validatePlayerData(playerData)) {
          console.warn(`   ✗ Invalid player data for ${username}`);
          continue;
        }

        // Upsert player
        const result = upsertPlayer(players, playerData);
        players = result.players;

        if (result.updated) {
          updatedCount++;
          console.log(`   ✓ Updated stats for ${username}`);
        } else {
          console.log(`   ⊘ Skipped older data for ${username}`);
        }

        // Track last processed message
        lastMessageId = update.messageId;
      } catch (error) {
        console.error(`   ✗ Error processing update:`, error.message);
        parseResults.failed.push(update);
      }
    }

    // Step 5: Sort players
    const sortedPlayers = sortPlayers(players);

    // Step 6: Render and update leaderboard
    console.log(`\n📊 Rendering leaderboard...`);
    
    let content = renderLeaderboard(game.name, sortedPlayers, lastMessageId);
    
    // Check if message is too long
    if (!validateMessageLength(content)) {
      console.warn('⚠️  Message too long, truncating...');
      const truncated = truncateIfNeeded(game.name, sortedPlayers, lastMessageId);
      content = truncated.content;
      if (truncated.truncated) {
        console.warn(`⚠️  Showing ${truncated.shownCount} of ${sortedPlayers.length} players`);
      }
    }

    // Update webhook message
    const result = await this.discord.upsertLeaderboardMessage(
      game.webhookUrl,
      persistentMessageId,
      content
    );

    // Track new message ID
    if (result.action === 'created') {
      console.log(`✓ Created new leaderboard message: ${result.messageId}`);
      console.log(`💡 Add this to .env: GAME_${game.name}_MESSAGE_ID=${result.messageId}`);
      this.persistentMessageIds.set(game.name, result.messageId);
    } else {
      console.log(`✓ Updated leaderboard message`);
    }

    return {
      processed: messages.length,
      updated: updatedCount,
      failed: parseResults.failed.length,
      skipped: parseResults.skipped,
      totalPlayers: sortedPlayers.length
    };
  }

  /**
   * Run sync for all configured games
   */
  async syncAll() {
    const results = {
      totalProcessed: 0,
      totalUpdated: 0,
      totalFailed: 0,
      totalSkipped: 0,
      games: []
    };

    for (const game of this.games) {
      try {
        const gameResults = await this.syncGame(game);
        
        results.totalProcessed += gameResults.processed;
        results.totalUpdated += gameResults.updated;
        results.totalFailed += gameResults.failed;
        results.totalSkipped += gameResults.skipped;
        
        results.games.push({
          name: game.name,
          ...gameResults
        });
      } catch (error) {
        console.error(`\n❌ Error syncing ${game.name}:`, error.message);
        results.games.push({
          name: game.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.discord) {
      await this.discord.disconnect();
    }

    console.log('✓ Cleanup complete');
  }

  /**
   * Print summary
   */
  printSummary(results) {
    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 SYNC SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Messages Processed: ${results.totalProcessed}`);
    console.log(`Total Updates Applied: ${results.totalUpdated}`);
    console.log(`Total Failed Parses: ${results.totalFailed}`);
    console.log(`Total Skipped: ${results.totalSkipped}`);
    console.log('');
    
    results.games.forEach(game => {
      if (game.error) {
        console.log(`❌ ${game.name}: ${game.error}`);
      } else {
        console.log(`✓ ${game.name}: ${game.updated} updates, ${game.totalPlayers} total players`);
      }
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Print message IDs for new leaderboards
    if (this.persistentMessageIds.size > 0) {
      console.log('💡 New leaderboard messages created. Add these to your .env:');
      for (const [gameName, messageId] of this.persistentMessageIds.entries()) {
        console.log(`   GAME_${gameName}_MESSAGE_ID=${messageId}`);
      }
      console.log('');
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const sync = new LeaderboardSync();

  try {
    await sync.initialize();
    const results = await sync.syncAll();
    sync.printSummary(results);
    
    await sync.cleanup();
    
    // Exit with appropriate code
    const hasErrors = results.games.some(g => g.error);
    process.exit(hasErrors ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    
    await sync.cleanup();
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default LeaderboardSync;
