from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy import func
from schemas import LocationCreate, LocationResponse
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from fastapi import File, UploadFile
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from uuid import uuid4
import shutil
from typing import List
from models import Location, Place
from db import Base, engine, SessionLocal
import models
import smtplib
from email.message import EmailMessage
import os
import re
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
    AdminPlaceCreate,
    SendVerificationCodeRequest,
    VerifyEmailRequest,
    VerifyEmailResponse,
    ResendCodeRequest,
    RequestPasswordResetRequest,
    VerifyPasswordResetCodeRequest,
    ResetPasswordRequest,
    PasswordResetResponse,
)
import requests


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
EMAIL_USER = "wejhetna@gmail.com"
EMAIL_PASS = "cdoj zsjt xpqf uelp"


def send_email(to_email: str, subject: str, body: str):
    """
    Send a simple email using Gmail SMTP.
    Uses EMAIL_USER and EMAIL_PASS defined above.
    """
    if not EMAIL_USER or not EMAIL_PASS:
        print("Email config missing, skipping real send.")
        print("=== EMAIL (FAKE) ===")
        print("To:", to_email)
        print("Subject:", subject)
        print("Body:", body)
        print("=============")
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
        print("Email sent to", to_email)
    except Exception as e:
        print("Error sending email:", e)
        # still print for debugging
        print("=== EMAIL (FAILED TO SEND) ===")
        print("To:", to_email)
        print("Subject:", subject)
        print("Body:", body)
        print("=============")


# CORS (לאפליקציית React Native)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Database session ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def send_verification_email(to_email: str, code: str, full_name: str = "", language: str = "ar"):
    """Send verification code email to user in their preferred language."""

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

    send_email(to_email, subject, body)


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

    send_email(to_email, subject, body)


class RegularUserSignup(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    phone: str
    password: str
    password_confirmation: str


class UserOut(BaseModel):
    id: int
    full_name: str
    username: str
    email: EmailStr
    phone: str
    role: str
    status: str

    class Config:
        orm_mode = True


class UserListOut(BaseModel):
    id: int
    full_name: str
    username: str
    email: EmailStr
    phone: str
    role: str
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True


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
    user: UserOut
    driver_profile_id: int
    vehicle_id: int
    driver_status: str
    vehicle_status: str
    message: Optional[str] = None  # NEW

    class Config:
        orm_mode = True


class DriverReviewRequest(BaseModel):
    admin_user_id: int
    reason: Optional[str] = None


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class LoginResponse(BaseModel):
    id: int
    full_name: str
    role: str
    status: str

    class Config:
        orm_mode = True


class BusinessOwnerSignup(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    phone: str
    password: str


class BusinessOwnerSignupOut(BaseModel):
    user: UserOut
    message: Optional[str] = None

    class Config:
        orm_mode = True


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

    class Config:
        orm_mode = True


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
    # NOTE: These fields are not in DB yet, so not included in response
    # business_license_image_url: Optional[str] = None
    # business_images_urls: Optional[List[str]] = None
    social_links: Optional[str] = None
    # social_media_account_name: Optional[str] = None

    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    class Config:
        orm_mode = True


# =========================
# PROFILE RESPONSE MODELS
# =========================

class UserProfileOut(BaseModel):
    id: int
    full_name: str
    username: str
    email: str
    phone: str
    role: str
    status: str
    created_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class DriverVehicleOut(BaseModel):
    id: int
    car_type: str
    plate_number: str
    production_year: int
    car_license_image_url: str
    car_insurance_image_url: str
    car_photos_urls: Optional[List[str]] = None
    status: str

    class Config:
        orm_mode = True


class DriverProfileOut(BaseModel):
    user: UserProfileOut
    vehicle: Optional[DriverVehicleOut] = None
    driver_status: str
    driver_license_image_url: Optional[str] = None
    id_card_image_url: Optional[str] = None

    class Config:
        orm_mode = True


class BusinessPlaceOut(BaseModel):
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
    lat: Optional[float] = None
    lon: Optional[float] = None

    class Config:
        orm_mode = True


class BusinessOwnerProfileOut(BaseModel):
    user: UserProfileOut
    place: Optional[BusinessPlaceOut] = None
    request_status: Optional[str] = None

    class Config:
        orm_mode = True


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

    # מייל (אופציונלי)
    send_email(
        to_email=user.email,
        subject="Wejhetna – Business owner request approved",
        body="Your business owner request has been approved. You can now log in and manage your business place.",
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

    send_email(
        to_email=user.email,
        subject="Wejhetna – Business owner request rejected",
        body=f"Your business owner request was rejected.\n\nReason: {reason}\n\nYou can try to sign up again with the same email and username if you wish to submit a new request.",
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
    # Find user by email
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already verified (but allow rejected business owners to re-verify)
    if user.email_verified:
        # Allow rejected business owners to request new verification code
        if user.role == UserRole.BUSINESS_OWNER and user.status == UserStatus.REJECTED:
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
    # Check if user exists with this email
    existing_user = db.query(User).filter(User.email == data.email).first()
    
    if existing_user:
        # Allow rejected business owners to always request new verification code
        if existing_user.role == UserRole.BUSINESS_OWNER and existing_user.status == UserStatus.REJECTED:
            # Rejected business owner can re-verify email - reset email_verified
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


@app.post("/files/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Accept one file, save it to 'uploads' folder, and return a URL.
    Later we can switch this to AWS S3 with the same response format.
    """
    # make unique filename
    ext = Path(file.filename).suffix or ".bin"
    new_name = f"{uuid4().hex}{ext}"
    dest = UPLOAD_DIR / new_name

    with dest.open("wb") as out_file:
        shutil.copyfileobj(file.file, out_file)

    # URL that the app can store in DB / display
    file_url = f"http://10.0.2.2:8000/uploads/{new_name}"  # for Android emulator
    return {"file_url": file_url}


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

    # send email
    send_email(
        to_email=user.email,
        subject="Wejhetna – Driver application approved",
        body="Your driver account has been approved. You can now use the app as a driver.",
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

    # send email with reason
    send_email(
        to_email=user.email,
        subject="Wejhetna – Driver application rejected",
        body=f"Your driver application was rejected. Reason: {reason}",
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
    """
    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
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
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    category.name_ar = data.name_ar
    category.name_he = data.name_he
    category.name_en = data.name_en
    category.icon_name = data.icon_name
    category.is_active = data.is_active

    db.commit()
    db.refresh(category)
    return category


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
    """
    city = City(**data.model_dump())
    db.add(city)
    db.commit()
    db.refresh(city)
    return city


@app.put("/admin/cities/{city_id}", response_model=CityResponse)
def update_city(
        city_id: int,
        data: CityCreate,  # אותם שדות name_ar / name_he / name_en
        db: Session = Depends(get_db),
):
    """
    עדכון שם עיר קיימת.
    (כרגע שמות בלבד – כמו שביקשת.)
    """
    city = db.query(City).filter(City.id == city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    city.name_ar = data.name_ar
    city.name_he = data.name_he
    city.name_en = data.name_en

    db.commit()
    db.refresh(city)
    return city


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
    places = db.query(Place).order_by(Place.id).all()
    return places


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

    db.refresh(place)
    db.refresh(location)
    return place


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