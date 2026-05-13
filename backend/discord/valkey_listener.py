"""Shared Valkey pub/sub helpers for Discord bots."""

import valkey
import configs


def get_valkey_client() -> valkey.Valkey:
    """Create a Valkey (Redis-compatible) client."""
    return valkey.Valkey(
        host=configs.VALKEY_HOST,
        port=configs.VALKEY_PORT,
        username=configs.VALKEY_USER,
        password=configs.VALKEY_PASSWORD,
        db=configs.VALKEY_DB,
        decode_responses=True,
    )


def subscribe_to_match_channels(valkey_client: valkey.Valkey, match_code: str):
    """Subscribe to a match channel (or pattern) and yield messages.

    If match_code contains '*' or '?', uses psubscribe (pattern matching).
    Otherwise uses exact subscribe.

    Yields:
        dict: Parsed JSON message from the channel.
    """
    import json
    import logging

    logger = logging.getLogger(__name__)
    pubsub = valkey_client.pubsub()
    is_pattern = "*" in match_code or "?" in match_code

    if is_pattern:
        pubsub.psubscribe(match_code)
        logger.info(f"Subscribed to pattern '{match_code}'")
    else:
        pubsub.subscribe(match_code)
        logger.info(f"Subscribed to channel '{match_code}'")

    try:
        for message in pubsub.listen():
            msg_type = message["type"]
            if (is_pattern and msg_type == "pmessage") or (not is_pattern and msg_type == "message"):
                try:
                    yield json.loads(message["data"])
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON on channel {match_code}: {message['data']}")
    finally:
        if is_pattern:
            pubsub.punsubscribe(match_code)
        else:
            pubsub.unsubscribe(match_code)
        pubsub.close()
        logger.info(f"Unsubscribed from '{match_code}'")
