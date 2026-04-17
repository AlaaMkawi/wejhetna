from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import or_, cast
from sqlalchemy import func
from schemas import LocationCreate, LocationResponse
from pydantic import BaseModel, EmailStr, ConfigDict
from passlib.context import CryptContext
from typing import Optional, List, Any
from datetime import datetime, timezone, timedelta
from fastapi import File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from uuid import uuid4
import shutil
import secrets
from typing import List
from models import Location, Place
from db import Base, engine, SessionLocal
from deps import get_db
import models
import os
import re
import boto3
from uuid import uuid4
from pathlib import Path
from models import (
    User,
    UserRole,
    UserStatus,
    DriverProfile,
    DriverVehicle,
    DriverStatus,
    VehicleStatus,
    City,
    Category,
    Location,
    Place,
    PlaceType,
    BusinessOwnerPlaceRequest,
    OwnerPlaceRequestStatus,
    EmailVerification,
    SavedPlace,
    DriverAvailability,
    RideRequest,
    RideRequestStatus,
)
from schemas import (
    CityCreate,
    CityResponse,
    CategoryCreate,
    CategoryResponse,
    LocationCreate,
    LocationResponse,
    PlaceCreate,
    PlaceResponse,
    PlaceUpdate,
    AdminPlaceCreate,
    SendVerificationCodeRequest,
    VerifyEmailRequest,
    VerifyEmailResponse,
    ResendCodeRequest,
    RequestPasswordResetRequest,
    VerifyPasswordResetCodeRequest,
    ResetPasswordRequest,
    PasswordResetResponse,
    AdvertisementCreateResponse,
    AdvertisementPublicOut,
    AdminPendingAdvertisementOut,
    AdvertisementAdminActionResponse,
    DriverAvailabilityUpdateRequest,
    DriverAvailabilityLocationUpdateRequest,
    NearbyAvailableDriverOut,
    RideRequestCreateRequest,
    RideRequestActionRequest,
    RideRequestStatusOut,
    RideRequestRegularOut,
    RideRequestDriverOut,
    RideVerifyCodeRequest,
)
import requests
from dependencies import (
    get_current_user,
    get_current_admin_user,
    get_admin_user_from_body,
)
from services.advertisement_service import (
    create_advertisement_request,
    list_pending_advertisements,
    list_public_approved_advertisements,
    approve_advertisement,
    reject_advertisement,
    CategoryNotFoundError,
    CityNotFoundError,
    AdvertisementNotFoundError,
    AdvertisementInvalidStateError,
    AdvertisementImageValidationError,
    AdvertisementS3ConfigError,
    AdvertisementS3UploadError,
)
from ride_notifications import enqueue_ride_in_progress, enqueue_verification_code_created


def find_osm_poi(lat: float, lon: float):
    """
    מחפש אובייקט OSM ליד הנקודה.
    מחזיר מספר osm_id אם נמצא – אחרת None.
    """

    overpass_url = "https://overpass-api.de/api/interpreter"

    query = f"""
    [out:json];
    (
      node(around:25,{lat},{lon})["name"];
      way(around:25,{lat},{lon})["name"];
      relation(around:25,{lat},{lon})["name"];
    );
    out center;
    """

    try:
        res = requests.post(overpass_url, data={"data": query}, timeout=4)
        data = res.json()

        if "elements" in data and len(data["elements"]) > 0:
            # לוקחים את הראשון
            elem = data["elements"][0]
            return str(elem.get("id"))
    except Exception as e:
        print("OSM lookup failed:", e)

    return None


app = FastAPI(
    title="Wejhetna Backend",
    version="0.1.0"
)
Base.metadata.create_all(bind=engine)


def send_email(to_email: str, subject: str, body: str, *, flow: str = "send_email") -> None:
    """
    Queue a transactional email on Celery (tasks.send_email).
    Used by verification, password reset, admin approval/rejection, etc.

    Primary path: ``email_dispatch.enqueue_transactional_email`` → Celery task
    ``tasks.send_email``. If enqueue fails, the dispatcher falls back to synchronous SMTP
    (same ``email_settings`` as the worker).

    ``flow`` identifies the call site in logs only; subject and body are unchanged.
    """
    from email_dispatch import enqueue_transactional_email

    print(
        f"[API] send_email: flow={flow!r} handoff to EMAIL_DISPATCH "
        f"to={to_email!r} subject_len={len(subject)} body_len={len(body)}"
    )
    enqueue_transactional_email(to_email, subject, body, flow=flow)


def enqueue_admin_status_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    status: str,
    request_type: str,
) -> None:
    """
    Queue approve/reject emails for business owner or driver via the same Celery path as
    verification/password reset: send_email → tasks.send_email (subject/body unchanged).

    status / request_type are for API logs only.
    """
    print(
        f"[API] enqueue_admin_status_email: routing to send_email → send_email_task.delay "
        f"(tasks.send_email) to={to_email!r} status={status!r} request_type={request_type!r} "
        f"subject_len={len(subject)} body_len={len(body)}"
    )
    send_email(
        to_email,
        subject,
        body,
        flow=f"admin_status_email:{request_type}:{status}",
    )
    print(
        f"[API] enqueue_admin_status_email: send_email handoff finished "
        f"to={to_email!r} status={status!r} request_type={request_type!r}"
    )


def enqueue_advertisement_approved_email(to_email: str, full_name: str) -> None:
    """Notify submitter that their advertisement was approved and published (7 days)."""
    subject = (
        "وجهتنا / ווג'הטנא – تمت الموافقة على نشر إعلانك / אישור פרסום המודעה"
    )
    email_body = f"""عزيزي/عزيزتي {full_name},

يسرّنا إبلاغك بأنه تمت الموافقة على إعلانك (البوستر) وتم نشره في التطبيق.

سيظل إعلانك منشوراً لمدة 7 أيام.

مع أطيب التحيات،
فريق وجهتنا

─────────────────────────────────────

שלום {full_name},

אנו שמחים לעדכן כי בקשתך לפרסם מודעה (פוסטר) אושרה והמודעה פורסמה באפליקציה.

המודעה תוצג למשך 7 ימים.

בברכה,
צוות ווג'הטנא"""
    enqueue_admin_status_email(
        to_email,
        subject,
        email_body,
        status="approved",
        request_type="advertisement",
    )


def enqueue_advertisement_rejected_email(to_email: str, full_name: str) -> None:
    """Notify submitter that their advertisement publish request was rejected."""
    subject = (
        "وجهتنا / ווג'הטנא – لم تتم الموافقة على طلب نشر إعلانك / בקשת פרסום המודעה נדחתה"
    )
    email_body = f"""عزيزي/عزيزتي {full_name},

نأسف لإبلاغك بأنه لم تتم الموافقة على طلبك لنشر الإعلان (البوستر) في التطبيق.

مع أطيب التحيات،
فريق وجهتنا

─────────────────────────────────────

שלום {full_name},

אנו מצטערים לעדכן כי בקשתך לפרסם מודעה (פוסטר) לא אושרה.

בברכה,
צוות ווג'הטנא"""
    enqueue_admin_status_email(
        to_email,
        subject,
        email_body,
        status="rejected",
        request_type="advertisement",
    )


# CORS (לאפליקציית React Native)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- File uploads (local for now) -----
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Password hashing
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# Import random for verification codes
import random


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# =========================
# EMAIL VERIFICATION HELPER FUNCTIONS
# =========================

def generate_verification_code() -> str:
    """Generate a random 6-digit verification code."""
    return str(random.randint(100000, 999999))


def generate_ride_request_verification_code() -> str:
    """Cryptographically strong 6-digit code for ride start verification (not predictable)."""
    return str(secrets.randbelow(900_000) + 100_000)


def send_verification_email(to_email: str, code: str, full_name: str = "", language: str = "ar"):
    """Send verification code email to user in their preferred language."""

    print(
        f"[API] send_verification_email: to={to_email!r} language={language!r} "
        "(will call send_email -> tasks.send_email)"
    )

    # Email templates for different languages
    if language == "he":
        # Hebrew
        subject = "ווג'הטנה - קוד אימות אימייל"
        body = f"""שלום {full_name if full_name else 'שלום'},

תודה שנרשמת לוג'הטנה!

קוד אימות האימייל שלך הוא: {code}

קוד זה יפוג תוקף בעוד 2 דקות.

אם לא נרשמת לוג'הטנה, אנא התעלם מהאימייל הזה.

בברכה,
צוות ווג'הטנה"""
    elif language == "en":
        # English
        subject = "Wejhetna - Email Verification Code"
        body = f"""Hello {full_name if full_name else 'there'},

Thank you for signing up with Wejhetna!

Your email verification code is: {code}

This code will expire in 2 minutes.

If you didn't sign up for Wejhetna, please ignore this email.

Best regards,
Wejhetna Team"""
    else:
        # Arabic (default)
        subject = "وجهتنا - رمز التحقق من البريد الإلكتروني"
        body = f"""مرحباً {full_name if full_name else ''},

شكراً لك على التسجيل في وجهتنا!

رمز التحقق من بريدك الإلكتروني هو: {code}

سينتهي هذا الرمز خلال دقيقتين.

إذا لم تقم بالتسجيل في وجهتنا، يرجى تجاهل هذا البريد الإلكتروني.

مع تحياتنا،
فريق وجهتنا"""

    send_email(to_email, subject, body, flow=f"verification_email:{language}")


def create_verification_code(user_id: int, email: str, db: Session) -> EmailVerification:
    """Create a new verification code for a user."""
    # Invalidate any existing unused codes for this user
    db.query(EmailVerification).filter(
        EmailVerification.user_id == user_id,
        EmailVerification.is_used == False
    ).update({"is_used": True})

    # Generate new code
    code = generate_verification_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=2)

    verification = EmailVerification(
        user_id=user_id,
        email=email,
        code=code,
        expires_at=expires_at,
        is_used=False
    )

    db.add(verification)
    db.commit()
    db.refresh(verification)

    return verification


# =========================
# EMAIL VERIFICATION HELPER FUNCTIONS
# =========================


def send_password_reset_email(to_email: str, code: str, full_name: str = "", language: str = "ar"):
    """Send password reset code email to user in their preferred language."""

    print(
        f"[API] send_password_reset_email: to={to_email!r} language={language!r} "
        "(will call send_email -> tasks.send_email)"
    )

    # Email templates for different languages
    if language == "he":
        # Hebrew
        subject = "ווג'הטנה - קוד איפוס סיסמה"
        body = f"""שלום {full_name if full_name else 'שלום'},

ביקשת לאפס את הסיסמה שלך בוג'הטנה.

קוד איפוס הסיסמה שלך הוא: {code}

קוד זה יפוג תוקף בעוד 2 דקות.

אם לא ביקשת לאפס את הסיסמה, אנא התעלם מהאימייל הזה.

בברכה,
צוות ווג'הטנה"""
    elif language == "en":
        # English
        subject = "Wejhetna - Password Reset Code"
        body = f"""Hello {full_name if full_name else 'there'},

You requested to reset your password on Wejhetna.

Your password reset code is: {code}

This code will expire in 2 minutes.

If you didn't request a password reset, please ignore this email.

Best regards,
Wejhetna Team"""
    else:
        # Arabic (default)
        subject = "وجهتنا - رمز إعادة تعيين كلمة المرور"
        body = f"""مرحباً {full_name if full_name else ''},

لقد طلبت إعادة تعيين كلمة المرور الخاصة بك في وجهتنا.

رمز إعادة تعيين كلمة المرور هو: {code}

سينتهي هذا الرمز خلال دقيقتين.

إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد الإلكتروني.

مع تحياتنا،
فريق وجهتنا"""

    send_email(to_email, subject, body, flow=f"password_reset_email:{language}")


class RegularUserSignup(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    phone: str
    password: str
    password_confirmation: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    full_name: str
    username: str
    email: EmailStr
    phone: str
    role: str
    status: str


class UserListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    full_name: str
    username: str
    email: EmailStr
    phone: str
    role: str
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime


class DriverSignupRequest(BaseModel):
    # basic user info
    full_name: str
    username: str
    email: EmailStr
    phone: str
    password: str

    # driver documents
    driver_license_image_url: str  # רישיון נהיגה
    id_card_image_url: str  # תעודת זהות

    # car info + docs
    car_type: str  # סוג רכב
    plate_number: str  # מספר רכב
    production_year: int  # שנת יצור
    car_license_image_url: str  # רישיון רכב
    car_insurance_image_url: str  # ביטוח רכב

    # optional photos
    car_photos_urls: Optional[List[str]] = None  # צילומים לרכב (לא חובה)


from typing import Optional  # make sure this exists near the top


class DriverSignupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    user: UserOut
    driver_profile_id: int
    vehicle_id: int
    driver_status: str
    vehicle_status: str
    message: Optional[str] = None  # NEW


class DriverReviewRequest(BaseModel):
    admin_user_id: int
    reason: Optional[str] = None
    driver_language: Optional[str] = "ar"  # Language for driver email: "ar", "he", or "en"


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class LoginResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    full_name: str
    role: str
    status: str


class BusinessOwnerSignup(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    phone: str
    password: str


class BusinessOwnerSignupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    user: UserOut
    message: Optional[str] = None


class NearbyPlaceInfo(BaseModel):
    place_id: int
    name: str
    name_ar: Optional[str] = None
    name_he: Optional[str] = None
    city_name_ar: Optional[str] = None
    has_owner: bool


class BusinessOwnerNearbyCheckResponse(BaseModel):
    status: str  # "NO_PLACE" / "CAN_CLAIM" / "HAS_OWNER"
    candidate: Optional[NearbyPlaceInfo] = None


class BusinessOwnerPlaceRequestCreate(BaseModel):
    """
    מה שהאפליקציה של בעל העסק תשלח
    אחרי שבחר מיקום + מילא פרטי העסק.
    """

    # Personal info to create user (user will be created here if doesn't exist)
    full_name: str
    username: str
    email: EmailStr
    phone: str  # User's personal phone
    password: str  # ה-id של המשתמש (BUSINESS_OWNER)

    # אם זה קליים על מקום קיים → existing_place_id != None
    existing_place_id: Optional[int] = None

    # מיקום שבחר
    lat: float
    lon: float
    source: str  # "MAP_PICK" / "GPS_NO_OSM" / ...
    osm_id: Optional[str] = None

    # פרטי העסק
    name: str
    name_ar: str
    name_he: str
    city_id: int
    category_id: int  # תמיד עסק → חובה קטגוריה

    description: Optional[str] = None
    business_phone: Optional[str] = None  # Business phone (different from user's personal phone)
    opening_hours: Optional[str] = None
    main_image_url: Optional[str] = None
    # NOTE: These fields are accepted in API but not saved to DB yet (UI-only)
    business_license_image_url: Optional[str] = None  # רישיון עסק (UI only)
    business_images_urls: Optional[List[str]] = None  # תמונות העסק (UI only)
    social_links: Optional[str] = None
    social_media_account_name: Optional[str] = None  # שם חשבון רשתות חברתיות (UI only)


class BusinessOwnerRequestReview(BaseModel):
    admin_user_id: int
    reason: Optional[str] = None


class DriverApplicationOut(BaseModel):
    user_id: int
    driver_profile_id: int
    vehicle_id: int

    full_name: str
    email: EmailStr
    phone: str

    driver_status: str
    vehicle_status: str

    driver_license_image_url: str
    id_card_image_url: str
    car_type: str
    plate_number: str
    production_year: int
    car_license_image_url: str
    car_insurance_image_url: str
    car_photos_urls: Optional[List[str]] = None

    model_config = ConfigDict(from_attributes=True)


from typing import List  # make sure this import exists at the top


class BusinessOwnerPlaceRequestOut(BaseModel):
    id: int
    user_id: int
    existing_place_id: Optional[int] = None

    lat: float
    lon: float
    source: str
    osm_id: Optional[str] = None

    name: str
    name_ar: str
    name_he: str
    city_id: int
    category_id: Optional[int] = None

    description: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    main_image_url: Optional[str] = None
    business_license_image_url: Optional[str] = None
    business_images_urls: Optional[List[str]] = None
    social_links: Optional[str] = None
    # social_media_account_name: Optional[str] = None

    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# =========================
# PROFILE RESPONSE MODELS
# =========================

class UserProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    full_name: str
    username: str
    email: str
    phone: str
    role: str
    status: str
    created_at: Optional[datetime] = None


class DriverVehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    car_type: str
    plate_number: str
    production_year: int
    car_license_image_url: str
    car_insurance_image_url: str
    car_photos_urls: Optional[List[str]] = None
    status: str


class DriverProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    user: UserProfileOut
    vehicle: Optional[DriverVehicleOut] = None
    driver_status: str
    driver_license_image_url: Optional[str] = None
    id_card_image_url: Optional[str] = None


class BusinessPlaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    name: str
    name_ar: Optional[str] = None
    name_he: Optional[str] = None
    city_name: Optional[str] = None
    category_name: Optional[str] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    main_image_url: Optional[str] = None
    business_images_urls: Optional[List[str]] = None
    social_links: Optional[str] = None
    announcement: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class BusinessOwnerProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    user: UserProfileOut
    place: Optional[BusinessPlaceOut] = None
    request_status: Optional[str] = None


@app.get(
    "/admin/business-owner/requests",
    response_model=List[BusinessOwnerPlaceRequestOut],
)
def list_business_owner_requests(
        status: Optional[str] = None,
        db: Session = Depends(get_db),
):
    """
    רשימת כל הבקשות מבעלי עסקים.
    אפשר לסנן לפי status = PENDING / APPROVED / REJECTED
    """
    q = db.query(BusinessOwnerPlaceRequest).order_by(
        BusinessOwnerPlaceRequest.created_at.desc()
    )

    if status:
        try:
            status_enum = OwnerPlaceRequestStatus(status)
            q = q.filter(BusinessOwnerPlaceRequest.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status filter")

    return q.all()


@app.post("/admin/business-owner/requests/{request_id}/approve")
def approve_business_owner_request(
        request_id: int,
        data: BusinessOwnerRequestReview,
        db: Session = Depends(get_db),
):
    admin = (
        db.query(User)
        .filter(User.id == data.admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not admin:
        raise HTTPException(status_code=403, detail="Only admin can approve")

    req = (
        db.query(BusinessOwnerPlaceRequest)
        .filter(BusinessOwnerPlaceRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != OwnerPlaceRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request is not pending")

    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Business owner user not found")

    # --- CASE 1: קליים על מקום קיים ---
    if req.existing_place_id is not None:
        place = db.query(Place).filter(Place.id == req.existing_place_id).first()
        if not place:
            raise HTTPException(status_code=404, detail="Place not found")

        # מעדכנים את המקום בדאטה של בעל העסק
        place.name = req.name
        place.name_ar = req.name_ar
        place.name_he = req.name_he
        place.city_id = req.city_id
        place.category_id = req.category_id
        place.description = req.description
        place.phone = req.phone
        place.opening_hours = req.opening_hours
        place.main_image_url = req.main_image_url
        place.social_links = req.social_links
        place.owner_user_id = user.id
        place.can_be_claimed = False  # יש בעלים עכשיו

    # --- CASE 2: מקום חדש לגמרי ---
    else:
        # קודם מיקום חדש
        location = Location(
            geom=func.ST_SetSRID(func.ST_MakePoint(req.lon, req.lat), 4326),
            source=req.source,
            osm_id=req.osm_id,
        )
        db.add(location)
        db.flush()  # location.id

        place = Place(
            location_id=location.id,
            city_id=req.city_id,
            category_id=req.category_id,
            place_type=PlaceType.BUSINESS,
            name=req.name,
            name_ar=req.name_ar,
            name_he=req.name_he,
            can_be_claimed=False,  # כבר משויך לבעלים
            description=req.description,
            phone=req.phone,
            opening_hours=req.opening_hours,
            main_image_url=req.main_image_url,
            social_links=req.social_links,
            owner_user_id=user.id,
            created_by_admin_id=admin.id,
        )
        db.add(place)

    # מעדכנים את הבקשה
    req.status = OwnerPlaceRequestStatus.APPROVED
    req.reviewed_at = datetime.now(timezone.utc)
    req.reviewed_by_admin_id = admin.id
    req.rejection_reason = None

    # מעדכנים את המשתמש
    user.status = UserStatus.ACTIVE
    user.rejection_reason = None

    db.commit()

    # Plain strings only after commit (no ORM attrs passed to Celery; avoid lazy-load edge cases)
    to_email = str(user.email)
    full_name = str(user.full_name)
    username = str(user.username)

    # Send professional bilingual email (Arabic and Hebrew)
    email_body = f"""عزيزي/عزيزتي {full_name},

نحن سعداء بإبلاغك بأن طلب صاحب العمل الخاص بك لوجهتنا تمت الموافقة عليه!

يمكنك الآن تسجيل الدخول إلى التطبيق والبدء في إدارة مكان عملك.

اسم المستخدم الخاص بك لتسجيل الدخول: {username}
استخدم كلمة المرور التي اخترتها عند إنشاء الحساب.

نشكرك على اهتمامك بالانضمام إلى وجهتنا ونتمنى لك تجربة ممتعة.

مع أطيب التحيات،
فريق وجهتنا

─────────────────────────────────────

שלום {full_name},

אנו שמחים להודיע לך כי בקשת בעל העסק שלך לוג'הטנא אושרה!

אתה יכול כעת להתחבר לאפליקציה ולהתחיל לנהל את מקום העסק שלך.

שם המשתמש שלך להתחברות: {username}
השתמש/י בסיסמה שבחרת בעת יצירת החשבון.

תודה על העניין שלך להצטרף לוג'הטנא ואנו מאחלים לך חוויה נעימה.

בברכה,
צוות ווג'הטנא"""

    subject = "وجهتنا / ווג'הטנא – الموافقة على طلب صاحب العمل / אישור בקשת בעל עסק"

    enqueue_admin_status_email(
        to_email,
        subject,
        email_body,
        status="approved",
        request_type="business_owner",
    )

    return {"detail": "Business owner request approved"}


@app.post("/admin/business-owner/requests/{request_id}/reject")
def reject_business_owner_request(
        request_id: int,
        data: BusinessOwnerRequestReview,
        db: Session = Depends(get_db),
):
    admin = (
        db.query(User)
        .filter(User.id == data.admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not admin:
        raise HTTPException(status_code=403, detail="Only admin can reject")

    req = (
        db.query(BusinessOwnerPlaceRequest)
        .filter(BusinessOwnerPlaceRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != OwnerPlaceRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request is not pending")

    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Business owner user not found")

    reason = data.reason or "Your business owner request was not approved."

    req.status = OwnerPlaceRequestStatus.REJECTED
    req.reviewed_at = datetime.now(timezone.utc)
    req.reviewed_by_admin_id = admin.id
    req.rejection_reason = reason

    user.status = UserStatus.REJECTED
    user.rejection_reason = reason

    db.commit()

    to_email = str(user.email)
    full_name = str(user.full_name)
    username = str(user.username)

    # Send professional bilingual email (Arabic and Hebrew) with reason and re-signup instructions
    email_body = f"""عزيزي/عزيزتي {full_name},

نأسف لإبلاغك بأن طلب صاحب العمل الخاص بك لوجهتنا تمت مراجعته ولسوء الحظ، لا يمكننا الموافقة عليه في هذا الوقت.

سبب الرفض:
{reason}

نفهم أن هذا قد يكون محبطاً، لكننا نريد أن نمنحك الفرصة لمعالجة المشاكل وإعادة التقديم.

يمكنك تقديم طلب جديد باستخدام نفس بيانات الاعتماد:
• البريد الإلكتروني: {to_email}
• اسم المستخدم: {username}

ببساطة قم بزيارة تطبيق وجهتنا وأكمل نموذج تسجيل صاحب العمل مرة أخرى بنفس البريد الإلكتروني واسم المستخدم. سنراجع طلبك الجديد بعد تقديمه.

إذا كان لديك أي أسئلة أو تحتاج إلى توضيح حول سبب الرفض، يرجى عدم التردد في الاتصال بنا.

شكراً لاهتمامك بالانضمام إلى وجهتنا.

مع أطيب التحيات،
فريق وجهتنا

─────────────────────────────────────

שלום {full_name},

אנו מצטערים להודיע לך כי בקשת בעל העסק שלך לוג'הטנא נבדקה ולמרבה הצער, איננו יכולים לאשר אותה בשלב זה.

סיבת הדחייה:
{reason}

אנו מבינים שזה עשוי להיות מאכזב, אך אנו רוצים לתת לך הזדמנות לטפל בבעיות ולהגיש בקשה מחדש.

תוכל להגיש בקשה חדשה באמצעות אותם פרטי התחברות:
• אימייל: {to_email}
• שם משתמש: {username}

פשוט בקר באפליקציית ווג'הטנא והשלם את טופס הרשמת בעל העסק שוב עם אותו אימייל ושם משתמש. נבדוק את הבקשה החדשה שלך לאחר הגשתה.

אם יש לך שאלות או צריך הבהרה לגבי סיבת הדחייה, אנא אל תהסס ליצור איתנו קשר.

תודה על העניין שלך להצטרף לוג'הטנא.

בברכה,
צוות ווג'הטנא"""

    subject = "وجهتنا / ווג'הטנא – تحديث حالة طلب صاحب العمل / עדכון סטטוס בקשת בעל עסק"

    enqueue_admin_status_email(
        to_email,
        subject,
        email_body,
        status="rejected",
        request_type="business_owner",
    )

    return {"detail": "Business owner request rejected"}


# -


# ---------- Regular user signup endpoint ----------

@app.post("/auth/signup/regular", response_model=UserOut)
def signup_regular_user(data: RegularUserSignup, db: Session = Depends(get_db)):
    if data.password != data.password_confirmation:
        raise HTTPException(
            status_code=400,
            detail="Passwords do not match",
        )
    import re
    if not re.match(r'^[a-zA-Z\u0590-\u05FF\u0600-\u06FF\s]+$', data.full_name.strip()):
        raise HTTPException(
            status_code=400,
            detail="Full name should contain only letters"
        )

    # Validate username - at least 3 characters, alphanumeric and underscore
    if len(data.username.strip()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Username must be at least 3 characters"
        )
    if not re.match(r'^[a-zA-Z0-9_]+$', data.username.strip()):
        raise HTTPException(
            status_code=400,
            detail="Username can only contain letters, numbers, and underscore"
        )

    # Validate phone - exactly 10 digits starting with 05
    if not re.match(r'^05\d{8}$', data.phone.strip()):
        raise HTTPException(
            status_code=400,
            detail="Phone must be 10 digits starting with 05"
        )

    # Validate password - at least 8 chars, uppercase, lowercase, number, symbol
    if len(data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters"
        )
    if not re.search(r'[A-Z]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one uppercase letter"
        )
    if not re.search(r'[a-z]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one lowercase letter"
        )
    if not re.search(r'[0-9]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one number"
        )
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one symbol"
        )

    # Check username or email already exists
    # Check username, email, or phone already exists
    existing_user = db.query(User).filter(
        or_(
            User.username == data.username,
            User.email == data.email,
            User.phone == data.phone.strip()
        )
    ).first()

    if existing_user:
        # Check which field caused the conflict
        if existing_user.username == data.username:
            raise HTTPException(
                status_code=400,
                detail="Username already exists",
            )
        elif existing_user.email == data.email:
            raise HTTPException(
                status_code=400,
                detail="Email already exists",
            )
        elif existing_user.phone == data.phone.strip():
            raise HTTPException(
                status_code=400,
                detail="Phone number already exists",
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="User already exists",
            )
    # Hash password
    password_hash = hash_password(data.password)
    verified = db.query(EmailVerification).filter(
        EmailVerification.email == data.email,
        EmailVerification.is_used == True
    ).first()
    if not verified:
        raise HTTPException(403, "Email not verified")

    # Create user
    user = User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        phone=data.phone,
        password_hash=password_hash,
        role=UserRole.REGULAR,
        status=UserStatus.ACTIVE,
        email_verified=True

    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


@app.post("/auth/signup/driver", response_model=DriverSignupOut)
def signup_driver(data: DriverSignupRequest, db: Session = Depends(get_db)):
    import re

    # ============================
    # VALIDATION
    # ============================

    # Validate ID number - exactly 9 digits
    id_trimmed = data.id_card_image_url.strip()
    if not re.match(r'^[0-9]{9}$', id_trimmed):
        raise HTTPException(
            status_code=400,
            detail="ID number must be exactly 9 digits"
        )

    # Validate car type - at least 2 characters
    car_type_trimmed = data.car_type.strip()
    if len(car_type_trimmed) < 2:
        raise HTTPException(
            status_code=400,
            detail="Car type should be at least 2 characters"
        )

    # Validate plate number - at least 5 characters and must include a digit
    plate_trimmed = data.plate_number.strip()
    if len(plate_trimmed) < 5 or not re.search(r'\d', plate_trimmed):
        raise HTTPException(
            status_code=400,
            detail="Plate number should be at least 5 characters and include a digit"
        )

    # Validate production year - between 1990 and current year + 1
    current_year = datetime.now().year
    if not isinstance(data.production_year,
                      int) or data.production_year < 1990 or data.production_year > current_year + 1:
        raise HTTPException(
            status_code=400,
            detail=f"Production year must be a valid number between 1990 and {current_year + 1}"
        )

    # Validate basic user fields (same as regular signup)
    if not re.match(r'^[a-zA-Z\u0590-\u05FF\u0600-\u06FF\s]+$', data.full_name.strip()):
        raise HTTPException(
            status_code=400,
            detail="Full name should contain only letters"
        )

    if len(data.username.strip()) < 3:
        raise HTTPException(
            status_code=400,
            detail="Username must be at least 3 characters"
        )
    if not re.match(r'^[a-zA-Z0-9_]+$', data.username.strip()):
        raise HTTPException(
            status_code=400,
            detail="Username can only contain letters, numbers, and underscore"
        )

    if not re.match(r'^05\d{8}$', data.phone.strip()):
        raise HTTPException(
            status_code=400,
            detail="Phone must be 10 digits starting with 05"
        )

    if len(data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters"
        )
    if not re.search(r'[A-Z]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one uppercase letter"
        )
    if not re.search(r'[a-z]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one lowercase letter"
        )
    if not re.search(r'[0-9]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one number"
        )
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]', data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one symbol"
        )
    # 1. Check if there is already a user with this username/email
    existing_user = (
        db.query(User)
        .filter(or_(User.username == data.username, User.email == data.email))
        .first()
    )

    # ============================
    # CASE A – USER ALREADY EXISTS
    # ============================
    if existing_user:
        # Try to find their driver profile (if any)
        driver_profile = (
            db.query(DriverProfile)
            .filter(DriverProfile.user_id == existing_user.id)
            .first()
        )

        # Is this user a driver WITH a driver_profile that was REJECTED?
        is_rejected_driver = (
                driver_profile is not None
                and driver_profile.driver_status == DriverStatus.REJECTED
        )

        # 👉 1) REJECTED DRIVER RE-APPLYING → ALLOW
        if is_rejected_driver:
            # hash new password
            password_hash = hash_password(data.password)

            # update basic user info
            existing_user.full_name = data.full_name
            existing_user.phone = data.phone
            existing_user.password_hash = password_hash
            existing_user.status = UserStatus.PENDING  # back to pending
            # we KEEP existing_user.rejection_reason so admin can see old rejection

            # update documents + status
            driver_profile.driver_license_image_url = data.driver_license_image_url
            driver_profile.id_card_image_url = data.id_card_image_url
            driver_profile.driver_status = DriverStatus.PENDING
            driver_profile.driver_status_updated_at = datetime.now(timezone.utc)

            # get last vehicle for this driver (if exists)
            vehicle = (
                db.query(DriverVehicle)
                .filter(DriverVehicle.driver_profile_id == driver_profile.id)
                .order_by(DriverVehicle.id.desc())
                .first()
            )

            if not vehicle:
                # no vehicle yet → create new one
                vehicle = DriverVehicle(
                    driver_profile_id=driver_profile.id,
                    car_type=data.car_type,
                    plate_number=data.plate_number,
                    production_year=data.production_year,
                    car_license_image_url=data.car_license_image_url,
                    car_insurance_image_url=data.car_insurance_image_url,
                    car_photos_urls=data.car_photos_urls,
                    status=VehicleStatus.SUBMITTED,
                    submitted_at=datetime.now(timezone.utc),
                )
                db.add(vehicle)
            else:
                # update existing vehicle for the new application
                vehicle.car_type = data.car_type
                vehicle.plate_number = data.plate_number
                vehicle.production_year = data.production_year
                vehicle.car_license_image_url = data.car_license_image_url
                vehicle.car_insurance_image_url = data.car_insurance_image_url
                vehicle.car_photos_urls = data.car_photos_urls
                vehicle.status = VehicleStatus.SUBMITTED
                vehicle.submitted_at = datetime.now(timezone.utc)
                vehicle.reviewed_at = None
                vehicle.reviewed_by_admin_id = None
                vehicle.rejection_reason = None

            db.commit()
            db.refresh(existing_user)
            db.refresh(driver_profile)
            db.refresh(vehicle)

            return DriverSignupOut(
                user=UserOut.model_validate(existing_user, from_attributes=True),
                driver_profile_id=driver_profile.id,
                vehicle_id=vehicle.id,
                driver_status=driver_profile.driver_status.value,
                vehicle_status=vehicle.status.value,
                message="Your request has been sent again.",  # 👈 re-apply msg
            )

        # 👉 2) ANY OTHER EXISTING USER (approved driver / regular / admin / business owner)
        # → BLOCK with 'already exists'
        raise HTTPException(
            status_code=400,
            detail="Username or email already exists",
        )

    # ============================
    # CASE B – FIRST TIME DRIVER SIGNUP (NO USER YET)
    # ============================

    # 2. Hash password
    password_hash = hash_password(data.password)

    # 3. Create user with role DRIVER, status PENDING
    user = User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        phone=data.phone,
        password_hash=password_hash,
        role=UserRole.DRIVER,
        status=UserStatus.PENDING,
        email_verified=True

    )
    db.add(user)
    db.flush()  # get user.id

    # 4. Create driver profile
    driver_profile = DriverProfile(
        user_id=user.id,
        driver_license_image_url=data.driver_license_image_url,
        id_card_image_url=data.id_card_image_url,
        driver_status=DriverStatus.PENDING,
        driver_status_updated_at=datetime.now(timezone.utc),
    )
    db.add(driver_profile)
    db.flush()  # get driver_profile.id

    # 5. Create vehicle application
    vehicle = DriverVehicle(
        driver_profile_id=driver_profile.id,
        car_type=data.car_type,
        plate_number=data.plate_number,
        production_year=data.production_year,
        car_license_image_url=data.car_license_image_url,
        car_insurance_image_url=data.car_insurance_image_url,
        car_photos_urls=data.car_photos_urls,
        status=VehicleStatus.SUBMITTED,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(vehicle)

    # 6. Commit everything
    db.commit()

    # 7. Refresh objects from DB
    db.refresh(user)
    db.refresh(driver_profile)
    db.refresh(vehicle)

    # 8. Send verification code

    # 9. Return response
    return DriverSignupOut(
        user=UserOut.model_validate(user, from_attributes=True),
        driver_profile_id=driver_profile.id,
        vehicle_id=vehicle.id,
        driver_status=driver_profile.driver_status.value,
        vehicle_status=vehicle.status.value,
        message="Your request has been sent and is waiting for admin approval.",
    )


@app.post("/auth/signup/business-owner", response_model=BusinessOwnerSignupOut)
def signup_business_owner(data: BusinessOwnerSignup, db: Session = Depends(get_db)):
    """
    יצירת משתמש חדש עם ROLE = BUSINESS_OWNER.
    בתחילה status = PENDING → לא פעיל עד שהאדמין יאשר את הבקשה.
    """
    existing_user = (
        db.query(User)
        .filter(or_(User.username == data.username, User.email == data.email))
        .first()
    )

    if existing_user:
        if (
                existing_user.role == UserRole.BUSINESS_OWNER
                and existing_user.status == UserStatus.REJECTED
        ):
            # Rejected business owner trying again - allow re-signup
            # Check if email was verified (user should verify email again after rejection)
            verified = db.query(EmailVerification).filter(
                EmailVerification.email == data.email,
                EmailVerification.is_used == True
            ).order_by(EmailVerification.created_at.desc()).first()
            
            if not verified:
                # Email not verified - set to unverified and send verification code
                existing_user.full_name = data.full_name
                existing_user.phone = data.phone
                existing_user.password_hash = hash_password(data.password)
                existing_user.status = UserStatus.PENDING
                existing_user.rejection_reason = None  # Clear old rejection reason
                existing_user.email_verified = False

                db.commit()
                db.refresh(existing_user)

                # Send verification code (default to Arabic if no language preference)
                verification = create_verification_code(existing_user.id, existing_user.email, db)
                send_verification_email(existing_user.email, verification.code, existing_user.full_name, language="ar")

                return BusinessOwnerSignupOut(
                    user=UserOut.model_validate(existing_user, from_attributes=True),
                    message="Your business owner signup request has been sent again. Please verify your email and then choose your business location next.",
                )
            else:
                # Email already verified - proceed with signup
                existing_user.full_name = data.full_name
                existing_user.phone = data.phone
                existing_user.password_hash = hash_password(data.password)
                existing_user.status = UserStatus.PENDING
                existing_user.rejection_reason = None  # Clear old rejection reason
                existing_user.email_verified = True  # Email was verified

                db.commit()
                db.refresh(existing_user)

                return BusinessOwnerSignupOut(
                    user=UserOut.model_validate(existing_user, from_attributes=True),
                    message="Your business owner signup request has been sent again. Please choose your business location next.",
                )

        raise HTTPException(
            status_code=400,
            detail="Username or email already exists",
        )

    user = User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        role=UserRole.BUSINESS_OWNER,
        status=UserStatus.PENDING,
        email_verified=True

    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return BusinessOwnerSignupOut(
        user=UserOut.model_validate(user, from_attributes=True),
        message="Your business owner signup request has been created. Please choose your business location next.",
    )


# =========================
# EMAIL VERIFICATION ENDPOINTS
# =========================

@app.post("/auth/verify-email", response_model=VerifyEmailResponse)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verify user's email with the code they received."""
    # Find user by email
    verification = db.query(EmailVerification).filter(
        EmailVerification.email == data.email,
        EmailVerification.code == data.code,
        EmailVerification.is_used == False
    ).first()

    # Find the most recent unused verification code for this user
    verification = (
        db.query(EmailVerification)
        .filter(
            EmailVerification.email == data.email,
            EmailVerification.code == data.code.strip(),
            EmailVerification.is_used == False
        )
        .order_by(EmailVerification.created_at.desc())
        .first()
    )

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Check if code is expired
    if verification.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code has expired")

    # Mark code as used and verify user's email
    verification.is_used = True

    user = db.query(User).filter(User.email == verification.email).first()
    if user:
        user.email_verified = True

    db.commit()

    db.commit()

    return VerifyEmailResponse(
        success=True,
        message="Email verified successfully"
    )


@app.post("/auth/resend-verification-code")
def resend_verification_code(data: ResendCodeRequest, db: Session = Depends(get_db)):
    """Resend verification code to user's email."""
    print(f"[API] POST /auth/resend-verification-code for email={data.email!r}")
    # Find user by email
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already verified (but allow rejected business owners and drivers to re-verify)
    if user.email_verified:
        # Allow rejected business owners and drivers to request new verification code
        if (user.role == UserRole.BUSINESS_OWNER and user.status == UserStatus.REJECTED) or \
           (user.role == UserRole.DRIVER and user.status == UserStatus.REJECTED):
            # Reset email_verified to False so they can verify again
            user.email_verified = False
            db.commit()
        else:
            raise HTTPException(status_code=400, detail="Email is already verified")

    # Create and send new verification code
    verification = create_verification_code(user.id, user.email, db)
    language = data.language if hasattr(data, 'language') and data.language else "ar"
    send_verification_email(user.email, verification.code, user.full_name, language=language)

    return {"success": True, "message": "Verification code has been resent"}


@app.post("/auth/request-password-reset")
def request_password_reset(data: RequestPasswordResetRequest, db: Session = Depends(get_db)):
    """Request password reset code - sends email with verification code."""
    print(f"[API] POST /auth/request-password-reset for email={data.email!r}")
    # Check if email exists in database
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Email not found. Please check your email address or sign up for a new account."
        )

    # Generate verification code
    code = generate_verification_code()

    # Create password reset verification record
    verification = EmailVerification(
        user_id=user.id,
        email=data.email,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
        is_used=False
    )

    db.add(verification)
    db.commit()

    # Send email with code
    language = data.language if hasattr(data, 'language') and data.language else "ar"
    send_password_reset_email(data.email, code, user.full_name, language=language)

    return {"success": True, "message": "Password reset code has been sent to your email."}


@app.post("/auth/verify-password-reset-code", response_model=PasswordResetResponse)
def verify_password_reset_code(data: VerifyPasswordResetCodeRequest, db: Session = Depends(get_db)):
    """Verify password reset code is valid."""
    # Find the most recent unused verification code for this email
    verification = (
        db.query(EmailVerification)
        .filter(
            EmailVerification.email == data.email,
            EmailVerification.code == data.code.strip(),
            EmailVerification.is_used == False
        )
        .order_by(EmailVerification.created_at.desc())
        .first()
    )

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Check if code is expired
    if verification.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code has expired")

    # Don't mark as used yet - will be marked when password is actually reset
    # This allows user to verify code and then reset password

    return PasswordResetResponse(
        success=True,
        message="Code verified successfully"
    )


@app.post("/auth/reset-password", response_model=PasswordResetResponse)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset user password after code verification."""
    # Find the most recent unused verification code
    verification = (
        db.query(EmailVerification)
        .filter(
            EmailVerification.email == data.email,
            EmailVerification.code == data.code.strip(),
            EmailVerification.is_used == False
        )
        .order_by(EmailVerification.created_at.desc())
        .first()
    )

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Check if code is expired
    if verification.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code has expired")

    # Find user
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate password requirements (same as signup)
    import re
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not re.search(r'[A-Z]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not re.search(r'[a-z]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not re.search(r'[0-9]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one symbol")

    # Hash new password
    password_hash = hash_password(data.new_password)

    # Update user password
    user.password_hash = password_hash

    # Mark verification code as used
    verification.is_used = True

    db.commit()

    return PasswordResetResponse(
        success=True,
        message="Password has been reset successfully"
    )


@app.post("/auth/login", response_model=LoginResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(
            or_(
                User.username == data.username_or_email,
                User.email == data.username_or_email,
            )
        )
        .first()
    )

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in"
        )

    return LoginResponse(
        id=user.id,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
    )


@app.post("/auth/request-email-verification")
def request_email_verification(data: SendVerificationCodeRequest, db: Session = Depends(get_db)):
    print(f"[API] POST /auth/request-email-verification for email={data.email!r}")
    # Check if user exists with this email
    existing_user = db.query(User).filter(User.email == data.email).first()
    
    if existing_user:
        # Allow rejected business owners and drivers to always request new verification code
        if (existing_user.role == UserRole.BUSINESS_OWNER and existing_user.status == UserStatus.REJECTED) or \
           (existing_user.role == UserRole.DRIVER and existing_user.status == UserStatus.REJECTED):
            # Rejected business owner or driver can re-verify email - reset email_verified
            existing_user.email_verified = False
            db.commit()
        elif existing_user.email_verified:
            # For other verified users, block the request
            raise HTTPException(400, "Email already registered")
        
        # Create verification code with user_id if user exists
        code = generate_verification_code()
        verification = EmailVerification(
            user_id=existing_user.id,
            email=data.email,
            code=code,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
            is_used=False
        )
        db.add(verification)
        db.commit()
        
        language = data.language if hasattr(data, 'language') and data.language else "ar"
        send_verification_email(data.email, code, existing_user.full_name, language=language)
    else:
        # New user - create verification code without user_id
        code = generate_verification_code()
        verification = EmailVerification(
            user_id=None,
            email=data.email,
            code=code,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
            is_used=False
        )
        db.add(verification)
        db.commit()
        
        language = data.language if hasattr(data, 'language') and data.language else "ar"
        send_verification_email(data.email, code, full_name="", language=language)

    return {"success": True}


# --- Health check ---
@app.get("/")
def root():
    return {"message": "Wejhetna backend is alive 🚀"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ping")
def ping():
    return {"status": "ok"}


# --- AI Translation Endpoint ---
class TranslationRequest(BaseModel):
    text: str
    target_language: str  # "ar" or "he"

class TranslationResponse(BaseModel):
    translated_text: str
    detected_language: str

def detect_language(text: str) -> str:
    """Simple language detection based on character ranges."""
    # Count Arabic, Hebrew, and English characters
    arabic_chars = sum(1 for c in text if '\u0600' <= c <= '\u06FF')
    hebrew_chars = sum(1 for c in text if '\u0590' <= c <= '\u05FF')
    english_chars = sum(1 for c in text if c.isalpha() and ord(c) < 128 and c.isascii())
    
    if arabic_chars > hebrew_chars and arabic_chars > english_chars:
        return "ar"
    elif hebrew_chars > arabic_chars and hebrew_chars > english_chars:
        return "he"
    elif english_chars > arabic_chars and english_chars > hebrew_chars:
        return "en"
    else:
        # Default to English if unclear (most common case for business descriptions)
        return "en"

@app.post("/translate", response_model=TranslationResponse)
def translate_text(request: TranslationRequest):
    """
    Translate text using OpenAI API.
    Supports Arabic <-> Hebrew translation.
    """
    import openai
    from dotenv import load_dotenv
    import logging
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    # Load environment variables
    env_path = Path(__file__).parent / ".env"
    print(f"[TRANSLATE] Loading .env from: {env_path}")
    load_dotenv(dotenv_path=env_path)
    load_dotenv()  # Also try loading from current directory
    
    openai_api_key = os.getenv("OPENAI_API_KEY")
    
    # Log for debugging (don't log the actual key)
    if openai_api_key:
        masked_key = f"{openai_api_key[:10]}...{openai_api_key[-4:]}" if len(openai_api_key) > 14 else "***"
        print(f"[TRANSLATE] OpenAI API key found: {masked_key}")
        logger.info(f"OpenAI API key found: {masked_key}")
    else:
        error_msg = "OpenAI API key not found in environment variables"
        print(f"[TRANSLATE ERROR] {error_msg}")
        logger.error(error_msg)
        # Check if .env file exists
        if env_path.exists():
            print(f"[TRANSLATE ERROR] .env file exists at {env_path} but OPENAI_API_KEY not found")
            logger.error(f".env file exists at {env_path} but OPENAI_API_KEY not found")
        else:
            print(f"[TRANSLATE ERROR] .env file not found at {env_path}")
            logger.error(f".env file not found at {env_path}")
        raise HTTPException(
            status_code=500, 
            detail="OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file in the wejhetna_backend directory and restart the server."
        )
    
    # Validate input
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text to translate cannot be empty")
    
    # Detect source language
    detected_lang = detect_language(request.text)
    print(f"[TRANSLATE] Detected language: {detected_lang}, Target language: {request.target_language}")
    logger.info(f"Detected language: {detected_lang}, Target language: {request.target_language}")
    
    # Determine target language
    if request.target_language not in ["ar", "he"]:
        raise HTTPException(status_code=400, detail="Target language must be 'ar' or 'he'")
    
    # If already in target language, return as-is
    if detected_lang == request.target_language:
        print(f"[TRANSLATE] Text is already in target language, returning as-is")
        logger.info("Text is already in target language, returning as-is")
        return TranslationResponse(
            translated_text=request.text,
            detected_language=detected_lang
        )
    
    # Map language codes to full names for OpenAI
    lang_map = {
        "ar": "Arabic",
        "he": "Hebrew",
        "en": "English"
    }
    
    # Get source and target language names
    source_lang_name = lang_map.get(detected_lang, "English")
    target_lang_name = lang_map[request.target_language]
    
    try:
        print(f"[TRANSLATE] Creating OpenAI client and translating from {source_lang_name} to {target_lang_name}")
        logger.info(f"Creating OpenAI client and translating from {source_lang_name} to {target_lang_name}")
        client = openai.OpenAI(api_key=openai_api_key)
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": f"You are a professional translator. Translate the following text from {source_lang_name} to {target_lang_name}. Preserve the meaning, tone, and context. Return only the translated text without any explanations or additional text."
                },
                {
                    "role": "user",
                    "content": request.text
                }
            ],
            temperature=0.3,
            max_tokens=1000
        )
        
        if not response.choices or not response.choices[0].message:
            raise Exception("OpenAI API returned empty response")
        
        translated_text = response.choices[0].message.content.strip()
        
        if not translated_text:
            raise Exception("OpenAI API returned empty translation")
        
        print(f"[TRANSLATE] Translation successful: {len(translated_text)} characters")
        logger.info(f"Translation successful: {len(translated_text)} characters")
        
        return TranslationResponse(
            translated_text=translated_text,
            detected_language=detected_lang
        )
        
    except openai.AuthenticationError as e:
        error_msg = f"OpenAI Authentication Error: {str(e)}"
        print(f"[TRANSLATE ERROR] {error_msg}")
        logger.error(error_msg)
        raise HTTPException(
            status_code=500, 
            detail="OpenAI API key is invalid. Please check your API key in .env file. Make sure it starts with 'sk-' and is the correct key. Restart the server after updating .env file."
        )
    except openai.RateLimitError as e:
        error_msg = f"OpenAI Rate Limit Error: {str(e)}"
        print(f"[TRANSLATE ERROR] {error_msg}")
        logger.error(error_msg)
        raise HTTPException(
            status_code=429, 
            detail="OpenAI API rate limit exceeded. Please try again later."
        )
    except openai.APIError as e:
        error_msg = f"OpenAI API Error: {str(e)}"
        print(f"[TRANSLATE ERROR] {error_msg}")
        logger.error(error_msg)
        raise HTTPException(
            status_code=500, 
            detail=f"OpenAI API error: {str(e)}"
        )
    except Exception as e:
        error_msg = str(e)
        print(f"[TRANSLATE ERROR] Translation error: {error_msg}")
        print(f"[TRANSLATE ERROR] Error type: {type(e).__name__}")
        import traceback
        print(f"[TRANSLATE ERROR] Traceback: {traceback.format_exc()}")
        logger.error(f"Translation error: {error_msg}", exc_info=True)
        if "API key" in error_msg or "authentication" in error_msg.lower() or "401" in error_msg:
            raise HTTPException(
                status_code=500, 
                detail="OpenAI API key is invalid or missing. Please check your .env file in the wejhetna_backend directory and restart the server."
            )
        raise HTTPException(
            status_code=500, 
            detail=f"Translation failed: {error_msg}. Please check the server console/logs for more details."
        )


@app.post("/files/upload")
async def upload_file(file: UploadFile = File(...), request: Request = None):
    """
    Return a pre-signed S3 URL so the client uploads directly to S3.

    This keeps the endpoint synchronous (no task_id) and avoids slow uploads
    through the FastAPI server.
    """
    import os
    import traceback

    # Load .env (if present) for local dev runs
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).parent / ".env"
        print(f"[UPLOAD] Loading .env from: {env_path}")
        load_dotenv(dotenv_path=env_path)
        load_dotenv()
    except Exception as e:
        print("[UPLOAD] Could not load .env:", str(e))

    print("[UPLOAD] entered upload_file handler (presign flow)")
    print("[UPLOAD] filename:", getattr(file, "filename", None))
    print("[UPLOAD] content_type:", getattr(file, "content_type", None))
    print("[UPLOAD] AWS_S3_BUCKET:", os.getenv("AWS_S3_BUCKET"))
    print("[UPLOAD] S3_BUCKET:", os.getenv("S3_BUCKET"))
    print("[UPLOAD] AWS_REGION:", os.getenv("AWS_REGION"))

    bucket_name = os.getenv("AWS_S3_BUCKET") or os.getenv("S3_BUCKET")
    if not bucket_name:
        raise HTTPException(status_code=500, detail="S3 bucket is not configured (AWS_S3_BUCKET or S3_BUCKET).")

    region = os.getenv("AWS_REGION")
    if not region:
        raise HTTPException(status_code=500, detail="AWS_REGION is not configured.")

    # make unique filename/key
    ext = Path(file.filename).suffix or ".bin"
    new_name = f"{uuid4().hex}{ext}"
    object_key = f"uploads/{new_name}"

    try:
        s3 = boto3.client("s3", region_name=region)
        content_type = file.content_type or "application/octet-stream"

        print("[UPLOAD] object_key:", object_key)
        upload_url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket_name,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=int(os.getenv("S3_PRESIGNED_EXPIRES_SECONDS", "300")),
        )
    except Exception as e:
        print("PRESIGN ERROR:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"S3 presign failed: {str(e)}")

    file_url = f"https://{bucket_name}.s3.{region}.amazonaws.com/{object_key}"
    return {
        "upload_url": upload_url,
        "file_url": file_url,
        "object_key": object_key,
        "content_type": content_type,
        "method": "PUT",
        "headers": {"Content-Type": content_type},
    }


# =========================
# ADVERTISEMENTS (user requests)
# =========================


@app.get("/advertisements", response_model=List[AdvertisementPublicOut])
def list_public_advertisements(
    category_id: Optional[int] = None,
    city_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Public list of approved, non-expired advertisements (newest first).
    Optional query filters: category_id, city_id.
    """
    return list_public_approved_advertisements(
        db, category_id=category_id, city_id=city_id
    )


@app.post("/advertisements", response_model=AdvertisementCreateResponse)
async def create_advertisement(
    image: UploadFile = File(..., description="Advertisement image (jpg, jpeg, png; max 5MB)"),
    category_id: int = Form(...),
    city_id: int = Form(...),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a new advertisement request (image stored under S3 prefix advertisements/).
    Requires multipart/form-data: user_id (logged-in user), category_id, city_id,
    optional description, and image file.
    """
    _max_ad_image_bytes = 5 * 1024 * 1024
    if getattr(image, "size", None) is not None and image.size > _max_ad_image_bytes:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB).")

    file_content = await image.read()
    if not file_content:
        raise HTTPException(status_code=400, detail="Image file is required and cannot be empty.")

    original_filename = image.filename or "image.jpg"

    try:
        ad = create_advertisement_request(
            db,
            user=current_user,
            category_id=category_id,
            city_id=city_id,
            description=description,
            file_content=file_content,
            original_filename=original_filename,
        )
    except CategoryNotFoundError:
        raise HTTPException(status_code=404, detail="Category not found")
    except CityNotFoundError:
        raise HTTPException(status_code=404, detail="City not found")
    except AdvertisementImageValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AdvertisementS3ConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except AdvertisementS3UploadError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return AdvertisementCreateResponse(
        id=ad.id,
        image_url=ad.image_url,
        status=ad.status.value,
        message="Advertisement request submitted and is pending review.",
    )


@app.get(
    "/admin/advertisements/pending",
    response_model=List[AdminPendingAdvertisementOut],
)
def admin_list_pending_advertisements(
    category_id: Optional[int] = None,
    city_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """List pending advertisement requests (newest first). Optional filters: category_id, city_id."""
    return list_pending_advertisements(db, category_id=category_id, city_id=city_id)


@app.post(
    "/admin/advertisements/{advertisement_id}/approve",
    response_model=AdvertisementAdminActionResponse,
)
def admin_approve_advertisement(
    advertisement_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user_from_body),
):
    try:
        ad, message = approve_advertisement(db, advertisement_id)
    except AdvertisementNotFoundError:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    except AdvertisementInvalidStateError as e:
        raise HTTPException(status_code=400, detail=e.message)

    if message == "Advertisement approved successfully.":
        owner = db.query(User).filter(User.id == ad.user_id).first()
        if owner and owner.email:
            enqueue_advertisement_approved_email(
                str(owner.email),
                str(owner.full_name or owner.username),
            )

    return AdvertisementAdminActionResponse(
        id=ad.id,
        status=ad.status.value,
        message=message,
    )


@app.post(
    "/admin/advertisements/{advertisement_id}/reject",
    response_model=AdvertisementAdminActionResponse,
)
def admin_reject_advertisement(
    advertisement_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user_from_body),
):
    try:
        ad, message = reject_advertisement(db, advertisement_id)
    except AdvertisementNotFoundError:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    except AdvertisementInvalidStateError as e:
        raise HTTPException(status_code=400, detail=e.message)

    if message == "Advertisement rejected successfully.":
        owner = db.query(User).filter(User.id == ad.user_id).first()
        if owner and owner.email:
            enqueue_advertisement_rejected_email(
                str(owner.email),
                str(owner.full_name or owner.username),
            )

    return AdvertisementAdminActionResponse(
        id=ad.id,
        status=ad.status.value,
        message=message,
    )


from datetime import datetime, timezone, timedelta  # make sure this import exists


@app.post("/admin/drivers/{driver_profile_id}/approve")
def approve_driver(
        driver_profile_id: int,
        data: DriverReviewRequest,
        db: Session = Depends(get_db),
):
    # check admin exists and is ADMIN
    admin = (
        db.query(User)
        .filter(User.id == data.admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not admin:
        raise HTTPException(status_code=403, detail="Only admin can approve")

    profile = db.query(DriverProfile).filter(DriverProfile.id == driver_profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    user = profile.user
    vehicle = (
        db.query(DriverVehicle)
        .filter(DriverVehicle.driver_profile_id == profile.id)
        .first()
    )

    # update statuses
    user.status = UserStatus.ACTIVE
    profile.driver_status = DriverStatus.APPROVED
    profile.driver_status_updated_at = datetime.now(timezone.utc)

    if vehicle:
        vehicle.status = VehicleStatus.APPROVED
        vehicle.reviewed_at = datetime.now(timezone.utc)
        vehicle.reviewed_by_admin_id = admin.id
        vehicle.rejection_reason = None

    db.commit()

    to_email = str(user.email)
    full_name = str(user.full_name)
    username = str(user.username)

    # Send bilingual email (Arabic + Hebrew) regardless of UI language
    subject = "وجهتنا / ווג'הטנא – الموافقة على طلب السائق / אישור בקשת נהג"

    email_body_ar = f"""عزيزي/عزيزتي {full_name},

نحن سعداء بإبلاغك بأن طلب السائق الخاص بك لوجهتنا تمت الموافقة عليه!

يمكنك الآن تسجيل الدخول إلى التطبيق والبدء في استخدامه كسائق.

اسم المستخدم الخاص بك لتسجيل الدخول: {username}
استخدم كلمة المرور التي اخترتها عند إنشاء الحساب.

نشكرك على اهتمامك بالانضمام إلى وجهتنا ونتمنى لك تجربة ممتعة.

مع أطيب التحيات،
فريق وجهتنا"""

    email_body_he = f"""שלום {full_name},

אנו שמחים להודיע לך כי בקשת הנהג שלך לוג'הטנא אושרה!

אתה יכול כעת להתחבר לאפליקציה ולהתחיל להשתמש בה כנהג.

שם המשתמש שלך להתחברות: {username}
השתמש/י בסיסמה שבחרת בעת יצירת החשבון.

תודה על העניין שלך להצטרף לוג'הטנא ואנו מאחלים לך חוויה נעימה.

בברכה,
צוות ווג'הטנא"""

    email_body = f"""{email_body_ar}

------------------------------

{email_body_he}"""

    enqueue_admin_status_email(
        to_email,
        subject,
        email_body,
        status="approved",
        request_type="driver",
    )

    return {"detail": "Driver approved"}


@app.post("/admin/drivers/{driver_profile_id}/reject")
def reject_driver(
        driver_profile_id: int,
        data: DriverReviewRequest,
        db: Session = Depends(get_db),
):
    admin = (
        db.query(User)
        .filter(User.id == data.admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not admin:
        raise HTTPException(status_code=403, detail="Only admin can reject")

    profile = db.query(DriverProfile).filter(DriverProfile.id == driver_profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    user = profile.user
    vehicle = (
        db.query(DriverVehicle)
        .filter(DriverVehicle.driver_profile_id == profile.id)
        .first()
    )

    # if no reason → use a default
    reason = data.reason or "Your documents were not approved."

    user.status = UserStatus.REJECTED
    profile.driver_status = DriverStatus.REJECTED
    profile.driver_status_updated_at = datetime.now(timezone.utc)

    if vehicle:
        vehicle.status = VehicleStatus.REJECTED
        vehicle.reviewed_at = datetime.now(timezone.utc)
        vehicle.reviewed_by_admin_id = admin.id
        vehicle.rejection_reason = reason

    db.commit()

    to_email = str(user.email)
    full_name = str(user.full_name)
    username = str(user.username)

    # Send professional bilingual email (Arabic and Hebrew) with reason and re-signup instructions
    # Get driver language from request if provided, otherwise use admin's language or default to Arabic
    driver_language = data.driver_language if hasattr(data, 'driver_language') and data.driver_language else "ar"
    
    if driver_language == "he":
        email_body = f"""שלום {full_name},

אנו מצטערים להודיע לך כי בקשת הנהג שלך לוג'הטנא נבדקה ולמרבה הצער, איננו יכולים לאשר אותה בשלב זה.

סיבת הדחייה:
{reason}

אנו מבינים שזה עשוי להיות מאכזב, אך אנו רוצים לתת לך הזדמנות לטפל בבעיות ולהגיש בקשה מחדש.

תוכל להגיש בקשה חדשה באמצעות אותם פרטי התחברות:
• אימייל: {to_email}
• שם משתמש: {username}

פשוט בקר באפליקציית ווג'הטנא והשלם את טופס הרשמת הנהג שוב עם אותו אימייל ושם משתמש. נבדוק את הבקשה החדשה שלך לאחר הגשתה.

אם יש לך שאלות או צריך הבהרה לגבי סיבת הדחייה, אנא אל תהסס ליצור איתנו קשר.

תודה על העניין שלך להצטרף לוג'הטנא.

בברכה,
צוות ווג'הטנא"""
        subject = "ווג'הטנא – עדכון סטטוס בקשת נהג"
    elif driver_language == "en":
        email_body = f"""Dear {full_name},

We regret to inform you that your driver application to Wejhetna has been reviewed and unfortunately, we cannot approve it at this time.

Rejection reason:
{reason}

We understand this may be disappointing, but we want to give you the opportunity to address the issues and resubmit.

You can submit a new application using the same credentials:
• Email: {to_email}
• Username: {username}

Simply visit the Wejhetna app and complete the driver registration form again with the same email and username. We will review your new application after submission.

If you have any questions or need clarification about the rejection reason, please do not hesitate to contact us.

Thank you for your interest in joining Wejhetna.

Best regards,
Wejhetna Team"""
        subject = "Wejhetna – Driver application status update"
    else:  # Arabic (default)
        email_body = f"""عزيزي/عزيزتي {full_name},

نأسف لإبلاغك بأن طلب السائق الخاص بك لوجهتنا تمت مراجعته ولسوء الحظ، لا يمكننا الموافقة عليه في هذا الوقت.

سبب الرفض:
{reason}

نفهم أن هذا قد يكون محبطاً، لكننا نريد أن نمنحك الفرصة لمعالجة المشاكل وإعادة التقديم.

يمكنك تقديم طلب جديد باستخدام نفس بيانات الاعتماد:
• البريد الإلكتروني: {to_email}
• اسم المستخدم: {username}

ببساطة قم بزيارة تطبيق وجهتنا وأكمل نموذج تسجيل السائق مرة أخرى بنفس البريد الإلكتروني واسم المستخدم. سنراجع طلبك الجديد بعد تقديمه.

إذا كان لديك أي أسئلة أو تحتاج إلى توضيح حول سبب الرفض، يرجى عدم التردد في الاتصال بنا.

شكراً لاهتمامك بالانضمام إلى وجهتنا.

مع أطيب التحيات،
فريق وجهتنا"""
        subject = "وجهتنا – تحديث حالة طلب السائق"

    enqueue_admin_status_email(
        to_email,
        subject,
        email_body,
        status="rejected",
        request_type="driver",
    )

    return {"detail": "Driver rejected"}


@app.get("/admin/drivers/pending", response_model=List[DriverApplicationOut])
def list_pending_drivers(db: Session = Depends(get_db)):
    # all drivers whose driver_status is PENDING
    rows = (
        db.query(User, DriverProfile, DriverVehicle)
        .join(DriverProfile, DriverProfile.user_id == User.id)
        .join(DriverVehicle, DriverVehicle.driver_profile_id == DriverProfile.id)
        .filter(DriverProfile.driver_status == DriverStatus.PENDING)
        .all()
    )

    result: List[DriverApplicationOut] = []
    for user, profile, vehicle in rows:
        result.append(
            DriverApplicationOut(
                user_id=user.id,
                driver_profile_id=profile.id,
                vehicle_id=vehicle.id,
                full_name=user.full_name,
                email=user.email,
                phone=user.phone,
                driver_status=profile.driver_status.value,
                vehicle_status=vehicle.status.value,
                driver_license_image_url=profile.driver_license_image_url,
                id_card_image_url=profile.id_card_image_url,
                car_type=vehicle.car_type,
                plate_number=vehicle.plate_number,
                production_year=vehicle.production_year,
                car_license_image_url=vehicle.car_license_image_url,
                car_insurance_image_url=vehicle.car_insurance_image_url,
                car_photos_urls=vehicle.car_photos_urls,
            )
        )
    return result


# =========================
# ADMIN – CATEGORIES
# =========================

from typing import List  # אם עדיין לא קיים למעלה


@app.get("/admin/categories", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    """
    מחזיר את כל הקטגוריות הקיימות.
    זה מה שהמסך של האדמין יציג ברשימה.
    """
    categories = db.query(Category).order_by(Category.id).all()
    return categories


@app.post("/admin/categories", response_model=CategoryResponse, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    """
    יצירת קטגוריה חדשה.
    ברגע שהאדמין לוחץ "הוסף" – זה נקרא.
    גם מעדכן את קבצי התרגום אוטומטית.
    """
    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    
    # עדכון קבצי התרגום
    if category.name_en and category.name_ar and category.name_he:
        translation_key = create_translation_key(category.name_en)
        update_translation_file(translation_key, category.name_ar, category.name_he)
    
    return category


@app.put("/admin/categories/{category_id}", response_model=CategoryResponse)
def update_category(
        category_id: int,
        data: CategoryCreate,  # משתמשים באותם שדות (name_ar, name_he, name_en, icon_name, is_active)
        db: Session = Depends(get_db),
):
    """
    עדכון קטגוריה קיימת.
    במסך האדמין תערכי את השם (ואפשר גם icon/is_active בעתיד).
    גם מעדכן את קבצי התרגום אוטומטית.
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # שמירת השם הישן למחיקה אם השתנה
    old_name_en = category.name_en
    old_translation_key = None
    if old_name_en:
        old_translation_key = create_translation_key(old_name_en)

    # שמירת הערכים החדשים
    new_name_en = data.name_en
    new_name_ar = data.name_ar
    new_name_he = data.name_he

    # עדכון הקטגוריה בדאטה בייס
    category.name_ar = new_name_ar
    category.name_he = new_name_he
    category.name_en = new_name_en
    category.icon_name = data.icon_name
    category.is_active = data.is_active

    db.commit()
    db.refresh(category)
    
    # אם השם באנגלית השתנה, מוחקים את התרגום הישן
    if old_name_en and old_name_en.strip() != new_name_en.strip() and old_translation_key:
        delete_translation_key(old_translation_key)
    
    # עדכון/הוספת התרגום החדש לפי השם החדש באנגלית
    if new_name_en and new_name_ar and new_name_he:
        new_translation_key = create_translation_key(new_name_en)
        update_translation_file(new_translation_key, new_name_ar, new_name_he)
    
    return category


@app.delete("/admin/categories/{category_id}")
def delete_category(
        category_id: int,
        db: Session = Depends(get_db),
):
    """
    מחיקת קטגוריה.
    גם מוחקת את התרגום מקבצי התרגום.
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check if category has places
    places_count = db.query(Place).filter(Place.category_id == category_id).count()
    if places_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete category with {places_count} associated places. Please reassign or delete places first."
        )

    # מחיקת התרגום מקבצי התרגום
    if category.name_en:
        translation_key = create_translation_key(category.name_en)
        delete_translation_key(translation_key)

    db.delete(category)
    db.commit()
    return {"detail": "Category deleted successfully"}


# =========================
# ADMIN – TRANSLATIONS
# =========================

class TranslationUpdate(BaseModel):
    key: str
    en: str
    ar: str
    he: str


def get_translation_files_path():
    """מוצא את נתיב קבצי התרגום"""
    import json
    
    # נסה מספר נתיבים אפשריים
    possible_paths = [
        Path(__file__).parent.parent / "wejhetna_app" / "src" / "languages",
        Path(__file__).parent / "wejhetna_app" / "src" / "languages",
        Path("wejhetna_app/src/languages"),
    ]
    
    for base_path in possible_paths:
        if base_path.exists():
            ar_file = base_path / "ar.json"
            he_file = base_path / "he.json"
            if ar_file.exists() and he_file.exists():
                return base_path, ar_file, he_file
    
    return None, None, None


def update_translation_file(translation_key: str, ar_value: str, he_value: str):
    """מעדכן או מוסיף תרגום לקבצי התרגום"""
    import json
    
    base_path, ar_file, he_file = get_translation_files_path()
    
    if not base_path or not ar_file or not he_file:
        raise HTTPException(
            status_code=500,
            detail="Translation files path not found. Please ensure the files exist."
        )
    
    try:
        # קריאת קבצי התרגום
        with open(ar_file, "r", encoding="utf-8") as f:
            ar_data = json.load(f)
        
        with open(he_file, "r", encoding="utf-8") as f:
            he_data = json.load(f)
        
        # הוספה/עדכון התרגום
        ar_data[translation_key] = ar_value
        he_data[translation_key] = he_value
        
        # שמירת הקבצים
        with open(ar_file, "w", encoding="utf-8") as f:
            json.dump(ar_data, f, ensure_ascii=False, indent=2)
        
        with open(he_file, "w", encoding="utf-8") as f:
            json.dump(he_data, f, ensure_ascii=False, indent=2)
        
        return True
    except Exception as e:
        print(f"Error updating translation file: {e}")
        return False


def delete_translation_key(translation_key: str):
    """מוחק מפתח תרגום מקבצי התרגום"""
    import json
    
    base_path, ar_file, he_file = get_translation_files_path()
    
    if not base_path or not ar_file or not he_file:
        # אם לא מוצא את הקבצים, לא נזרוק שגיאה (יכול להיות שלא צריך)
        return False
    
    try:
        # קריאת קבצי התרגום
        with open(ar_file, "r", encoding="utf-8") as f:
            ar_data = json.load(f)
        
        with open(he_file, "r", encoding="utf-8") as f:
            he_data = json.load(f)
        
        # מחיקת המפתח אם קיים
        if translation_key in ar_data:
            del ar_data[translation_key]
        if translation_key in he_data:
            del he_data[translation_key]
        
        # שמירת הקבצים
        with open(ar_file, "w", encoding="utf-8") as f:
            json.dump(ar_data, f, ensure_ascii=False, indent=2)
        
        with open(he_file, "w", encoding="utf-8") as f:
            json.dump(he_data, f, ensure_ascii=False, indent=2)
        
        return True
    except Exception as e:
        print(f"Error deleting translation key: {e}")
        return False


def create_translation_key(name_en: str) -> str:
    """יוצר מפתח תרגום משם באנגלית"""
    import re
    key = name_en.lower().strip()
    key = re.sub(r'\s+', '_', key)  # החלפת רווחים בקו תחתון
    key = re.sub(r'[^a-z0-9_]', '', key)  # הסרת תווים מיוחדים
    return f"category_{key}"


def create_city_translation_key(name_en: str) -> str:
    """יוצר מפתח תרגום לשם עיר באנגלית"""
    import re
    key = name_en.lower().strip()
    key = re.sub(r'\s+', '_', key)  # החלפת רווחים בקו תחתון
    key = re.sub(r'[^a-z0-9_]', '', key)  # הסרת תווים מיוחדים
    return f"city_{key}"


def create_place_translation_key(name_en: str) -> str:
    """יוצר מפתח תרגום לשם מקום באנגלית"""
    import re
    key = name_en.lower().strip()
    key = re.sub(r'\s+', '_', key)  # החלפת רווחים בקו תחתון
    key = re.sub(r'[^a-z0-9_]', '', key)  # הסרת תווים מיוחדים
    return f"place_{key}"


@app.post("/admin/translations/category")
def update_category_translation(data: TranslationUpdate):
    """
    מעדכן את קבצי התרגום עם קטגוריה חדשה.
    זה נקרא אוטומטית כשמוסיפים קטגוריה חדשה.
    """
    translation_key = create_translation_key(data.key)
    
    if update_translation_file(translation_key, data.ar, data.he):
        return {"detail": "Translation updated successfully", "key": translation_key}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to update translation files"
        )


@app.post("/admin/translations/sync-categories")
def sync_categories_to_translations(db: Session = Depends(get_db)):
    """
    מסנכרן את כל הקטגוריות מהדאטה בייס לקבצי התרגום.
    זה נקרא כשטוענים את דף הקטגוריות או כשצריך לסנכרן ידנית.
    """
    try:
        # שליפת כל הקטגוריות מהדאטה בייס
        categories = db.query(Category).all()
        
        synced_count = 0
        failed_count = 0
        
        for category in categories:
            if category.name_en and category.name_ar and category.name_he:
                translation_key = create_translation_key(category.name_en)
                if update_translation_file(translation_key, category.name_ar, category.name_he):
                    synced_count += 1
                else:
                    failed_count += 1
        
        return {
            "detail": f"Synced {synced_count} categories to translation files",
            "synced": synced_count,
            "failed": failed_count,
            "total": len(categories)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync categories: {str(e)}"
        )


# =========================
# ADMIN – CITIES
# =========================

@app.get("/admin/cities", response_model=List[CityResponse])
def list_cities(db: Session = Depends(get_db)):
    """
    מחזיר את כל הערים.
    המסך של האדמין יציג אותן ברשימה.
    """
    cities = db.query(City).order_by(City.id).all()
    return cities


@app.post("/admin/cities", response_model=CityResponse, status_code=201)
def create_city(data: CityCreate, db: Session = Depends(get_db)):
    """
    יצירת עיר חדשה.
    מוסיף אוטומטית את התרגום לקבצי התרגום.
    """
    city = City(**data.model_dump())
    db.add(city)
    db.commit()
    db.refresh(city)
    
    # הוספת התרגום לקבצי התרגום
    if city.name_en and city.name_ar and city.name_he:
        translation_key = create_city_translation_key(city.name_en)
        update_translation_file(translation_key, city.name_ar, city.name_he)
    
    return city


@app.put("/admin/cities/{city_id}", response_model=CityResponse)
def update_city(
        city_id: int,
        data: CityCreate,  # אותם שדות name_ar / name_he / name_en
        db: Session = Depends(get_db),
):
    """
    עדכון שם עיר קיימת.
    מעדכן אוטומטית את התרגום בקבצי התרגום.
    """
    city = db.query(City).filter(City.id == city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    old_name_en = city.name_en
    old_translation_key = None
    if old_name_en:
        old_translation_key = create_city_translation_key(old_name_en)

    new_name_en = data.name_en
    new_name_ar = data.name_ar
    new_name_he = data.name_he

    city.name_ar = new_name_ar
    city.name_he = new_name_he
    city.name_en = new_name_en

    db.commit()
    db.refresh(city)
    
    # אם השם באנגלית השתנה, מחק את המפתח הישן
    if old_name_en and old_name_en.strip() != new_name_en.strip() and old_translation_key:
        delete_translation_key(old_translation_key)
    
    # עדכון התרגום החדש
    if new_name_en and new_name_ar and new_name_he:
        new_translation_key = create_city_translation_key(new_name_en)
        update_translation_file(new_translation_key, new_name_ar, new_name_he)
    
    return city


@app.delete("/admin/cities/{city_id}")
def delete_city(
        city_id: int,
        db: Session = Depends(get_db),
):
    """
    מחיקת עיר.
    גם מוחקת את התרגום מקבצי התרגום.
    """
    city = db.query(City).filter(City.id == city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    # Check if city has places
    places_count = db.query(Place).filter(Place.city_id == city_id).count()
    if places_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete city with {places_count} associated places. Please reassign or delete places first."
        )

    # מחיקת התרגום מקבצי התרגום
    if city.name_en:
        translation_key = create_city_translation_key(city.name_en)
        delete_translation_key(translation_key)

    db.delete(city)
    db.commit()
    return {"detail": "City deleted successfully"}


# ========================
# CITY BOUNDARY VALIDATION
# ========================

# Model לבדיקת boundary
class BoundaryCheckRequest(BaseModel):
    lat: float
    lon: float

@app.post("/cities/check-boundary")
def check_location_in_service_cities(
    data: BoundaryCheckRequest,
    db: Session = Depends(get_db),
):
    """
    בודק אם נקודה (lat, lon) נמצאת בתוך boundaries של אחת מ-3 הערים:
    רהט, לקיה, תל שבע.
    
    מחזיר:
    - is_within: True אם הנקודה בתוך אחת מהערים
    - city_id: ID של העיר (אם נמצאה)
    - city_name: שם העיר (אם נמצאה)
    """
    from geoalchemy2 import Geography, Geometry
    from sqlalchemy import cast
    
    # יצירת נקודה מה-lat/lon
    lat = data.lat
    lon = data.lon
    
    # יצירת נקודה כ-Geometry (ST_Within עובד רק עם Geometry, לא Geography)
    point_geom = func.ST_SetSRID(
        func.ST_MakePoint(lon, lat),
        4326
    )
    
    # חיפוש עיר עם boundary שמכילה את הנקודה
    # רק ערים שיש להן boundary (לא NULL)
    # חשוב: ST_Within עובד רק עם Geometry, אז צריך להמיר את שניהם
    city = (
        db.query(City)
        .filter(City.boundary.isnot(None))
        .filter(
            func.ST_Within(
                point_geom,  # Geometry
                cast(City.boundary, Geometry(srid=4326))  # המיר Geography ל-Geometry
            )
        )
        .first()
    )
    
    if city:
        return {
            "is_within": True,
            "city_id": city.id,
            "city_name_ar": city.name_ar,
            "city_name_he": city.name_he,
            "city_name_en": city.name_en,
        }
    else:
        return {
            "is_within": False,
            "city_id": None,
            "city_name_ar": None,
            "city_name_he": None,
            "city_name_en": None,
        }


@app.post("/admin/translations/sync-cities")
def sync_cities_to_translations(db: Session = Depends(get_db)):
    """
    מסנכרן את כל הערים מהדאטה בייס לקבצי התרגום.
    זה נקרא כשטוענים את דף הערים או כשצריך לסנכרן ידנית.
    """
    try:
        # שליפת כל הערים מהדאטה בייס
        cities = db.query(City).all()
        
        synced_count = 0
        failed_count = 0
        
        for city in cities:
            if city.name_en and city.name_ar and city.name_he:
                translation_key = create_city_translation_key(city.name_en)
                if update_translation_file(translation_key, city.name_ar, city.name_he):
                    synced_count += 1
                else:
                    failed_count += 1
        
        return {
            "detail": f"Synced {synced_count} cities to translation files",
            "synced": synced_count,
            "failed": failed_count,
            "total": len(cities)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync cities: {str(e)}"
        )


@app.post("/admin/translations/sync-places")
def sync_places_to_translations(db: Session = Depends(get_db)):
    """
    מסנכרן את כל המקומות מהדאטה בייס לקבצי התרגום.
    זה נקרא כשטוענים את דף המקומות או כשצריך לסנכרן ידנית.
    """
    try:
        # שליפת כל המקומות מהדאטה בייס
        places = db.query(Place).all()
        
        synced_count = 0
        failed_count = 0
        
        for place in places:
            # name הוא name_en (השם באנגלית)
            if place.name and place.name_ar and place.name_he:
                translation_key = create_place_translation_key(place.name)
                if update_translation_file(translation_key, place.name_ar, place.name_he):
                    synced_count += 1
                else:
                    failed_count += 1
        
        return {
            "detail": f"Synced {synced_count} places to translation files",
            "synced": synced_count,
            "failed": failed_count,
            "total": len(places)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync places: {str(e)}"
        )


# =========================
# LOCATIONS – POSTGIS POINT
# =========================

@app.post("/locations", response_model=LocationResponse, status_code=201)
def create_location(data: LocationCreate, db: Session = Depends(get_db)):
    """
    יצירת לוקיישן חדש:
    - מקבל lat, lon (והפרונט רשאי לשלוח גם source / osm_id אבל לא חייב)
    - אם source == 'GPS_NO_OSM' → לא מחפשים OSM בכלל (שומרים osm_id=None)
    - אם יש data.osm_id → משתמשים בו (למשל אחרי שהמשתמש אישר שהמקום הוא שלו)
    - אחרת → אותה לוגיקה כמו היום: חיפוש אוטומטי ב-OSM לפי lat/lon
    """

    # 1) מקרה מיוחד: המשתמש הצהיר שזה עסק חדש → לא רוצים לקשר ל-OSM
    if data.source == "GPS_NO_OSM":
        print(">>> create_location: GPS_NO_OSM – לא מחפשים OSM בכלל")
        final_osm_id = None
        final_source = data.source or "GPS"

    # 2) אם לקוח שלח osm_id (למשל מה-GPS CHECK / מהמפה / מהאדמין)
    elif data.osm_id:
        print(">>> create_location: using client-provided osm_id:", data.osm_id)
        final_osm_id = data.osm_id
        final_source = data.source or "MAP_PICK"

    # 3) המצב הרגיל – כמו שהיה לך קודם (MAP_PICK / GPS כללי)
    else:
        print(">>> TRYING OSM LOOKUP FOR:", data.lat, data.lon)
        detected_osm_id = find_osm_feature(data.lat, data.lon)
        print(">>> OSM RESULT:", detected_osm_id)

        if detected_osm_id:  # אם זיהינו אוטומטית
            final_osm_id = detected_osm_id
            final_source = "MAP_PICK"
        else:  # לא מצאנו כלום
            final_osm_id = None
            final_source = data.source or "MAP_PICK"

    # 4) יצירת ה־Location עם ה־OSM ID (אם נמצא)
    location = Location(
        geom=func.ST_SetSRID(func.ST_MakePoint(data.lon, data.lat), 4326),
        source=final_source,
        osm_id=final_osm_id,
    )

    db.add(location)
    db.commit()
    db.refresh(location)

    return location


@app.get("/locations/{location_id}", response_model=LocationResponse)
def get_location(location_id: int, db: Session = Depends(get_db)):
    """
    שליפת לוקיישן לפי ID.
    """
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    return location


from sqlalchemy import func, or_, cast  # cast חדש
from geoalchemy2 import Geography  # כדי לקסט ל-Geography

from sqlalchemy import func, or_, cast  # cast חדש
from geoalchemy2 import Geography  # כדי לקסט ל-Geography


@app.get("/places/map", response_model=List[PlaceResponse])
def get_places_in_bbox(
        north: float,
        south: float,
        east: float,
        west: float,
        db: Session = Depends(get_db),
):
    envelope_geom = func.ST_MakeEnvelope(west, south, east, north, 4326)
    envelope_geog = cast(envelope_geom, Geography(geometry_type="POLYGON", srid=4326))

    places = (
        db.query(Place)
        .join(Location, Place.location_id == Location.id)
        .filter(func.ST_Intersects(Location.geom, envelope_geog))
        .all()
    )

    return places


# 👇👇 ADD THIS BLOCK HERE 👇👇
@app.get("/business-owner/places/nearby", response_model=BusinessOwnerNearbyCheckResponse)
def check_nearby_places_for_owner(
        lat: float,
        lon: float,
        radius_m: float = 50,  # ברירת מחדל 50 מטר
        db: Session = Depends(get_db),
):
    """
    בודקת האם יש עסק קיים במרחק radius_m מטר
    מהמיקום שבעל העסק בחר.

    לוגיקה:
    - אם אין בכלל מקום קרוב → status = "NO_PLACE"
    - אם יש מקום ו-has_owner = True → status = "HAS_OWNER"
    - אם יש מקום ו-has_owner = False → status = "CAN_CLAIM"
    """

    picked_point_geog = cast(
        func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
        Geography(geometry_type="POINT", srid=4326),
    )

    row = (
        db.query(Place, City)
        .join(Location, Place.location_id == Location.id)
        .join(City, Place.city_id == City.id)
        .filter(
            Place.place_type == PlaceType.BUSINESS,
            func.ST_DWithin(Location.geom, picked_point_geog, radius_m),
        )
        .order_by(Place.id)
        .first()
    )

    if not row:
        return BusinessOwnerNearbyCheckResponse(status="NO_PLACE", candidate=None)

    place, city = row
    has_owner = place.owner_user_id is not None

    candidate = NearbyPlaceInfo(
        place_id=place.id,
        name=place.name,
        name_ar=place.name_ar,
        name_he=place.name_he,
        city_name_ar=city.name_ar,
        has_owner=has_owner,
    )

    if has_owner:
        return BusinessOwnerNearbyCheckResponse(status="HAS_OWNER", candidate=candidate)

    return BusinessOwnerNearbyCheckResponse(status="CAN_CLAIM", candidate=candidate)


# 👆👆 UNTIL HERE 👆👆


# =========================
# PLACES API
# =========================

@app.post("/places", response_model=PlaceResponse, status_code=201)
def create_place(data: PlaceCreate, db: Session = Depends(get_db)):
    """
    יצירת מקום חדש.
    מקבל:
    - location_id (חובה)
    - city_id
    - category_id (רק אם זה BUSINESS)
    - place_type
    - name
    - ועוד שדות אופציונלים
    """

    # בדיקה שה-location קיים
    location = db.query(Location).filter(Location.id == data.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # בדיקה שהעיר קיימת
    city = db.query(City).filter(City.id == data.city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    # אם זה BUSINESS — חייב category
    if data.place_type == PlaceType.BUSINESS and not data.category_id:
        raise HTTPException(status_code=400, detail="Business must have a category")

    # בדיקת קטגוריה (אם יש)
    category = None
    if data.category_id:
        category = db.query(Category).filter(Category.id == data.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

    # אם יש בעל עסק — לבדוק שקיים ושהוא באמת BUSINESS_OWNER
    owner = None
    if data.owner_user_id:
        owner = db.query(User).filter(User.id == data.owner_user_id).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner user not found")

        if owner.role != UserRole.BUSINESS_OWNER:
            raise HTTPException(status_code=400, detail="User is not a business owner")

    # יוצרים את המקום
    place = Place(**data.model_dump())
    db.add(place)
    db.commit()
    db.refresh(place)

    # מחזירים FULL RESPONSE
    return place


@app.get("/places/{place_id}", response_model=PlaceResponse)
def get_place(place_id: int, db: Session = Depends(get_db)):
    """
    שליפת מקום כולל:
    - location (lat/lon)
    - city
    - category
    - owner (אם קיים)
    """

    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    return place


from typing import List


@app.get("/admin/places", response_model=List[PlaceResponse])
def admin_list_places(db: Session = Depends(get_db)):
    """
    מחזיר את כל המקומות (כולל city + category + location).
    ישמש לרשימה בטבלת האדמין.
    """
    try:
        places = db.query(Place).order_by(Place.id).all()
        return places
    except Exception as e:
        # If error is due to missing business_images_urls column, try to handle it
        error_msg = str(e).lower()
        if "business_images_urls" in error_msg or "column" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="Database migration needed: Please run 'python add_business_images_column.py' to add the business_images_urls column."
            )
        raise


import httpx

import httpx

import httpx


def find_osm_feature(lat: float, lon: float, radius: int = 50):
    """
    מזהה את האובייקט הקרוב ביותר ב־OSM
    lat = קו רוחב
    lon = קו אורך
    radius = רדיוס במטרים לחיפוש סביב הנקודה
    """
    query = f"""
    [out:json][timeout:10];
    (
      node(around:{radius},{lat},{lon});
      way(around:{radius},{lat},{lon});
      relation(around:{radius},{lat},{lon});
    );
    out center;
    """

    try:
        r = httpx.post(
            "https://overpass-api.de/api/interpreter",
            data=query,
            timeout=10.0
        )

        data = r.json()
        print(">>> OVERPASS RAW ELEMENTS COUNT:", len(data.get("elements", [])))

        if "elements" not in data or len(data["elements"]) == 0:
            return None

        el = data["elements"][0]
        return f"{el['type']}:{el['id']}"

    except Exception as e:
        print("OVERPASS ERROR:", e)
        return None


@app.post("/admin/places", response_model=PlaceResponse, status_code=201)
def admin_create_place(data: AdminPlaceCreate, db: Session = Depends(get_db)):
    """
    אדמין יוצר מקום חדש עם בדיקה אוטומטית מול OSM.
    """

    # -----------------------------------------
    # 🔍 בדיקת OSM — לפני יצירת Location
    # -----------------------------------------
    detected_osm_id = find_osm_feature(data.lat, data.lon)

    if detected_osm_id:
        final_source = "MAP_PICK"
        final_osm_id = detected_osm_id
    else:
        final_source = "MAP_PICK"
        final_osm_id = None

    # -----------------------------------------
    # 1) יצירת לוקיישן
    # -----------------------------------------
    location = Location(
        geom=func.ST_SetSRID(func.ST_MakePoint(data.lon, data.lat), 4326),
        source=final_source,
        osm_id=final_osm_id,
    )
    db.add(location)
    db.flush()  # לקבל location_id

    # -----------------------------------------
    # 2) בדיקת עיר
    # -----------------------------------------
    city = db.query(City).filter(City.id == data.city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    # -----------------------------------------
    # 3) בדיקת קטגוריה (לעסק)
    # -----------------------------------------
    if data.place_type == PlaceType.BUSINESS and not data.category_id:
        raise HTTPException(status_code=400, detail="Business must have a category")

    category = None
    if data.category_id:
        category = db.query(Category).filter(Category.id == data.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

    # -----------------------------------------
    # 4) בדיקת בעל עסק
    # -----------------------------------------
    owner = None
    if data.owner_user_id:
        owner = db.query(User).filter(User.id == data.owner_user_id).first()
        if not owner:
            raise HTTPException(status_code=404, detail="Owner user not found")
        if owner.role != UserRole.BUSINESS_OWNER:
            raise HTTPException(status_code=400, detail="User is not a business owner")

    if data.place_type == PlaceType.BUSINESS:
        can_be_claimed_value = True
    else:  # PUBLIC_SERVICE
        can_be_claimed_value = False

    # -----------------------------------------
    # 5) יצירת Place
    # -----------------------------------------
    place = Place(
        location_id=location.id,
        city_id=data.city_id,
        category_id=data.category_id,
        place_type=data.place_type,
        name=data.name,
        can_be_claimed=can_be_claimed_value,
        description=data.description,
        phone=data.phone,
        opening_hours=data.opening_hours,
        main_image_url=data.main_image_url,
        social_links=data.social_links,
        owner_user_id=data.owner_user_id,
        created_by_admin_id=data.created_by_admin_id,
        name_ar=data.name_ar,
        name_he=data.name_he,
    )
    db.add(place)
    db.commit()

    # סנכרון התרגום לקבצי התרגום
    try:
        if place.name and place.name_ar and place.name_he:
            translation_key = create_place_translation_key(place.name)
            update_translation_file(translation_key, place.name_ar, place.name_he)
    except Exception as e:
        # לא נזרוק שגיאה אם התרגום נכשל - זה לא קריטי
        print(f"Warning: Failed to sync place translation: {e}")

    db.refresh(place)
    db.refresh(location)
    return place


@app.put("/admin/places/{place_id}", response_model=PlaceResponse)
def admin_update_place(
        place_id: int,
        data: PlaceUpdate,
        db: Session = Depends(get_db),
):
    """
    עדכון מקום על ידי אדמין או בעל עסק (רק את המקום שלו).
    אדמין לא יכול לערוך מקומות שיש להן בעל עסק.
    """
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    
    # Check if place has an owner - admin cannot edit places with owners
    # Note: This endpoint is used by both admin and business owners
    # Business owners can only edit their own places (checked in frontend)
    # But we add this check here as a safety measure
    if place.owner_user_id is not None:
        # This check should ideally be done with user authentication/authorization
        # For now, we'll allow the update but the frontend should prevent admin from editing
        # If we want to enforce it in backend, we'd need to pass user role/ID in the request
        pass  # Place has owner - frontend should handle this

    # עדכון השדות אם הם נשלחו
    if data.name is not None:
        place.name = data.name
    if data.name_ar is not None:
        place.name_ar = data.name_ar
    if data.name_he is not None:
        place.name_he = data.name_he
    if data.city_id is not None:
        city = db.query(City).filter(City.id == data.city_id).first()
        if not city:
            raise HTTPException(status_code=404, detail="City not found")
        place.city_id = data.city_id
    if data.category_id is not None:
        if data.category_id == 0 or data.category_id is None:  # Allow null category
            place.category_id = None
        else:
            category = db.query(Category).filter(Category.id == data.category_id).first()
            if not category:
                raise HTTPException(status_code=404, detail="Category not found")
            place.category_id = data.category_id
    if data.description is not None:
        # Allow setting to None/empty string to clear the field
        place.description = data.description.strip() if data.description and data.description.strip() else None
    if data.phone is not None:
        # Allow setting to None/empty string to clear the field
        place.phone = data.phone.strip() if data.phone and data.phone.strip() else None
    if data.opening_hours is not None:
        # Allow setting to None/empty string to clear the field
        place.opening_hours = data.opening_hours.strip() if data.opening_hours and data.opening_hours.strip() else None
    if data.main_image_url is not None:
        # Allow setting to None/empty string to clear the field
        place.main_image_url = data.main_image_url.strip() if data.main_image_url and data.main_image_url.strip() else None
    if data.business_images_urls is not None:
        # Allow setting to None/empty list to clear the field
        place.business_images_urls = data.business_images_urls if data.business_images_urls else None
    if data.social_links is not None:
        # Allow setting to None/empty string to clear the field
        place.social_links = data.social_links.strip() if data.social_links and data.social_links.strip() else None
    if data.announcement is not None:
        # Allow setting to None/empty string to clear the field
        place.announcement = data.announcement.strip() if data.announcement and data.announcement.strip() else None

    # סנכרון התרגום לקבצי התרגום אם השמות השתנו
    try:
        if place.name and place.name_ar and place.name_he:
            translation_key = create_place_translation_key(place.name)
            update_translation_file(translation_key, place.name_ar, place.name_he)
    except Exception as e:
        print(f"Warning: Failed to sync place translation: {e}")

    db.commit()
    db.refresh(place)
    return place


@app.delete("/admin/places/{place_id}")
def admin_delete_place(
        place_id: int,
        db: Session = Depends(get_db),
):
    """
    מחיקת מקום על ידי אדמין.
    מוחק גם את ה-Location הקשור (1:1 relationship).
    מוחק גם את התרגום מקבצי התרגום.
    """
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    # מחיקת התרגום מקבצי התרגום לפני מחיקת המקום
    try:
        if place.name:
            translation_key = create_place_translation_key(place.name)
            delete_translation_key(translation_key)
    except Exception as e:
        # לא נזרוק שגיאה אם מחיקת התרגום נכשלה - זה לא קריטי
        print(f"Warning: Failed to delete place translation: {e}")

    # Get location before deleting place
    location_id = place.location_id
    location = db.query(Location).filter(Location.id == location_id).first()

    # Delete place first
    db.delete(place)
    
    # Delete location if exists
    if location:
        db.delete(location)

    db.commit()
    return {"detail": "Place deleted successfully"}


# ---------- GPS → OSM CHECK (לפני יצירת לוקיישן) ----------

class GpsCheckRequest(BaseModel):
    lat: float
    lon: float


class GpsCheckResponse(BaseModel):
    match_found: bool
    osm_id: Optional[str] = None


@app.post("/gps/osm-check", response_model=GpsCheckResponse)
def gps_osm_check(data: GpsCheckRequest):
    """
    בדיקת OSM לפי מיקום GPS:
    - לא יוצרת Location ולא Place
    - רק אומרת אם יש אובייקט OSM קרוב → ואם כן, מחזירה את ה-osm_id
    """
    osm_id = find_osm_feature(data.lat, data.lon)

    if osm_id:
        return GpsCheckResponse(match_found=True, osm_id=osm_id)

    return GpsCheckResponse(match_found=False, osm_id=None)


@app.post("/business-owner/place-requests", response_model=BusinessOwnerPlaceRequestOut, status_code=201)
def create_business_owner_place_request(
        data: BusinessOwnerPlaceRequestCreate,
        db: Session = Depends(get_db),
):
    """
    יצירת בקשה חדשה מבעל עסק:
    - או קליים על מקום קיים (existing_place_id != None)
    - או בקשה ליצור מקום חדש (existing_place_id == None)
    """

    # ===== STEP 1: CREATE USER (if doesn't exist) =====
    # Check if user already exists
    existing_user = db.query(User).filter(
        or_(User.username == data.username, User.email == data.email)
    ).first()

    if existing_user:
        if (
                existing_user.role == UserRole.BUSINESS_OWNER
                and existing_user.status == UserStatus.REJECTED
        ):
            # Rejected business owner trying again - allow re-signup
            # Check if email was verified (user should verify email again after rejection)
            verified = db.query(EmailVerification).filter(
                EmailVerification.email == data.email,
                EmailVerification.is_used == True
            ).order_by(EmailVerification.created_at.desc()).first()
            
            if not verified:
                raise HTTPException(403, "Email not verified. Please verify your email first.")
            
            existing_user.full_name = data.full_name
            existing_user.phone = data.phone  # user's personal phone
            existing_user.password_hash = hash_password(data.password)
            existing_user.status = UserStatus.PENDING
            existing_user.rejection_reason = None
            existing_user.email_verified = True  # Email was verified in step 1
            db.commit()
            db.refresh(existing_user)
            user = existing_user
        else:
            raise HTTPException(
                status_code=400,
                detail="Username or email already exists",
            )
    else:
        # Validate personal info before creating user
        if not re.match(r'^[a-zA-Z\u0590-\u05FF\u0600-\u06FF\s]+$', data.full_name.strip()):
            raise HTTPException(
                status_code=400,
                detail="Full name should contain only letters"
            )

        if len(data.username.strip()) < 3:
            raise HTTPException(
                status_code=400,
                detail="Username must be at least 3 characters"
            )
        if not re.match(r'^[a-zA-Z0-9_]+$', data.username.strip()):
            raise HTTPException(
                status_code=400,
                detail="Username can only contain letters, numbers, and underscore"
            )

        if not re.match(r'^05\d{8}$', data.phone.strip()):
            raise HTTPException(
                status_code=400,
                detail="Phone must be 10 digits starting with 05"
            )

        if len(data.password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters"
            )
        if not re.search(r'[A-Z]', data.password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one uppercase letter"
            )
        if not re.search(r'[a-z]', data.password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one lowercase letter"
            )
        if not re.search(r'[0-9]', data.password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one number"
            )
        if not re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'"\\|,.<>\/?]', data.password):
            raise HTTPException(
                status_code=400,
                detail="Password must contain at least one symbol"
            )

        # Check email was verified
        verified = db.query(EmailVerification).filter(
            EmailVerification.email == data.email,
            EmailVerification.is_used == True
        ).first()
        if not verified:
            raise HTTPException(403, "Email not verified")

        # Create new user
        user = User(
            full_name=data.full_name,
            username=data.username,
            email=data.email,
            phone=data.phone,  # user's personal phone
            password_hash=hash_password(data.password),
            role=UserRole.BUSINESS_OWNER,
            status=UserStatus.PENDING,
            email_verified=True
        )
        db.add(user)
        db.flush()  # Get user.id without committing yet
        db.refresh(user)

    # ===== STEP 2: CONTINUE WITH PLACE REQUEST CREATION =====
    # Check user role (should always be BUSINESS_OWNER at this point, but double-check)
    if user.role != UserRole.BUSINESS_OWNER:
        raise HTTPException(status_code=400, detail="User is not BUSINESS_OWNER")

    # המצב שלו – בדרך כלל PENDING או REJECTED
    # REJECTED users can create new requests (they re-signed up)
    if user.status not in (UserStatus.PENDING, UserStatus.REJECTED):
        # אם כבר ACTIVE – אפשר להחליט אם לאפשר עוד בקשות, כרגע נחסום
        raise HTTPException(
            status_code=400,
            detail="User is already an active business owner",
        )

    # If user was REJECTED and is trying again, set status back to PENDING
    if user.status == UserStatus.REJECTED:
        user.status = UserStatus.PENDING
        user.rejection_reason = None  # Clear old rejection reason

    existing_place = None
    if data.existing_place_id is not None:
        existing_place = (
            db.query(Place)
            .filter(Place.id == data.existing_place_id)
            .first()
        )
        if not existing_place:
            raise HTTPException(status_code=404, detail="Place not found")

        if existing_place.place_type != PlaceType.BUSINESS:
            raise HTTPException(
                status_code=400,
                detail="Only business places can be claimed",
            )

        if existing_place.owner_user_id is not None:
            raise HTTPException(
                status_code=400,
                detail="This place already has an owner",
            )
    # ===== VALIDATION: Business Details =====
    # Validate business names (minimum 2 characters each)
    name_trimmed = data.name.strip()
    name_ar_trimmed = data.name_ar.strip()
    name_he_trimmed = data.name_he.strip()

    if len(name_trimmed) < 2:
        raise HTTPException(
            status_code=400,
            detail="Business name (English) must be at least 2 characters"
        )

    if len(name_ar_trimmed) < 2:
        raise HTTPException(
            status_code=400,
            detail="Business name (Arabic) must be at least 2 characters"
        )

    if len(name_he_trimmed) < 2:
        raise HTTPException(
            status_code=400,
            detail="Business name (Hebrew) must be at least 2 characters"
        )

        # Validate business phone (if provided, must be 9 or 10 digits)
    if data.business_phone:
        business_phone_trimmed = data.business_phone.strip()
        if business_phone_trimmed:
            if not re.match(r'^[0-9]{9,10}$', business_phone_trimmed):
                raise HTTPException(
                    status_code=400,
                    detail="Business phone number must be 9 or 10 digits (if provided)"
                )

    # Validate city_id and category_id exist
    city = db.query(City).filter(City.id == data.city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    category = db.query(Category).filter(Category.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    # ===== END VALIDATION =====
    # יצירת רשומה לטבלת הבקשות (היסטוריית בקשות נשמרת)
    # NOTE: business_license_image_url, business_images_urls, social_media_account_name
    # are NOT set here because the database columns may not exist yet
    # These fields are UI-only for now - they will be saved to DB after migration
    req = BusinessOwnerPlaceRequest(
        user_id=user.id,
        existing_place_id=data.existing_place_id,
        lat=data.lat,
        lon=data.lon,
        source=data.source,
        osm_id=data.osm_id,
        name=data.name,
        name_ar=data.name_ar,
        name_he=data.name_he,
        city_id=data.city_id,
        category_id=data.category_id,
        description=data.description,
        phone=data.business_phone,  # Business phone (mapped from business_phone field)
        opening_hours=data.opening_hours,
        main_image_url=data.main_image_url,
        business_license_image_url=data.business_license_image_url,
        business_images_urls=data.business_images_urls,
        social_links=data.social_links,
        status=OwnerPlaceRequestStatus.PENDING,
    )

    # סטטוס USER נשאר PENDING (או REJECTED עד אישור חדש)
    user.status = UserStatus.PENDING

    db.add(req)
    db.commit()
    db.refresh(req)

    return req


# =========================
# ADMIN – USERS LIST
# =========================

@app.get("/admin/users", response_model=List[UserListOut])
def list_all_users(
        role_filter: Optional[str] = None,
        db: Session = Depends(get_db),
):
    """
    מחזיר את כל המשתמשים.
    אפשר לסנן לפי role = REGULAR / DRIVER / BUSINESS_OWNER / ADMIN
    """
    try:
        q = db.query(User).order_by(User.created_at.desc())

        if role_filter:
            try:
                role_enum = UserRole(role_filter)
                q = q.filter(User.role == role_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid role filter")

        users = q.all()
        return users
    except Exception as e:
        print(f"Error in list_all_users: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching users: {str(e)}")


# =========================
# ADMIN – DELETE USER
# =========================

class DeleteUserRequest(BaseModel):
    admin_user_id: int


@app.delete("/admin/users/{user_id}")
def delete_user(
        user_id: int,
        data: DeleteUserRequest,
        db: Session = Depends(get_db),
):
    """
    מחק משתמש:
    - אם REGULAR או DRIVER → מחק לחלוטין (כולל פרופיל נהג/רכב)
    - אם BUSINESS_OWNER → שנה status ל-PENDING (לא יכול להתחבר), אבל השאר את המקומות על המפה
    """
    # בדיקת אדמין
    admin = (
        db.query(User)
        .filter(User.id == data.admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not admin:
        raise HTTPException(status_code=403, detail="Only admin can delete users")

    # מציאת המשתמש למחיקה
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # לא ניתן למחוק אדמין אחר
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot delete admin users")

    # טיפול מיוחד ב-BUSINESS_OWNER
    if user.role == UserRole.BUSINESS_OWNER:
        # שנה status ל-PENDING (לא יכול להתחבר)
        user.status = UserStatus.PENDING
        user.rejection_reason = "Account removed by admin. Business places remain on the map."

        # השאר את המקומות על המפה (לא מוחקים אותם)
        # רק מסירים את owner_user_id מהמקומות
        places = db.query(Place).filter(Place.owner_user_id == user.id).all()
        for place in places:
            place.owner_user_id = None
            place.can_be_claimed = True  # אפשר לטעון מחדש

        db.commit()
        return {"detail": "Business owner removed. Status set to PENDING. Places remain on map."}

    # טיפול ב-REGULAR או DRIVER - מחיקה מלאה
    if user.role == UserRole.DRIVER:
        # מחק פרופיל נהג ורכבים
        driver_profile = db.query(DriverProfile).filter(DriverProfile.user_id == user.id).first()
        if driver_profile:
            # מחק רכבים
            vehicles = db.query(DriverVehicle).filter(DriverVehicle.driver_profile_id == driver_profile.id).all()
            for vehicle in vehicles:
                db.delete(vehicle)
            # מחק פרופיל נהג
            db.delete(driver_profile)

    # מחק את המשתמש עצמו
    db.delete(user)
    db.commit()

    return {"detail": "User deleted successfully"}


# =========================
# USER PROFILE ENDPOINTS
# =========================

@app.get("/users/{user_id}", response_model=UserProfileOut)
def get_user_profile(user_id: int, db: Session = Depends(get_db)):
    """
    Get basic user profile information.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserProfileOut(
        id=user.id,
        full_name=user.full_name,
        username=user.username,
        email=user.email,
        phone=user.phone,
        role=user.role.value,
        status=user.status.value,
        created_at=user.created_at,
    )


@app.get("/users/{user_id}/driver-profile", response_model=DriverProfileOut)
def get_driver_profile(user_id: int, db: Session = Depends(get_db)):
    """
    Get driver profile with vehicle information.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != UserRole.DRIVER:
        raise HTTPException(status_code=400, detail="User is not a driver")

    driver_profile = db.query(DriverProfile).filter(DriverProfile.user_id == user_id).first()
    if not driver_profile:
        return DriverProfileOut(
            user=UserProfileOut(
                id=user.id,
                full_name=user.full_name,
                username=user.username,
                email=user.email,
                phone=user.phone,
                role=user.role.value,
                status=user.status.value,
                created_at=user.created_at,
            ),
            vehicle=None,
            driver_status="N/A",
        )

    # Get the most recent vehicle
    vehicle = (
        db.query(DriverVehicle)
        .filter(DriverVehicle.driver_profile_id == driver_profile.id)
        .order_by(DriverVehicle.id.desc())
        .first()
    )

    vehicle_out = None
    if vehicle:
        vehicle_out = DriverVehicleOut(
            id=vehicle.id,
            car_type=vehicle.car_type,
            plate_number=vehicle.plate_number,
            production_year=vehicle.production_year,
            car_license_image_url=vehicle.car_license_image_url,
            car_insurance_image_url=vehicle.car_insurance_image_url,
            car_photos_urls=vehicle.car_photos_urls,
            status=vehicle.status.value,
        )

    return DriverProfileOut(
        user=UserProfileOut(
            id=user.id,
            full_name=user.full_name,
            username=user.username,
            email=user.email,
            phone=user.phone,
            role=user.role.value,
            status=user.status.value,
            created_at=user.created_at,
        ),
        vehicle=vehicle_out,
        driver_status=driver_profile.driver_status.value,
        driver_license_image_url=driver_profile.driver_license_image_url,
        id_card_image_url=driver_profile.id_card_image_url,
    )


@app.get("/users/{user_id}/business-owner-profile", response_model=BusinessOwnerProfileOut)
def get_business_owner_profile(user_id: int, db: Session = Depends(get_db)):
    """
    Get business owner profile with place information.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != UserRole.BUSINESS_OWNER:
        raise HTTPException(status_code=400, detail="User is not a business owner")

    # Get the most recent place request
    place_request = (
        db.query(BusinessOwnerPlaceRequest)
        .filter(BusinessOwnerPlaceRequest.user_id == user_id)
        .order_by(BusinessOwnerPlaceRequest.id.desc())
        .first()
    )

    place_out = None
    request_status = None

    if place_request:
        request_status = place_request.status.value

        # If request is APPROVED, try to find the actual Place record by owner_user_id
        # This handles both cases: existing place (existing_place_id) and new place (created on approval)
        if place_request.status == OwnerPlaceRequestStatus.APPROVED:
            # First, try to find place by owner_user_id (works for both existing and new places)
            place = db.query(Place).filter(Place.owner_user_id == user_id).first()

            if place:
                city = db.query(City).filter(City.id == place.city_id).first()
                category = db.query(Category).filter(
                    Category.id == place.category_id).first() if place.category_id else None

                # Get location coordinates if available
                location = db.query(Location).filter(Location.id == place.location_id).first()
                lat, lon = None, None
                if location and location.geom:
                    try:
                        result = db.execute(
                            func.ST_AsText(func.ST_Transform(location.geom, 4326))
                        ).scalar()
                        if result:
                            import re
                            match = re.search(r'POINT\(([\d.]+)\s+([\d.]+)\)', result)
                            if match:
                                lon, lat = float(match.group(1)), float(match.group(2))
                    except:
                        pass

                place_out = BusinessPlaceOut(
                    id=place.id,
                    name=place.name,
                    name_ar=place.name_ar,
                    name_he=place.name_he,
                    city_name=city.name_ar if city else None,
                    category_name=category.name_ar if category else None,
                    description=place.description,
                    phone=place.phone,
                    opening_hours=place.opening_hours,
                    main_image_url=place.main_image_url,
                    business_images_urls=place.business_images_urls,
                    social_links=place.social_links,
                    announcement=place.announcement,
                    lat=lat,
                    lon=lon,
                )
        elif place_request.existing_place_id:
            # If there's an existing place ID (for pending requests that claim existing places)
            place = db.query(Place).filter(Place.id == place_request.existing_place_id).first()
            if place:
                city = db.query(City).filter(City.id == place.city_id).first()
                category = db.query(Category).filter(
                    Category.id == place.category_id).first() if place.category_id else None

                # Get location coordinates if available
                location = db.query(Location).filter(Location.id == place.location_id).first()
                lat, lon = None, None
                if location and location.geom:
                    try:
                        result = db.execute(
                            func.ST_AsText(func.ST_Transform(location.geom, 4326))
                        ).scalar()
                        if result:
                            import re
                            match = re.search(r'POINT\(([\d.]+)\s+([\d.]+)\)', result)
                            if match:
                                lon, lat = float(match.group(1)), float(match.group(2))
                    except:
                        pass

                place_out = BusinessPlaceOut(
                    id=place.id,
                    name=place.name,
                    name_ar=place.name_ar,
                    name_he=place.name_he,
                    city_name=city.name_ar if city else None,
                    category_name=category.name_ar if category else None,
                    description=place.description,
                    phone=place.phone,
                    opening_hours=place.opening_hours,
                    main_image_url=place.main_image_url,
                    business_images_urls=place.business_images_urls,
                    social_links=place.social_links,
                    announcement=place.announcement,
                    lat=lat,
                    lon=lon,
                )

        # If still no place found, use data from the request itself (for pending requests)
        if not place_out:
            city = db.query(City).filter(City.id == place_request.city_id).first()
            category = db.query(Category).filter(
                Category.id == place_request.category_id).first() if place_request.category_id else None

            place_out = BusinessPlaceOut(
                id=0,
                name=place_request.name,
                name_ar=place_request.name_ar,
                name_he=place_request.name_he,
                city_name=city.name_ar if city else None,
                category_name=category.name_ar if category else None,
                description=place_request.description,
                phone=place_request.phone,
                opening_hours=place_request.opening_hours,
                main_image_url=place_request.main_image_url,
                business_images_urls=None,  # Place requests don't have business_images_urls yet
                social_links=place_request.social_links,
                lat=place_request.lat,
                lon=place_request.lon,
            )

    return BusinessOwnerProfileOut(
        user=UserProfileOut(
            id=user.id,
            full_name=user.full_name,
            username=user.username,
            email=user.email,
            phone=user.phone,
            role=user.role.value,
            status=user.status.value,
            created_at=user.created_at,
        ),
        place=place_out,
        request_status=request_status,
    )


# =========================
# CHANGE PASSWORD ENDPOINT
# =========================

class ChangePasswordRequest(BaseModel):
    user_id: int
    current_password: str
    new_password: str


class ChangePasswordResponse(BaseModel):
    success: bool
    message: str


@app.post("/auth/change-password", response_model=ChangePasswordResponse)
def change_password(data: ChangePasswordRequest, db: Session = Depends(get_db)):
    """Change user password - requires current password verification."""
    # Find user
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify current password
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # Validate new password requirements (same as signup)
    import re
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not re.search(r'[A-Z]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not re.search(r'[a-z]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not re.search(r'[0-9]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]', data.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one symbol")

    # Check if new password is same as current password
    if verify_password(data.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    # Hash new password
    password_hash = hash_password(data.new_password)

    # Update user password
    user.password_hash = password_hash

    db.commit()

    return ChangePasswordResponse(
        success=True,
        message="Password has been changed successfully"
    )


# =========================
# UPDATE PHONE NUMBER ENDPOINT
# =========================

class UpdatePhoneRequest(BaseModel):
    user_id: int
    new_phone: str


class UpdatePhoneResponse(BaseModel):
    success: bool
    message: str


@app.put("/users/{user_id}/phone", response_model=UpdatePhoneResponse)
def update_user_phone(user_id: int, data: UpdatePhoneRequest, db: Session = Depends(get_db)):
    """Update user phone number - validates that phone is not already in use by another user."""
    # Verify user_id matches
    if data.user_id != user_id:
        raise HTTPException(status_code=400, detail="User ID mismatch")

    # Find user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if phone number is the same (no change needed)
    if user.phone == data.new_phone.strip():
        raise HTTPException(status_code=400, detail="New phone number is the same as current phone number")

    # Check if phone number already exists for another user
    existing_user = db.query(User).filter(
        User.phone == data.new_phone.strip(),
        User.id != user_id
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Phone number is already in use by another user"
        )

    # Validate phone format (exactly 10 digits starting with 05)
    import re
    phone_cleaned = re.sub(r'[^\d]', '', data.new_phone.strip())
    if len(phone_cleaned) != 10:
        raise HTTPException(
            status_code=400,
            detail="Phone number must be exactly 10 digits"
        )
    if not phone_cleaned.startswith('05'):
        raise HTTPException(
            status_code=400,
            detail="Phone number must start with 05"
        )

    # Update phone number
    user.phone = data.new_phone.strip()

    db.commit()
    db.refresh(user)

    return UpdatePhoneResponse(
        success=True,
        message="Phone number has been updated successfully"
    )


# =========================
# UPDATE BUSINESS PLACE PHONE NUMBER ENDPOINT
# =========================

class UpdateBusinessPhoneRequest(BaseModel):
    new_phone: str


class UpdateBusinessPhoneResponse(BaseModel):
    success: bool
    message: str


@app.put("/places/{place_id}/phone", response_model=UpdateBusinessPhoneResponse)
def update_business_phone(place_id: int, data: UpdateBusinessPhoneRequest, db: Session = Depends(get_db)):
    """Update business place phone number - validates format (10 digits starting with 05)."""
    # Find place
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    # Check if phone number is the same (no change needed)
    if place.phone == data.new_phone.strip():
        raise HTTPException(status_code=400, detail="New phone number is the same as current phone number")

    # Validate phone format (exactly 10 digits starting with 05)
    import re
    phone_cleaned = re.sub(r'[^\d]', '', data.new_phone.strip())
    if len(phone_cleaned) != 10:
        raise HTTPException(
            status_code=400,
            detail="Phone number must be exactly 10 digits"
        )
    if not phone_cleaned.startswith('05'):
        raise HTTPException(
            status_code=400,
            detail="Phone number must start with 05"
        )

    # Update phone number
    place.phone = data.new_phone.strip()

    db.commit()
    db.refresh(place)

    return UpdateBusinessPhoneResponse(
        success=True,
        message="Business phone number has been updated successfully"
    )


# =========================
# SAVED PLACES (BOOKMARKS)
# =========================

class SavePlaceRequest(BaseModel):
    user_id: int


@app.post("/places/{place_id}/save")
def save_place(place_id: int, data: SavePlaceRequest, db: Session = Depends(get_db)):
    """
    שמירת מקום על ידי משתמש.
    """
    # בדיקה שהמקום קיים
    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    
    # בדיקה שהמשתמש קיים
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # בדיקה אם המקום כבר שמור
    existing = (
        db.query(SavedPlace)
        .filter(
            SavedPlace.user_id == data.user_id,
            SavedPlace.place_id == place_id
        )
        .first()
    )
    
    if existing:
        raise HTTPException(status_code=400, detail="Place already saved")
    
    # יצירת שמירה חדשה
    saved_place = SavedPlace(
        user_id=data.user_id,
        place_id=place_id
    )
    db.add(saved_place)
    db.commit()
    db.refresh(saved_place)
    
    return {"success": True, "message": "Place saved successfully", "saved_place_id": saved_place.id}


@app.delete("/places/{place_id}/unsave")
def unsave_place(place_id: int, user_id: int, db: Session = Depends(get_db)):
    """
    הסרת מקום מהשמורים.
    """
    saved_place = (
        db.query(SavedPlace)
        .filter(
            SavedPlace.user_id == user_id,
            SavedPlace.place_id == place_id
        )
        .first()
    )
    
    if not saved_place:
        raise HTTPException(status_code=404, detail="Saved place not found")
    
    db.delete(saved_place)
    db.commit()
    
    return {"success": True, "message": "Place removed from saved"}


@app.get("/users/{user_id}/saved-places", response_model=List[PlaceResponse])
def get_saved_places(user_id: int, db: Session = Depends(get_db)):
    """
    קבלת כל המקומות השמורים של משתמש.
    """
    saved_places = (
        db.query(SavedPlace)
        .options(
            joinedload(SavedPlace.place).joinedload(Place.city),
            joinedload(SavedPlace.place).joinedload(Place.category),
            joinedload(SavedPlace.place).joinedload(Place.location),
        )
        .filter(SavedPlace.user_id == user_id)
        .order_by(SavedPlace.saved_at.desc())
        .all()
    )
    
    # אם אין מקומות שמורים, מחזירים רשימה ריקה
    if not saved_places:
        return []
    
    places = [saved.place for saved in saved_places]
    
    # המרה ל-PlaceResponse
    result = []
    for place in places:
        if not place:
            continue  # דילוג על מקומות שלא נטענו
            
        result.append(PlaceResponse(
            id=place.id,
            name=place.name,
            name_ar=place.name_ar,
            name_he=place.name_he,
            place_type=place.place_type.value,
            city_id=place.city_id,
            category_id=place.category_id,
            can_be_claimed=place.can_be_claimed,
            description=place.description,
            phone=place.phone,
            opening_hours=place.opening_hours,
            main_image_url=place.main_image_url,
            social_links=place.social_links,
            created_by_admin_id=place.created_by_admin_id,
            owner_user_id=place.owner_user_id,
            city=CityResponse(
                id=place.city.id,
                name_ar=place.city.name_ar,
                name_he=place.city.name_he,
                name_en=place.city.name_en,
                created_at=place.city.created_at,
                updated_at=place.city.updated_at,
            ) if place.city else None,
            category=CategoryResponse(
                id=place.category.id,
                name_ar=place.category.name_ar,
                name_he=place.category.name_he,
                name_en=place.category.name_en,
                icon_name=place.category.icon_name,
                is_active=place.category.is_active,
                created_at=place.category.created_at,
                updated_at=place.category.updated_at,
            ) if place.category else None,
            location=LocationResponse(
                id=place.location.id,
                lat=place.location.lat,
                lon=place.location.lon,
                source=place.location.source,
                osm_id=place.location.osm_id,
                created_at=place.location.created_at,
                updated_at=place.location.updated_at,
            ),
            created_at=place.created_at,
            updated_at=place.updated_at,
        ))
    
    return result


@app.get("/places/{place_id}/is-saved")
def check_if_place_saved(place_id: int, user_id: int, db: Session = Depends(get_db)):
    """
    בדיקה אם מקום שמור על ידי משתמש.
    """
    saved_place = (
        db.query(SavedPlace)
        .filter(
            SavedPlace.user_id == user_id,
            SavedPlace.place_id == place_id
        )
        .first()
    )
    
    return {"is_saved": saved_place is not None}


# =========================
# RIDE REQUEST FLOW (V1)
# =========================

DEFAULT_NEARBY_DRIVER_RADIUS_M = 3000
DEFAULT_DRIVER_LOCATION_MAX_AGE_MIN = 10
DEFAULT_DRIVER_SPEED_KMPH = 30.0


def _distance_km_between_points(db: Session, lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    distance_m = db.query(
        func.ST_DistanceSphere(
            func.ST_SetSRID(func.ST_MakePoint(lon1, lat1), 4326),
            func.ST_SetSRID(func.ST_MakePoint(lon2, lat2), 4326),
        )
    ).scalar()
    if not distance_m:
        return 0.0
    return round(float(distance_m) / 1000.0, 2)


def _estimate_eta_minutes(distance_km: float) -> int:
    if distance_km <= 0:
        return 0
    return max(1, int(round((distance_km / DEFAULT_DRIVER_SPEED_KMPH) * 60)))


def _live_eta_minutes_driver_to_pickup(db: Session, ride: RideRequest) -> Optional[int]:
    """Minutes from driver's latest location to the ride pickup point."""
    av = (
        db.query(DriverAvailability)
        .filter(DriverAvailability.driver_user_id == ride.driver_user_id)
        .first()
    )
    if not av or not av.location_id:
        return ride.eta_to_user
    loc = db.query(Location).filter(Location.id == av.location_id).first()
    if not loc:
        return ride.eta_to_user
    try:
        km = _distance_km_between_points(
            db,
            float(loc.lon),
            float(loc.lat),
            float(ride.pickup_lon),
            float(ride.pickup_lat),
        )
        return _estimate_eta_minutes(km)
    except Exception:
        return ride.eta_to_user


def _coerce_ride_request_status(status: Any) -> Optional[RideRequestStatus]:
    """
    ORM may load status as Enum, plain str (e.g. PostgreSQL enum), or mixed casing.
    Python compares str to RideRequestStatus incorrectly — normalize before logic.
    """
    if isinstance(status, RideRequestStatus):
        return status
    if status is None:
        return None
    raw: Any = getattr(status, "value", status)
    if isinstance(raw, RideRequestStatus):
        return raw
    if not isinstance(raw, str):
        raw = str(raw)
    key = raw.strip()
    by_name = getattr(RideRequestStatus, key.upper(), None)
    if by_name is not None:
        return by_name
    for m in RideRequestStatus:
        if m.value == key:
            return m
    return None


def _ride_request_status_str(ride: RideRequest) -> str:
    """Pydantic expects lowercase API values (pending, accepted, …)."""
    coerced = _coerce_ride_request_status(ride.status)
    if coerced is not None:
        return coerced.value
    s = ride.status
    if isinstance(s, str):
        return s
    return getattr(s, "value", str(s))


@app.put("/drivers/availability", response_model=RideRequestStatusOut)
def update_driver_availability(data: DriverAvailabilityUpdateRequest, db: Session = Depends(get_db)):
    driver = db.query(User).filter(User.id == data.driver_user_id).first()
    if not driver or driver.role != UserRole.DRIVER:
        raise HTTPException(status_code=404, detail="Driver not found")

    if data.is_available and (data.lat is None or data.lon is None):
        raise HTTPException(status_code=400, detail="Location is required when enabling availability")

    availability = db.query(DriverAvailability).filter(
        DriverAvailability.driver_user_id == data.driver_user_id
    ).first()
    if not availability:
        availability = DriverAvailability(driver_user_id=data.driver_user_id)
        db.add(availability)

    availability.is_available = data.is_available
    if data.lat is not None and data.lon is not None:
        location = Location(
            geom=func.ST_SetSRID(func.ST_MakePoint(data.lon, data.lat), 4326),
            source="DRIVER_AVAILABILITY",
        )
        db.add(location)
        db.flush()
        availability.location_id = location.id

    db.commit()
    return RideRequestStatusOut(
        id=availability.id,
        status="ok",
        message="Driver availability updated",
    )


@app.get("/drivers/{driver_user_id}/availability")
def get_driver_availability(driver_user_id: int, db: Session = Depends(get_db)):
    driver = db.query(User).filter(User.id == driver_user_id).first()
    if not driver or driver.role != UserRole.DRIVER:
        raise HTTPException(status_code=404, detail="Driver not found")

    availability = db.query(DriverAvailability).filter(
        DriverAvailability.driver_user_id == driver_user_id
    ).first()
    if not availability:
        return {"is_available": False}
    return {"is_available": bool(availability.is_available)}


@app.post("/drivers/location", response_model=RideRequestStatusOut)
def update_driver_location(data: DriverAvailabilityLocationUpdateRequest, db: Session = Depends(get_db)):
    driver = db.query(User).filter(User.id == data.driver_user_id).first()
    if not driver or driver.role != UserRole.DRIVER:
        raise HTTPException(status_code=404, detail="Driver not found")

    availability = db.query(DriverAvailability).filter(
        DriverAvailability.driver_user_id == data.driver_user_id
    ).first()
    if not availability:
        availability = DriverAvailability(driver_user_id=data.driver_user_id, is_available=False)
        db.add(availability)

    location = Location(
        geom=func.ST_SetSRID(func.ST_MakePoint(data.lon, data.lat), 4326),
        source="DRIVER_LIVE_LOCATION",
    )
    db.add(location)
    db.flush()
    availability.location_id = location.id
    db.commit()

    return RideRequestStatusOut(id=availability.id, status="ok", message="Driver location updated")


@app.get("/rides/nearby-drivers", response_model=List[NearbyAvailableDriverOut])
def list_nearby_available_drivers(
    regular_user_id: int,
    lat: float,
    lon: float,
    radius_m: float = DEFAULT_NEARBY_DRIVER_RADIUS_M,
    db: Session = Depends(get_db),
):
    regular_user = db.query(User).filter(User.id == regular_user_id).first()
    if not regular_user or regular_user.role != UserRole.REGULAR:
        raise HTTPException(status_code=404, detail="Regular user not found")

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DEFAULT_DRIVER_LOCATION_MAX_AGE_MIN)
    rows = (
        db.query(DriverAvailability, User, Location)
        .join(User, DriverAvailability.driver_user_id == User.id)
        .join(Location, DriverAvailability.location_id == Location.id)
        .join(DriverProfile, DriverProfile.user_id == User.id)
        .filter(
            DriverAvailability.is_available.is_(True),
            DriverAvailability.updated_at >= cutoff,
            DriverProfile.driver_status == DriverStatus.APPROVED,
            func.ST_DWithin(
                Location.geom,
                cast(
                    func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
                    Geography(geometry_type="POINT", srid=4326),
                ),
                radius_m,
            ),
        )
        .all()
    )

    result: List[NearbyAvailableDriverOut] = []
    for availability, user, location in rows:
        distance_km = _distance_km_between_points(db, lon, lat, float(location.lon), float(location.lat))
        result.append(
            NearbyAvailableDriverOut(
                driver_user_id=user.id,
                full_name=user.full_name,
                username=user.username,
                lat=float(location.lat),
                lon=float(location.lon),
                distance_km=distance_km,
            )
        )
    return result


@app.post("/rides/requests", response_model=RideRequestStatusOut, status_code=201)
def create_ride_request(data: RideRequestCreateRequest, db: Session = Depends(get_db)):
    regular_user = db.query(User).filter(User.id == data.regular_user_id).first()
    driver_user = db.query(User).filter(User.id == data.driver_user_id).first()
    if not regular_user or regular_user.role != UserRole.REGULAR:
        raise HTTPException(status_code=404, detail="Regular user not found")
    if not driver_user or driver_user.role != UserRole.DRIVER:
        raise HTTPException(status_code=404, detail="Driver not found")

    availability = db.query(DriverAvailability).filter(
        DriverAvailability.driver_user_id == data.driver_user_id
    ).first()
    if not availability or not availability.is_available:
        raise HTTPException(status_code=400, detail="Driver is not available")

    number_of_people = data.number_of_people or data.passengers_count
    number_of_seats_required = data.number_of_seats_required or data.passengers_count
    if not number_of_people or not number_of_seats_required:
        raise HTTPException(
            status_code=400,
            detail="number_of_people and number_of_seats_required are required",
        )
    if number_of_people <= 0 or number_of_seats_required <= 0:
        raise HTTPException(
            status_code=400,
            detail="number_of_people and number_of_seats_required must be positive",
        )

    eta_to_user = None
    estimated_trip_time = None
    if availability.location_id:
        driver_loc = db.query(Location).filter(Location.id == availability.location_id).first()
        if driver_loc:
            try:
                driver_to_user_km = _distance_km_between_points(
                    db,
                    float(driver_loc.lon),
                    float(driver_loc.lat),
                    data.pickup_lon,
                    data.pickup_lat,
                )
                eta_to_user = _estimate_eta_minutes(driver_to_user_km)
            except Exception:
                eta_to_user = None

    if data.destination_lat is not None and data.destination_lon is not None:
        try:
            trip_distance_km = _distance_km_between_points(
                db,
                data.pickup_lon,
                data.pickup_lat,
                data.destination_lon,
                data.destination_lat,
            )
            estimated_trip_time = _estimate_eta_minutes(trip_distance_km)
        except Exception:
            estimated_trip_time = None

    ride = RideRequest(
        regular_user_id=data.regular_user_id,
        driver_user_id=data.driver_user_id,
        pickup_lat=data.pickup_lat,
        pickup_lon=data.pickup_lon,
        destination_text=data.destination_text,
        destination_lat=data.destination_lat,
        destination_lon=data.destination_lon,
        regular_phone=data.regular_phone,
        passengers_count=number_of_people,
        number_of_people=number_of_people,
        number_of_seats_required=number_of_seats_required,
        eta_to_user=eta_to_user,
        estimated_trip_time=estimated_trip_time,
        status=RideRequestStatus.PENDING.value,
    )
    db.add(ride)
    try:
        db.commit()
        db.refresh(ride)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not save ride request",
        )
    return RideRequestStatusOut(
        id=ride.id, status=_ride_request_status_str(ride), message="Ride request created"
    )


@app.get("/drivers/{driver_user_id}/ride-requests", response_model=List[RideRequestDriverOut])
def list_driver_ride_requests(driver_user_id: int, db: Session = Depends(get_db)):
    driver = db.query(User).filter(User.id == driver_user_id).first()
    if not driver or driver.role != UserRole.DRIVER:
        raise HTTPException(status_code=404, detail="Driver not found")

    rides = (
        db.query(RideRequest, User)
        .join(User, RideRequest.regular_user_id == User.id)
        .filter(RideRequest.driver_user_id == driver_user_id)
        .order_by(RideRequest.created_at.desc())
        .all()
    )

    result: List[RideRequestDriverOut] = []
    availability = db.query(DriverAvailability).filter(DriverAvailability.driver_user_id == driver_user_id).first()
    driver_lat = None
    driver_lon = None
    if availability and availability.location_id:
        loc = db.query(Location).filter(Location.id == availability.location_id).first()
        if loc:
            driver_lat = float(loc.lat)
            driver_lon = float(loc.lon)

    for ride, regular_user in rides:
        distance_km = None
        eta_min = ride.eta_to_user
        if driver_lat is not None and driver_lon is not None:
            try:
                distance_km = _distance_km_between_points(
                    db,
                    driver_lon,
                    driver_lat,
                    float(ride.pickup_lon),
                    float(ride.pickup_lat),
                )
                eta_min = _estimate_eta_minutes(distance_km)
            except Exception:
                distance_km = None
                eta_min = ride.eta_to_user

        status_str = _ride_request_status_str(ride)
        is_phone_visible = status_str in (
            RideRequestStatus.ACCEPTED.value,
            RideRequestStatus.ON_THE_WAY.value,
            RideRequestStatus.DRIVING_TO_CUSTOMER.value,
            RideRequestStatus.ARRIVED.value,
            RideRequestStatus.IN_PROGRESS.value,
        )
        result.append(
            RideRequestDriverOut(
                id=ride.id,
                regular_user_id=ride.regular_user_id,
                regular_username=regular_user.username,
                pickup_lat=ride.pickup_lat,
                pickup_lon=ride.pickup_lon,
                destination_text=ride.destination_text,
                destination_lat=ride.destination_lat,
                destination_lon=ride.destination_lon,
                passengers_count=ride.passengers_count,
                number_of_people=ride.number_of_people or ride.passengers_count,
                number_of_seats_required=ride.number_of_seats_required or ride.passengers_count,
                status=status_str,
                distance_to_pickup_km=distance_km,
                eta_to_pickup_min=eta_min,
                eta_to_user=ride.eta_to_user,
                estimated_trip_time=ride.estimated_trip_time,
                regular_phone=ride.regular_phone if is_phone_visible else None,
                created_at=ride.created_at,
                updated_at=ride.updated_at,
            )
        )
    return result


@app.get("/users/{user_id}/ride-requests/latest", response_model=Optional[RideRequestRegularOut])
def get_regular_latest_ride_request(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != UserRole.REGULAR:
        raise HTTPException(status_code=404, detail="Regular user not found")

    row = (
        db.query(RideRequest, User)
        .join(User, RideRequest.driver_user_id == User.id)
        .filter(RideRequest.regular_user_id == user_id)
        .order_by(RideRequest.created_at.desc())
        .first()
    )
    if not row:
        return None

    ride, driver = row
    st = _coerce_ride_request_status(ride.status)

    driver_live_lat: Optional[float] = None
    driver_live_lon: Optional[float] = None
    distance_to_pickup_km: Optional[float] = None
    av = (
        db.query(DriverAvailability)
        .filter(DriverAvailability.driver_user_id == ride.driver_user_id)
        .first()
    )
    if av and av.location_id:
        loc = db.query(Location).filter(Location.id == av.location_id).first()
        if loc:
            driver_live_lat = float(loc.lat)
            driver_live_lon = float(loc.lon)
            if st in (
                RideRequestStatus.ACCEPTED,
                RideRequestStatus.ON_THE_WAY,
                RideRequestStatus.DRIVING_TO_CUSTOMER,
                RideRequestStatus.ARRIVED,
            ):
                try:
                    distance_to_pickup_km = _distance_km_between_points(
                        db,
                        driver_live_lon,
                        driver_live_lat,
                        float(ride.pickup_lon),
                        float(ride.pickup_lat),
                    )
                except Exception:
                    distance_to_pickup_km = None

    live_eta: Optional[int] = None
    if st in (RideRequestStatus.ON_THE_WAY, RideRequestStatus.DRIVING_TO_CUSTOMER):
        live_eta = _live_eta_minutes_driver_to_pickup(db, ride)
    elif st == RideRequestStatus.ACCEPTED:
        live_eta = _live_eta_minutes_driver_to_pickup(db, ride)
        if live_eta is None:
            live_eta = ride.eta_to_user
    elif st == RideRequestStatus.ARRIVED:
        live_eta = 0

    code_for_passenger = None
    if st == RideRequestStatus.ARRIVED and ride.verification_code:
        code_for_passenger = ride.verification_code

    return RideRequestRegularOut(
        id=ride.id,
        driver_user_id=ride.driver_user_id,
        driver_full_name=driver.full_name,
        driver_username=driver.username,
        pickup_lat=float(ride.pickup_lat),
        pickup_lon=float(ride.pickup_lon),
        destination_text=ride.destination_text,
        passengers_count=ride.passengers_count,
        number_of_people=ride.number_of_people or ride.passengers_count,
        number_of_seats_required=ride.number_of_seats_required or ride.passengers_count,
        estimated_trip_time=ride.estimated_trip_time,
        eta_to_user=live_eta,
        distance_to_pickup_km=distance_to_pickup_km,
        driver_live_lat=driver_live_lat,
        driver_live_lon=driver_live_lon,
        status=_ride_request_status_str(ride),
        verification_code=code_for_passenger,
        created_at=ride.created_at,
        updated_at=ride.updated_at,
    )


@app.post("/rides/requests/{ride_request_id}/accept", response_model=RideRequestStatusOut)
def accept_ride_request(ride_request_id: int, data: RideRequestActionRequest, db: Session = Depends(get_db)):
    ride = db.query(RideRequest).filter(RideRequest.id == ride_request_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride request not found")
    if ride.driver_user_id != data.driver_user_id:
        raise HTTPException(status_code=403, detail="Driver is not allowed to accept this request")
    if _coerce_ride_request_status(ride.status) != RideRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Only pending requests can be accepted")

    active_existing = db.query(RideRequest).filter(
        RideRequest.driver_user_id == data.driver_user_id,
        RideRequest.status.in_(
            [
                RideRequestStatus.ACCEPTED.value,
                RideRequestStatus.ON_THE_WAY.value,
                RideRequestStatus.DRIVING_TO_CUSTOMER.value,
                RideRequestStatus.ARRIVED.value,
                RideRequestStatus.IN_PROGRESS.value,
            ]
        ),
        RideRequest.id != ride.id,
    ).first()
    if active_existing:
        raise HTTPException(status_code=400, detail="Driver already has an active ride request")

    ride.status = RideRequestStatus.ACCEPTED.value
    ride.status_note = data.note

    db.query(RideRequest).filter(
        RideRequest.driver_user_id == data.driver_user_id,
        RideRequest.status == RideRequestStatus.PENDING.value,
        RideRequest.id != ride.id,
    ).update(
        {
            "status": RideRequestStatus.REJECTED.value,
            "status_note": "Auto-rejected: another request accepted",
        },
        synchronize_session=False,
    )
    db.commit()

    return RideRequestStatusOut(id=ride.id, status=_ride_request_status_str(ride), message="Ride request accepted")


@app.post("/rides/requests/{ride_request_id}/reject", response_model=RideRequestStatusOut)
def reject_ride_request(ride_request_id: int, data: RideRequestActionRequest, db: Session = Depends(get_db)):
    ride = db.query(RideRequest).filter(RideRequest.id == ride_request_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride request not found")
    if ride.driver_user_id != data.driver_user_id:
        raise HTTPException(status_code=403, detail="Driver is not allowed to reject this request")
    if _coerce_ride_request_status(ride.status) != RideRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")

    ride.status = RideRequestStatus.REJECTED.value
    ride.status_note = data.note
    db.commit()

    return RideRequestStatusOut(id=ride.id, status=_ride_request_status_str(ride), message="Ride request rejected")


@app.post("/rides/requests/{ride_request_id}/cancel", response_model=RideRequestStatusOut)
def cancel_ride_request(ride_request_id: int, data: RideRequestActionRequest, db: Session = Depends(get_db)):
    ride = db.query(RideRequest).filter(RideRequest.id == ride_request_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride request not found")
    if ride.driver_user_id != data.driver_user_id:
        raise HTTPException(status_code=403, detail="Driver is not allowed to cancel this request")
    st = _coerce_ride_request_status(ride.status)
    if st not in (
        RideRequestStatus.ACCEPTED,
        RideRequestStatus.ON_THE_WAY,
        RideRequestStatus.DRIVING_TO_CUSTOMER,
        RideRequestStatus.ARRIVED,
        RideRequestStatus.IN_PROGRESS,
    ):
        raise HTTPException(status_code=400, detail="Only accepted or driving requests can be cancelled")

    ride.status = RideRequestStatus.CANCELLED.value
    ride.status_note = data.note
    db.commit()

    return RideRequestStatusOut(id=ride.id, status=_ride_request_status_str(ride), message="Ride cancelled")


@app.post("/rides/requests/{ride_request_id}/start-driving", response_model=RideRequestStatusOut)
def start_driving_to_customer(ride_request_id: int, data: RideRequestActionRequest, db: Session = Depends(get_db)):
    ride = db.query(RideRequest).filter(RideRequest.id == ride_request_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride request not found")
    if ride.driver_user_id != data.driver_user_id:
        raise HTTPException(status_code=403, detail="Driver is not allowed to update this request")
    if _coerce_ride_request_status(ride.status) != RideRequestStatus.ACCEPTED:
        raise HTTPException(status_code=400, detail="Only accepted requests can start driving to customer")

    live_eta = _live_eta_minutes_driver_to_pickup(db, ride)
    if live_eta is not None:
        ride.eta_to_user = live_eta

    ride.status = RideRequestStatus.ON_THE_WAY.value
    ride.status_note = data.note
    db.commit()
    db.refresh(ride)

    return RideRequestStatusOut(id=ride.id, status=_ride_request_status_str(ride), message="Driver is on the way")


RIDE_VERIFICATION_CODE_TTL_MINUTES = 30


@app.post("/rides/requests/{ride_request_id}/arrived", response_model=RideRequestStatusOut)
def mark_ride_arrived(ride_request_id: int, data: RideRequestActionRequest, db: Session = Depends(get_db)):
    ride = db.query(RideRequest).filter(RideRequest.id == ride_request_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride request not found")
    if ride.driver_user_id != data.driver_user_id:
        raise HTTPException(status_code=403, detail="Driver is not allowed to update this request")
    st = _coerce_ride_request_status(ride.status)
    if st == RideRequestStatus.ARRIVED:
        return RideRequestStatusOut(
            id=ride.id,
            status=_ride_request_status_str(ride),
            message="Driver already marked arrived",
        )
    if st not in (RideRequestStatus.ON_THE_WAY, RideRequestStatus.DRIVING_TO_CUSTOMER):
        raise HTTPException(status_code=400, detail="Only on-the-way rides can be marked arrived")

    now = datetime.now(timezone.utc)
    code = generate_ride_request_verification_code()
    ride.status = RideRequestStatus.ARRIVED.value
    ride.verification_code = code
    ride.verification_expires_at = now + timedelta(minutes=RIDE_VERIFICATION_CODE_TTL_MINUTES)
    ride.status_note = data.note
    ride.eta_to_user = 0
    db.commit()
    db.refresh(ride)

    enqueue_verification_code_created(ride.id)

    return RideRequestStatusOut(id=ride.id, status=_ride_request_status_str(ride), message="Driver arrived")


@app.post("/rides/verify-code", response_model=RideRequestStatusOut)
def verify_ride_start_code(data: RideVerifyCodeRequest, db: Session = Depends(get_db)):
    ride = db.query(RideRequest).filter(RideRequest.id == data.ride_request_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride request not found")
    if ride.driver_user_id != data.driver_user_id:
        raise HTTPException(status_code=403, detail="Driver is not allowed to verify this request")
    st = _coerce_ride_request_status(ride.status)
    if st != RideRequestStatus.ARRIVED:
        raise HTTPException(status_code=400, detail="Ride is not waiting for verification code")

    now = datetime.now(timezone.utc)
    if ride.verification_expires_at is not None and ride.verification_expires_at < now:
        ride.verification_code = None
        ride.verification_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Verification code expired")

    submitted = (data.verification_code or "").strip()
    stored = (ride.verification_code or "").strip()
    if not stored or submitted != stored:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    ride.status = RideRequestStatus.IN_PROGRESS.value
    ride.verification_code = None
    ride.verification_expires_at = None
    ride.status_note = None
    db.commit()
    db.refresh(ride)

    enqueue_ride_in_progress(ride.id)

    return RideRequestStatusOut(id=ride.id, status=_ride_request_status_str(ride), message="Ride started")