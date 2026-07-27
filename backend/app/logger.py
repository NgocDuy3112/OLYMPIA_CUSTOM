import gzip
import logging
import os
import re
import shutil
import sys
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path


LOG_FILE_NAME = "backend.log"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s (%(filename)s:%(lineno)d)"


_LOG_LEVEL = logging.INFO


LOG_FILE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "logs",
    LOG_FILE_NAME,
)


LOG_ROTATE_WHEN = "midnight"
LOG_ROTATE_BACKUP_COUNT = 7


def mask_email(email: str | None) -> str:
    if not email:
        return "None"
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if not local:
        return f"***@{domain}"
    if not domain:
        return f"{local[:1]}***"

    local_mask = local[0] + "*" * (len(local) - 1) if len(local) > 1 else local
    domain_parts = domain.rsplit(".", 1)
    domain_mask = (
        (domain_parts[0][0] + "*" * (len(domain_parts[0]) - 1) + "." + domain_parts[1])
        if len(domain_parts) == 2 and domain_parts[0]
        else "***"
    )
    return f"{local_mask}@{domain_mask}"


def setup_logger(name: str = "app_logger", level: int | None = None):
    logger = logging.getLogger(name)


    logger.setLevel(level if level is not None else _LOG_LEVEL)


    logger.propagate = False

    if not logger.handlers:
        formatter = logging.Formatter(LOG_FORMAT)


        console_handler = logging.StreamHandler(sys.stderr)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)


        try:
            log_dir = Path(LOG_FILE_PATH).resolve().parent
            log_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            sys.stderr.write(
                f"[logger] Cannot create log dir for {LOG_FILE_PATH!r}: {exc}\n"
            )
        else:
            file_handler = TimedRotatingFileHandler(
                LOG_FILE_PATH,
                when=LOG_ROTATE_WHEN,
                backupCount=LOG_ROTATE_BACKUP_COUNT,
                encoding="utf-8",
                delay=True,
            )


            file_handler.namer = _gzip_namer
            file_handler.rotator = _gzip_rotator
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)

    return logger


def _gzip_namer(default_name: str) -> str:
    if default_name.endswith(".gz"):
        return default_name
    return default_name + ".gz"


def _gzip_rotator(source: str, dest: str) -> None:


    if not dest.endswith(".gz"):

        shutil.move(source, dest)
        return
    with open(source, "rb") as f_in, gzip.open(dest, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)
    os.remove(source)


global_logger = setup_logger()


logging.getLogger().handlers = global_logger.handlers