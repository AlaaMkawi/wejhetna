# schemas.py
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

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
    source: str = Field("MAP_PICK", description="MAP_PICK / GPS / OSM_SEARCH")
    osm_id: Optional[str] = Field(None, description="OSM feature id like 'node:123456789'")


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
    name: str
    place_type: PlaceType          # BUSINESS / PUBLIC_SERVICE

    city_id: int                   # לכל מקום יש עיר אחת
    category_id: Optional[int] = None  # חובה רק אם זה BUSINESS (בלוגיקה, לא כאן)

    can_be_claimed: bool = True

    description: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    main_image_url: Optional[str] = None
    social_links: Optional[str] = None

    owner_user_id: Optional[int] = None  # אם זה עסק, אפשר לשייך לבעלים


class PlaceCreate(PlaceBase):
    # כאן אנחנו מניחים שה-Location כבר נוצר, ויש לנו את ה-id שלו.
    location_id: int


class PlaceResponse(PlaceBase):
    id: int
    location: LocationResponse
    city: CityResponse
    category: Optional[CategoryResponse] = None

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

    # ---------- שדות של LOCATION ----------
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")
    source: str = Field("MAP_PICK", description="MAP_PICK / GPS / OSM_SEARCH")
    osm_id: Optional[str] = Field(None, description="OSM feature id like 'node:123456789'")
