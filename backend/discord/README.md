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

### Run with Podman (recommended for development)

If you use Podman / podman-compose to manage containers, the repository's top-level `docker-compose.yaml` defines `bgm-bot` and `sfx-bot` services. Start only the bots with:

```bash
podman-compose -f docker-compose.yaml -p olympia-custom --profile development --env-file ./configs/.env up -d bgm-bot sfx-bot
```

To rebuild the bot images and recreate the services:

```bash
podman-compose -f docker-compose.yaml -p olympia-custom build bgm-bot sfx-bot
podman-compose -f docker-compose.yaml -p olympia-custom up -d bgm-bot sfx-bot
```

View logs:

```bash
podman logs bgm-bot -f
podman logs sfx-bot -f
```

If you prefer to build/run a single bot container manually:

```bash
podman build -f backend/ocee-bot/Dockerfile -t bgm-bot ./
podman run -d --env-file configs/.env --name bgm-bot --network olympia-custom-network bgm-bot
```

## Audio Files

Place MP3/OGG/WAV files in the corresponding directories:

```
audios/
├── bgm/                      # Music Bot
│   ├── kdc.mp3               # Khởi Động Chung – phase BGM
│   ├── kdc_30s.mp3           # Khởi Động Chung – timer 30s
│   ├── kdc_60s.mp3           # Khởi Động Chung – timer 60s
│   ├── kdr.mp3               # Khởi Động CÁ NHÂN – phase BGM
│   ├── kdr_40s.mp3           # Khởi Động CÁ NHÂN – timer 40s
│   ├── kdr_60s.mp3           # Khởi Động CÁ NHÂN – timer 60s
│   ├── bp.mp3                # Bứt Phá – phase BGM
│   ├── bp_30s.mp3            # Bứt Phá – timer 30s
│   ├── vdc.mp3               # Về Đích Chung – phase BGM
│   ├── vdc_15s.mp3           # Về Đích Chung – timer 15s
│   ├── vdc_20s.mp3           # ...
│   ├── vdc_30s.mp3
│   ├── vdc_45s.mp3
│   ├── vdr.mp3               # Về Đích CÁ NHÂN – phase BGM
│   ├── vdr_15s.mp3 ...       # (tương tự vdc)
│   ├── gm.mp3                # Giải Mã – phase BGM
│   ├── gm_15s.mp3            # Giải Mã – timer 15s
│   ├── vl.mp3                # Vòng Loại – phase BGM
│   └── vl_10s.mp3            # Vòng Loại – timer 10s
└── sfx/                      # SFX Bot
    ├── buzzer.mp3             # Buzzer press
    ├── correct.mp3            # Correct answer
    ├── wrong.mp3              # Wrong answer
    ├── timer_end.mp3          # Timer expired
    ├── winner.mp3             # Winner celebration
    ├── navigate.mp3           # Page navigation
    ├── join.mp3               # Player joined
    ├── GM_mo_dap_an.mp3       # Giải Mã – reveal answers SFX (overrides generic)
    └── BP_mo_dap_an.mp3       # Bứt Phá  – reveal answers SFX (overrides generic)
```

### Naming Convention – Timer BGM

Timer BGM được tìm tự động theo pattern **`{phase}_{duration}s`**. Ví dụ:
- Phase `vdc`, timer 30 giây → file `vdc_30s.mp3`
- Phase `gm`, timer 15 giây → file `gm_15s.mp3`

Không cần hardcode mapping trong code. Chỉ cần đặt file đúng tên là bot tự nhận.

> **Lưu ý**: Nếu hai phase dùng chung file timer (ví dụ kdc và kdr cùng dùng nhạc giống nhau), cần đặt hai bản copy CÁ NHÂN: `kdc_60s.mp3` và `kdr_40s.mp3`.

**SFX Bot – event SFX** (`PHASE_EVENT_SFX_MAP`):

| Phase | Event | File |
|-------|-------|------|
| `gm` | `send_answers_to_players` | `GM_mo_dap_an` |
| `bp` | `send_answers_to_players` | `BP_mo_dap_an` |

The SFX Bot tracks the current phase by listening for `navigate` events on the Valkey channel and parsing the `/player/<phase>` path.

## Docker

```bash
# Build
docker build -t olympia-music-bot -f Dockerfile.music .
docker build -t olympia-sfx-bot -f Dockerfile.sfx .

# Run
docker run -d --env-file .env --network host olympia-music-bot
docker run -d --env-file .env --network host olympia-sfx-bot
```
