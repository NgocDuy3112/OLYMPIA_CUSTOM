from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_HOST: str
    APP_PORT: int
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int


    SEASON: int = 3

    @computed_field
    @property
    def APP_URL(self) -> str:
        return f"http://{self.APP_HOST}:{self.APP_PORT}"

    @computed_field
    @property
    def MATCH_PATTERN(self) -> str:
        return f"OC{self.SEASON}_M"

    @computed_field
    @property
    def QUESTION_PATTERN(self) -> str:
        return f"OC{self.SEASON}_Q"


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


class ValkeySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    VALKEY_USER: str
    VALKEY_PASSWORD: str
    VALKEY_HOST: str
    VALKEY_PORT: int
    VALKEY_TIMEOUT: float = 5.0
    VALKEY_HEALTH_CHECK_INTERVAL: int = 30

    @computed_field
    @property
    def VALKEY_URL(self) -> str:
        return f"valkey://{self.VALKEY_USER}:{self.VALKEY_PASSWORD}@{self.VALKEY_HOST}:{self.VALKEY_PORT}"


class S3Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    S3_ENDPOINT_URL: str | None = 'https://s3.vn-hcm-1.vietnix.cloud'
    S3_REGION: str = "vn-hcm-1"
    S3_BUCKET_NAME: str
    S3_ACCESS_KEY_ID: str
    S3_SECRET_ACCESS_KEY: str
    S3_PRESIGNED_URL_EXPIRY: int = 3600
    S3_MAX_UPLOAD_SIZE_MB: int = 50


class EmailSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    EMAIL_FROM_NAME: str = "Olympia Custom"

    FRONTEND_URL: str = "http://localhost:5173"


    APP_ENV: str = "stage"

    @computed_field
    @property
    def IS_BETA(self) -> bool:
        return self.APP_ENV.lower() != "prod"

    @computed_field
    @property
    def EMAIL_SUBJECT_PREFIX(self) -> str:
        return "[Olympia Custom BETA] " if self.IS_BETA else "[Olympia Custom] "