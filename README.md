# Discord Leaderboard System (Stateless)

A **database-free** Discord leaderboard system where the webhook message itself serves as the storage. No PostgreSQL, no SQLite—just pure Discord message-based persistence.

## 🌟 Key Features

- **🚫 No Database Required**: Webhook messages store all player data
- **🔄 Stateless Architecture**: No external dependencies beyond Discord
- **🎮 Multi-Game Support**: Track multiple games simultaneously
- **⚡ GitHub Actions**: Automated syncing every 15 minutes
- **📱 Mobile-Optimized**: Clean, readable Discord formatting
- **🔒 Secure**: Environment-based secrets, input sanitization

## 📋 How It Works

### Traditional Approach (Database)
```
Discord Messages → Parser → Database → Renderer → Webhook Display
                            ↑
                     State stored here
```

### Our Approach (Stateless)
```
Discord Messages → Parser → Webhook Message (Storage + Display)
                            ↑
                     State stored here!
```

### Message Format

The leaderboard message contains:

1. **Visible Section** (for humans):
```
🏆 VALORANT LEADERBOARD

🥇 @Turbo  
   Current: 💎 Diamond — 2,450  
   Peak: 👑 Master — 2,610  
   Last Update: 2026-02-14  
```

2. **Data Section** (for the bot):
```
[DATA:v1]
LAST:1234567890
123456789|Turbo|Diamond|2450|Master|2610|2026-02-14
987654321|Alpha|Platinum|1980|Diamond|2100|2026-02-10
[/DATA]
```

The bot parses the data section to know:
- Which message was last processed
- Current state of all players

## 🚀 Quick Start

### 1. Install Node.js (WSL/Linux)

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should be v18.x.x+
```

### 2. Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
```

### 3. Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Create New Application → Add Bot
3. Enable **"Message Content Intent"** ✅
4. Copy bot token
5. Invite bot to server with:
   - Read Messages
   - Read Message History

### 4. Create Webhook

1. In Discord channel settings
2. Integrations → Webhooks → New Webhook
3. Copy webhook URL

### 5. Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in:
```env
DISCORD_BOT_TOKEN=your_bot_token_here
GAME_VALORANT_CHANNEL_ID=1234567890123456789
GAME_VALORANT_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

### 6. Test Locally

Post a test message in Discord:
```
LB_UPDATE: @YourName Diamond 2450 Master 2610 2026-02-14
```

Run sync:
```bash
npm run sync
```

Check Discord—you should see a leaderboard message!

### 7. Save Message ID (Important!)

After first sync, you'll see:
```
💡 Add this to .env: GAME_VALORANT_MESSAGE_ID=9876543210
```

Add that line to your `.env` file so the bot knows which message to update.

## 📝 Message Format

```
LB_UPDATE: @username <Current_rank> <Current_rank_score> <Peak_rank> <Peak_rank_score> <Last_Updated>
```

**Example:**
```
LB_UPDATE: @Turbo Diamond 2450 Master 2610 2026-02-14
```

**Field Definitions:**
- `@username` - Discord mention (bot extracts user ID)
- `Current_rank` - Rank title (Diamond, Master, etc.)
- `Current_rank_score` - Current MMR/score
- `Peak_rank` - Historical best rank
- `Peak_rank_score` - Historical best score
- `Last_Updated` - Date in YYYY-MM-DD format

## 🤖 GitHub Actions Setup

### 1. Push to GitHub

```bash
git add .
git commit -m "Add stateless leaderboard system"
git push origin main
```

### 2. Configure Secrets

Go to: Repository → Settings → Secrets → Actions

Add secrets:
- `DISCORD_BOT_TOKEN`
- `GAME_VALORANT_CHANNEL_ID`
- `GAME_VALORANT_WEBHOOK_URL`
- `GAME_VALORANT_MESSAGE_ID` (after first sync)

### 3. Enable Actions

The workflow runs automatically every 15 minutes!

## 🎮 Adding Multiple Games

Just add more environment variables:

```env
# Game 1: VALORANT
GAME_VALORANT_CHANNEL_ID=...
GAME_VALORANT_WEBHOOK_URL=...
GAME_VALORANT_MESSAGE_ID=...

# Game 2: League of Legends
GAME_LOL_CHANNEL_ID=...
GAME_LOL_WEBHOOK_URL=...
GAME_LOL_MESSAGE_ID=...
```

Each game gets its own channel and leaderboard!

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   Discord Channel (Input)           │
│   User posts: LB_UPDATE: @user ...  │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   GitHub Actions (Every 15 min)     │
│   1. Fetch webhook message (state)  │
│   2. Parse embedded player data     │
│   3. Fetch new Discord messages     │
│   4. Merge & sort players           │
│   5. Render leaderboard + data      │
│   6. Update webhook message         │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   Webhook Message (Storage)         │
│   ┌───────────────────────────────┐ │
│   │ Human-readable leaderboard    │ │
│   ├───────────────────────────────┤ │
│   │ Machine-readable data section │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 💡 Benefits vs Database Approach

| Feature | Stateless (This) | Database |
|---------|------------------|----------|
| Setup complexity | ✅ Low | ⚠️ Medium |
| Dependencies | ✅ None | ⚠️ PostgreSQL/SQLite |
| Hosting cost | ✅ Free | ⚠️ DB hosting costs |
| Data persistence | ✅ In Discord | ✅ In database |
| Message limit | ⚠️ 2000 chars | ✅ Unlimited |
| Query complexity | ⚠️ Parse message | ✅ SQL queries |
| Best for | <100 players | 100+ players |

## 📊 Sorting Logic

Players ranked by:
1. **Primary**: Highest `current_rank_score`
2. **Tiebreaker 1**: Highest `peak_rank_score`
3. **Tiebreaker 2**: Most recent `last_updated`

## 🔐 Security

- ✅ Environment-based secrets (never committed)
- ✅ Input sanitization (SQL injection prevention)
- ✅ Rate limiting (respects Discord API limits)
- ✅ Validation (rejects malformed messages)

## 🐛 Troubleshooting

### Bot can't see messages
- Enable "Message Content Intent" in Discord Developer Portal
- Check bot has "Read Messages" permission

### Webhook fails
- Verify webhook URL is correct
- Check webhook still exists in Discord

### Message too long error
The system automatically truncates if >2000 characters. Limits:
- ~50 players with full formatting
- ~100 players with compact formatting

### Sync finds no new messages
- Verify `GAME_*_MESSAGE_ID` is set correctly
- Check messages start with `LB_UPDATE:`
- Ensure bot can access channel

## 📈 Scaling Considerations

**Current Capacity:**
- ~50-100 players per game before hitting message limits
- Multiple games supported (each has own message)

**If You Need More:**
1. Switch to database version (see other implementation)
2. Use multiple channels per game (e.g., top 50, next 50)
3. Create paginated leaderboards

## 🔄 Update Flow

```
User posts LB_UPDATE message
    ↓
Bot reads webhook message (gets current state)
    ↓
Bot fetches new Discord messages
    ↓
Bot merges new data with existing
    ↓
Bot sorts and renders leaderboard
    ↓
Bot updates webhook message (saves new state)
```

## 🧪 Testing

```bash
# Local development
npm run dev

# Single sync
npm run sync

# Check for errors
npm run sync 2>&1 | tee sync.log
```

## 📄 Project Structure

```
.
├── .github/
│   └── workflows/
│       └── sync.yml          # GitHub Actions automation
├── src/
│   ├── discord.js            # Discord API integration
│   ├── parser.js             # LB_UPDATE message parsing
│   ├── renderer.js           # Leaderboard formatting
│   ├── storage.js            # Message encode/decode
│   └── sync.js               # Main orchestration
├── .env.example              # Environment template
├── .gitignore                # Git exclusions
├── package.json              # Dependencies
└── README.md                 # This file
```

## 🎯 Commands

```bash
# Install dependencies
npm install

# Run sync
npm run sync

# Development (auto-reload)
npm run dev
```

## 💬 Example Output

After running sync, Discord shows:

```
🏆 VALORANT LEADERBOARD

🥇 @Turbo  
   Current: 💎 Diamond — 2,450  
   Peak: 👑 Master — 2,610  
   Last Update: 2026-02-14  

🥈 @Alpha  
   Current: 🔵 Platinum — 1,980  
   Peak: 💎 Diamond — 2,100  
   Last Update: 2026-02-13  

━━━━━━━━━━━━━━━━━━
📊 Total Players: 2
Updated: 2026-02-14 18:00 UTC

[DATA:v1]
LAST:1234567890
123456789|Turbo|Diamond|2450|Master|2610|2026-02-14
987654321|Alpha|Platinum|1980|Diamond|2100|2026-02-13
[/DATA]
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

## 📧 Support

- Check this README first
- Review error messages in sync logs
- Test locally before deploying

---

**Built with ❤️ for competitive gaming communities**

No databases, no complications—just Discord! 🚀
