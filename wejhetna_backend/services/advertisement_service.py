"""Create advertisement requests (user-facing; admin review is separate)."""

from __future__ import annotations

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

    ad = Advertisement(
        user_id=user.id,
        image_url=upload.image_url,
        image_key=upload.image_key,
        category_id=category_id,
        city_id=city_id,
        description=desc,
        status=AdvertisementStatus.PENDING,
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

    ad.status = AdvertisementStatus.APPROVED
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
    db.commit()
    db.refresh(ad)
    return ad, "Advertisement rejected successfully."


__all__ = [
    "create_advertisement_request",
    "list_pending_advertisements",
    "list_public_approved_advertisements",
    "approve_advertisement",
    "reject_advertisement",
    "CategoryNotFoundError",
    "CityNotFoundError",
    "AdvertisementNotFoundError",
    "AdvertisementInvalidStateError",
    "AdvertisementImageValidationError",
    "AdvertisementS3ConfigError",
    "AdvertisementS3UploadError",
]
