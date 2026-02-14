import { Client, GatewayIntentBits, WebhookClient } from 'discord.js';

/**
 * Discord Integration Module
 * Handles message fetching and webhook updates
 */

class DiscordIntegration {
  constructor(token) {
    this.token = token;
    this.client = null;
    this.webhooks = new Map();
    this.rateLimitDelay = parseInt(process.env.DISCORD_RATE_LIMIT_DELAY || '1000', 10);
  }

  /**
   * Initialize Discord client
   */
  async connect() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    await this.client.login(this.token);
    console.log(`✓ Discord bot connected as ${this.client.user.tag}`);
    
    return this;
  }

  /**
   * Fetch messages from a channel since a specific message ID
   */
  async fetchMessages(channelId, afterMessageId = null, limit = 100) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      
      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${channelId} is not a text channel`);
      }

      const options = {
        limit: Math.min(limit, 100) // Discord API max is 100
      };

      if (afterMessageId) {
        options.after = afterMessageId;
      }

      const messages = await channel.messages.fetch(options);
      
      // Convert Collection to Array and sort by timestamp (oldest first)
      const messageArray = Array.from(messages.values())
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      console.log(`✓ Fetched ${messageArray.length} messages from channel ${channelId}`);
      
      return messageArray;
    } catch (error) {
      if (error.code === 50001) {
        throw new Error(`Missing access to channel ${channelId}. Check bot permissions.`);
      }
      if (error.code === 10003) {
        throw new Error(`Channel ${channelId} not found`);
      }
      throw error;
    }
  }

  /**
   * Get or create webhook client
   */
  getWebhookClient(webhookUrl) {
    if (this.webhooks.has(webhookUrl)) {
      return this.webhooks.get(webhookUrl);
    }

    // Parse webhook URL to extract ID and token
    const urlMatch = webhookUrl.match(/\/webhooks\/(\d+)\/([a-zA-Z0-9_-]+)/);
    if (!urlMatch) {
      throw new Error(`Invalid webhook URL format: ${webhookUrl}`);
    }

    const [, webhookId, webhookToken] = urlMatch;
    const webhookClient = new WebhookClient({ id: webhookId, token: webhookToken });
    
    this.webhooks.set(webhookUrl, webhookClient);
    return webhookClient;
  }

  /**
   * Fetch the current webhook message (if it exists)
   * Returns the message content or null
   */
  async fetchWebhookMessage(webhookUrl, messageId) {
    if (!messageId) {
      return null;
    }

    try {
      const webhook = this.getWebhookClient(webhookUrl);
      const message = await webhook.fetchMessage(messageId);
      return message.content;
    } catch (error) {
      if (error.code === 10008) {
        console.warn(`Message ${messageId} not found (may have been deleted)`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Send a new leaderboard message via webhook
   */
  async sendLeaderboardMessage(webhookUrl, content) {
    try {
      await this.delay(this.rateLimitDelay);
      
      const webhook = this.getWebhookClient(webhookUrl);
      
      const message = await webhook.send({
        content,
        username: 'Leaderboard System',
        allowedMentions: { parse: ['users'] }
      });

      console.log(`✓ Sent new leaderboard message: ${message.id}`);
      return message.id;
    } catch (error) {
      if (error.code === 10015) {
        throw new Error('Webhook not found or deleted');
      }
      if (error.code === 50027) {
        throw new Error('Invalid webhook token');
      }
      throw error;
    }
  }

  /**
   * Update (patch) an existing leaderboard message via webhook
   */
  async updateLeaderboardMessage(webhookUrl, messageId, content) {
    try {
      await this.delay(this.rateLimitDelay);
      
      const webhook = this.getWebhookClient(webhookUrl);
      
      await webhook.editMessage(messageId, {
        content,
        allowedMentions: { parse: ['users'] }
      });

      console.log(`✓ Updated leaderboard message: ${messageId}`);
      return true;
    } catch (error) {
      if (error.code === 10008) {
        console.warn(`Message ${messageId} not found, will create new message`);
        return false;
      }
      if (error.code === 50027) {
        throw new Error('Invalid webhook token');
      }
      throw error;
    }
  }

  /**
   * Send or update a leaderboard message
   */
  async upsertLeaderboardMessage(webhookUrl, persistentMessageId, content) {
    if (persistentMessageId) {
      const updated = await this.updateLeaderboardMessage(webhookUrl, persistentMessageId, content);
      
      if (updated) {
        return { messageId: persistentMessageId, action: 'updated' };
      }
    }

    // Create new message if update failed or no existing message
    const messageId = await this.sendLeaderboardMessage(webhookUrl, content);
    return { messageId, action: 'created' };
  }

  /**
   * Resolve username from user ID
   */
  async resolveUsername(userId) {
    try {
      const user = await this.client.users.fetch(userId);
      return user.username;
    } catch (error) {
      console.warn(`Could not fetch user ${userId}:`, error.message);
      return `User_${userId.substring(0, 6)}`;
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gracefully disconnect
   */
  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      console.log('✓ Discord client disconnected');
    }

    // Clean up webhook clients
    for (const webhook of this.webhooks.values()) {
      webhook.destroy();
    }
    this.webhooks.clear();
  }
}

export default DiscordIntegration;
