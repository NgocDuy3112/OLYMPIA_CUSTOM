FROM python:3.12-alpine

WORKDIR /app

# Copy requirements first for better caching
COPY backend/discord/requirements.txt .

# ffmpeg + libsodium are runtime deps — kept permanently.
# Build tools grouped under .build-deps so apk del cleans them all at once.
RUN apk add --no-cache ffmpeg libsodium \
    && apk add --no-cache --virtual .build-deps gcc musl-dev libffi-dev libsodium-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && apk del .build-deps

# Copy bot source code
COPY backend/discord/ .

# Copy assets (BGM, SFX) into image
COPY audios/ ./audios/
