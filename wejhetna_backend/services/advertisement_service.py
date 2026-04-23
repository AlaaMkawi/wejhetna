"""Create advertisement requests (user-facing; admin review is separate)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Advertisement, AdvertisementStatus, Category, City, User
from services.advertisement_s3_upload import (
    AdvertisementImageValidationError,
    AdvertisementS3ConfigError,
    AdvertisementS3UploadError,
    upload_advertisement_image_to_s3,
)


class CategoryNotFoundError(Exception):
    """No category with the given id."""


class CityNotFoundError(Exception):
    """No city with the given id."""


class AdvertisementNotFoundError(Exception):
    """No advertisement with the given id."""


class AdvertisementInvalidStateError(Exception):
    """Advertisement cannot move to the requested status (e.g. approve after reject)."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class AdvertisementPermissionError(Exception):
    """Caller is not allowed to perform the requested action on this advertisement."""


# Public visibility window after admin approval.
ADVERTISEMENT_PUBLIC_LIFETIME = timedelta(days=7)


def create_advertisement_request(
    db: Session,
    *,
    user: User,
    category_id: int,
    city_id: int,
    description: Optional[str],
    file_content: bytes,
    original_filename: str,
) -> Advertisement:
    """
    Upload image to S3 under advertisements/ and persist a PENDING Advertisement row.
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise CategoryNotFoundError()

    city = db.query(City).filter(City.id == city_id).first()
    if not city:
        raise CityNotFoundError()

    upload = upload_advertisement_image_to_s3(
        user_id=user.id,
        file_content=file_content,
        original_filename=original_filename,
    )

    desc = (description or "").strip() or None

    # expires_at is intentionally left NULL at submission time: the 7-day public
    # lifetime only starts when an admin approves the advertisement.
    ad = Advertisement(
        user_id=user.id,
        image_url=upload.image_url,
        image_key=upload.image_key,
        category_id=category_id,
        city_id=city_id,
        description=desc,
        status=AdvertisementStatus.PENDING,
        approved_at=None,
        expires_at=None,
    )
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return ad


def list_pending_advertisements(
    db: Session,
    *,
    category_id: Optional[int] = None,
    city_id: Optional[int] = None,
) -> List[Advertisement]:
    """
    Return PENDING advertisements, newest first. Optional filters by category_id and/or city_id.
    """
    q = db.query(Advertisement).filter(Advertisement.status == AdvertisementStatus.PENDING)
    if category_id is not None:
        q = q.filter(Advertisement.category_id == category_id)
    if city_id is not None:
        q = q.filter(Advertisement.city_id == city_id)
    return q.order_by(Advertisement.created_at.desc()).all()


def list_public_approved_advertisements(
    db: Session,
    *,
    category_id: Optional[int] = None,
    city_id: Optional[int] = None,
) -> List[Advertisement]:
    """
    Return APPROVED advertisements that are not expired (expires_at > now), newest first.
    Optional filters by category_id and/or city_id. No authentication; do not expose user_id.
    """
    q = (
        db.query(Advertisement)
        .filter(Advertisement.status == AdvertisementStatus.APPROVED)
        .filter(Advertisement.expires_at > func.now())
    )
    if category_id is not None:
        q = q.filter(Advertisement.category_id == category_id)
    if city_id is not None:
        q = q.filter(Advertisement.city_id == city_id)
    return q.order_by(Advertisement.created_at.desc()).all()


def approve_advertisement(db: Session, advertisement_id: int) -> tuple[Advertisement, str]:
    """
    Set status to APPROVED. Idempotent if already APPROVED.
    Raises AdvertisementNotFoundError, AdvertisementInvalidStateError if rejected.
    """
    ad = db.query(Advertisement).filter(Advertisement.id == advertisement_id).first()
    if not ad:
        raise AdvertisementNotFoundError()

    if ad.status == AdvertisementStatus.APPROVED:
        return ad, "Advertisement is already approved."

    if ad.status == AdvertisementStatus.REJECTED:
        raise AdvertisementInvalidStateError(
            "Cannot approve a rejected advertisement."
        )

    now = datetime.now(timezone.utc)
    ad.status = AdvertisementStatus.APPROVED
    ad.approved_at = now
    ad.expires_at = now + ADVERTISEMENT_PUBLIC_LIFETIME
    db.commit()
    db.refresh(ad)
    return ad, "Advertisement approved successfully."


def reject_advertisement(db: Session, advertisement_id: int) -> tuple[Advertisement, str]:
    """
    Set status to REJECTED. Idempotent if already REJECTED.
    Raises AdvertisementNotFoundError, AdvertisementInvalidStateError if already approved.
    """
    ad = db.query(Advertisement).filter(Advertisement.id == advertisement_id).first()
    if not ad:
        raise AdvertisementNotFoundError()

    if ad.status == AdvertisementStatus.REJECTED:
        return ad, "Advertisement is already rejected."

    if ad.status == AdvertisementStatus.APPROVED:
        raise AdvertisementInvalidStateError(
            "Cannot reject an approved advertisement."
        )

    ad.status = AdvertisementStatus.REJECTED
    # A rejected advertisement is never published; keep the lifecycle fields clean.
    ad.approved_at = None
    ad.expires_at = None
    db.commit()
    db.refresh(ad)
    return ad, "Advertisement rejected successfully."


def list_my_advertisements(db: Session, *, user_id: int) -> List[Advertisement]:
    """
    Return the user's own advertisements (any status), newest first.
    Used by the "My advertisements" screen so the owner can see submissions,
    track approval and delete if desired.
    """
    return (
        db.query(Advertisement)
        .filter(Advertisement.user_id == user_id)
        .order_by(Advertisement.created_at.desc())
        .all()
    )


def delete_advertisement_by_owner(
    db: Session, *, advertisement_id: int, user_id: int
) -> None:
    """
    Delete the advertisement if owned by `user_id`. Allowed in any status so the
    owner can withdraw a pending request or take down a published one early.
    Raises AdvertisementNotFoundError or AdvertisementPermissionError.
    """
    ad = db.query(Advertisement).filter(Advertisement.id == advertisement_id).first()
    if not ad:
        raise AdvertisementNotFoundError()
    if ad.user_id != user_id:
        raise AdvertisementPermissionError()
    db.delete(ad)
    db.commit()


def delete_advertisement_by_admin(db: Session, *, advertisement_id: int) -> None:
    """Admin-side hard delete (e.g. inappropriate/outdated content)."""
    ad = db.query(Advertisement).filter(Advertisement.id == advertisement_id).first()
    if not ad:
        raise AdvertisementNotFoundError()
    db.delete(ad)
    db.commit()


__all__ = [
    "create_advertisement_request",
    "list_pending_advertisements",
    "list_public_approved_advertisements",
    "list_my_advertisements",
    "approve_advertisement",
    "reject_advertisement",
    "delete_advertisement_by_owner",
    "delete_advertisement_by_admin",
    "CategoryNotFoundError",
    "CityNotFoundError",
    "AdvertisementNotFoundError",
    "AdvertisementInvalidStateError",
    "AdvertisementPermissionError",
    "AdvertisementImageValidationError",
    "AdvertisementS3ConfigError",
    "AdvertisementS3UploadError",
]
