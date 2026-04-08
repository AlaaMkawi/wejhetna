"""
FastAPI dependencies (auth helpers).

The app currently has no JWT middleware; clients send the logged-in user id in form data
(same pattern as other authenticated-style flows). We validate the user exists and
email is verified before mutating data.
"""

from fastapi import Depends, HTTPException, Form, Query
from sqlalchemy.orm import Session

from models import User, UserRole
from deps import get_db
from schemas import AdvertisementAdminRequest


def get_current_user(
    user_id: int = Form(
        ...,
        description="Logged-in user id (from client session after login).",
    ),
    db: Session = Depends(get_db),
) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before creating an advertisement.",
        )
    return user


def get_current_admin_user(
    admin_user_id: int = Query(
        ...,
        description="Admin user id (must have role ADMIN).",
    ),
    db: Session = Depends(get_db),
) -> User:
    """Restricts access to users with role ADMIN (same id-in-request pattern as other admin routes)."""
    user = db.query(User).filter(User.id == admin_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Only administrators can access this resource.",
        )
    return user


def get_admin_user_from_body(
    data: AdvertisementAdminRequest,
    db: Session = Depends(get_db),
) -> User:
    """Validates admin_user_id in JSON body (matches DriverReviewRequest / other admin actions)."""
    admin = (
        db.query(User)
        .filter(User.id == data.admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not admin:
        raise HTTPException(
            status_code=403,
            detail="Only admin can perform this action.",
        )
    return admin
