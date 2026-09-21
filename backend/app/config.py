"""Configurazione da variabili d'ambiente (file .env in locale)."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    mb_username: str = ""
    mb_password: str = ""
    mb_pin: str = ""
    mb_region: str = "Europe"

    database_url: str = "postgresql://mbcompanion:mbcompanion@localhost:5432/mbcompanion"

    api_auth_token: str = ""
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Intervallo minimo fra due punti GPS salvati durante un viaggio. L'auto
    # manda aggiornamenti molto piu' spesso di quanto serva per disegnare un
    # percorso leggibile.
    trip_point_min_seconds: int = 15
    # ...e distanza minima, per non accumulare punti mentre si e' fermi in coda.
    trip_point_min_meters: float = 25.0

    token_path: Path = BASE_DIR / "data" / "token.json"

    @property
    def asyncpg_dsn(self) -> str:
        return self.database_url


settings = Settings()
