from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import Optional


class Settings(BaseSettings):
    """
    Sidecar configuration — loaded from CLI args / env vars.
    """
    model_config = ConfigDict(env_prefix="CITY_")

    port: int = 8765
    token: str = ""
    data_dir: str = ""
    app_version: str = "1.0.0"
    log_level: str = "info"


settings = Settings()
