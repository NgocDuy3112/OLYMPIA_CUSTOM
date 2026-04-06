FROM python:3.12-alpine

# Install FFmpeg for audio playback (required by discord.py)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy requirements first for better caching
COPY backend/ocee-bot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot source code
COPY backend/ocee-bot/ .

# Copy assets (BGM, SFX) into image
COPY assets/ ./assets/

# Default command — overridden by docker-compose per service
CMD ["python", "music_bot.py"]
