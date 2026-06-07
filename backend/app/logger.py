import logging
import os
import re
import sys
from logging.handlers import TimedRotatingFileHandler


LOG_FILE_NAME = "backend.log"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s (%(filename)s:%(lineno)d)"

# Resolve level from env at import time so changing LOG_LEVEL requires only a restart.
# Supported values: DEBUG, INFO, WARNING, ERROR, CRITICAL. Default = INFO.
_LOG_LEVEL_ENV = os.getenv("LOG_LEVEL", "INFO").upper()
_LOG_LEVEL = getattr(logging, _LOG_LEVEL_ENV, logging.INFO)


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
    # Use env-derived level if caller didn't pass one explicitly.
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

        # Giữ nguyên phần File Handler của bạn
        # ... (phần code file_handler của bạn)
        
    return logger

# Create the global logger instance
global_logger = setup_logger()

# MẸO THÊM: Để bắt được lỗi 500 từ FastAPI/Uvicorn
# Hãy ép Root Logger cũng dùng chung cấu hình với bạn
logging.getLogger().handlers = global_logger.handlers