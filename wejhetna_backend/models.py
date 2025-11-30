from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Enum,
    Boolean,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import ARRAY
from geoalchemy2 import Geography          # will be used later for map/location
from db import Base
import enum


# ========== ENUMS ==========

class UserRole(str, enum.Enum):
    REGULAR = "REGULAR"
    DRIVER = "DRIVER"
    BUSINESS_OWNER = "BUSINESS_OWNER"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    REJECTED = "REJECTED"


class DriverStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class VehicleStatus(str, enum.Enum):
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class PlaceType(str, enum.Enum):
    PUBLIC_SERVICE = "PUBLIC_SERVICE"   # בתי ספר, מרפאה, מסגד...
    BUSINESS = "BUSINESS"               # עסקים רגילים

# ========== TABLES ==========

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    phone = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)

    role = Column(Enum(UserRole), nullable=False)
    status = Column(Enum(UserStatus), nullable=False, default=UserStatus.ACTIVE)

    rejection_reason = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # relationships
    driver_profile = relationship("DriverProfile", back_populates="user", uselist=False)
    # בעלויות על עסקים (places)
    owned_places = relationship("Place", back_populates="owner")


class DriverProfile(Base):
    __tablename__ = "driver_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # DRIVER DOCUMENTS
    driver_license_image_url = Column(Text, nullable=False)  # רישיון נהיגה
    id_card_image_url = Column(Text, nullable=False)         # תעודת זהות

    driver_status = Column(Enum(DriverStatus), nullable=False, default=DriverStatus.PENDING)
    driver_status_updated_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # relationships
    user = relationship("User", back_populates="driver_profile")
    vehicles = relationship("DriverVehicle", back_populates="driver_profile")


class DriverVehicle(Base):
    __tablename__ = "driver_vehicles"

    id = Column(Integer, primary_key=True, index=True)
    driver_profile_id = Column(Integer, ForeignKey("driver_profiles.id"), nullable=False)

    # CAR INFO
    car_type = Column(String, nullable=False)         # סוג רכב
    plate_number = Column(String, nullable=False)     # מספר רכב
    production_year = Column(Integer, nullable=False) # שנת יצור

    # REQUIRED DOCS
    car_license_image_url = Column(Text, nullable=False)      # רישיון רכב
    car_insurance_image_url = Column(Text, nullable=False)    # ביטוח רכב

    # OPTIONAL PHOTOS
    car_photos_urls = Column(ARRAY(Text), nullable=True)      # צילומי רכב (לא חובה)

    # STATUS FOR THIS CAR
    status = Column(Enum(VehicleStatus), nullable=False, default=VehicleStatus.SUBMITTED)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # relationships
    driver_profile = relationship("DriverProfile", back_populates="vehicles")

class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)

    # 📍 כאן משתמשים ב-PostGIS:
    # Geography(POINT, 4326) = נקודה על כדור הארץ (lat/lon)
    geom = Column(
        Geography(geometry_type="POINT", srid=4326),
        nullable=False,
    )

    # אם הלוקיישן קשור ל-OSM: למשל "node:123456789"
    osm_id = Column(String, nullable=True)

    # מאיפה קיבלנו את המיקום: MAP_PICK / GPS / OSM_SEARCH
    source = Column(String, nullable=False, default="MAP_PICK")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # קשר 1–1 לטבלת places
    place = relationship("Place", back_populates="location", uselist=False)

class City(Base):
    __tablename__ = "cities"

    id = Column(Integer, primary_key=True, index=True)

    # שמות העיר – אפשר להתחיל רק עם אחד אם בא לך
    name_ar = Column(String, nullable=False)   # השם בערבית (חובה אצלך)
    name_he = Column(String, nullable=True)    # אופציונלי – שם בעברית
    name_en = Column(String, nullable=True)

    # אופציונלי בעתיד: קוד יישוב / מחוז / סוג יישוב
    # city_code = Column(String, nullable=True)
    # region = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # קשר 1–ל־הרבה: לעיר אחת יש הרבה PLACES
    places = relationship("Place", back_populates="city")

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)

    # שמות הקטגוריה
    name_ar = Column(String, nullable=False)   # חובה בערבית
    name_he = Column(String, nullable=True)    # אופציונלי בעברית
    name_en = Column(String, nullable=True)
    # אופציונלי – אייקון / צבע / סוג
    icon_name = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # קשר 1–ל־הרבה: קטגוריה אחת → הרבה Places
    places = relationship("Place", back_populates="category")

class Place(Base):
    __tablename__ = "places"

    id = Column(Integer, primary_key=True, index=True)

    # 🔗 קשר 1–1 ללוקיישן
    location_id = Column(Integer, ForeignKey("locations.id"), unique=True, nullable=False)
    location = relationship("Location", back_populates="place")

    # 🔗 עיר – MANY places → ONE city
    city_id = Column(Integer, ForeignKey("cities.id"), nullable=False)
    city = relationship("City", back_populates="places")

    # 🔗 קטגוריה – MANY places → ONE category
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category = relationship("Category", back_populates="places")

    # BUSINESS / PUBLIC_SERVICE
    place_type = Column(Enum(PlaceType), nullable=False)

    # שם המקום – חובה
    name = Column(String, nullable=False)

    # האם אפשר לקחת בעלות (claim)
    can_be_claimed = Column(Boolean, nullable=False, default=True)

    # מידע אופציונלי
    description = Column(Text, nullable=True)
    phone = Column(String, nullable=True)
    opening_hours = Column(String, nullable=True)
    main_image_url = Column(Text, nullable=True)
    social_links = Column(Text, nullable=True)

    # 👇 בעל העסק – קשר MANY places → ONE user
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    owner = relationship("User", back_populates="owned_places")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
