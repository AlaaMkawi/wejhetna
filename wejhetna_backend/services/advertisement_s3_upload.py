"""
S3 upload for Advertisement images only.

Uses key prefix: advertisements/{user_id}/<uuid>.<ext>
Do not use for business/place uploads (those use other paths).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import boto3

# Separated from generic uploads/ and business/place keys in main.py
ADVERTISEMENT_S3_PREFIX = "advertisements"

MAX_ADVERTISEMENT_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

_ALLOWED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png"})

_EXT_TO_CONTENT_TYPE = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


class AdvertisementImageValidationError(ValueError):
    """Raised when file type or size is not allowed."""


class AdvertisementS3ConfigError(RuntimeError):
    """Raised when bucket/region env is missing."""


class AdvertisementS3UploadError(RuntimeError):
    """Raised when S3 upload fails."""


@dataclass(frozen=True)
class AdvertisementImageUploadResult:
    """Public URL and S3 object key for a stored advertisement image."""

    image_url: str
    image_key: str


def _normalize_extension(original_filename: str) -> str:
    suffix = Path(original_filename).suffix.lower()
    if not suffix:
        raise AdvertisementImageValidationError("File must have an extension (.jpg, .jpeg, .png).")
    if suffix not in _ALLOWED_EXTENSIONS:
        raise AdvertisementImageValidationError(
            f"Only jpg, jpeg, and png are allowed; got {suffix!r}."
        )
    return suffix


def _validate_size(file_content: bytes) -> None:
    if len(file_content) > MAX_ADVERTISEMENT_IMAGE_BYTES:
        raise AdvertisementImageValidationError(
            f"Image too large: max {MAX_ADVERTISEMENT_IMAGE_BYTES // (1024 * 1024)} MB."
        )
    if len(file_content) == 0:
        raise AdvertisementImageValidationError("Empty file.")


def _validate_image_magic_bytes(file_content: bytes, ext: str) -> None:
    """Basic JPEG/PNG signature check (no local file; bytes only)."""
    if ext in (".jpg", ".jpeg"):
        if len(file_content) < 3 or file_content[:3] != b"\xff\xd8\xff":
            raise AdvertisementImageValidationError("File content is not a valid JPEG.")
    elif ext == ".png":
        png_sig = b"\x89PNG\r\n\x1a\n"
        if len(file_content) < len(png_sig) or file_content[:8] != png_sig:
            raise AdvertisementImageValidationError("File content is not a valid PNG.")


def _s3_bucket_and_region() -> tuple[str, str]:
    bucket = os.getenv("AWS_S3_BUCKET") or os.getenv("S3_BUCKET")
    region = os.getenv("AWS_REGION")
    if not bucket:
        raise AdvertisementS3ConfigError(
            "S3 bucket is not configured (set AWS_S3_BUCKET or S3_BUCKET)."
        )
    if not region:
        raise AdvertisementS3ConfigError("AWS_REGION is not configured.")
    return bucket, region


def _public_object_url(bucket: str, region: str, key: str) -> str:
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def upload_advertisement_image_to_s3(
    *,
    user_id: int,
    file_content: bytes,
    original_filename: str,
) -> AdvertisementImageUploadResult:
    """
    Upload a single advertisement image to S3 (no local disk write).

    Object key: advertisements/{user_id}/{uuid}.{ext}

    Parameters
    ----------
    user_id:
        Owner user id (folder segment under advertisements/).
    file_content:
        Raw image bytes (e.g. from await upload_file.read()).
    original_filename:
        Original name; used only to determine allowed extension (jpg/jpeg/png).

    Returns
    -------
    AdvertisementImageUploadResult
        Public HTTPS URL for the object and the S3 key.

    Raises
    ------
    AdvertisementImageValidationError
        Invalid type, size, or content.
    AdvertisementS3ConfigError
        Missing AWS env configuration.
    AdvertisementS3UploadError
        boto3 / S3 API failure.
    """
    if user_id < 1:
        raise AdvertisementImageValidationError("user_id must be a positive integer.")

    ext = _normalize_extension(original_filename)
    _validate_size(file_content)
    _validate_image_magic_bytes(file_content, ext)

    uuid_filename = f"{uuid4().hex}{ext}"
    image_key = f"{ADVERTISEMENT_S3_PREFIX}/{user_id}/{uuid_filename}"
    content_type = _EXT_TO_CONTENT_TYPE[ext]

    bucket, region = _s3_bucket_and_region()

    try:
        client = boto3.client("s3", region_name=region)
        client.put_object(
            Bucket=bucket,
            Key=image_key,
            Body=file_content,
            ContentType=content_type,
        )
    except AdvertisementS3ConfigError:
        raise
    except Exception as e:
        raise AdvertisementS3UploadError(f"S3 upload failed: {e}") from e

    image_url = _public_object_url(bucket, region, image_key)
    return AdvertisementImageUploadResult(image_url=image_url, image_key=image_key)
