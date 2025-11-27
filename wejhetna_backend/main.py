from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_

from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import File, UploadFile
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from uuid import uuid4
import shutil


from db import Base, engine, SessionLocal
import models
from models import (
    User,
    UserRole,
    UserStatus,
    DriverProfile,
    DriverVehicle,
    DriverStatus,
    VehicleStatus,
)
app = FastAPI(
    title="Wejhetna Backend",
    version="0.1.0"
)
Base.metadata.create_all(bind=engine)
# ----- File uploads (local for now) -----
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Password hashing
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# ---------- Pydantic schemas for signup ----------

class RegularUserSignup(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    phone: str
    password: str


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

class DriverSignupRequest(BaseModel):
    # basic user info
    full_name: str
    username: str
    email: EmailStr
    phone: str
    password: str

    # driver documents
    driver_license_image_url: str   # רישיון נהיגה
    id_card_image_url: str          # תעודת זהות

    # car info + docs
    car_type: str                   # סוג רכב
    plate_number: str               # מספר רכב
    production_year: int            # שנת יצור
    car_license_image_url: str      # רישיון רכב
    car_insurance_image_url: str    # ביטוח רכב

    # optional photos
    car_photos_urls: Optional[List[str]] = None  # צילומים לרכב (לא חובה)


class DriverSignupOut(BaseModel):
    user: UserOut
    driver_profile_id: int
    vehicle_id: int
    driver_status: str
    vehicle_status: str

    class Config:
        orm_mode = True

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


# ---------- Regular user signup endpoint ----------

@app.post("/auth/signup/regular", response_model=UserOut)
def signup_regular_user(data: RegularUserSignup, db: Session = Depends(get_db)):
    # Check username or email already exists
    existing_user = db.query(User).filter(
        or_(User.username == data.username, User.email == data.email)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username or email already exists",
        )

    # Hash password
    password_hash = hash_password(data.password)

    # Create user
    user = User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        phone=data.phone,
        password_hash=password_hash,
        role=UserRole.REGULAR,
        status=UserStatus.ACTIVE,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

@app.post("/auth/signup/driver", response_model=DriverSignupOut)
def signup_driver(data: DriverSignupRequest, db: Session = Depends(get_db)):
    # 1. Check username/email uniqueness
    existing_user = (
        db.query(User)
        .filter(or_(User.username == data.username, User.email == data.email))
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username or email already exists",
        )

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

    # 8. Return response
    return DriverSignupOut(
        user=UserOut.model_validate(user, from_attributes=True),
        driver_profile_id=driver_profile.id,
        vehicle_id=vehicle.id,
        driver_status=driver_profile.driver_status.value,
        vehicle_status=vehicle.status.value,
    )


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
