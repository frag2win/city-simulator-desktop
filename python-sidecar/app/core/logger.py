import logging
import sys
from app.core.config import settings


def setup_logger(name: str = "city-sidecar") -> logging.Logger:
    """
    Set up structured logging for the Python sidecar.
    Logs to stdout so Electron can capture the output.
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    # Console handler (captured by Electron via stdout)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)

    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger


logger = setup_logger()
