# email_utils.py
import os
import smtplib
from email.message import EmailMessage

EMAIL_USER = os.environ.get("wejhetna.app@gmail.com")  # e.g. "wejhetna.app@gmail.com"
EMAIL_PASS = os.environ.get("")  # Gmail app password, not normal password

def send_driver_approved_email(to_email: str, full_name: str):
    if not EMAIL_USER or not EMAIL_PASS:
        print("Email config missing, skipping email")
        return

    msg = EmailMessage()
    msg["Subject"] = "Wejhetna - your driver application was approved"
    msg["From"] = EMAIL_USER
    msg["To"] = to_email
    msg.set_content(
        f"Hi {full_name},\n\n"
        "Your driver application on Wejhetna has been approved. "
        "You can now log in and start using the app.\n\n"
        "Thank you,\n"
        "Wejhetna team"
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(EMAIL_USER, EMAIL_PASS)
        smtp.send_message(msg)
