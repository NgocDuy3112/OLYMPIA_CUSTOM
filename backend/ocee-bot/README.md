# OLYMPIA CUSTOM Discord Bots

Two Discord bots that integrate with the OLYMPIA CUSTOM quiz game via Valkey pub/sub.

## Architecture

```
FastAPI Backend
     ↓ (broadcasts events)
  Valkey pub/sub  (channel: {match_code})
     ↙              ↘
Music Bot          SFX Bot
(background music)  (sound effects)
```

## Bots

| Bot | Purpose | Audio |
|-----|---------|-------|
| **Music Bot** | Plays background music per game phase | Long tracks, loops |
| **SFX Bot** | Plays sound effects on events | Short clips (buzzer, timer, etc.) |

## Setup

### Prerequisites

- Python 3.12+
- Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))
- Valkey/Redis server running

### Install Dependencies

```bash
cd backend/ocee-bot
pip install -r requirements.txt
```

### Configure

```bash
cp .env.example .env
# Edit .env with your bot tokens and Valkey URL
```

### Run

```bash
# Music Bot
python music_bot.py

# SFX Bot (separate terminal)
python sfx_bot.py
```

## Audio Files

Place MP3 files in the corresponding directories:

```
audio/
├── music/              # Music Bot
│   ├── kdc.mp3         # Khởi Động Chung BGM
│   ├── kdr.mp3         # Khởi Động Riêng BGM
│   ├── bp.mp3          # Bứt Phá BGM
│   ├── vdc.mp3         # Về Đích Chung BGM
│   ├── vdr.mp3         # Về Đích Riêng BGM
│   └── gm.mp3          # Giải Mã BGM
└── sfx/                # SFX Bot
    ├── buzzer.mp3      # Buzzer press
    ├── correct.mp3     # Correct answer
    ├── wrong.mp3       # Wrong answer
    ├── timer_end.mp3   # Timer expired
    ├── winner.mp3      # Winner celebration
    ├── navigate.mp3    # Page navigation
    └── join.mp3        # Player joined
```

## Docker

```bash
# Build
docker build -t olympia-music-bot -f Dockerfile.music .
docker build -t olympia-sfx-bot -f Dockerfile.sfx .

# Run
docker run -d --env-file .env --network host olympia-music-bot
docker run -d --env-file .env --network host olympia-sfx-bot
```
