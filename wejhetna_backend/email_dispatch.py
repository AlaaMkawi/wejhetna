"""
Single entry point from the API process for transactional email delivery.

Primary path: enqueue Celery task ``tasks.send_email`` (worker performs SMTP).
Backup path: synchronous SMTP using ``email_settings`` if enqueue fails.
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path

# Ensure imports like ``email_settings`` / ``tasks`` work regardless of process CWD.
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from email_settings_loader import get_email_settings


def enqueue_transactional_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    flow: str = "unknown",
) -> None:
    """
    Try Celery first; on failure, send synchronously (same credentials as worker).

    ``flow`` is for logs only; it does not change subject/body.
    """
    print(
        f"[EMAIL_DISPATCH] flow={flow!r} action=enqueue task_name=tasks.send_email "
        f"to={to_email!r} subject_len={len(subject)} body_len={len(body)}"
    )
    try:
        from tasks import send_email_task

        async_result = send_email_task.delay(to_email, subject, body)
        print(
            f"[EMAIL_DISPATCH] flow={flow!r} enqueue=OK "
            f"task_name={send_email_task.name!r} celery_task_id={async_result.id!r} "
            f"state={async_result.state!r} to={to_email!r}"
        )
        return
    except Exception as e:
        print(
            f"[EMAIL_DISPATCH] flow={flow!r} enqueue=FAILED reason={e!r} "
            f"-> sync_smtp_fallback to={to_email!r}"
        )
        traceback.print_exc()

    _sync_smtp_fallback(to_email, subject, body, flow=flow)


def _sync_smtp_fallback(to_email: str, subject: str, body: str, *, flow: str) -> None:
    import smtplib
    from email.message import EmailMessage

    es = get_email_settings()

    print(
        f"[EMAIL_DISPATCH] flow={flow!r} action=sync_smtp_fallback "
        f"to={to_email!r} subject_len={len(subject)} body_len={len(body)}"
    )
    es.log_smtp_diagnostics(prefix=f"[EMAIL_DISPATCH sync_fallback flow={flow}]")
    email_user, email_pass = es.get_smtp_login()
    if not email_user or not email_pass:
        print(
            f"[EMAIL_DISPATCH] flow={flow!r} sync_fallback: creds missing, "
            "printing content only (no SMTP)."
        )
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

    try:
        host, port = es.get_smtp_host_port()
        with smtplib.SMTP_SSL(host, port) as smtp:
            smtp.login(email_user, email_pass)
            smtp.send_message(msg)
        print(
            f"[EMAIL_DISPATCH] flow={flow!r} sync_fallback=SUCCESS sent to={to_email!r}"
        )
    except Exception as e:
        print(
            f"[EMAIL_DISPATCH] flow={flow!r} sync_fallback=FAILED to={to_email!r}: {e}"
        )
        print("=== EMAIL (FAILED TO SEND) ===")
        print("To:", to_email)
        print("Subject:", subject)
        print("Body:", body)
        print("=============")
