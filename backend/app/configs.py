from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field

from google.oauth2.credentials import Credentials


SCOPES = ['https://www.googleapis.com/auth/drive']
DRIVE_CREDENTIALS_FILE = 'credentials.json'


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


class GCPSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    GOOGLE_DRIVE_SCOPE: str
    DRIVE_CREDENTIALS_FILE: str

    @computed_field
    @property
    def GCP_CREDS(self) -> Credentials:
        return Credentials.from_authorized_user_file(
            self.DRIVE_CREDENTIALS_FILE,
            scopes=[self.GOOGLE_DRIVE_SCOPE]
        )


class EmailSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    EMAIL_FROM_NAME: str = "Olympia Custom"
    # Frontend URL used to build password reset links emailed to users
    FRONTEND_URL: str = "http://localhost:5173"