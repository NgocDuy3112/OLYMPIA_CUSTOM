"""Download audio files from S3 on bot startup.

Uses the same S3 credentials and path-style addressing as the backend app.
Files are stored under the S3 prefix `audios/bgm/` and `audios/sfx/`.
"""

import logging
import os

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

import configs

logger = logging.getLogger("s3-audio")

_S3_CONFIG = Config(
    s3={"addressing_style": "path"},
    signature_version="s3v4",
    retries={"max_attempts": 3},
)

_PREFIX_DIR_MAP = {
    "audios/bgm/": configs.BGM_DIR,
    "audios/sfx/": configs.SFX_DIR,
    "audios/ping/": configs.PING_DIR,
}


def sync_audio_from_s3() -> None:
    """Download all audio files from S3 into local dirs.

    Skips files already present with the same size.
    No-ops silently when S3 is not configured (local dev fallback).
    """
    logger.info(f"Starting S3 audio sync...")
    logger.info(f"S3_BUCKET_NAME: {configs.S3_BUCKET_NAME}")
    logger.info(f"S3_ENDPOINT_URL: {configs.S3_ENDPOINT_URL}")
    logger.info(f"BGM_DIR: {configs.BGM_DIR}")
    logger.info(f"SFX_DIR: {configs.SFX_DIR}")
    logger.info(f"PING_DIR: {configs.PING_DIR}")
    
    if not configs.S3_BUCKET_NAME:
        logger.warning("S3_BUCKET_NAME not set — skipping S3 audio sync")
        return

    try:
        client = boto3.client(
            "s3",
            endpoint_url=configs.S3_ENDPOINT_URL or None,
            region_name=configs.S3_REGION,
            aws_access_key_id=configs.S3_ACCESS_KEY_ID,
            aws_secret_access_key=configs.S3_SECRET_ACCESS_KEY,
            config=_S3_CONFIG,
        )
    except Exception as e:
        logger.error(f"Failed to create S3 client: {e}")
        return

    downloaded = 0
    skipped = 0

    for prefix, local_dir in _PREFIX_DIR_MAP.items():
        logger.info(f"Processing prefix: {prefix} -> {local_dir}")
        os.makedirs(local_dir, exist_ok=True)

        try:
            paginator = client.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=configs.S3_BUCKET_NAME, Prefix=prefix)
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Failed to list S3 objects under '{prefix}': {e}")
            continue

        for page in pages:
            objects = page.get("Contents", [])
            logger.info(f"Found {len(objects)} objects in {prefix}")
            for obj in objects:
                key = obj["Key"]
                filename = os.path.basename(key)
                if not filename:
                    continue

                local_path = os.path.join(local_dir, filename)
                remote_size = obj.get("Size", -1)

                if os.path.isfile(local_path) and os.path.getsize(local_path) == remote_size:
                    skipped += 1
                    logger.debug(f"Skipping (already exists): {key}")
                    continue

                try:
                    client.download_file(configs.S3_BUCKET_NAME, key, local_path)
                    downloaded += 1
                    logger.info(f"Downloaded: {key} -> {local_path}")
                except (BotoCoreError, ClientError) as e:
                    logger.error(f"Failed to download '{key}': {e}")

    logger.info(f"S3 audio sync complete: {downloaded} downloaded, {skipped} skipped")
