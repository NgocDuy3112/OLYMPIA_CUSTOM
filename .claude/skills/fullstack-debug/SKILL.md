---
name: fullstack-debug
description: Debug fullstack issues in OLYMPIA CUSTOM 3 — backend API, frontend routes, WebSocket events, Discord bots, S3 audio. Use when investigating bugs, tracing event flows, checking container health, or mapping a broken feature across layers.
---

# Fullstack Debug — OLYMPIA CUSTOM 3

> **QUAN TRỌNG — MỌI LỆNH ĐỀU CHẠY QUA PODMAN.**
> Không dùng `docker` hay `docker-compose`. Project dùng `podman` và `podman-compose`.
> Containers đang chạy với prefix `olympia-*`.

---

## Kiểm tra nhanh hệ thống

```bash
# Xem tất cả containers đang chạy
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Health check backend (từ IP nội bộ container)
APP_IP=$(podman inspect olympia-app --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
curl -s http://${APP_IP}:8000/health

# Xem log realtime của từng service
podman logs -f olympia-app       # FastAPI backend
podman logs -f olympia-frontend  # Nginx + React build
podman logs -f olympia-nginx     # Reverse proxy
podman logs -f olympia-bgm-bot   # Discord BGM bot
podman logs -f olympia-sfx-bot   # Discord SFX bot

# Xem N dòng log gần nhất
podman logs --tail 50 olympia-app
```

---

## Deploy / Rebuild

```bash
cd /root/OLYMPIA_CUSTOM

# Deploy bình thường (build + up)
./scripts/deploy.sh        # podman-compose up -d --build --no-cache

# Rebuild hoàn toàn (down + prune + up)
./scripts/rebuild.sh

# Tắt
./scripts/shutdown.sh

# Tắt + xóa volumes (CẨN THẬN: mất dữ liệu)
./scripts/destroy.sh
```

---

## References

| Tài liệu | Đường dẫn |
|----------|-----------|
| Backend API tổng quan | [docs/backend/README.md](../../../docs/backend/README.md) |
| Matches API | [docs/backend/matches.md](../../../docs/backend/matches.md) |
| Questions API | [docs/backend/questions.md](../../../docs/backend/questions.md) |
| Answers API | [docs/backend/answers.md](../../../docs/backend/answers.md) |
| Records API | [docs/backend/records.md](../../../docs/backend/records.md) |
| Scoreboard API | [docs/backend/scoreboard.md](../../../docs/backend/scoreboard.md) |
| Qualifier API | [docs/backend/qualifier.md](../../../docs/backend/qualifier.md) |
| Media API | [docs/backend/media.md](../../../docs/backend/media.md) |
| Auth API | [docs/backend/auth.md](../../../docs/backend/auth.md) |
| WebSocket API (backend) | [docs/backend/websocket.md](../../../docs/backend/websocket.md) |
| WebSocket events (full ref) | [docs/websocket_events.md](../../../docs/websocket_events.md) |
| S3 audio files | [docs/s3_audio_files.md](../../../docs/s3_audio_files.md) |
| PostgreSQL schema | [docs/data-schemas/postgresql.md](../../../docs/data-schemas/postgresql.md) |
| Valkey schema | [docs/data-schemas/valkey.md](../../../docs/data-schemas/valkey.md) |
| Frontend architecture | [docs/frontend/ARCHITECTURE.md](../../../docs/frontend/ARCHITECTURE.md) |
| Frontend components | [docs/frontend/COMPONENTS.md](../../../docs/frontend/COMPONENTS.md) |

---

## Map: Backend ↔ Frontend ↔ WebSocket Events

Dùng bảng này khi truy vết một bug qua các layer.

### Khởi Động Chung (kdc)

| Layer | File |
|-------|------|
| Admin UI | `frontend/src/pages/admin/AKhoiDongChungPage.tsx` |
| Player UI | `frontend/src/pages/player/PKhoiDongChungPage.tsx` |
| MC UI | `frontend/src/pages/mc/MKhoiDongChungPage.tsx` |
| Backend route | `backend/app/routes/answer.py`, `backend/app/routes/record.py` |
| WS events (Admin → Server) | `send_question`, `clear_question`, `start_the_timer`, `send_players_info`, `send_answers_to_players`, `clear_answers`, `navigate` |
| WS events (Player → Server) | `player_online`, `player_heartbeat`, `answer` |
| BGM trigger | `navigate` → `kdc` intro; `start_the_timer` → `kdc_60s.mp3` |
| SFX triggers | `kd_bat_dau.ogg`, `kd_dung.mp3`, `kd_hien_tra_loi.ogg`, `kd_sai.ogg`, `kd_ket_thuc.ogg` |

### Khởi Động Cá Nhân (kdr)

| Layer | File |
|-------|------|
| Admin UI | `frontend/src/pages/admin/AKhoiDongRiengPage.tsx` |
| Player UI | `frontend/src/pages/player/PKhoiDongRiengPage.tsx` |
| MC UI | `frontend/src/pages/mc/MKhoiDongRiengPage.tsx` |
| Backend route | `backend/app/routes/answer.py`, `backend/app/routes/record.py` |
| WS events (Admin → Server) | `send_question`, `clear_question`, `start_the_timer`, `send_players_info`, `clear_answers`, `navigate` |
| WS events (Player → Server) | `player_online`, `player_heartbeat`, `answer` |
| BGM trigger | `navigate` → `kdr` intro; `start_the_timer` → `kdr_30s.mp3` |
| SFX triggers | `kd_bat_dau.ogg`, `kd_dung.mp3`, `kd_hien_tra_loi.ogg`, `kd_sai.ogg`, `kd_ket_thuc.ogg` |

### Bứt Phá (bp)

| Layer | File |
|-------|------|
| Admin UI | `frontend/src/pages/admin/AButPhaPage.tsx` |
| Player UI | `frontend/src/pages/player/PButPhaPage.tsx` |
| MC UI | `frontend/src/pages/mc/MButPhaPage.tsx` |
| Backend route | `backend/app/routes/answer.py`, `backend/app/routes/record.py` |
| WS events (Admin → Server) | `send_question`, `clear_question`, `start_the_timer`, `send_players_info`, `send_answers_to_players`, `clear_answers`, `navigate` |
| WS events (Player → Server) | `player_online`, `player_heartbeat`, `answer` |
| BGM trigger | `navigate` → `bp` intro; `start_the_timer` → `bp_30s.ogg` |
| SFX triggers | `bp_dung.mp3`, `bp_hien_tra_loi.ogg` |

### Về Đích Chung (vdc)

| Layer | File |
|-------|------|
| Admin UI — pick | `frontend/src/pages/admin/AVeDichPickQuestionPage.tsx` |
| Admin UI — gameplay | `frontend/src/pages/admin/AVeDichChungPage.tsx` |
| Player UI — pick | `frontend/src/pages/player/PVeDichPickPage.tsx` |
| Player UI — gameplay | `frontend/src/pages/player/PVeDichChungPage.tsx` |
| MC UI — pick | `frontend/src/pages/mc/MVeDichPickPage.tsx` |
| MC UI — gameplay | `frontend/src/pages/mc/MVeDichChungPage.tsx` |
| Backend route | `backend/app/routes/answer.py`, `backend/app/routes/record.py`, `backend/app/routes/scoreboard.py` |
| WS events (Admin → Server) | `veDich_questions_meta`, `veDich_question_state`, `veDich_selection_update`, `veDich_questions_selected`, `send_question`, `start_the_timer`, `send_players_info`, `navigate` |
| WS events (Player → Server) | `player_online`, `player_heartbeat`, `answer` |
| BGM trigger | `navigate` → `vdc` intro; `start_the_timer` → `vd_{N}s.*` (prefix `vd`, không phải `vdc`) |
| SFX triggers | `vd_dung.ogg`, `vd_hien_tra_loi.ogg`, `vd_sai.ogg`, `vd_nshv.mp3` (sao), `vd_bhmt.ogg` (khiên) |

> **Gotcha BGM**: Timer file dùng prefix `vd_` chứ không phải `vdc_`. Ví dụ: `vd_30s.mp3`, không phải `vdc_30s.mp3`.

### Về Đích Cá Nhân (vdr)

| Layer | File |
|-------|------|
| Admin UI — pick | `frontend/src/pages/admin/AVeDichPickQuestionPage.tsx` |
| Admin UI — gameplay | `frontend/src/pages/admin/AVeDichRiengPage.tsx` |
| Player UI — pick | `frontend/src/pages/player/PVeDichPickPage.tsx` |
| Player UI — gameplay | `frontend/src/pages/player/PVeDichRiengPage.tsx` |
| MC UI | `frontend/src/pages/mc/MVeDichRiengPage.tsx` |
| Backend route | `backend/app/routes/answer.py`, `backend/app/routes/record.py`, `backend/app/routes/scoreboard.py` |
| WS events (Admin → Server) | `veDich_rieng_questions_meta`, `veDich_question_state`, `answering_window_activated`, `buzzer_winner`, `blocked_buzz`, `send_players_info`, `navigate` |
| WS events (Player → Server) | `player_online`, `player_heartbeat`, `buzz` |
| BGM trigger | `navigate` → `vdr` intro; `start_the_timer` → `vd_{N}s.*` |
| SFX triggers | `vd_dung.ogg`, `vd_hien_tra_loi.ogg`, `vd_sai.ogg`, power-up: `vd_nshv.mp3` / `vd_bhmt.ogg` |
| Power-up WS event | `veDich_power_activated` → `{ power: "nshv" | "bhmt" | null }` |

### Giải Mã (gm)

| Layer | File |
|-------|------|
| Admin UI | `frontend/src/pages/admin/AGiaiMaPage.tsx` |
| Player UI | `frontend/src/pages/player/PGiaiMaPage.tsx` |
| MC UI | `frontend/src/pages/mc/MGiaiMaPage.tsx` |
| Backend route | `backend/app/routes/answer.py`, `backend/app/routes/question.py` |
| WS events (Admin → Server) | `send_question`, `start_the_timer`, `send_players_info`, `send_answers_to_players`, `keyword_locked`, `reveal_keyword_answer`, `send_keyword_answers`, `navigate` |
| WS events (Player → Server) | `player_online`, `player_heartbeat`, `answer`, `keyword_submit` |
| BGM trigger | `navigate` → `gm` intro; `start_the_timer` → `gm_15s.ogg` |
| SFX triggers | `gm_bat_dau.ogg`, `gm_chon_goi_y.ogg`, `gm_dung.mp3`, `gm_dung_tu_khoa.mp3`, `gm_hien_tra_loi.ogg`, `gm_ket_thuc.mp3` |
| Keyword question code | `OC3_Q_GM_KEY` (answer field chứa đáp án từ khoá) |

> **Gotcha Giải Mã**: `keyword_submit` chỉ được gửi một lần; có confirmation dialog ở frontend. Keyword answer nằm trong question record `OC3_Q_GM_KEY`, không phải record thường.

### Vòng Loại (vl)

> Xem [docs/backend/qualifier.md](../../../docs/backend/qualifier.md). **Không debug chung với các round khác** — qualifier có isolated route, DB schema và API riêng.

| Layer | File |
|-------|------|
| Admin UI | `frontend/src/pages/admin/AQualifierPage.tsx` |
| Player UI | `frontend/src/pages/player/PQualifierPage.tsx` |
| MC UI | `frontend/src/pages/mc/MQualifierPage.tsx` |
| Backend route | `backend/app/routes/qualifier.py` |
| WS events (Admin → Server) | `send_question`, `start_the_timer`, `send_answers_to_players`, `sync_qualifier_round`, `navigate` |
| WS events (Player → Server) | `player_online`, `answer`, `request_qualifier_state` |
| WS events (Server → Client) | `qualifier_scores_updated`, `qualifier_advancement`, `qualifier_state` |
| Match code cố định | `OC3_M_VL` (hardcoded trong `PlayerRoutes.tsx` và `AdminRoutes.tsx`) |

---

## Map: REST API → Frontend page sử dụng

| Endpoint | Trang gọi |
|----------|-----------|
| `POST /answers/` | Tất cả player round pages |
| `GET /answers/` | Admin round pages (xem đáp án cache) |
| `POST /records/` | Admin round pages (sau khi chấm điểm) |
| `GET /scoreboard/{code}` | Admin + MC pages (hiển thị bảng điểm) |
| `PATCH /scoreboard/adjust` | `AGameManagingPage.tsx` |
| `GET /matches/{code}/room` | `PWaitingPage.tsx`, `MWaitingPage.tsx`, `AWaitingPage.tsx` |
| `GET /matches/{code}/players` | `AWaitingPage.tsx`, admin round pages |
| `PATCH /matches/{code}/finish` | Admin sau khi kết thúc trận |
| `GET /questions/` | Admin round pages (lấy câu hỏi hiện tại) |
| `POST /questions/excel/` | `AGameManagingPage.tsx` |
| `POST /questions/zip/` | `AGameManagingPage.tsx` |
| `GET /media/` | Player/MC pages (load ảnh/video câu hỏi từ S3) |
| `GET /media/drive/` | Trang nào dùng Google Drive media |
| `POST /qualifier/calculate-scores` | `AQualifierPage.tsx` |
| `POST /qualifier/end-round` | `AQualifierPage.tsx` |

---

## Debug WebSocket

```bash
# Kết nối thử WebSocket đến một room (cần wscat)
# npx wscat -c "ws://<APP_IP>:8000/ws/OC3_M001?token=<JWT>"

# Xem log WS realtime trong backend
podman logs -f olympia-app 2>&1 | grep -E "(websocket|WS|broadcast|publish)"

# Xem Valkey pub/sub
VALKEY_IP=$(podman inspect olympia-valkey --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
podman exec olympia-valkey valkey-cli -h ${VALKEY_IP} SUBSCRIBE OC3_M001
```

**Luồng message chuẩn**:
```
Frontend gửi → FastAPI nhận → publish lên Valkey channel {match_code}
                             → broadcast tới tất cả WS clients trong room
                             → BGM bot nhận từ Valkey → play nhạc
                             → SFX bot nhận từ Valkey → play sound effect
```

**Role filtering tại backend** (`main.py`):
- `admin`: nhận tất cả message types
- `mc`: chỉ nhận `_MC_ALLOWED_TYPES`
- `player`: chỉ nhận `_PLAYER_ALLOWED_TYPES`

---

## Debug Database & Valkey

```bash
# PostgreSQL — kết nối vào DB
podman exec -it olympia-postgresql psql -U $POSTGRES_USER -d $POSTGRES_DB

# Valkey — kiểm tra leaderboard
VALKEY_IP=$(podman inspect olympia-valkey --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
podman exec olympia-valkey valkey-cli -h ${VALKEY_IP} ZRANGE leaderboard:OC3_M001 0 -1 WITHSCORES

# Xem answer cache
podman exec olympia-valkey valkey-cli -h ${VALKEY_IP} GET "answer:OC3_M001:OC_U001:OC3_Q001"
```

---

## Debug Discord Bots

```bash
# Xem log bot (lỗi S3, lỗi Valkey, lỗi Discord voice)
podman logs --tail 100 olympia-bgm-bot
podman logs --tail 100 olympia-sfx-bot

# S3 audio files — kiểm tra đã sync chưa
podman exec olympia-bgm-bot ls /app/audios/bgm/
podman exec olympia-sfx-bot ls /app/audios/sfx/
```

**BGM file naming rule**:
- Phase intro: xem `PHASE_MUSIC_MAP` trong `bgm_bot.py`
- Timer: `{phase}_{time_limit}s.*` — nhưng `vdc`/`vdr` dùng prefix `vd` (ví dụ: `vd_30s.mp3`)

**SFX priority**: `PHASE_EVENT_SFX_MAP[phase][event]` > `EVENT_SFX_MAP[event]`

---

## Gotchas thường gặp

| Triệu chứng | Nguyên nhân hay gặp |
|-------------|---------------------|
| Bot không play nhạc timer | File `vdc_30s.mp3` không tồn tại — phải dùng `vd_30s.mp3` |
| Player không nhận WS message | Message type bị lọc bởi `_PLAYER_ALLOWED_TYPES` trong `main.py` |
| Bảng điểm không cập nhật | Valkey ZSET `leaderboard:{code}` chưa được seed; `POST /records/` chưa gọi |
| WebSocket 403 | JWT expired hoặc `?token=` không có trong URL kết nối |
| `keyword_submit` gửi 2 lần | Frontend không block re-submit — kiểm tra confirmation dialog trong `PGiaiMaPage.tsx` |
| Qualifier không hiện kết quả | Match code phải là `OC3_M_VL`, không phải match code trận bình thường |
| S3 media không load | Dùng `GET /media/?key=...` hoặc `GET /media/presign/`, không link thẳng S3 URL |
| Podman exec lỗi `curl not found` | `curl` không có trong container — gọi từ host qua IP nội bộ container |
