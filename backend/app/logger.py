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

# Hardcoded log level: INFO. Tweak the constant below to change verbosity.
_LOG_LEVEL = logging.INFO

# Hardcoded file-log destination: <project-root>/logs/backend.log (same directory
# docker-compose already mounts). The directory is auto-created on first emit.
LOG_FILE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),  # backend/
    "logs",
    LOG_FILE_NAME,
)

# Hardcoded rotation knobs:
#   - rotate daily at midnight (when="midnight")
#   - keep 7 backups
#   - gzip-compress rotated files via the rotator below
LOG_ROTATE_WHEN = "midnight"
LOG_ROTATE_BACKUP_COUNT = 7


def mask_email(email: str | None) -> str:
    """Mask a user email so logs don't leak PII.

    Examples
    --------
    >>> mask_email("john.doe@example.com")
    'j*******@e******.com'
    >>> mask_email(None)
    'None'
    """
    if not email:
        return "None"
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if not local:
        return f"***@{domain}"
    if not domain:
        return f"{local[:1]}***"
    # Show first char of local part, last segment of domain (.com / .io.vn)
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
    # Caller-provided ``level`` overrides the hardcoded default (``_LOG_LEVEL``).
    # Tests pass ``level=logging.DEBUG`` to opt into verbose output.
    logger.setLevel(level if level is not None else _LOG_LEVEL)

    # QUAN TRỌNG: Ngăn chặn log bị lặp hoặc mất khi chạy với Uvicorn
    logger.propagate = False

    if not logger.handlers:
        formatter = logging.Formatter(LOG_FORMAT)

        # Sử dụng sys.stderr thay vì sys.stdout cho log lỗi/debug
        # Stderr thường được Docker ưu tiên đẩy ra console ngay lập tức hơn
        console_handler = logging.StreamHandler(sys.stderr)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # File handler — TimedRotatingFileHandler, daily rotation @ midnight,
        # keep 7 backups, gzip-compress rotated files. Directory is
        # auto-created on first emit. Falls back to stderr-only if the
        # filesystem is read-only (e.g. CI containers).
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
                delay=True,  # don't open the file until first emit
            )
            # gzip rotated backups so the daily 7-day window doesn't fill disk.
            # ``namer`` renames the rotated file (the handler still expects
            # the file to exist); ``rotator`` actually opens/compresses it.
            file_handler.namer = _gzip_namer
            file_handler.rotator = _gzip_rotator
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)

    return logger


def _gzip_namer(default_name: str) -> str:
    """Return the on-disk name with a ``.gz`` suffix so the rotator can find it.

    TimedRotatingFileHandler calls this to decide the destination name when
    rotating. We append ``.gz`` so the matching ``_gzip_rotator`` knows to
    compress. The actual file at this path does NOT exist yet when namer runs.
    """
    if default_name.endswith(".gz"):
        return default_name
    return default_name + ".gz"


def _gzip_rotator(source: str, dest: str) -> None:
    """Compress ``source`` → ``dest`` (where ``dest`` already has ``.gz`` suffix).

    Called by TimedRotatingFileHandler right after it has closed the active
    log and renamed it. Without gzip, 7 days of INFO logs from a busy match
    day can balloon past several hundred MB.
    """
    # ``dest`` is the final compressed name (e.g. backend.log.2026-06-27.gz).
    # The just-closed file is at ``source`` (e.g. backend.log.2026-06-27).
    if not dest.endswith(".gz"):
        # Safety net — namer should always append .gz, but be defensive.
        shutil.move(source, dest)
        return
    with open(source, "rb") as f_in, gzip.open(dest, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)
    os.remove(source)

# Create the global logger instance
global_logger = setup_logger()

# MẸO THÊM: Để bắt được lỗi 500 từ FastAPI/Uvicorn
# Hãy ép Root Logger cũng dùng chung cấu hình với bạn
logging.getLogger().handlers = global_logger.handlers