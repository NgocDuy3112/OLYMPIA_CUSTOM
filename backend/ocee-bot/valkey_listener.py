"""Shared Valkey pub/sub helpers for Discord bots."""

import valkey
import configs


def get_valkey_client() -> valkey.Valkey:
    """Create a Valkey (Redis-compatible) client."""
    return valkey.Valkey(
        host=configs.VALKEY_HOST,
        port=configs.VALKEY_PORT,
        password=configs.VALKEY_PASSWORD,
        db=configs.VALKEY_DB,
        decode_responses=True,
    )


def subscribe_to_match_channels(valkey_client: valkey.Valkey, match_code: str):
    """Subscribe to a match channel and yield messages.

    Yields:
        dict: Parsed JSON message from the channel.
    """
    import json
    import logging

    logger = logging.getLogger(__name__)
    pubsub = valkey_client.pubsub()
    pubsub.subscribe(match_code)
    logger.info(f"Subscribed to channel '{match_code}'")

    try:
        for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    yield json.loads(message["data"])
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON on channel {match_code}: {message['data']}")
    finally:
        pubsub.unsubscribe(match_code)
        pubsub.close()
        logger.info(f"Unsubscribed from channel '{match_code}'")
