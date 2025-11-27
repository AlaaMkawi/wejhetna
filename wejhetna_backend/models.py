from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Enum,
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
