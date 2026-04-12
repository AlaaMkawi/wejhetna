"""
Celery tasks. Import celery_app from celery_app to register decorators.

From FastAPI (e.g. inside a route), after ensuring celery_app is configured:
    from tasks import ping
    ping.delay()
"""
from celery_app import celery_app


def _smtp_deliver(to_email: str, subject: str, body: str) -> None:
    """Shared SMTP send used by all email tasks (runs inside the worker)."""
    import os
    import smtplib
    from email.message import EmailMessage

    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")

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

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(email_user, email_pass)
        smtp.send_message(msg)


@celery_app.task(name="tasks.ping")
def ping() -> dict:
    """Minimal task to verify broker, worker, and result backend."""
    return {"ok": True, "message": "pong"}


@celery_app.task(name="tasks.send_email")
def send_email_task(to_email: str, subject: str, body: str) -> None:
    """
    Send an email via Gmail SMTP (verification, password reset, admin approve/reject, etc.).
    Subject/body are built in the API; this task only delivers.
    """
    print(
        f"[CELERY tasks.send_email] RUNNING to={to_email!r} "
        f"subject_len={len(subject)} body_len={len(body)}"
    )
    try:
        _smtp_deliver(to_email, subject, body)
        print(f"[CELERY tasks.send_email] DONE to={to_email!r}")
    except Exception as e:
        print(f"[CELERY tasks.send_email] FAILED to={to_email!r}: {e}")
        raise
