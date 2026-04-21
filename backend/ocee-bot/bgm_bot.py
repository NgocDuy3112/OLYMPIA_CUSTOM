import discord
import asyncio
import json
import logging
from valkey.asyncio import Valkey
from configs import BGM_BOT_TOKEN, VOICE_CHANNEL_ID, VALKEY_HOST, VALKEY_PORT, VALKEY_PASSWORD, MATCH_CODE, BGM_FILES


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BGM_Bot")


class BGMBot(discord.Client):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.voice_client = None

    async def on_ready(self):
        logger.info(f"BGM Bot connected as {self.user}")
        
        # Join voice channel on startup
        channel = self.get_channel(VOICE_CHANNEL_ID)
        if channel:
            self.voice_client = await channel.connect()
            logger.info(f"Joined voice channel: {channel.name}")
        else:
            logger.error("Could not find voice channel!")

        # Start Valkey listener in background
        asyncio.create_task(self.listen_valkey())

    async def listen_valkey(self):
        try:
            # Create valkey client from host/port/password configuration
            vk = Valkey(host=VALKEY_HOST, port=VALKEY_PORT, password=VALKEY_PASSWORD, decode_responses=True)
            pubsub = vk.pubsub()
            await pubsub.subscribe(MATCH_CODE)
            logger.info(f"Subscribed to Valkey channel: {MATCH_CODE}")

            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await self.handle_event(data)
                    except Exception as e:
                        logger.error(f"Error parsing Valkey message: {e}")
            await vk.aclose()
        except Exception as e:
            logger.exception(f"Valkey listener crashed: {e}")

    async def handle_event(self, data: dict):
        event_type = data.get("type")
        
        if event_type == "start_the_timer":
            time_limit = data.get("time_limit", 30)
            # support 10s qualifier timer (VL), 15s, 30s defaults
            if time_limit == 10:
                key = "timer_10"
            elif time_limit == 15:
                key = "timer_15"
            else:
                key = "timer_30"
            logger.info(f"Playing timer {time_limit}s -> key={key}")
            fp = BGM_FILES.get(key)
            if fp:
                self.play_audio(fp)
            else:
                logger.debug(f"No BGM file configured for key {key}")

        elif event_type == "send_question":
            # Only play decoding BGM if it's the decoding round (logic can be expanded)
            # For now, we check if it's a specific round or just a flag
            if "decoding" in data.get("round_name", "").lower():
                logger.info("Playing decoding BGM")
                self.play_audio(BGM_FILES["decoding"])

        elif event_type == "clear_question":
            logger.info("Stopping all BGM")
            self.stop_audio()

        elif event_type == "qualifier_scores_updated":
            # Play celebratory / reaction BGM depending on result
            try:
                correct = int(data.get("correct_count", 0) or 0)
                wrong = int(data.get("wrong_count", 0) or 0)
            except Exception:
                correct = data.get("correct_count", 0) or 0
                wrong = data.get("wrong_count", 0) or 0

            if correct > wrong:
                key = "applause"
            elif wrong > correct:
                key = "boo"
            else:
                key = "neutral"

            logger.info(f"Qualifier scores updated: correct={correct}, wrong={wrong}, playing bgm key={key}")
            try:
                fp = BGM_FILES.get(key)
                if fp:
                    self.play_audio(fp)
                else:
                    logger.debug(f"No BGM file configured for key={key}")
            except Exception:
                logger.exception("Failed to play BGM for qualifier_scores_updated")

    def play_audio(self, file_path):
        if not self.voice_client:
            return
        
        if self.voice_client.is_playing():
            self.voice_client.stop()
            
        if file_path.exists():
            self.voice_client.play(discord.FFmpegPCMAudio(str(file_path)))
        else:
            logger.warning(f"Audio file not found: {file_path}")

    def stop_audio(self):
        if self.voice_client and self.voice_client.is_playing():
            self.voice_client.stop()


if __name__ == "__main__":
    intents = discord.Intents.default()
    client = BGMBot(intents=intents)
    client.run(BGM_BOT_TOKEN)
