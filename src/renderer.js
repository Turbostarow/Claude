/**
 * Leaderboard Renderer Module
 * Formats leaderboard data for Discord display with embedded player data
 */

import { encodeState } from './storage.js';

/**
 * Format a date string for display
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Get current timestamp
 */
function getCurrentTimestamp() {
  const now = new Date();
  const timezone = process.env.DISPLAY_TIMEZONE || 'UTC';
  
  return now.toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Format rank badge based on rank name
 */
function getRankEmoji(rankName) {
  const rank = rankName.toLowerCase();
  
  const rankEmojis = {
    'iron': '⚫',
    'bronze': '🟤',
    'silver': '⚪',
    'gold': '🟡',
    'platinum': '🔵',
    'diamond': '💎',
    'master': '👑',
    'grandmaster': '🔥',
    'challenger': '⭐',
    'radiant': '✨',
    'immortal': '🌟',
    'legend': '🏆'
  };

  return rankEmojis[rank] || '🔹';
}

/**
 * Render a single player entry
 */
function renderPlayerEntry(position, player, showEmojis = true) {
  const { userId, username, currentRank, currentRankScore, peakRank, peakRankScore, lastUpdated } = player;

  // Get position emoji
  const positionDisplay = position <= 3 ? ['🥇', '🥈', '🥉'][position - 1] : `${position}.`;
  
  // Format rank display
  const currentRankEmoji = showEmojis ? getRankEmoji(currentRank) : '';
  const peakRankEmoji = showEmojis ? getRankEmoji(peakRank) : '';

  // Build the entry
  const lines = [
    `${positionDisplay} <@${userId}>`,
    `   Current: ${currentRankEmoji} ${currentRank} — ${currentRankScore.toLocaleString()}`,
    `   Peak: ${peakRankEmoji} ${peakRank} — ${peakRankScore.toLocaleString()}`,
    `   Last Update: ${formatDate(lastUpdated)}`
  ];

  return lines.join('\n');
}

/**
 * Render complete leaderboard with embedded data
 * 
 * @param {string} gameName - Name of the game
 * @param {Array} players - Array of player objects (already sorted)
 * @param {string} lastProcessedMessageId - Last processed message ID
 * @param {Object} options - Rendering options
 */
export function renderLeaderboard(gameName, players, lastProcessedMessageId, options = {}) {
  const {
    maxPlayers = 50,
    showEmojis = true
  } = options;

  const output = [];

  // Header
  output.push(`🏆 ${gameName.toUpperCase()} LEADERBOARD`);
  output.push('');

  // Check for empty leaderboard
  if (!players || players.length === 0) {
    output.push('No leaderboard data available.');
    output.push('');
    output.push('💡 Use `LB_UPDATE: @user <rank> <score> <peak_rank> <peak_score> <date>` to add entries.');
  } else {
    // Render players
    const limitedPlayers = players.slice(0, maxPlayers);
    
    limitedPlayers.forEach((player, index) => {
      const position = index + 1;
      output.push(renderPlayerEntry(position, player, showEmojis));
      output.push(''); // Spacing between entries
    });

    // Remove last empty line before footer
    if (output[output.length - 1] === '') {
      output.pop();
    }
  }

  // Footer
  output.push('━━━━━━━━━━━━━━━━━━');
  if (players && players.length > 0) {
    output.push(`📊 Total Players: ${players.length}`);
    if (players.length > maxPlayers) {
      output.push(`(Showing top ${maxPlayers})`);
    }
  }
  output.push(`Updated: ${getCurrentTimestamp()}`);
  output.push('');

  // Embed data section (hidden from casual view but parseable)
  const dataSection = encodeState(lastProcessedMessageId, players);
  output.push(dataSection);

  return output.join('\n');
}

/**
 * Render compact leaderboard (for smaller displays or summaries)
 */
export function renderCompactLeaderboard(gameName, players, lastProcessedMessageId, topN = 10) {
  const output = [];
  
  output.push(`🏆 ${gameName} — Top ${topN}`);
  output.push('');

  if (!players || players.length === 0) {
    output.push('No data available');
  } else {
    const topPlayers = players.slice(0, topN);
    
    topPlayers.forEach((player, index) => {
      const position = index + 1;
      const emoji = position <= 3 ? ['🥇', '🥈', '🥉'][position - 1] : `${position}.`;
      
      output.push(
        `${emoji} <@${player.userId}> — ` +
        `${player.currentRank} (${player.currentRankScore.toLocaleString()})`
      );
    });
  }

  output.push('');
  output.push(`Updated: ${getCurrentTimestamp()}`);
  output.push('');

  // Embed data section
  const dataSection = encodeState(lastProcessedMessageId, players);
  output.push(dataSection);

  return output.join('\n');
}

/**
 * Validate message fits Discord limits
 * Discord max message length is 2000 characters
 */
export function validateMessageLength(content) {
  const length = content.length;
  const MAX_LENGTH = 2000;
  
  if (length > MAX_LENGTH) {
    console.warn(`⚠️  Message exceeds Discord limit: ${length}/${MAX_LENGTH} characters`);
    return false;
  }
  
  return true;
}

/**
 * Truncate players list if message is too long
 */
export function truncateIfNeeded(gameName, players, lastProcessedMessageId, maxLength = 1900) {
  let rendered = renderLeaderboard(gameName, players, lastProcessedMessageId);
  
  if (rendered.length <= maxLength) {
    return { content: rendered, truncated: false };
  }

  // Try reducing player count
  let playerCount = Math.floor(players.length / 2);
  
  while (playerCount > 0) {
    rendered = renderLeaderboard(
      gameName, 
      players.slice(0, playerCount), 
      lastProcessedMessageId,
      { maxPlayers: playerCount }
    );
    
    if (rendered.length <= maxLength) {
      return { content: rendered, truncated: true, shownCount: playerCount };
    }
    
    playerCount = Math.floor(playerCount / 2);
  }

  // Fallback: show at least top 3
  rendered = renderLeaderboard(gameName, players.slice(0, 3), lastProcessedMessageId);
  return { content: rendered, truncated: true, shownCount: 3 };
}

export default {
  renderLeaderboard,
  renderCompactLeaderboard,
  validateMessageLength,
  truncateIfNeeded
};
