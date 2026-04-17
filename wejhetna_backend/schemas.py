# schemas.py
from datetime import datetime
from typing import Optional

from typing import Optional, List

from pydantic import BaseModel, Field,  EmailStr

from models import PlaceType  # נשתמש ב-ENUM שהגדרת במודלים


# =========================
# CITY SCHEMAS
# =========================

class CityBase(BaseModel):
    name_ar: str
    name_he: Optional[str] = None
    name_en: Optional[str] = None


class CityCreate(CityBase):
    """מה שהאדמין שולח כשמוסיף עיר חדשה."""
    pass


class CityResponse(CityBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


# =========================
# CATEGORY SCHEMAS
# =========================

class CategoryBase(BaseModel):
    name_ar: str
    name_he: Optional[str] = None
    name_en: Optional[str] = None
    icon_name: Optional[str] = None
    is_active: bool = True


class CategoryCreate(CategoryBase):
    """מה ששולחים כשאדמין יוצר קטגוריה חדשה."""
    pass


class CategoryResponse(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


# =========================
# LOCATION SCHEMAS
# =========================
# כאן הסכמות מייצגות את ה-POINT של PostGIS:
# lat / lon = יושבים בפועל על Geography(POINT, 4326) (PostGIS)

class LocationBase(BaseModel):
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")
    # נוסיף גם הערכים החדשים של GPS בתיאור
    source: str = Field(
        "MAP_PICK",
        description="MAP_PICK / GPS_NO_OSM / GPS_WITH_OSM / OSM_SEARCH",
    )
    osm_id: Optional[str] = Field(
        None,
        description="OSM feature id like 'node:123456789'",
    )


class LocationCreate(LocationBase):
    """מה שהפרונט שולח כשמייצרים לוקיישן חדש (מהמפה / GPS)."""
    pass


class LocationResponse(LocationBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


# =========================
# PLACE SCHEMAS
# =========================
# כאן זה השילוב:
# - city_id, category_id, owner_user_id → PostgreSQL
# - location_id → מצביע ל-Location שבו ה-geom הוא PostGIS POINT


class PlaceBase(BaseModel):
    # השם הכללי (למשל באנגלית או ברירת מחדל)
    name: str
    name_ar: Optional[str] = None
    name_he: Optional[str] = None
    place_type: PlaceType          # BUSINESS / PUBLIC_SERVICE

    city_id: int                   # לכל מקום יש עיר אחת
    category_id: Optional[int] = None  # חובה רק אם זה BUSINESS (בלוגיקה, לא כאן)

    can_be_claimed: bool = True

    description: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    main_image_url: Optional[str] = None
    business_images_urls: Optional[List[str]] = None  # תמונות העסק (מערך)
    social_links: Optional[str] = None
    announcement: Optional[str] = None  # הודעת עסק / מבצעים / הודעות מיוחדות
    created_by_admin_id: Optional[int] = None
    owner_user_id: Optional[int] = None  # אם זה עסק, אפשר לשייך לבעלים


class PlaceCreate(PlaceBase):
    """
    יצירת מקום רגילה (לאדמין דרך /places) –
    כאן נדרוש שמות בשתי השפות.
    """
    name_ar: str
    name_he: str

    # כאן אנחנו מניחים שה-Location כבר נוצר, ויש לנו את ה-id שלו.
    location_id: int


class PlaceUpdate(BaseModel):
    """
    עדכון מקום - כל השדות אופציונליים חוץ מ-id.
    """
    name: Optional[str] = None
    name_ar: Optional[str] = None
    name_he: Optional[str] = None
    city_id: Optional[int] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    main_image_url: Optional[str] = None

    social_links: Optional[str] = None

    business_images_urls: Optional[List[str]] = None
    social_links: Optional[str] = None
    announcement: Optional[str] = None


class PlaceResponse(PlaceBase):
    id: int

    # בשכבת ה-Response מותר שלא יהיה ערך (למקומות ישנים)
    name_ar: Optional[str] = None
    name_he: Optional[str] = None

    location: LocationResponse
    city: CityResponse
    category: Optional[CategoryResponse] = None
    created_by_admin_id: Optional[int] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class AdminPlaceCreate(BaseModel):
    """
    מה שטופס האדמין ישלח כדי ליצור מקום חדש + לוקיישן.
    """

    # ---------- שדות של PLACE ----------
    name: str
    # כאן *חובה* למלא ערבית + עברית:
    name_ar: str
    name_he: str

    place_type: PlaceType          # BUSINESS / PUBLIC_SERVICE

    city_id: int                   # חובה – לכל מקום יש עיר
    category_id: Optional[int] = None  # חובה רק אם זה BUSINESS (נבדוק בלוגיקה)

    can_be_claimed: bool = True

    description: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    main_image_url: Optional[str] = None
    social_links: Optional[str] = None

    owner_user_id: Optional[int] = None  # אם זה עסק משויך לבעלים
    created_by_admin_id: Optional[int] = None
    # ---------- שדות של LOCATION ----------
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")
    source: str = Field(
        "MAP_PICK",
        description="MAP_PICK / GPS_NO_OSM / GPS_WITH_OSM / OSM_SEARCH",
    )
    osm_id: Optional[str] = Field(
        None,
        description="OSM feature id like 'node:123456789'",
    )


# =========================
# EMAIL VERIFICATION SCHEMAS
# =========================

class SendVerificationCodeRequest(BaseModel):
    email: EmailStr
    language: Optional[str] = "ar"  # Default to Arabic, can be "ar", "he", or "en"


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class VerifyEmailResponse(BaseModel):
    success: bool
    message: str


class ResendCodeRequest(BaseModel):
    email: EmailStr


# =========================
# PASSWORD RESET SCHEMAS
# =========================

class RequestPasswordResetRequest(BaseModel):
    email: EmailStr
    language: Optional[str] = "ar"  # Default to Arabic, can be "ar", "he", or "en"


class VerifyPasswordResetCodeRequest(BaseModel):
    email: EmailStr
    code: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class PasswordResetResponse(BaseModel):
    success: bool
    message: str


# =========================
# ADVERTISEMENT SCHEMAS
# =========================

class AdvertisementUserPublicOut(BaseModel):
    """Minimal user info for advertisement display (no internal ids)."""

    username: str
    full_name: str

    class Config:
        orm_mode = True


class AdvertisementCreateResponse(BaseModel):
    """Response after creating an advertisement request (user submission)."""

    id: int
    image_url: str
    status: str
    message: str


class AdvertisementPublicOut(BaseModel):
    """Approved, non-expired advertisement for public listing (GET /advertisements)."""

    id: int
    image_url: str
    category_id: int
    city_id: int
    description: Optional[str] = None
    user: AdvertisementUserPublicOut
    created_at: datetime

    class Config:
        orm_mode = True


class AdminPendingAdvertisementOut(BaseModel):
    """Pending advertisement row for admin list (GET /admin/advertisements/pending)."""

    id: int
    image_url: str
    category_id: int
    city_id: int
    description: Optional[str] = None
    user: AdvertisementUserPublicOut
    created_at: datetime

    class Config:
        orm_mode = True


class AdvertisementAdminRequest(BaseModel):
    """Body for admin advertisement approve/reject (matches other admin_*_user_id patterns)."""

    admin_user_id: int


class AdvertisementAdminActionResponse(BaseModel):
    """Response after admin approve or reject."""

    id: int
    status: str
    message: str


class DriverAvailabilityUpdateRequest(BaseModel):
    driver_user_id: int
    is_available: bool
    lat: Optional[float] = None
    lon: Optional[float] = None


class DriverAvailabilityLocationUpdateRequest(BaseModel):
    driver_user_id: int
    lat: float
    lon: float


class NearbyAvailableDriverOut(BaseModel):
    driver_user_id: int
    full_name: str
    username: str
    lat: float
    lon: float
    distance_km: float


class RideRequestCreateRequest(BaseModel):
    regular_user_id: int
    driver_user_id: int
    pickup_lat: float
    pickup_lon: float
    destination_text: str
    destination_lat: Optional[float] = None
    destination_lon: Optional[float] = None
    regular_phone: str
    passengers_count: Optional[int] = Field(default=None, ge=1, le=12)
    number_of_people: Optional[int] = Field(default=None, ge=1, le=12)
    number_of_seats_required: Optional[int] = Field(default=None, ge=1, le=12)


class RideRequestActionRequest(BaseModel):
    driver_user_id: int
    note: Optional[str] = None


class RideRequestStatusOut(BaseModel):
    id: int
    status: str
    message: str


class RideRequestRegularOut(BaseModel):
    id: int
    driver_user_id: int
    driver_full_name: str
    driver_username: str
    pickup_lat: float
    pickup_lon: float
    destination_text: str
    passengers_count: int
    number_of_people: Optional[int] = None
    number_of_seats_required: Optional[int] = None
    estimated_trip_time: Optional[int] = None
    eta_to_user: Optional[int] = None  # minutes until driver reaches pickup (live while on the way)
    distance_to_pickup_km: Optional[float] = None  # driver live position to pickup (when location known)
    driver_live_lat: Optional[float] = None
    driver_live_lon: Optional[float] = None
    status: str
    verification_code: Optional[str] = None  # set when driver arrived; passenger shares with driver
    created_at: datetime
    updated_at: datetime


class RideVerifyCodeRequest(BaseModel):
    ride_request_id: int = Field(..., ge=1)
    driver_user_id: int = Field(..., ge=1)
    verification_code: str = Field(..., min_length=4, max_length=16)


class RideRequestDriverOut(BaseModel):
    id: int
    regular_user_id: int
    regular_username: str
    pickup_lat: float
    pickup_lon: float
    destination_text: str
    destination_lat: Optional[float] = None
    destination_lon: Optional[float] = None
    passengers_count: int
    number_of_people: Optional[int] = None
    number_of_seats_required: Optional[int] = None
    status: str
    distance_to_pickup_km: Optional[float] = None
    eta_to_pickup_min: Optional[int] = None
    eta_to_user: Optional[int] = None
    estimated_trip_time: Optional[int] = None
    regular_phone: Optional[str] = None
    created_at: datetime
    updated_at: datetime