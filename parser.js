/**
 * Message Parser Module
 * Parses Discord messages in the format:
 * LB_UPDATE: @username <Current_rank> <Current_rank_score> <Peak_rank> <Peak_rank_score> <Last_Updated>
 */

const LB_UPDATE_PREFIX = 'LB_UPDATE:';

/**
 * Extract Discord user ID from mention format
 * Handles both <@123456789> and <@!123456789> formats
 */
function extractUserId(mention) {
  const match = mention.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

/**
 * Validate and parse ISO date string
 */
function parseDate(dateString) {
  // Accept YYYY-MM-DD format
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}`);
  
  // Validate it's a real date
  if (isNaN(date.getTime())) return null;
  
  return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
}

/**
 * Sanitize input to prevent injection attacks
 */
function sanitizeInput(text) {
  if (typeof text !== 'string') return '';
  
  // Remove any potential injection patterns
  return text
    .replace(/[<>'"`;()]/g, '') // Remove dangerous characters
    .trim()
    .substring(0, 200); // Limit length
}

/**
 * Parse a leaderboard update message
 * 
 * Expected format:
 * LB_UPDATE: @username <Current_rank> <Current_rank_score> <Peak_rank> <Peak_rank_score> <Last_Updated>
 * 
 * Example:
 * LB_UPDATE: @Turbo Diamond 2450 Master 2610 2026-02-14
 * 
 * @param {string} messageContent - The Discord message content
 * @returns {Object|null} Parsed data or null if invalid
 */
export function parseLeaderboardUpdate(messageContent) {
  if (!messageContent || typeof messageContent !== 'string') {
    return null;
  }

  // Check if message starts with LB_UPDATE:
  if (!messageContent.trim().startsWith(LB_UPDATE_PREFIX)) {
    return null;
  }

  // Remove prefix and trim
  const content = messageContent.trim().substring(LB_UPDATE_PREFIX.length).trim();

  // Split by whitespace, but preserve the mention format
  const parts = content.split(/\s+/);

  if (parts.length < 6) {
    console.warn('Invalid LB_UPDATE format: insufficient fields', { parts });
    return null;
  }

  const [mention, currentRank, currentRankScore, peakRank, peakRankScore, lastUpdated, ...extra] = parts;

  // Extract user ID from mention
  const userId = extractUserId(mention);
  if (!userId) {
    console.warn('Invalid LB_UPDATE format: invalid mention format', { mention });
    return null;
  }

  // Parse and validate rank scores
  const currentScore = parseInt(currentRankScore, 10);
  const peakScore = parseInt(peakRankScore, 10);

  if (isNaN(currentScore) || isNaN(peakScore)) {
    console.warn('Invalid LB_UPDATE format: invalid score values', { currentRankScore, peakRankScore });
    return null;
  }

  // Validate scores are positive
  if (currentScore < 0 || peakScore < 0) {
    console.warn('Invalid LB_UPDATE format: negative scores not allowed');
    return null;
  }

  // Parse and validate date
  const parsedDate = parseDate(lastUpdated);
  if (!parsedDate) {
    console.warn('Invalid LB_UPDATE format: invalid date format', { lastUpdated });
    return null;
  }

  // Warn about extra fields (common mistake)
  if (extra.length > 0) {
    console.warn('Extra fields detected in LB_UPDATE message (will be ignored)', { extra });
  }

  // Sanitize rank strings
  const sanitizedCurrentRank = sanitizeInput(currentRank);
  const sanitizedPeakRank = sanitizeInput(peakRank);

  if (!sanitizedCurrentRank || !sanitizedPeakRank) {
    console.warn('Invalid LB_UPDATE format: invalid rank names');
    return null;
  }

  return {
    userId,
    currentRank: sanitizedCurrentRank,
    currentRankScore: currentScore,
    peakRank: sanitizedPeakRank,
    peakRankScore: peakScore,
    lastUpdated: parsedDate,
    rawMention: mention
  };
}

/**
 * Validate if a message could be a leaderboard update
 * (lighter check before full parsing)
 */
export function isLeaderboardUpdate(messageContent) {
  return messageContent && 
         typeof messageContent === 'string' && 
         messageContent.trim().startsWith(LB_UPDATE_PREFIX);
}

/**
 * Batch parse multiple messages
 */
export function parseMultipleUpdates(messages) {
  const results = {
    successful: [],
    failed: [],
    skipped: 0
  };

  for (const message of messages) {
    if (!isLeaderboardUpdate(message.content)) {
      results.skipped++;
      continue;
    }

    const parsed = parseLeaderboardUpdate(message.content);
    
    if (parsed) {
      results.successful.push({
        messageId: message.id,
        timestamp: message.createdTimestamp,
        author: message.author,
        data: parsed
      });
    } else {
      results.failed.push({
        messageId: message.id,
        content: message.content,
        reason: 'parse_error'
      });
    }
  }

  return results;
}

export default {
  parseLeaderboardUpdate,
  isLeaderboardUpdate,
  parseMultipleUpdates
};
