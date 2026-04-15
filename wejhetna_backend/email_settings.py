"""
Single SMTP credential source for FastAPI and Celery worker.

Both must use this module so queued tasks and sync fallback authenticate the same way.
Gmail app passwords may include spaces; spaces are removed before login.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend directory whether process is API or Celery worker
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv()  # also cwd default


def dotenv_file_abs_path() -> Path:
    """Absolute path to wejhetna_backend/.env (may not exist)."""
    return (_BACKEND_DIR / ".env").resolve()


def describe_email_pass_env_shape() -> str:
    """Safe one-line hint about EMAIL_PASS from env (no secret printed)."""
    raw = os.getenv("EMAIL_PASS")
    if raw is None:
        return "EMAIL_PASS_key_absent"
    s = str(raw)
    return (
        f"raw_len={len(s)} "
        f"needs_strip={s != s.strip()} "
        f"cr={s.count(chr(13))} lf={s.count(chr(10))} "
        f"spaces={s.count(' ')} "
        f"wrapped_in_quotes={len(s) >= 2 and s[0] == s[-1] == chr(34)}"
    )


def get_smtp_login() -> tuple[str | None, str | None]:
    user = (os.getenv("EMAIL_USER") or "").strip() or None
    raw = os.getenv("EMAIL_PASS")
    if raw is None or not str(raw).strip():
        return user, None
    # Gmail accepts app passwords with or without spaces
    password = str(raw).strip().replace(" ", "")
    return user, password or None


def get_smtp_host_port() -> tuple[str, int]:
    host = (os.getenv("SMTP_HOST") or "smtp.gmail.com").strip()
    port_str = (os.getenv("SMTP_PORT") or "465").strip()
    try:
        port = int(port_str)
    except ValueError:
        port = 465
    return host, port


def log_smtp_diagnostics(*, prefix: str = "[smtp]") -> None:
    """Safe debug: never log the password; confirm env + target server."""
    user, password = get_smtp_login()
    host, port = get_smtp_host_port()
    dotenv_abs = dotenv_file_abs_path()
    dotenv_exists = dotenv_abs.is_file()
    env_has_email_user = "EMAIL_USER" in os.environ
    env_has_email_pass = "EMAIL_PASS" in os.environ
    print(
        f"{prefix} dotenv_abs={dotenv_abs} exists={dotenv_exists} "
        f"os.environ has EMAIL_USER={env_has_email_user} EMAIL_PASS={env_has_email_pass} "
        f"EMAIL_USER_set={bool(os.getenv('EMAIL_USER'))} "
        f"EMAIL_PASS_set={bool(os.getenv('EMAIL_PASS'))} "
        f"pass_shape={describe_email_pass_env_shape()} "
        f"login_user={user!r} password_len={len(password) if password else 0} "
        f"host={host!r} port={port}"
    )
