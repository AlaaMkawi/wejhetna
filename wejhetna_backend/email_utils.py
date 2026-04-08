# email_utils.py
# Template helpers for transactional emails. Delivery always goes through Celery via email_dispatch.


def _send_email(to_email: str, subject: str, body: str, *, flow: str) -> None:
    from email_dispatch import enqueue_transactional_email

    enqueue_transactional_email(to_email, subject, body, flow=flow)


# ===============================
# INTERNAL helper (DO NOT USE DIRECTLY)
# ===============================
# (kept name for backward compatibility — enqueues Celery, does not open SMTP here)


# ===============================
# ✅ EXISTING FUNCTION (UNCHANGED LOGIC)
# ===============================
def send_driver_approved_email(to_email: str, full_name: str):
    body = (
        f"Hi {full_name},\n\n"
        "Your driver application on Wejhetna has been approved. "
        "You can now log in and start using the app.\n\n"
        "Thank you,\n"
        "Wejhetna team"
    )

    _send_email(
        to_email=to_email,
        subject="Wejhetna - your driver application was approved",
        body=body,
        flow="email_utils.send_driver_approved_email",
    )


# ===============================
# 🆕 NEW FUNCTION (REQUIRED)
# ===============================
def send_verification_email(to_email: str, full_name: str, code: str):
    body = (
        f"Hello {full_name},\n\n"
        "Thank you for signing up with Wejhetna!\n\n"
        f"Your email verification code is: {code}\n\n"
        "This code will expire in 15 minutes.\n\n"
        "If you didn’t sign up, please ignore this email.\n\n"
        "Best regards,\n"
        "Wejhetna Team"
    )

    _send_email(
        to_email=to_email,
        subject="Wejhetna - Email Verification Code",
        body=body,
        flow="email_utils.send_verification_email",
    )
