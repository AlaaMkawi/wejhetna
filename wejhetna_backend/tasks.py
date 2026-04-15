"""
Celery tasks. Import celery_app from celery_app to register decorators.

From FastAPI (e.g. inside a route), after ensuring celery_app is configured:
    from tasks import ping
    ping.delay()
"""
import os
import sys
from pathlib import Path

# Local package imports (email_settings, etc.) must resolve even if CWD is not wejhetna_backend.
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from email_settings_loader import get_email_settings

from celery_app import celery_app

# --- LOCAL A/B TEST ONLY (Gmail 535 debugging) ---
# Set True, paste app password, restart worker. Set False before commit; do not commit secrets.
_SMTP_FORCE_PLAINTEXT_CREDS = False
_SMTP_FORCE_USER = os.getenv("EMAIL_USER", "")
_SMTP_FORCE_PASS = ""

# --- TEMP TEST ONLY #2 — isolation: smtp.login ONLY in worker, then return (no email sent) ---
# If True: set user/pass below for a local test. Set False for normal operation. Do not commit secrets.
_SMTP_TEMP_HARDCODE_ISOLATION_TEST = False
_SMTP_TEMP_HARDCODE_USER = os.getenv("EMAIL_USER", "")
_SMTP_TEMP_HARDCODE_PASS = ""


def _smtp_deliver(to_email: str, subject: str, body: str) -> None:
    """Shared SMTP send used by all email tasks (runs inside the worker)."""
    # Load project SMTP settings before stdlib ``email`` imports so tracebacks stay accurate.
    es = get_email_settings()
    import smtplib
    from email.message import EmailMessage
    dotenv_file_abs_path = es.dotenv_file_abs_path
    describe_email_pass_env_shape = es.describe_email_pass_env_shape
    get_smtp_host_port = es.get_smtp_host_port
    get_smtp_login = es.get_smtp_login
    log_smtp_diagnostics = es.log_smtp_diagnostics

    if _SMTP_TEMP_HARDCODE_ISOLATION_TEST:
        host, port = get_smtp_host_port()
        u = (_SMTP_TEMP_HARDCODE_USER or "").strip()
        p = (_SMTP_TEMP_HARDCODE_PASS or "").strip().replace(" ", "")
        print(
            f"[TEMP TEST ONLY #2 Celery] hardcoded smtp.login ONLY "
            f"user={u!r} password_len={len(p)} host={host!r} port={port} "
            f"(no email will be sent after this block)"
        )
        try:
            with smtplib.SMTP_SSL(host, port, timeout=30) as smtp:
                smtp.login(u, p)
            print("[TEMP TEST ONLY #2 Celery] smtp.login SUCCESS with hardcoded creds")
        except Exception as e:
            print(f"[TEMP TEST ONLY #2 Celery] smtp.login FAILED: {type(e).__name__}: {e}")
            raise
        return

    dotenv_abs = dotenv_file_abs_path()
    print(
        f"[tasks._smtp_deliver] runtime dotenv_abs={dotenv_abs} "
        f"exists={dotenv_abs.is_file()}"
    )
    print(
        f"[tasks._smtp_deliver] os.environ EMAIL_USER present={'EMAIL_USER' in os.environ} "
        f"EMAIL_PASS present={'EMAIL_PASS' in os.environ}"
    )
    print(
        f"[tasks._smtp_deliver] EMAIL_PASS shape before get_smtp_login: "
        f"{describe_email_pass_env_shape()}"
    )
    log_smtp_diagnostics(prefix="[tasks._smtp_deliver]")

    email_user, email_pass = get_smtp_login()

    if _SMTP_FORCE_PLAINTEXT_CREDS:
        print(
            "[tasks._smtp_deliver] WARNING: _SMTP_FORCE_PLAINTEXT_CREDS=True "
            "(inline test — disable after debugging)"
        )
        email_user = (_SMTP_FORCE_USER or "").strip()
        email_pass = (_SMTP_FORCE_PASS or "").strip().replace(" ", "")

    # Precise runtime values used for login (full user; password length only)
    host, port = get_smtp_host_port()
    print(
        f"[tasks._smtp_deliver] resolved_for_login EMAIL_USER={email_user!r} "
        f"EMAIL_PASS_len={len(email_pass) if email_pass else 0} "
        f"host={host!r} port={port}"
    )

    if not email_user or not email_pass:
        print("[tasks._smtp_deliver] Email config missing, skipping real send.")
        print("=== EMAIL (FAKE) ===")
        print("To:", to_email)
        print("Subject:", subject)
        print("Body:", body)
        print("=============")
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = email_user
    msg["To"] = to_email
    msg.set_content(body)

    print(
        f"[tasks._smtp_deliver] about to smtp.login with user={email_user!r} "
        f"password_len={len(email_pass)} host={host!r} port={port}"
    )
    with smtplib.SMTP_SSL(host, port) as smtp:
        smtp.login(email_user, email_pass)
        smtp.send_message(msg)


@celery_app.task(name="tasks.ping")
def ping() -> dict:
    """Minimal task to verify broker, worker, and result backend."""
    return {"ok": True, "message": "pong"}


@celery_app.task(name="tasks.send_email", bind=True)
def send_email_task(self, to_email: str, subject: str, body: str) -> None:
    """
    Send an email via Gmail SMTP (verification, password reset, admin approve/reject, etc.).
    Subject/body are built in the API; this task only delivers.
    """
    task_id = getattr(getattr(self, "request", None), "id", None)
    print(
        f"[CELERY tasks.send_email] RUNNING task_id={task_id!r} to={to_email!r} "
        f"subject_len={len(subject)} body_len={len(body)}"
    )
    try:
        _smtp_deliver(to_email, subject, body)
        print(
            f"[CELERY tasks.send_email] SUCCESS task_id={task_id!r} to={to_email!r}"
        )
    except Exception as e:
        print(
            f"[CELERY tasks.send_email] FAILED task_id={task_id!r} to={to_email!r}: {e}"
        )
        raise
