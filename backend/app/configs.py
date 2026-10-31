from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_HOST: str
    APP_PORT: int
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    @computed_field
    @property
    def APP_URL(self) -> str:
        return f"http://{self.APP_HOST}:{self.APP_PORT}"

    @computed_field
    @property
    def MATCH_PATTERN(self) -> str:
        return "OCF_M"

    @computed_field
    @property
    def QUESTION_PATTERN(self) -> str:
        return "OCF_Q"

    @computed_field
    @property
    def USER_PATTERN(self) -> str:
        return "OCF_U"


class PostgreSQLSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    POSTGRES_DB_USER: str
    POSTGRES_DB_PASSWORD: str
    POSTGRES_DB_HOST: str
    POSTGRES_DB_PORT: int
    POSTGRES_DB_NAME: str

    @computed_field
    @property
    def POSTGRES_DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_DB_USER}:{self.POSTGRES_DB_PASSWORD}@{self.POSTGRES_DB_HOST}:{self.POSTGRES_DB_PORT}/{self.POSTGRES_DB_NAME}"


class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_USER: str
    REDIS_PASSWORD: str
    REDIS_HOST: str
    REDIS_PORT: int
    REDIS_TIMEOUT: float = 5.0
    REDIS_HEALTH_CHECK_INTERVAL: int = 30
    REDIS_STATE_TTL_SECONDS: int = 900


    @computed_field
    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_USER}:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}"


class S3Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    S3_ENDPOINT_URL: str | None = 'https://s3.vn-hcm-1.vietnix.cloud'
    S3_REGION: str = "vn-hcm-1"
    S3_BUCKET_NAME: str
    S3_ACCESS_KEY_ID: str
    S3_SECRET_ACCESS_KEY: str
    S3_PRESIGNED_URL_EXPIRY: int = 3600
    S3_MAX_UPLOAD_SIZE_MB: int = 50
