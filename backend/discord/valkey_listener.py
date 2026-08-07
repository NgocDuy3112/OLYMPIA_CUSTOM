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


def subscribe_to_event_channels(valkey_client: valkey.Valkey, event_channel_pattern: str):
    """Subscribe to an event channel (or pattern) and yield messages.

    If event_channel_pattern contains '*' or '?', uses psubscribe (pattern matching).
    Otherwise uses exact subscribe.

    Yields:
        dict: Parsed JSON message from the channel.
    """
    import json
    import logging

    logger = logging.getLogger(__name__)
    pubsub = valkey_client.pubsub()
    is_pattern = "*" in event_channel_pattern or "?" in event_channel_pattern

    if is_pattern:
        pubsub.psubscribe(event_channel_pattern)
        logger.info(f"Subscribed to pattern '{event_channel_pattern}'")
    else:
        pubsub.subscribe(event_channel_pattern)
        logger.info(f"Subscribed to channel '{event_channel_pattern}'")

    try:
        for message in pubsub.listen():
            msg_type = message["type"]
            if (is_pattern and msg_type == "pmessage") or (not is_pattern and msg_type == "message"):
                try:
                    yield json.loads(message["data"])
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON on channel {event_channel_pattern}: {message['data']}")
    finally:
        if is_pattern:
            pubsub.punsubscribe(event_channel_pattern)
        else:
            pubsub.unsubscribe(event_channel_pattern)
        pubsub.close()
        logger.info(f"Unsubscribed from '{event_channel_pattern}'")
