## Multi-stage build to produce a smaller runtime image
FROM python:3.12-alpine AS builder

# Install build dependencies for compiling wheels
RUN apk add --no-cache build-base libffi-dev openssl-dev libsodium-dev

WORKDIR /wheels

# Copy requirements and build wheels in a dedicated layer
COPY backend/ocee-bot/requirements.txt ./
RUN pip wheel --no-cache-dir --wheel-dir=/wheels -r requirements.txt


FROM python:3.12-alpine

# Runtime dependencies (ffmpeg for audio playback)
RUN apk add --no-cache ffmpeg libstdc++ libsodium

WORKDIR /app

# Copy prebuilt wheels from builder and install without compiling
COPY --from=builder /wheels /wheels
COPY backend/ocee-bot/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt

# Copy bot source and audio assets
COPY backend/ocee-bot/ /app
COPY audios/ /app/audios/

# Create a non-root user for safer runtime
RUN addgroup -S app && adduser -S app -G app
USER app

# Default command — run the BGM bot by default; docker-compose can override per-service
CMD ["python", "bgm_bot.py"]
