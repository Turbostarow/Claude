/**
 * Storage Module - Message-as-Database
 * Encodes and decodes player data within Discord webhook messages
 */

const DATA_VERSION = 'v1';
const DATA_START_MARKER = `[DATA:${DATA_VERSION}]`;
const DATA_END_MARKER = '[/DATA]';

/**
 * Encode player data into storage format
 * Format: userID|username|currentRank|currentScore|peakRank|peakScore|lastUpdated
 */
function encodePlayerData(players) {
  return players.map(player => {
    return [
      player.userId,
      player.username || 'Unknown',
      player.currentRank,
      player.currentRankScore,
      player.peakRank,
      player.peakRankScore,
      player.lastUpdated
    ].join('|');
  }).join('\n');
}

/**
 * Decode player data from storage format
 */
function decodePlayerData(dataString) {
  if (!dataString || !dataString.trim()) {
    return [];
  }

  return dataString
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split('|');
      if (parts.length < 7) {
        console.warn('Invalid data line:', line);
        return null;
      }

      return {
        userId: parts[0],
        username: parts[1],
        currentRank: parts[2],
        currentRankScore: parseInt(parts[3], 10),
        peakRank: parts[4],
        peakRankScore: parseInt(parts[5], 10),
        lastUpdated: parts[6]
      };
    })
    .filter(player => player !== null);
}

/**
 * Encode complete state (last processed message ID + player data)
 */
export function encodeState(lastProcessedMessageId, players) {
  const lines = [
    DATA_START_MARKER,
    `LAST:${lastProcessedMessageId || 'none'}`,
    encodePlayerData(players),
    DATA_END_MARKER
  ];
  
  return lines.join('\n');
}

/**
 * Decode complete state from webhook message content
 */
export function decodeState(messageContent) {
  if (!messageContent) {
    return {
      lastProcessedMessageId: null,
      players: []
    };
  }

  // Find data section
  const startIdx = messageContent.indexOf(DATA_START_MARKER);
  const endIdx = messageContent.indexOf(DATA_END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    // No data section found - this is a new leaderboard
    return {
      lastProcessedMessageId: null,
      players: []
    };
  }

  // Extract data section
  const dataSection = messageContent.substring(
    startIdx + DATA_START_MARKER.length,
    endIdx
  ).trim();

  // Parse last processed message ID
  const lines = dataSection.split('\n');
  const lastLine = lines[0] || '';
  const lastMatch = lastLine.match(/^LAST:(.+)$/);
  const lastProcessedMessageId = lastMatch && lastMatch[1] !== 'none' ? lastMatch[1] : null;

  // Parse player data
  const playerDataString = lines.slice(1).join('\n');
  const players = decodePlayerData(playerDataString);

  return {
    lastProcessedMessageId,
    players
  };
}

/**
 * Update player in the players array
 * Returns updated players array
 */
export function upsertPlayer(players, newPlayerData) {
  const existingIndex = players.findIndex(p => p.userId === newPlayerData.userId);

  if (existingIndex >= 0) {
    // Check if new data is newer
    const existingDate = new Date(players[existingIndex].lastUpdated);
    const newDate = new Date(newPlayerData.lastUpdated);

    if (newDate < existingDate) {
      console.log(`Ignoring stale data for user ${newPlayerData.userId}`);
      return { players, updated: false };
    }

    // Update existing player
    players[existingIndex] = { ...newPlayerData };
    return { players, updated: true };
  } else {
    // Add new player
    players.push(newPlayerData);
    return { players, updated: true };
  }
}

/**
 * Sort players by ranking logic
 */
export function sortPlayers(players) {
  return [...players].sort((a, b) => {
    // Primary: Highest current score
    if (b.currentRankScore !== a.currentRankScore) {
      return b.currentRankScore - a.currentRankScore;
    }

    // Tiebreaker 1: Highest peak score
    if (b.peakRankScore !== a.peakRankScore) {
      return b.peakRankScore - a.peakRankScore;
    }

    // Tiebreaker 2: Most recent update
    const dateA = new Date(a.lastUpdated);
    const dateB = new Date(b.lastUpdated);
    return dateB - dateA;
  });
}

/**
 * Validate player data object
 */
export function validatePlayerData(player) {
  const required = ['userId', 'currentRank', 'currentRankScore', 'peakRank', 'peakRankScore', 'lastUpdated'];
  
  for (const field of required) {
    if (player[field] === undefined || player[field] === null) {
      return false;
    }
  }

  // Validate scores are positive integers
  if (player.currentRankScore < 0 || player.peakRankScore < 0) {
    return false;
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(player.lastUpdated)) {
    return false;
  }

  return true;
}

export default {
  encodeState,
  decodeState,
  upsertPlayer,
  sortPlayers,
  validatePlayerData
};
