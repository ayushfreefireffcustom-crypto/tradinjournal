from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    shared_secret: str = "dev-secret-change-in-production"
    terminal_path: str = r"C:\Program Files\XM Global MT5\terminal64.exe"

    model_config = {"env_file": ".env", "env_prefix": "MT5_BRIDGE_"}


settings = Settings()
