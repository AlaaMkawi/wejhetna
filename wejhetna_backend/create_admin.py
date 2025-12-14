from db import SessionLocal
from models import User, UserRole, UserStatus
from main import hash_password


def create_or_reset_admin():
    db = SessionLocal()
    try:
        username = "admin"
        email = "admin@wejhetna.com"
        phone = "0500000000"
        password = "Admin123!"  # <-- this will be the login password

        # look for existing admin by username or email
        admin = (
            db.query(User)
            .filter((User.username == username) | (User.email == email))
            .first()
        )

        if admin:
            # reset password + role/status just in case
            admin.password_hash = hash_password(password)
            admin.role = UserRole.ADMIN
            admin.status = UserStatus.ACTIVE
            db.commit()
            db.refresh(admin)
            print("Admin UPDATED. id =", admin.id)
        else:
            # create new admin
            admin = User(
                full_name="Main Admin",
                username=username,
                email=email,
                phone=phone,
                password_hash=hash_password(password),
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            print("Admin CREATED. id =", admin.id)
    finally:
        db.close()


if __name__ == "__main__":
    create_or_reset_admin()
