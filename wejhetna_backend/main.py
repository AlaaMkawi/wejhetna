from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy import func
from schemas import LocationCreate, LocationResponse
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from typing import Optional, List
from datetime import datetime, timezone
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
EMAIL_USER = "wejhetna@gmail.com"   # <– put the sender email here
EMAIL_PASS = "cdoj zsjt xpqf uelp"   # <– app password from Gmail
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


# ----- File uploads (local for now) -----
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Password hashing
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")



def hash_password(password: str) -> str:
    return pwd_context.hash(password)

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
        
class DriverReviewRequest(BaseModel):
    admin_user_id: int
    reason: Optional[str] = None
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
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


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

    return LoginResponse(
        id=user.id,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
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
from datetime import datetime, timezone  # make sure this import exists

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
    data: CategoryCreate,   # משתמשים באותם שדות (name_ar, name_he, name_en, icon_name, is_active)
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
    data: CityCreate,   # אותם שדות name_ar / name_he / name_en
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

        if detected_osm_id:                 # אם זיהינו אוטומטית
            final_osm_id = detected_osm_id
            final_source = "MAP_PICK"
        else:                               # לא מצאנו כלום
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

from sqlalchemy import func, or_, cast   # cast חדש
from geoalchemy2 import Geography        # כדי לקסט ל-Geography

@app.get("/places/map", response_model=List[PlaceResponse])
def get_places_in_bbox(
    north: float,
    south: float,
    east: float,
    west: float,
    db: Session = Depends(get_db),
):
    # envelope כ-geometry
    envelope_geom = func.ST_MakeEnvelope(west, south, east, north, 4326)

    # הקסטה ל-Geography (פוליגון גאוגרפי)
    envelope_geog = cast(envelope_geom, Geography(geometry_type="POLYGON", srid=4326))

    places = (
        db.query(Place)
        .join(Location, Place.location_id == Location.id)
        .filter(func.ST_Intersects(Location.geom, envelope_geog))
        .all()
    )

    return places

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
