from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field



class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    APP_HOST: str
    APP_PORT: int

    SECRET_KEY: str
    ALGORITHM: str

    @computed_field
    @property
    def APP_URL(self) -> str:
        return f"http://{self.APP_HOST}:{self.APP_PORT}"



class PostgreSQLSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


class ValkeySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    VALKEY_USER: str
    VALKEY_PASSWORD: str
    VALKEY_HOST: str
    VALKEY_CACHE_PORT: int
    VALKEY_PUBSUB_PORT: int

    @computed_field
    @property
    def VALKEY_CACHE_URL(self) -> str:
        return f"valkey://{self.VALKEY_USER}:{self.VALKEY_PASSWORD}@{self.VALKEY_HOST}:{self.VALKEY_CACHE_PORT}"

    @computed_field
    @property
    def VALKEY_PUBSUB_URL(self) -> str:
        return  f"valkey://{self.VALKEY_USER}:{self.VALKEY_PASSWORD}@{self.VALKEY_HOST}:{self.VALKEY_PUBSUB_PORT}"