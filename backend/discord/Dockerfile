FROM python:3.12-alpine

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/

WORKDIR /app

# Copy requirements first for better caching
COPY backend/discord/requirements.txt .

# ffmpeg + libsodium are runtime deps — kept permanently.
# Build tools grouped under .build-deps so apk del cleans them all at once.
RUN apk add --no-cache ffmpeg libsodium \
    && apk add --no-cache --virtual .build-deps gcc musl-dev libffi-dev libsodium-dev \
    && uv pip install --system --no-cache -r requirements.txt \
    && apk del .build-deps

# Copy bot source code
COPY backend/discord/ .

# Create audio directories for S3 sync
RUN mkdir -p /app/audios/bgm /app/audios/sfx /app/audios/ping
