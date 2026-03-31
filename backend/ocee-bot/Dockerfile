FROM python:3.12-alpine

# Install FFmpeg for audio playback (required by discord.py)
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default command — overridden by docker-compose per service
CMD ["python", "music_bot.py"]
