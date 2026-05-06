import logging
import sys
from logging.handlers import TimedRotatingFileHandler
import os


LOG_FILE_NAME = "backend.log"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s (%(filename)s:%(lineno)d)"


def setup_logger(name: str = "app_logger", level: int = logging.DEBUG):
    logger = logging.getLogger(name)
    logger.setLevel(level)

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