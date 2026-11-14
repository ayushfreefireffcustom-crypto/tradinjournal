from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    shared_secret: str = "dev-secret-change-in-production"
    terminal_path: str = r"C:\Program Files\XM Global MT5\terminal64.exe"
    # Optional "check account": an account this terminal can always sign in to
    # (e.g. a demo account whose password is saved in the terminal). Used to
    # prove the terminal works when a user's login fails and no other account
    # has signed in recently. Leave check_password unset to use the password
    # saved in the terminal.
    check_login: int | None = None
    check_server: str | None = None
    check_password: str | None = None

    model_config = {"env_file": ".env", "env_prefix": "MT5_BRIDGE_"}


settings = Settings()
