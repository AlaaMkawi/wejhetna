# email_utils.py
import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

# ✅ load .env file
load_dotenv()

# ✅ FIXED env variables
EMAIL_USER = os.getenv("EMAIL_USER")      # e.g. wejhetna.app@gmail.com
EMAIL_PASS = os.getenv("EMAIL_PASS")      # Gmail App Password


# ===============================
# INTERNAL helper (DO NOT USE DIRECTLY)
# ===============================
def _send_email(to_email: str, subject: str, body: str):
    if not EMAIL_USER or not EMAIL_PASS:
        print("Email config missing, skipping email")
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(EMAIL_USER, EMAIL_PASS)
            smtp.send_message(msg)
            print(f"Email sent to {to_email}")
    except Exception as e:
        print("Error sending email:", e)


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
    )
