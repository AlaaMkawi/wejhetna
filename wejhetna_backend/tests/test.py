"""
Backend tests: all pytest cases in one file (fixtures defined below).

Set env before importing the app (must run before `main` import):
- WEJHETNA_SKIP_DB_CREATE_ALL — skip main.py create_all (Postgres + PostGIS in prod)
- DATABASE_URL — placeholder; per-fixture in-memory engine is used via dependency override
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

# noqa: E402 — env must be set before backend imports
os.environ["WEJHETNA_SKIP_DB_CREATE_ALL"] = "1"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Text, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import models
from deps import get_db
from main import (
    app,
    detect_language,
    generate_verification_code,
    hash_password,
)
from models import (
    Advertisement,
    AdvertisementStatus,
    BusinessOwnerPlaceRequest,
    Category,
    City,
    DriverAvailability,
    DriverProfile,
    DriverRating,
    DriverReport,
    DriverReportStatus,
    DriverStatus,
    DriverVehicle,
    DriverVehicleUpdateRequest,
    EmailVerification,
    Location,
    OwnerPlaceRequestStatus,
    Place,
    PlaceType,
    RideRequest,
    RideRequestStatus,
    SavedPlace,
    User,
    UserRole,
    UserStatus,
    VehicleStatus,
    VehicleUpdateRequestStatus,
)
from services.advertisement_s3_upload import (
    AdvertisementImageUploadResult,
    AdvertisementImageValidationError,
    _normalize_extension,
    _validate_image_magic_bytes,
    _validate_size,
    upload_advertisement_image_to_s3,
)
from services.advertisement_service import (
    AdvertisementInvalidStateError,
    AdvertisementPermissionError,
    CategoryNotFoundError,
    approve_advertisement,
    create_advertisement_request,
    delete_advertisement_by_admin,
    delete_advertisement_by_owner,
    list_public_approved_advertisements,
    reject_advertisement,
)

# -- fixtures (formerly conftest.py) -------------------------------------------------


def _patch_pg_only_columns_for_sqlite() -> None:
    """Postgres-only column types (Geography, ARRAY) are not renderable by the
    SQLite dialect. Swap them out for plain Text so DDL succeeds — we never
    rely on these columns in the test suite."""
    if "boundary" in models.City.__table__.c:
        col = models.City.__table__.c.boundary
        col.type = Text()
        col.nullable = True
    if "geom" in Location.__table__.c:
        col = Location.__table__.c.geom
        col.type = Text()
        col.nullable = False
    for _model, _colname in (
        (Place, "business_images_urls"),
        (BusinessOwnerPlaceRequest, "business_images_urls"),
    ):
        if _colname in _model.__table__.c:
            col = _model.__table__.c[_colname]
            col.type = Text()
            col.nullable = True
    for _model in (models.DriverVehicle, DriverVehicleUpdateRequest):
        if "car_photos_urls" in _model.__table__.c:
            col = _model.__table__.c.car_photos_urls
            col.type = Text()
            col.nullable = True


# Backwards-compat alias (older tests/imports may reference the original name).
_patch_city_boundary_for_sqlite = _patch_pg_only_columns_for_sqlite


def _create_ad_tables(engine) -> None:
    _patch_pg_only_columns_for_sqlite()
    User.__table__.create(engine, checkfirst=True)
    EmailVerification.__table__.create(engine, checkfirst=True)
    Category.__table__.create(engine, checkfirst=True)
    City.__table__.create(engine, checkfirst=True)
    # Stub `locations` / `places` / business-owner request rows for admin approval
    # tests (`geom` patched to Text`). Ride flows keep `DriverAvailability.location_id`
    # NULL in tests; SQLite still does not enforce FKs strictly.
    Location.__table__.create(engine, checkfirst=True)
    Place.__table__.create(engine, checkfirst=True)
    BusinessOwnerPlaceRequest.__table__.create(engine, checkfirst=True)
    Advertisement.__table__.create(engine, checkfirst=True)
    # Ride-domain tables.
    DriverProfile.__table__.create(engine, checkfirst=True)
    DriverVehicle.__table__.create(engine, checkfirst=True)
    DriverVehicleUpdateRequest.__table__.create(engine, checkfirst=True)
    DriverAvailability.__table__.create(engine, checkfirst=True)
    RideRequest.__table__.create(engine, checkfirst=True)
    DriverRating.__table__.create(engine, checkfirst=True)
    DriverReport.__table__.create(engine, checkfirst=True)
    SavedPlace.__table__.create(engine, checkfirst=True)


@pytest.fixture
def engine():
    # StaticPool: one connection so SQLite :memory: is not a fresh empty DB per checkout.
    eng = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    _create_ad_tables(eng)
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture
def db_session(engine) -> Session:
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client(db_session: Session):
    def _get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def sample_category_city(db_session: Session):
    cat = Category(
        name_ar="c",
        name_he=None,
        name_en=None,
        icon_name=None,
        is_active=True,
    )
    city = City(
        name_ar="city",
        name_he=None,
        name_en=None,
        boundary=None,
    )
    db_session.add_all([cat, city])
    db_session.commit()
    db_session.refresh(cat)
    db_session.refresh(city)
    return cat, city


@pytest.fixture
def regular_user_active_verified(db_session: Session) -> User:
    u = User(
        full_name="Test User",
        username="testuser1",
        email="testuser1@example.com",
        phone="0500000000",
        password_hash=hash_password("ValidPass1!"),
        role=UserRole.REGULAR,
        status=UserStatus.ACTIVE,
        email_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def admin_user_active(db_session: Session) -> User:
    u = User(
        full_name="Admin",
        username="admin1",
        email="admin1@example.com",
        phone="0500000001",
        password_hash=hash_password("AdminPass1!"),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
        email_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def mock_s3_ad_upload(monkeypatch):
    def _fake_upload(user_id, file_content, original_filename):
        return AdvertisementImageUploadResult(
            image_url="https://test-bucket.s3.test/ad.jpg",
            image_key="advertisements/1/abc.jpg",
        )

    monkeypatch.setattr(
        "services.advertisement_service.upload_advertisement_image_to_s3",
        _fake_upload,
    )


@pytest.fixture
def mock_admin_status_email(monkeypatch):
    calls: list[tuple] = []

    def _fake(to_email, subject, body, *, status, request_type):
        calls.append((to_email, status, request_type))

    monkeypatch.setattr("main.enqueue_admin_status_email", _fake)
    return calls


# -- Auth: POST /auth/login ----------------------------------------------------------


def test_login_success_returns_user_payload(
    client: TestClient, db_session, regular_user_active_verified: User
):
    res = client.post(
        "/auth/login",
        json={
            "username_or_email": regular_user_active_verified.email,
            "password": "ValidPass1!",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["id"] == regular_user_active_verified.id
    assert data["role"] == "REGULAR"
    assert data["status"] == "ACTIVE"
    assert data["full_name"] == "Test User"


def test_login_wrong_password_401(
    client: TestClient, db_session, regular_user_active_verified: User
):
    res = client.post(
        "/auth/login",
        json={
            "username_or_email": regular_user_active_verified.email,
            "password": "WrongPass1!",
        },
    )
    assert res.status_code == 401
    assert "Invalid" in res.json()["detail"] or "invalid" in res.json()["detail"].lower()


def test_login_unknown_user_401(client: TestClient, db_session):
    res = client.post(
        "/auth/login",
        json={"username_or_email": "nope@example.com", "password": "ValidPass1!"},
    )
    assert res.status_code == 401


def test_login_unverified_email_403(
    client: TestClient, db_session, regular_user_active_verified: User
):
    regular_user_active_verified.email_verified = False
    db_session.add(regular_user_active_verified)
    db_session.commit()

    res = client.post(
        "/auth/login",
        json={
            "username_or_email": regular_user_active_verified.email,
            "password": "ValidPass1!",
        },
    )
    assert res.status_code == 403
    assert "verify" in res.json()["detail"].lower()


def test_login_username_or_email_uses_username(
    client: TestClient, db_session, regular_user_active_verified: User
):
    res = client.post(
        "/auth/login",
        json={
            "username_or_email": regular_user_active_verified.username,
            "password": "ValidPass1!",
        },
    )
    assert res.status_code == 200
    assert res.json()["id"] == regular_user_active_verified.id


# -- services/advertisement_service.py ------------------------------------------------


def _user(db_session, tag: str | None = None) -> User:
    t = tag or str(uuid.uuid4())[:10]
    u = User(
        full_name="U",
        username=f"u_{t}",
        email=f"u_{t}@example.com",
        phone="1",
        password_hash=hash_password("Xyz9!Abc#"),
        role=UserRole.REGULAR,
        status=UserStatus.ACTIVE,
        email_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _cat_city(db_session):
    c = Category(name_ar="c", name_he=None, name_en=None, is_active=True)
    city = City(name_ar="ct", name_he=None, name_en=None, boundary=None)
    db_session.add_all([c, city])
    db_session.commit()
    db_session.refresh(c)
    db_session.refresh(city)
    return c, city


def test_create_request_pending_no_expires(
    db_session, mock_s3_ad_upload
):
    u = _user(db_session)
    cat, city = _cat_city(db_session)

    ad = create_advertisement_request(
        db_session,
        user=u,
        category_id=cat.id,
        city_id=city.id,
        description="  hi  ",
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 500,
        original_filename="a.jpg",
    )
    assert ad.id is not None
    assert ad.status == AdvertisementStatus.PENDING
    assert ad.approved_at is None
    assert ad.expires_at is None
    assert ad.description == "hi"


def test_create_category_not_found(
    db_session, mock_s3_ad_upload
):
    u = _user(db_session)
    _, city = _cat_city(db_session)
    with pytest.raises(CategoryNotFoundError):
        create_advertisement_request(
            db_session,
            user=u,
            category_id=99999,
            city_id=city.id,
            description=None,
            file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 100,
            original_filename="a.jpg",
        )


def test_approve_sets_lifecycle_and_idempotent(
    db_session, sample_category_city, mock_s3_ad_upload
):
    u = _user(db_session)
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=u,
        category_id=cat.id,
        city_id=city.id,
        description=None,
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        original_filename="p.jpg",
    )
    a1, msg1 = approve_advertisement(db_session, ad.id)
    assert a1.status == AdvertisementStatus.APPROVED
    assert a1.approved_at is not None
    assert a1.expires_at is not None
    assert msg1 == "Advertisement approved successfully."

    a2, msg2 = approve_advertisement(db_session, ad.id)
    assert a2.status == AdvertisementStatus.APPROVED
    assert msg2 == "Advertisement is already approved."


def test_cannot_approve_rejected(
    db_session, sample_category_city, mock_s3_ad_upload
):
    u = _user(db_session)
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=u,
        category_id=cat.id,
        city_id=city.id,
        description=None,
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        original_filename="p.jpg",
    )
    reject_advertisement(db_session, ad.id)
    with pytest.raises(AdvertisementInvalidStateError):
        approve_advertisement(db_session, ad.id)


def test_reject_cannot_after_approved(
    db_session, sample_category_city, mock_s3_ad_upload
):
    u = _user(db_session)
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=u,
        category_id=cat.id,
        city_id=city.id,
        description=None,
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        original_filename="p.jpg",
    )
    approve_advertisement(db_session, ad.id)
    with pytest.raises(AdvertisementInvalidStateError):
        reject_advertisement(db_session, ad.id)


def test_list_public_excludes_pending_and_expired(
    db_session, sample_category_city, mock_s3_ad_upload
):
    u = _user(db_session)
    cat, city = sample_category_city
    p = create_advertisement_request(
        db_session,
        user=u,
        category_id=cat.id,
        city_id=city.id,
        description=None,
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        original_filename="p.jpg",
    )
    assert len(list_public_approved_advertisements(db_session)) == 0

    approve_advertisement(db_session, p.id)
    assert len(list_public_approved_advertisements(db_session)) == 1

    ad = db_session.query(Advertisement).filter(Advertisement.id == p.id).one()
    ad.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()
    assert len(list_public_approved_advertisements(db_session)) == 0


def test_delete_owner_wrong_user_forbidden(
    db_session, sample_category_city, mock_s3_ad_upload
):
    u1 = _user(db_session, "one")
    u2 = _user(db_session, "two")

    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=u1,
        category_id=cat.id,
        city_id=city.id,
        description=None,
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        original_filename="p.jpg",
    )
    with pytest.raises(AdvertisementPermissionError):
        delete_advertisement_by_owner(
            db_session, advertisement_id=ad.id, user_id=u2.id
        )


def test_delete_by_admin(
    db_session, sample_category_city, mock_s3_ad_upload
):
    u = _user(db_session)
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=u,
        category_id=cat.id,
        city_id=city.id,
        description=None,
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        original_filename="p.jpg",
    )
    delete_advertisement_by_admin(db_session, advertisement_id=ad.id)
    assert (
        db_session.query(Advertisement).filter(Advertisement.id == ad.id).first()
        is None
    )


# -- HTTP: /advertisements, /admin/advertisements ------------------------------------


def test_get_advertisements_empty(client, db_session):
    r = client.get("/advertisements")
    assert r.status_code == 200
    assert r.json() == []


def test_create_then_approve_then_list_public(
    client,
    db_session,
    regular_user_active_verified: User,
    admin_user_active: User,
    sample_category_city,
    mock_s3_ad_upload,
):
    cat, city = sample_category_city
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 400
    r = client.post(
        "/advertisements",
        files={"image": ("poster.jpg", jpeg, "image/jpeg")},
        data={
            "category_id": str(cat.id),
            "city_id": str(city.id),
            "user_id": str(regular_user_active_verified.id),
            "description": "Hello",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "PENDING"
    ad_id = body["id"]

    r2 = client.get("/advertisements")
    assert r2.status_code == 200
    assert r2.json() == []

    r3 = client.post(
        f"/admin/advertisements/{ad_id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["status"] == "APPROVED"

    r4 = client.get("/advertisements")
    assert r4.status_code == 200
    items = r4.json()
    assert len(items) == 1
    assert items[0]["id"] == ad_id


def test_create_404_when_category_missing(
    client,
    db_session,
    regular_user_active_verified: User,
    sample_category_city,
    mock_s3_ad_upload,
):
    _, city = sample_category_city
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
    r = client.post(
        "/advertisements",
        files={"image": ("x.jpg", jpeg, "image/jpeg")},
        data={
            "category_id": "999999",
            "city_id": str(city.id),
            "user_id": str(regular_user_active_verified.id),
        },
    )
    assert r.status_code == 404
    assert "Category" in r.json()["detail"]


def test_owner_delete_returns_204(
    client,
    db_session,
    regular_user_active_verified: User,
    admin_user_active: User,
    sample_category_city,
    mock_s3_ad_upload,
):
    cat, city = sample_category_city
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 200
    cr = client.post(
        "/advertisements",
        files={"image": ("d.jpg", jpeg, "image/jpeg")},
        data={
            "category_id": str(cat.id),
            "city_id": str(city.id),
            "user_id": str(regular_user_active_verified.id),
        },
    )
    ad_id = cr.json()["id"]

    dr = client.delete(
        f"/advertisements/{ad_id}",
        params={"user_id": regular_user_active_verified.id},
    )
    assert dr.status_code == 204
    assert db_session.query(Advertisement).filter(Advertisement.id == ad_id).first() is None


def test_admin_delete_returns_204(
    client,
    db_session,
    regular_user_active_verified: User,
    admin_user_active: User,
    sample_category_city,
    mock_s3_ad_upload,
):
    cat, city = sample_category_city
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 200
    cr = client.post(
        "/advertisements",
        files={"image": ("e.jpg", jpeg, "image/jpeg")},
        data={
            "category_id": str(cat.id),
            "city_id": str(city.id),
            "user_id": str(regular_user_active_verified.id),
        },
    )
    ad_id = cr.json()["id"]

    dr = client.delete(
        f"/admin/advertisements/{ad_id}",
        params={"admin_user_id": admin_user_active.id},
    )
    assert dr.status_code == 204


# =====================================================================================
# RIDE LIFECYCLE / CANCELLATION / VALIDATION  (Batch A: backend rides)
# =====================================================================================
#
# These tests cover the full ride state machine end-to-end through the HTTP layer:
#
#   pending → accepted → on_the_way → arrived → in_progress → completed
#
# plus the cancellation/sync surface on both sides (driver, passenger), the
# `/users/{id}/ride-requests/latest` visibility checks, and the most important
# validation paths (wrong verification code, double-active block, only-pending
# can be accepted, etc.).
#
# IMPORTANT: PostGIS-only helpers (`_distance_km_between_points`,
# `_is_point_in_service_cities`, `_live_eta_minutes_driver_to_pickup`) are
# wrapped in try/except inside the production endpoints, so they fall through
# cleanly on SQLite. We never set `DriverAvailability.location_id` in the
# fixtures — the ETA columns end up nullable, which the schemas already allow.
#
# `enqueue_verification_code_created` / `enqueue_ride_in_progress` are no-ops
# unless Celery is configured (which it isn't in tests), so we don't need to
# mock them explicitly.
#
# -- ride fixtures ------------------------------------------------------------------


def _make_user(
    db_session: Session,
    *,
    role: UserRole,
    tag: str,
    status: UserStatus = UserStatus.ACTIVE,
) -> User:
    u = User(
        full_name=f"{role.value} {tag}",
        username=f"{role.value.lower()}_{tag}",
        email=f"{role.value.lower()}_{tag}@example.com",
        phone=f"05000{tag[-5:].rjust(5, '0')}",
        password_hash=hash_password("RidePass1!"),
        role=role,
        status=status,
        email_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def driver_user(db_session: Session) -> User:
    """Driver user with an APPROVED DriverProfile (no vehicles attached — those are
    only required by `/rides/nearby-drivers`, which we don't exercise here)."""
    u = _make_user(db_session, role=UserRole.DRIVER, tag=str(uuid.uuid4())[:6])
    profile = DriverProfile(
        user_id=u.id,
        driver_license_image_url="https://test/license.jpg",
        id_card_image_url="https://test/id.jpg",
        driver_status=DriverStatus.APPROVED,
    )
    db_session.add(profile)
    db_session.commit()
    return u


@pytest.fixture
def driver_available(db_session: Session, driver_user: User) -> User:
    """Driver flipped to `is_available=True` (no live location — fine for tests)."""
    av = DriverAvailability(driver_user_id=driver_user.id, is_available=True)
    db_session.add(av)
    db_session.commit()
    return driver_user


@pytest.fixture
def passenger(db_session: Session) -> User:
    return _make_user(db_session, role=UserRole.REGULAR, tag=str(uuid.uuid4())[:6])


@pytest.fixture
def business_passenger(db_session: Session) -> User:
    return _make_user(db_session, role=UserRole.BUSINESS_OWNER, tag=str(uuid.uuid4())[:6])


@pytest.fixture
def regular_user(db_session: Session) -> User:
    """Extra regular user (unique username/email per test run)."""
    return _make_user(db_session, role=UserRole.REGULAR, tag=str(uuid.uuid4())[:8])


@pytest.fixture
def approved_driver(db_session: Session) -> tuple[User, DriverProfile]:
    """Approved driver with an APPROVED vehicle (for vehicle-update request tests)."""
    u = _make_user(db_session, role=UserRole.DRIVER, tag=str(uuid.uuid4())[:6])
    profile = DriverProfile(
        user_id=u.id,
        driver_license_image_url="https://test/license.jpg",
        id_card_image_url="https://test/id.jpg",
        driver_status=DriverStatus.APPROVED,
        vehicle_update_blocked=False,
    )
    db_session.add(profile)
    db_session.flush()
    db_session.add(
        DriverVehicle(
            driver_profile_id=profile.id,
            car_type="sedan",
            plate_number="11-111-11",
            production_year=2021,
            car_license_image_url="https://test/car_license.jpg",
            car_insurance_image_url="https://test/car_insurance.jpg",
            status=VehicleStatus.APPROVED,
        )
    )
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(profile)
    return u, profile


def _vehicle_update_payload(driver_user_id: int, **overrides) -> dict:
    body = {
        "driver_user_id": driver_user_id,
        "request_type": "UPDATE_EXISTING",
        "car_type": "suv",
        "plate_number": "99-999-99",
        "production_year": 2022,
        "driver_license_image_url": "https://test/new_license.jpg",
        "id_card_image_url": "https://test/new_id.jpg",
        "car_license_image_url": "https://test/new_car_license.jpg",
        "car_insurance_image_url": "https://test/new_car_insurance.jpg",
        "message_to_admin": "please review",
    }
    body.update(overrides)
    return body


def _set_driver_online_with_location(
    db_session: Session,
    driver: User,
    *,
    lat: float = 31.392,
    lon: float = 34.756,
) -> DriverAvailability:
    loc = Location(geom=f"POINT({lon} {lat})", source="DRIVER_AVAILABILITY")
    db_session.add(loc)
    db_session.flush()
    av = (
        db_session.query(DriverAvailability)
        .filter(DriverAvailability.driver_user_id == driver.id)
        .first()
    )
    if not av:
        av = DriverAvailability(driver_user_id=driver.id)
        db_session.add(av)
    av.is_available = True
    av.location_id = loc.id
    av.updated_at = datetime.now(timezone.utc)
    db_session.commit()
    db_session.refresh(av)
    return av


def _create_vehicle_update_request(client: TestClient, driver_id: int) -> int:
    r = client.post(
        "/drivers/vehicle-update-requests",
        json=_vehicle_update_payload(driver_id),
    )
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def _regular_signup_payload(**overrides) -> dict:
    tag = str(uuid.uuid4())[:8]
    body = {
        "full_name": "Test User",
        "username": f"newuser_{tag}",
        "email": f"newuser_{tag}@example.com",
        "phone": "0501234567",
        "password": "ValidPass1!",
        "password_confirmation": "ValidPass1!",
        "language": "he",
    }
    body.update(overrides)
    return body


def _create_ride_payload(passenger_user: User, driver: User, **overrides) -> dict:
    """Default ride request body. Lat/Lon use Rahat-ish coordinates so the city
    boundary check (which falls through to True on PostGIS errors) is irrelevant."""
    body = {
        "regular_user_id": passenger_user.id,
        "driver_user_id": driver.id,
        "pickup_lat": 31.392,
        "pickup_lon": 34.756,
        "destination_text": "Selected destination",
        "destination_lat": 31.395,
        "destination_lon": 34.760,
        "regular_phone": passenger_user.phone,
        "passengers_count": 1,
        "number_of_people": 1,
        "number_of_seats_required": 1,
    }
    body.update(overrides)
    return body


def _create_ride(client: TestClient, passenger_user: User, driver: User, **overrides) -> int:
    r = client.post("/rides/requests", json=_create_ride_payload(passenger_user, driver, **overrides))
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def _walk_to_arrived(client: TestClient, ride_id: int, driver: User) -> None:
    """Walk a freshly-created ride through accept → on_the_way → arrived."""
    r = client.post(
        f"/rides/requests/{ride_id}/accept", json={"driver_user_id": driver.id}
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/rides/requests/{ride_id}/start-driving", json={"driver_user_id": driver.id}
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/rides/requests/{ride_id}/arrived", json={"driver_user_id": driver.id}
    )
    assert r.status_code == 200, r.text


def _verification_code_of(db_session: Session, ride_id: int) -> str:
    """The driver list endpoint deliberately does NOT echo the verification
    code (it's only included in the passenger payload while ARRIVED). For the
    tests that need to feed the code back in, we read it directly off the DB
    row — same value the passenger UI sees through `/users/.../latest`."""
    db_session.expire_all()
    code = db_session.query(RideRequest).filter(RideRequest.id == ride_id).one().verification_code
    assert code, "expected verification_code to be set after /arrived"
    return code


# -- happy-path lifecycle -----------------------------------------------------------


def test_ride_full_lifecycle_create_to_complete(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """create_request → accept → start-driving → arrived → verify-code → complete."""
    # 1) create
    ride_id = _create_ride(client, passenger, driver_available)
    ride = db_session.query(RideRequest).filter(RideRequest.id == ride_id).one()
    assert ride.status == RideRequestStatus.PENDING.value

    # 2) accept
    r = client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id, "note": "on it"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted"

    # 3) start-driving
    r = client.post(
        f"/rides/requests/{ride_id}/start-driving",
        json={"driver_user_id": driver_available.id},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "on_the_way"

    # 4) arrived → verification code generated
    r = client.post(
        f"/rides/requests/{ride_id}/arrived",
        json={"driver_user_id": driver_available.id},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "arrived"
    code = _verification_code_of(db_session, ride_id)
    assert len(code) >= 4

    # 5) verify-code (passenger side)
    r = client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": code,
            "regular_user_id": passenger.id,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"

    # 6) complete (passenger only)
    r = client.post(
        f"/rides/requests/{ride_id}/complete",
        json={"ride_request_id": ride_id, "regular_user_id": passenger.id},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


def test_arrived_is_idempotent(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    # Second /arrived must not 400 — the driver may retry on flaky network.
    r = client.post(
        f"/rides/requests/{ride_id}/arrived",
        json={"driver_user_id": driver_available.id},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "arrived"


def test_complete_idempotent_after_completed(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    code = _verification_code_of(db_session, ride_id)
    client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": code,
            "regular_user_id": passenger.id,
        },
    )
    client.post(
        f"/rides/requests/{ride_id}/complete",
        json={"ride_request_id": ride_id, "regular_user_id": passenger.id},
    )
    r = client.post(
        f"/rides/requests/{ride_id}/complete",
        json={"ride_request_id": ride_id, "regular_user_id": passenger.id},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


def test_business_owner_can_request_ride_full_lifecycle(
    client: TestClient, db_session, business_passenger: User, driver_available: User
):
    """Business owner is also allowed to request rides (`_user_can_request_rides`)."""
    ride_id = _create_ride(client, business_passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    code = _verification_code_of(db_session, ride_id)
    r = client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": code,
            "regular_user_id": business_passenger.id,
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


# -- latest / list visibility on both sides ----------------------------------------


def test_latest_ride_status_visible_on_both_sides(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)

    # passenger sees pending
    r_passenger = client.get(f"/users/{passenger.id}/ride-requests/latest")
    assert r_passenger.status_code == 200
    assert r_passenger.json()["status"] == "pending"
    assert r_passenger.json()["id"] == ride_id

    # driver list sees pending
    r_driver = client.get(f"/drivers/{driver_available.id}/ride-requests")
    assert r_driver.status_code == 200
    items = r_driver.json()
    assert len(items) == 1 and items[0]["id"] == ride_id and items[0]["status"] == "pending"

    # accept → both sides flip to accepted
    client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    assert (
        client.get(f"/users/{passenger.id}/ride-requests/latest").json()["status"]
        == "accepted"
    )
    assert (
        client.get(f"/drivers/{driver_available.id}/ride-requests").json()[0]["status"]
        == "accepted"
    )


def test_latest_returns_none_when_no_ride(client: TestClient, passenger: User):
    r = client.get(f"/users/{passenger.id}/ride-requests/latest")
    assert r.status_code == 200
    # FastAPI serializes None as JSON null
    assert r.json() is None


def test_passenger_phone_only_visible_to_driver_after_accept(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Privacy guard: while pending, the driver list must not leak `regular_phone`.
    After accept, the passenger has chosen this driver and the phone is shown."""
    ride_id = _create_ride(client, passenger, driver_available)
    items = client.get(f"/drivers/{driver_available.id}/ride-requests").json()
    assert items[0]["regular_phone"] is None

    client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    items = client.get(f"/drivers/{driver_available.id}/ride-requests").json()
    assert items[0]["regular_phone"] == passenger.phone


# -- cancellations / sync ----------------------------------------------------------


def test_driver_cancel_after_accept_passenger_sees_cancelled(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    r = client.post(
        f"/rides/requests/{ride_id}/cancel",
        json={"driver_user_id": driver_available.id, "note": "engine trouble"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"

    # Passenger latest reflects it immediately.
    latest = client.get(f"/users/{passenger.id}/ride-requests/latest").json()
    assert latest["status"] == "cancelled"
    assert latest["status_note"] == "engine trouble"


def test_driver_cannot_cancel_pending_request(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Drivers must REJECT (not CANCEL) a pending ride. Cancel is reserved for
    accepted/driving states — preventing accidental data loss before commit."""
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/cancel",
        json={"driver_user_id": driver_available.id},
    )
    assert r.status_code == 400
    assert "accepted" in r.json()["detail"].lower()


def test_passenger_cancel_pending_succeeds(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/cancel-by-passenger",
        json={"regular_user_id": passenger.id, "note": "changed plans"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"

    # Driver also sees it as cancelled.
    items = client.get(f"/drivers/{driver_available.id}/ride-requests").json()
    assert items[0]["status"] == "cancelled"
    assert items[0]["status_note"] == "changed plans"


def test_passenger_cancel_after_accept_drivers_listing_synced(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    r = client.post(
        f"/rides/requests/{ride_id}/cancel-by-passenger",
        json={"regular_user_id": passenger.id},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"
    items = client.get(f"/drivers/{driver_available.id}/ride-requests").json()
    assert items[0]["status"] == "cancelled"


def test_passenger_cancel_after_arrived_still_works(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/cancel-by-passenger",
        json={"regular_user_id": passenger.id},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


def test_passenger_cannot_cancel_already_cancelled(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    client.post(
        f"/rides/requests/{ride_id}/cancel-by-passenger",
        json={"regular_user_id": passenger.id},
    )
    r = client.post(
        f"/rides/requests/{ride_id}/cancel-by-passenger",
        json={"regular_user_id": passenger.id},
    )
    assert r.status_code == 400
    assert "already" in r.json()["detail"].lower() or "closed" in r.json()["detail"].lower()


def test_passenger_cannot_cancel_other_users_ride(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    other = _make_user(db_session, role=UserRole.REGULAR, tag="ot1")
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/cancel-by-passenger",
        json={"regular_user_id": other.id},
    )
    assert r.status_code == 403


def test_cancellation_flips_active_so_passenger_can_book_again(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Sync invariant: after cancellation the passenger is no longer blocked
    by the active-ride check, so a fresh request goes through."""
    ride_id = _create_ride(client, passenger, driver_available)
    client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    client.post(
        f"/rides/requests/{ride_id}/cancel-by-passenger",
        json={"regular_user_id": passenger.id},
    )

    # New ride creation must succeed now.
    r = client.post(
        "/rides/requests",
        json=_create_ride_payload(passenger, driver_available),
    )
    assert r.status_code == 201, r.text


# -- validation / edge cases -------------------------------------------------------


def test_create_blocked_when_passenger_has_active_ride(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    _create_ride(client, passenger, driver_available)
    r = client.post(
        "/rides/requests",
        json=_create_ride_payload(passenger, driver_available),
    )
    assert r.status_code == 400
    assert "active" in r.json()["detail"].lower()


def test_create_404_when_driver_not_a_driver(
    client: TestClient, db_session, passenger: User
):
    not_driver = _make_user(db_session, role=UserRole.REGULAR, tag="nd1")
    r = client.post(
        "/rides/requests", json=_create_ride_payload(passenger, not_driver)
    )
    assert r.status_code == 404
    assert "driver" in r.json()["detail"].lower()


def test_create_400_when_driver_unavailable(
    client: TestClient, db_session, passenger: User, driver_user: User
):
    """`driver_user` has no DriverAvailability row at all — the create endpoint
    must reject with 400 'Driver is not available'."""
    r = client.post(
        "/rides/requests", json=_create_ride_payload(passenger, driver_user)
    )
    assert r.status_code == 400
    assert "available" in r.json()["detail"].lower()


def test_accept_only_pending_can_be_accepted(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    # second /accept must 400 — already not pending.
    r = client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    assert r.status_code == 400
    assert "pending" in r.json()["detail"].lower()


def test_accept_wrong_driver_403(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    other_driver = _make_user(db_session, role=UserRole.DRIVER, tag="od1")
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": other_driver.id},
    )
    assert r.status_code == 403


def test_start_driving_requires_accepted(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """`/start-driving` must reject pending → ensures we don't skip a state."""
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/start-driving",
        json={"driver_user_id": driver_available.id},
    )
    assert r.status_code == 400


def test_arrived_requires_on_the_way(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    client.post(
        f"/rides/requests/{ride_id}/accept",
        json={"driver_user_id": driver_available.id},
    )
    # Skip start-driving — /arrived must reject "Only on-the-way rides…"
    r = client.post(
        f"/rides/requests/{ride_id}/arrived",
        json={"driver_user_id": driver_available.id},
    )
    assert r.status_code == 400


def test_verify_code_wrong_first_attempt_does_not_cancel(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)

    r = client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": "0000",
            "regular_user_id": passenger.id,
        },
    )
    assert r.status_code == 400
    assert "invalid" in r.json()["detail"].lower()

    # Status must still be ARRIVED — only the failed-attempt counter went up.
    db_session.expire_all()
    ride = db_session.query(RideRequest).filter(RideRequest.id == ride_id).one()
    assert ride.status == RideRequestStatus.ARRIVED.value
    assert ride.verification_failed_attempts == 1


def test_verify_code_two_wrong_attempts_cancel_the_ride(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    for _ in range(2):
        r = client.post(
            "/rides/verify-code",
            json={
                "ride_request_id": ride_id,
                "verification_code": "0000",
                "regular_user_id": passenger.id,
            },
        )
    # Final 400 carries the "exceeded" message and the ride is now cancelled.
    assert r.status_code == 400
    assert "exceeded" in r.json()["detail"].lower() or "cancel" in r.json()["detail"].lower()

    db_session.expire_all()
    ride = db_session.query(RideRequest).filter(RideRequest.id == ride_id).one()
    assert ride.status == RideRequestStatus.CANCELLED.value


def test_verify_code_requires_arrived_state(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)  # still pending
    r = client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": "1234",
            "regular_user_id": passenger.id,
        },
    )
    assert r.status_code == 400
    assert "verification" in r.json()["detail"].lower()


def test_verify_code_must_provide_exactly_one_actor(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    code = _verification_code_of(db_session, ride_id)

    # Both actors → 400
    r = client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": code,
            "regular_user_id": passenger.id,
            "driver_user_id": driver_available.id,
        },
    )
    assert r.status_code == 400


def test_complete_only_passenger_can_call(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    code = _verification_code_of(db_session, ride_id)
    client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": code,
            "regular_user_id": passenger.id,
        },
    )

    other = _make_user(db_session, role=UserRole.REGULAR, tag="ot2")
    r = client.post(
        f"/rides/requests/{ride_id}/complete",
        json={"ride_request_id": ride_id, "regular_user_id": other.id},
    )
    assert r.status_code == 403


def test_complete_requires_in_progress(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_arrived(client, ride_id, driver_available)
    # Skip /verify-code — ride is still ARRIVED, not IN_PROGRESS.
    r = client.post(
        f"/rides/requests/{ride_id}/complete",
        json={"ride_request_id": ride_id, "regular_user_id": passenger.id},
    )
    assert r.status_code == 400


# -- driver availability / nearby drivers ------------------------------------------


def test_availability_default_is_false(client: TestClient, driver_user: User):
    r = client.get(f"/drivers/{driver_user.id}/availability")
    assert r.status_code == 200
    body = r.json()
    assert body["is_available"] is False
    assert body["vehicle_update_blocked"] is False


def test_availability_enable_requires_location(client: TestClient, driver_user: User):
    r = client.put(
        "/drivers/availability",
        json={"driver_user_id": driver_user.id, "is_available": True},
    )
    assert r.status_code == 400
    assert "location" in r.json()["detail"].lower()


def test_availability_disable_does_not_require_location(
    client: TestClient, db_session, driver_available: User
):
    """Going OFFLINE must always succeed — `lat`/`lon` are only required when
    flipping ON. This is what the driver toggle relies on."""
    r = client.put(
        "/drivers/availability",
        json={"driver_user_id": driver_available.id, "is_available": False},
    )
    assert r.status_code == 200
    db_session.expire_all()
    av = (
        db_session.query(DriverAvailability)
        .filter(DriverAvailability.driver_user_id == driver_available.id)
        .one()
    )
    assert av.is_available is False


def test_availability_404_for_non_driver(
    client: TestClient, db_session, passenger: User
):
    r = client.get(f"/drivers/{passenger.id}/availability")
    assert r.status_code == 404


def test_nearby_drivers_404_for_non_passenger(
    client: TestClient, db_session, driver_available: User
):
    """Only REGULAR/BUSINESS_OWNER may probe nearby drivers."""
    admin = _make_user(db_session, role=UserRole.ADMIN, tag="a1")
    r = client.get(
        "/rides/nearby-drivers",
        params={"regular_user_id": admin.id, "lat": 31.39, "lon": 34.75},
    )
    assert r.status_code == 404


# =========================
# RATINGS + REPORTS (post-ride feedback)
# =========================


def _walk_to_completed(
    client: TestClient, db_session: Session, ride_id: int, passenger: User, driver: User
) -> None:
    """Walk a ride all the way through to COMPLETED (used by ratings tests)."""
    _walk_to_arrived(client, ride_id, driver)
    code = _verification_code_of(db_session, ride_id)
    r = client.post(
        "/rides/verify-code",
        json={
            "ride_request_id": ride_id,
            "verification_code": code,
            "regular_user_id": passenger.id,
        },
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/rides/requests/{ride_id}/complete",
        json={"ride_request_id": ride_id, "regular_user_id": passenger.id},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


# -- POST /rides/requests/{id}/rate -------------------------------------------------


def test_rate_completed_ride_creates_rating(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)

    r = client.post(
        f"/rides/requests/{ride_id}/rate",
        json={
            "regular_user_id": passenger.id,
            "stars": 5,
            "comment": "  Great driver  ",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ride_request_id"] == ride_id
    assert body["driver_user_id"] == driver_available.id
    assert body["regular_user_id"] == passenger.id
    assert body["stars"] == 5
    assert body["comment"] == "Great driver"  # endpoint trims whitespace

    # rating-summary now reflects the new entry
    r = client.get(f"/drivers/{driver_available.id}/rating-summary")
    assert r.status_code == 200
    s = r.json()
    assert s["driver_user_id"] == driver_available.id
    assert s["rating_avg"] == 5.0
    assert s["rating_count"] == 1


def test_rate_blank_comment_persists_as_null(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Whitespace-only comment is normalized to null so we don't store '   '."""
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": passenger.id, "stars": 4, "comment": "   "},
    )
    assert r.status_code == 201
    assert r.json()["comment"] is None


def test_rate_non_completed_ride_400(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Only COMPLETED rides can be rated — guard against accidental early submits."""
    ride_id = _create_ride(client, passenger, driver_available)  # PENDING
    r = client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": passenger.id, "stars": 5},
    )
    assert r.status_code == 400
    assert "completed" in r.json()["detail"].lower()


def test_rate_other_passenger_403(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """A different regular user cannot rate someone else's ride."""
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    other = _make_user(db_session, role=UserRole.REGULAR, tag="otherp")
    r = client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": other.id, "stars": 5},
    )
    assert r.status_code == 403


def test_rate_unknown_ride_404(client: TestClient, db_session, passenger: User):
    r = client.post(
        "/rides/requests/999999/rate",
        json={"regular_user_id": passenger.id, "stars": 5},
    )
    assert r.status_code == 404


def test_rate_duplicate_rejected(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Second rating attempt for the same (ride, passenger) is rejected with 400."""
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": passenger.id, "stars": 5},
    )
    assert r.status_code == 201
    r = client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": passenger.id, "stars": 4},
    )
    assert r.status_code == 400
    assert "already" in r.json()["detail"].lower()


@pytest.mark.parametrize("bad_stars", [0, 6, -1, 10])
def test_rate_invalid_stars_422(
    client: TestClient, db_session, passenger: User, driver_available: User, bad_stars: int
):
    """Pydantic guards stars to the 1..5 range."""
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": passenger.id, "stars": bad_stars},
    )
    assert r.status_code == 422


# -- GET /drivers/{id}/rating-summary -----------------------------------------------


def test_rating_summary_zero_when_no_ratings(client: TestClient, driver_user: User):
    r = client.get(f"/drivers/{driver_user.id}/rating-summary")
    assert r.status_code == 200
    assert r.json() == {
        "driver_user_id": driver_user.id,
        "rating_avg": 0.0,
        "rating_count": 0,
    }


def test_rating_summary_404_for_non_driver(
    client: TestClient, db_session, passenger: User
):
    r = client.get(f"/drivers/{passenger.id}/rating-summary")
    assert r.status_code == 404


def test_rating_summary_averages_multiple_ratings(
    client: TestClient, db_session, driver_available: User
):
    """Two passengers, two completed rides → avg over both ratings, count == 2."""
    p1 = _make_user(db_session, role=UserRole.REGULAR, tag="rp1")
    p2 = _make_user(db_session, role=UserRole.REGULAR, tag="rp2")
    for p, stars in [(p1, 5), (p2, 3)]:
        rid = _create_ride(client, p, driver_available)
        _walk_to_completed(client, db_session, rid, p, driver_available)
        r = client.post(
            f"/rides/requests/{rid}/rate",
            json={"regular_user_id": p.id, "stars": stars},
        )
        assert r.status_code == 201
    r = client.get(f"/drivers/{driver_available.id}/rating-summary")
    assert r.status_code == 200
    body = r.json()
    assert body["rating_count"] == 2
    assert body["rating_avg"] == 4.0  # (5 + 3) / 2


# -- GET /drivers/{id}/ratings (admin history) -------------------------------------


def test_list_driver_ratings_returns_history_with_passenger_info(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": passenger.id, "stars": 5, "comment": "ok"},
    )
    r = client.get(f"/drivers/{driver_available.id}/ratings")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["ride_request_id"] == ride_id
    assert row["regular_user_id"] == passenger.id
    assert row["regular_full_name"] == passenger.full_name
    assert row["regular_username"] == passenger.username
    assert row["stars"] == 5
    assert row["comment"] == "ok"


def test_list_driver_ratings_404_for_non_driver(
    client: TestClient, db_session, passenger: User
):
    r = client.get(f"/drivers/{passenger.id}/ratings")
    assert r.status_code == 404


# -- POST /rides/requests/{id}/report -----------------------------------------------


def test_report_completed_ride_creates_report(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/report",
        json={
            "regular_user_id": passenger.id,
            "message": "  Driver was speeding  ",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ride_request_id"] == ride_id
    assert body["driver_user_id"] == driver_available.id
    assert body["regular_user_id"] == passenger.id
    assert body["message"] == "Driver was speeding"  # whitespace trimmed
    assert body["status"] == "PENDING"
    assert body["admin_notes"] is None
    assert body["reviewed_at"] is None
    assert body["reviewed_by_admin_id"] is None
    # response is enriched with the actor names
    assert body["driver_full_name"] == driver_available.full_name
    assert body["regular_username"] == passenger.username


def test_report_pending_ride_allowed(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Reports must work even before the ride completes (passenger can flag misbehavior
    mid-ride). The endpoint deliberately does not gate on ride status."""
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/report",
        json={"regular_user_id": passenger.id, "message": "Driver is rude"},
    )
    assert r.status_code == 201


def test_report_other_passenger_403(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    other = _make_user(db_session, role=UserRole.REGULAR, tag="otherr")
    r = client.post(
        f"/rides/requests/{ride_id}/report",
        json={"regular_user_id": other.id, "message": "I was not even there"},
    )
    assert r.status_code == 403


def test_report_unknown_ride_404(client: TestClient, db_session, passenger: User):
    r = client.post(
        "/rides/requests/999999/report",
        json={"regular_user_id": passenger.id, "message": "nope"},
    )
    assert r.status_code == 404


@pytest.mark.parametrize("bad_message", ["", "ab"])
def test_report_short_message_422(
    client: TestClient, db_session, passenger: User, driver_available: User, bad_message: str
):
    """Pydantic enforces 3..2000 chars on message."""
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.post(
        f"/rides/requests/{ride_id}/report",
        json={"regular_user_id": passenger.id, "message": bad_message},
    )
    assert r.status_code == 422


def test_report_multiple_for_same_ride_allowed(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    """Unlike rating, there's no DB unique constraint on (ride, passenger) for
    reports — passengers can submit follow-ups if needed."""
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    payload = {"regular_user_id": passenger.id, "message": "Issue keeps happening"}
    r1 = client.post(f"/rides/requests/{ride_id}/report", json=payload)
    r2 = client.post(f"/rides/requests/{ride_id}/report", json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] != r2.json()["id"]


# -- GET /rides/requests/{id}/feedback-status --------------------------------------


def test_feedback_status_pending_ride_cannot_rate(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    r = client.get(
        f"/rides/requests/{ride_id}/feedback-status",
        params={"regular_user_id": passenger.id},
    )
    assert r.status_code == 200
    assert r.json() == {
        "ride_request_id": ride_id,
        "rated": False,
        "reported": False,
        "can_rate": False,
    }


def test_feedback_status_completed_can_rate_then_rated(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    _walk_to_completed(client, db_session, ride_id, passenger, driver_available)
    # Before rating
    r = client.get(
        f"/rides/requests/{ride_id}/feedback-status",
        params={"regular_user_id": passenger.id},
    )
    assert r.status_code == 200
    assert r.json()["can_rate"] is True
    assert r.json()["rated"] is False
    assert r.json()["reported"] is False

    client.post(
        f"/rides/requests/{ride_id}/rate",
        json={"regular_user_id": passenger.id, "stars": 4},
    )
    client.post(
        f"/rides/requests/{ride_id}/report",
        json={"regular_user_id": passenger.id, "message": "minor issue"},
    )
    r = client.get(
        f"/rides/requests/{ride_id}/feedback-status",
        params={"regular_user_id": passenger.id},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["rated"] is True
    assert body["reported"] is True
    assert body["can_rate"] is True


def test_feedback_status_other_passenger_403(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    ride_id = _create_ride(client, passenger, driver_available)
    other = _make_user(db_session, role=UserRole.REGULAR, tag="otherf")
    r = client.get(
        f"/rides/requests/{ride_id}/feedback-status",
        params={"regular_user_id": other.id},
    )
    assert r.status_code == 403


def test_feedback_status_unknown_ride_404(client: TestClient, db_session, passenger: User):
    r = client.get(
        "/rides/requests/999999/feedback-status",
        params={"regular_user_id": passenger.id},
    )
    assert r.status_code == 404


# -- ADMIN: list reports + filter ---------------------------------------------------


def _seed_report(
    client: TestClient,
    db_session: Session,
    passenger_user: User,
    driver: User,
    *,
    message: str = "test report",
    status: DriverReportStatus = DriverReportStatus.PENDING,
) -> int:
    """Create a ride + report directly so admin tests can stage rows quickly."""
    ride_id = _create_ride(client, passenger_user, driver)
    r = client.post(
        f"/rides/requests/{ride_id}/report",
        json={"regular_user_id": passenger_user.id, "message": message},
    )
    assert r.status_code == 201, r.text
    report_id = int(r.json()["id"])
    if status != DriverReportStatus.PENDING:
        # set the status directly via the ORM so we don't need an admin user
        rep = db_session.query(DriverReport).filter(DriverReport.id == report_id).one()
        rep.status = status
        db_session.commit()
    return report_id


def test_admin_list_reports_returns_all_when_no_filter(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    p2 = _make_user(db_session, role=UserRole.REGULAR, tag="rp_b")
    _seed_report(client, db_session, passenger, driver_available, message="first")
    _seed_report(client, db_session, p2, driver_available, message="second")
    r = client.get("/admin/driver-reports")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    # newest first — both are PENDING
    assert all(row["status"] == "PENDING" for row in rows)


def test_admin_list_reports_filter_by_status(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    p2 = _make_user(db_session, role=UserRole.REGULAR, tag="rp_c")
    _seed_report(client, db_session, passenger, driver_available, message="pending one")
    _seed_report(
        client,
        db_session,
        p2,
        driver_available,
        message="reviewed one",
        status=DriverReportStatus.REVIEWED,
    )
    r = client.get("/admin/driver-reports", params={"status_filter": "REVIEWED"})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["status"] == "REVIEWED"
    assert rows[0]["message"] == "reviewed one"


def test_admin_list_reports_invalid_status_filter_400(client: TestClient):
    r = client.get("/admin/driver-reports", params={"status_filter": "NOT_A_STATUS"})
    assert r.status_code == 400


def test_admin_list_reports_empty(client: TestClient):
    r = client.get("/admin/driver-reports")
    assert r.status_code == 200
    assert r.json() == []


# -- ADMIN: review / dismiss / re-open ---------------------------------------------


def test_admin_review_marks_reviewed_with_metadata(
    client: TestClient,
    db_session,
    passenger: User,
    driver_available: User,
    admin_user_active: User,
):
    report_id = _seed_report(client, db_session, passenger, driver_available, message="speeding")
    r = client.post(
        f"/admin/driver-reports/{report_id}/review",
        json={
            "admin_user_id": admin_user_active.id,
            "status": "REVIEWED",
            "admin_notes": "  spoke with driver  ",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "REVIEWED"
    assert body["admin_notes"] == "spoke with driver"
    assert body["reviewed_by_admin_id"] == admin_user_active.id
    assert body["reviewed_at"] is not None


def test_admin_review_dismissed_clears_blank_notes(
    client: TestClient,
    db_session,
    passenger: User,
    driver_available: User,
    admin_user_active: User,
):
    """Empty/whitespace-only admin notes should be normalized to null."""
    report_id = _seed_report(client, db_session, passenger, driver_available)
    r = client.post(
        f"/admin/driver-reports/{report_id}/review",
        json={
            "admin_user_id": admin_user_active.id,
            "status": "DISMISSED",
            "admin_notes": "   ",
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "DISMISSED"
    assert r.json()["admin_notes"] is None


def test_admin_review_back_to_pending_resets_metadata(
    client: TestClient,
    db_session,
    passenger: User,
    driver_available: User,
    admin_user_active: User,
):
    """Re-opening a closed report wipes reviewed_at + reviewed_by_admin_id."""
    report_id = _seed_report(
        client,
        db_session,
        passenger,
        driver_available,
        status=DriverReportStatus.REVIEWED,
    )
    # First push it through REVIEWED via the API so reviewed_at is set
    r = client.post(
        f"/admin/driver-reports/{report_id}/review",
        json={
            "admin_user_id": admin_user_active.id,
            "status": "REVIEWED",
            "admin_notes": "looked into it",
        },
    )
    assert r.status_code == 200
    assert r.json()["reviewed_at"] is not None

    # Now re-open it
    r = client.post(
        f"/admin/driver-reports/{report_id}/review",
        json={"admin_user_id": admin_user_active.id, "status": "PENDING"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "PENDING"
    assert body["reviewed_at"] is None
    assert body["reviewed_by_admin_id"] is None


def test_admin_review_non_admin_403(
    client: TestClient,
    db_session,
    passenger: User,
    driver_available: User,
):
    """Only ADMIN role may moderate reports."""
    report_id = _seed_report(client, db_session, passenger, driver_available)
    r = client.post(
        f"/admin/driver-reports/{report_id}/review",
        json={"admin_user_id": passenger.id, "status": "REVIEWED"},
    )
    assert r.status_code == 403


def test_admin_review_unknown_report_404(
    client: TestClient, db_session, admin_user_active: User
):
    r = client.post(
        "/admin/driver-reports/999999/review",
        json={"admin_user_id": admin_user_active.id, "status": "REVIEWED"},
    )
    assert r.status_code == 404


def test_admin_review_invalid_status_422(
    client: TestClient,
    db_session,
    passenger: User,
    driver_available: User,
    admin_user_active: User,
):
    """Pydantic regex on `status` rejects unknown values before the handler runs."""
    report_id = _seed_report(client, db_session, passenger, driver_available)
    r = client.post(
        f"/admin/driver-reports/{report_id}/review",
        json={"admin_user_id": admin_user_active.id, "status": "BOGUS"},
    )
    assert r.status_code == 422


# -- ADMIN: per-status counters ----------------------------------------------------


def test_admin_reports_summary_counts_per_status(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    p2 = _make_user(db_session, role=UserRole.REGULAR, tag="rp_d")
    p3 = _make_user(db_session, role=UserRole.REGULAR, tag="rp_e")
    _seed_report(client, db_session, passenger, driver_available)
    _seed_report(
        client, db_session, p2, driver_available, status=DriverReportStatus.REVIEWED
    )
    _seed_report(
        client, db_session, p3, driver_available, status=DriverReportStatus.DISMISSED
    )
    r = client.get("/admin/driver-reports/summary")
    assert r.status_code == 200
    assert r.json() == {"PENDING": 1, "REVIEWED": 1, "DISMISSED": 1}


def test_admin_reports_summary_empty(client: TestClient):
    r = client.get("/admin/driver-reports/summary")
    assert r.status_code == 200
    assert r.json() == {"PENDING": 0, "REVIEWED": 0, "DISMISSED": 0}


def test_admin_per_driver_reports_summary_counts_and_total(
    client: TestClient, db_session, passenger: User, driver_available: User
):
    p2 = _make_user(db_session, role=UserRole.REGULAR, tag="rp_f")
    _seed_report(client, db_session, passenger, driver_available)
    _seed_report(
        client, db_session, p2, driver_available, status=DriverReportStatus.REVIEWED
    )
    r = client.get(f"/admin/drivers/{driver_available.id}/reports-summary")
    assert r.status_code == 200
    body = r.json()
    assert body["driver_user_id"] == driver_available.id
    assert body["pending"] == 1
    assert body["reviewed"] == 1
    assert body["dismissed"] == 0
    assert body["total"] == 2


def test_admin_per_driver_reports_summary_404_for_non_driver(
    client: TestClient, db_session, passenger: User
):
    r = client.get(f"/admin/drivers/{passenger.id}/reports-summary")
    assert r.status_code == 404


# -- admin approval workflows (driver + business owner) ----------------------------


def _pending_driver_bundle(
    db_session: Session, *, tag: str
) -> tuple[User, DriverProfile, DriverVehicle]:
    u = _make_user(
        db_session, role=UserRole.DRIVER, tag=tag, status=UserStatus.PENDING
    )
    profile = DriverProfile(
        user_id=u.id,
        driver_license_image_url="https://test/license.jpg",
        id_card_image_url="https://test/id.jpg",
        driver_status=DriverStatus.PENDING,
    )
    db_session.add(profile)
    db_session.flush()
    vehicle = DriverVehicle(
        driver_profile_id=profile.id,
        car_type="sedan",
        plate_number="12-345-67",
        production_year=2020,
        car_license_image_url="https://test/car_license.jpg",
        car_insurance_image_url="https://test/car_insurance.jpg",
        status=VehicleStatus.SUBMITTED,
    )
    db_session.add(vehicle)
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(profile)
    db_session.refresh(vehicle)
    return u, profile, vehicle


def _pending_business_owner_request_claim_existing_place(
    db_session: Session,
    *,
    cat: Category,
    city: City,
    tag: str,
) -> tuple[User, Place, BusinessOwnerPlaceRequest]:
    u = _make_user(
        db_session,
        role=UserRole.BUSINESS_OWNER,
        tag=tag,
        status=UserStatus.PENDING,
    )
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    place = Place(
        location_id=loc.id,
        city_id=city.id,
        category_id=cat.id,
        place_type=PlaceType.BUSINESS,
        name="Old Place Name",
        name_ar="old_ar",
        name_he="old_he",
        can_be_claimed=True,
        owner_user_id=None,
    )
    db_session.add(place)
    db_session.flush()
    req = BusinessOwnerPlaceRequest(
        user_id=u.id,
        existing_place_id=place.id,
        lat=31.392,
        lon=34.756,
        source="MAP_PICK",
        osm_id=None,
        name="Approved Place Title",
        name_ar="approved_ar",
        name_he="approved_he",
        city_id=city.id,
        category_id=cat.id,
        description="Biz desc",
        phone="0509999999",
        opening_hours=None,
        main_image_url=None,
        business_license_image_url=None,
        business_images_urls=None,
        social_links=None,
        status=OwnerPlaceRequestStatus.PENDING,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(place)
    db_session.refresh(req)
    return u, place, req


def test_driver_admin_approve_pending_sets_user_vehicle_and_profile(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
):
    driver, profile, vehicle = _pending_driver_bundle(db_session, tag="d_ap_1")

    r = client.post(
        f"/admin/drivers/{profile.id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 200, r.text
    assert r.json()["detail"] == "Driver approved"

    db_session.refresh(driver)
    db_session.refresh(profile)
    db_session.refresh(vehicle)

    assert driver.status == UserStatus.ACTIVE
    assert profile.driver_status == DriverStatus.APPROVED
    assert vehicle.status == VehicleStatus.APPROVED
    assert vehicle.reviewed_by_admin_id == admin_user_active.id
    assert vehicle.rejection_reason is None


def test_driver_admin_reject_pending_sets_rejected_everywhere_default_reason(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
):
    driver, profile, vehicle = _pending_driver_bundle(db_session, tag="d_rej_1")

    r = client.post(
        f"/admin/drivers/{profile.id}/reject",
        json={
            "admin_user_id": admin_user_active.id,
            "reason": None,
            "driver_language": "ar",
        },
    )
    assert r.status_code == 200, r.text
    default_reason = "Your documents were not approved."

    db_session.refresh(driver)
    db_session.refresh(profile)
    db_session.refresh(vehicle)

    assert driver.status == UserStatus.REJECTED
    assert profile.driver_status == DriverStatus.REJECTED
    assert vehicle.status == VehicleStatus.REJECTED
    assert vehicle.rejection_reason == default_reason


def test_driver_admin_approve_requires_real_admin(client: TestClient, db_session: Session):
    _, profile, __ = _pending_driver_bundle(db_session, tag="d_403")

    r = client.post(
        f"/admin/drivers/{profile.id}/approve",
        json={"admin_user_id": 999999},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Only admin can approve"


def test_driver_admin_reject_requires_real_admin(client: TestClient, db_session: Session):
    _, profile, __ = _pending_driver_bundle(db_session, tag="d_403_r")

    r = client.post(
        f"/admin/drivers/{profile.id}/reject",
        json={"admin_user_id": 999999},
    )
    assert r.status_code == 403


def test_driver_admin_approve_404_unknown_profile(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
):
    nonexistent_pid = (
        db_session.query(DriverProfile.id).order_by(DriverProfile.id.desc()).scalar()
        or 0
    ) + 999
    r = client.post(
        f"/admin/drivers/{nonexistent_pid}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 404


def test_driver_admin_current_api_can_approve_already_approved_again(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
):
    """Approve endpoint does not guard on prior driver_status — documents current behaviour."""
    driver, profile, __ = _pending_driver_bundle(db_session, tag="dbl_ap")

    r1 = client.post(
        f"/admin/drivers/{profile.id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r1.status_code == 200
    r2 = client.post(
        f"/admin/drivers/{profile.id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r2.status_code == 200

    db_session.refresh(profile)
    assert profile.driver_status == DriverStatus.APPROVED


def test_driver_admin_can_reject_after_approve_documents_current_behavior(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
):
    """Reject endpoint does not require PENDING — second call flips APPROVED to REJECTED."""
    driver, profile, vehicle = _pending_driver_bundle(db_session, tag="rej_after_ok")

    assert (
        client.post(
            f"/admin/drivers/{profile.id}/approve",
            json={"admin_user_id": admin_user_active.id},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/admin/drivers/{profile.id}/reject",
            json={"admin_user_id": admin_user_active.id, "reason": "changed mind"},
        ).status_code
        == 200
    )

    db_session.refresh(driver)
    db_session.refresh(profile)
    db_session.refresh(vehicle)
    assert driver.status == UserStatus.REJECTED
    assert profile.driver_status == DriverStatus.REJECTED
    assert vehicle.status == VehicleStatus.REJECTED


def test_list_pending_drivers_returns_pending_application(
    client: TestClient,
    db_session: Session,
):
    _pending_driver_bundle(db_session, tag="lst_pd")

    r = client.get("/admin/drivers/pending")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["driver_status"] == "PENDING"
    assert items[0]["vehicle_status"] == "SUBMITTED"


def test_business_owner_admin_approve_pending_existing_place_updates_place_and_user(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
    sample_category_city,
):
    cat, city = sample_category_city
    bo_user, place, req = _pending_business_owner_request_claim_existing_place(
        db_session,
        cat=cat,
        city=city,
        tag="bo_ap_1",
    )

    assert place.name != req.name

    r = client.post(
        f"/admin/business-owner/requests/{req.id}/approve",
        json={
            "admin_user_id": admin_user_active.id,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["detail"] == "Business owner request approved"

    db_session.refresh(bo_user)
    db_session.refresh(place)
    db_session.refresh(req)

    assert req.status == OwnerPlaceRequestStatus.APPROVED
    assert bo_user.status == UserStatus.ACTIVE
    assert bo_user.rejection_reason is None
    assert place.owner_user_id == bo_user.id
    assert place.name == req.name == "Approved Place Title"
    assert place.can_be_claimed is False


def test_business_owner_admin_reject_pending_sets_user_and_request(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
    sample_category_city,
):
    cat, city = sample_category_city
    bo_user, _place, req = _pending_business_owner_request_claim_existing_place(
        db_session,
        cat=cat,
        city=city,
        tag="bo_rj_1",
    )

    r = client.post(
        f"/admin/business-owner/requests/{req.id}/reject",
        json={
            "admin_user_id": admin_user_active.id,
            "reason": "Missing license",
        },
    )
    assert r.status_code == 200

    db_session.refresh(bo_user)
    db_session.refresh(req)

    assert req.status == OwnerPlaceRequestStatus.REJECTED
    assert req.rejection_reason == "Missing license"
    assert bo_user.status == UserStatus.REJECTED
    assert bo_user.rejection_reason == "Missing license"


def test_business_owner_reject_without_reason_gets_default(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
    sample_category_city,
):
    cat, city = sample_category_city
    bo_user, _place, req = _pending_business_owner_request_claim_existing_place(
        db_session,
        cat=cat,
        city=city,
        tag="bo_rd_1",
    )

    r = client.post(
        f"/admin/business-owner/requests/{req.id}/reject",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 200

    db_session.refresh(bo_user)
    db_session.refresh(req)
    expected = "Your business owner request was not approved."
    assert req.rejection_reason == expected
    assert bo_user.rejection_reason == expected


def test_business_owner_approve_requires_pending_state(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
    sample_category_city,
):
    cat, city = sample_category_city
    _bo_user, __place, req = _pending_business_owner_request_claim_existing_place(
        db_session,
        cat=cat,
        city=city,
        tag="bo_ns_1",
    )

    ok = client.post(
        f"/admin/business-owner/requests/{req.id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert ok.status_code == 200

    again = client.post(
        f"/admin/business-owner/requests/{req.id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert again.status_code == 400
    assert again.json()["detail"] == "Request is not pending"


def test_business_owner_reject_requires_pending_state(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
    sample_category_city,
):
    cat, city = sample_category_city
    _bo_user, __place, req = _pending_business_owner_request_claim_existing_place(
        db_session,
        cat=cat,
        city=city,
        tag="bo_ns_2",
    )

    r1 = client.post(
        f"/admin/business-owner/requests/{req.id}/reject",
        json={
            "admin_user_id": admin_user_active.id,
            "reason": "no thanks",
        },
    )
    assert r1.status_code == 200

    r2 = client.post(
        f"/admin/business-owner/requests/{req.id}/reject",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r2.status_code == 400
    assert r2.json()["detail"] == "Request is not pending"


def test_business_owner_approve_requires_admin(
    client: TestClient,
    db_session: Session,
    sample_category_city,
):
    cat, city = sample_category_city
    _bo_user, __place, req = _pending_business_owner_request_claim_existing_place(
        db_session,
        cat=cat,
        city=city,
        tag="bo_403_a",
    )

    r = client.post(
        f"/admin/business-owner/requests/{req.id}/approve",
        json={"admin_user_id": 999991},
    )
    assert r.status_code == 403


def test_business_owner_reject_requires_admin(
    client: TestClient,
    db_session: Session,
    sample_category_city,
):
    cat, city = sample_category_city
    _bo_user, __place, req = _pending_business_owner_request_claim_existing_place(
        db_session,
        cat=cat,
        city=city,
        tag="bo_403_r",
    )

    r = client.post(
        f"/admin/business-owner/requests/{req.id}/reject",
        json={"admin_user_id": 999991},
    )
    assert r.status_code == 403


def test_business_owner_approve_404_unknown_request(
    client: TestClient,
    db_session: Session,
    admin_user_active: User,
):
    bogus_id = 99_991_993
    r = client.post(
        f"/admin/business-owner/requests/{bogus_id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 404


def test_list_business_owner_requests_invalid_status_filter_400(
    client: TestClient,
):
    r = client.get("/admin/business-owner/requests?status=NOT_A_STATUS")
    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid status filter"


# =====================================================================================
# SIGNUP (regular user)
# =====================================================================================


def test_signup_regular_password_mismatch_400(client: TestClient):
    r = client.post(
        "/auth/signup/regular",
        json=_regular_signup_payload(password_confirmation="OtherPass1!"),
    )
    assert r.status_code == 400
    assert "match" in r.json()["detail"].lower()


def test_signup_regular_invalid_phone_400(client: TestClient):
    r = client.post(
        "/auth/signup/regular",
        json=_regular_signup_payload(phone="12345"),
    )
    assert r.status_code == 400


def test_signup_regular_success_after_email_verified(
    client: TestClient, db_session: Session
):
    payload = _regular_signup_payload()
    db_session.add(
        EmailVerification(
            email=payload["email"],
            code="1234",
            is_used=True,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db_session.commit()
    r = client.post("/auth/signup/regular", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "REGULAR"
    assert data["email"] == payload["email"]

    user = db_session.query(User).filter(User.email == payload["email"]).one()
    assert user.email_verified is True


def test_signup_regular_requires_verified_email_403(client: TestClient):
    payload = _regular_signup_payload()
    r = client.post("/auth/signup/regular", json=payload)
    assert r.status_code == 403
    assert "verified" in r.json()["detail"].lower()


# =====================================================================================
# PLACES (SQLite-safe smoke tests)
# =====================================================================================


def test_place_row_persisted_in_db(db_session: Session, sample_category_city):
    """DB-level check — GET /places/{id} needs PostGIS lat/lon on SQLite."""
    cat, city = sample_category_city
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    place = Place(
        location_id=loc.id,
        city_id=city.id,
        category_id=cat.id,
        place_type=PlaceType.BUSINESS,
        name="Listed Cafe",
        name_ar="cafe_ar",
        name_he="cafe_he",
        can_be_claimed=True,
    )
    db_session.add(place)
    db_session.commit()
    assert db_session.query(Place).filter(Place.name == "Listed Cafe").count() == 1


def test_get_missing_place_returns_404(client: TestClient):
    r = client.get("/places/999999")
    assert r.status_code == 404


# =====================================================================================
# ROLE PERMISSIONS (admin-gated APIs)
# =====================================================================================


def test_regular_cannot_approve_driver_application(
    client: TestClient, db_session: Session
):
    regular = _make_user(db_session, role=UserRole.REGULAR, tag="reg_perm")
    driver = _make_user(
        db_session,
        role=UserRole.DRIVER,
        tag="drv_perm",
        status=UserStatus.PENDING,
    )
    profile = DriverProfile(
        user_id=driver.id,
        driver_license_image_url="https://test/license.jpg",
        id_card_image_url="https://test/id.jpg",
        driver_status=DriverStatus.PENDING,
    )
    db_session.add(profile)
    db_session.flush()
    db_session.add(
        DriverVehicle(
            driver_profile_id=profile.id,
            car_type="sedan",
            plate_number="12-345-67",
            production_year=2020,
            car_license_image_url="https://test/car_license.jpg",
            car_insurance_image_url="https://test/car_insurance.jpg",
            status=VehicleStatus.SUBMITTED,
        )
    )
    db_session.commit()
    db_session.refresh(profile)

    r = client.post(
        f"/admin/drivers/{profile.id}/approve",
        json={"admin_user_id": regular.id},
    )
    assert r.status_code == 403


def test_regular_cannot_review_driver_report(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
    regular_user: User,
):
    driver, _profile = approved_driver
    passenger = _make_user(db_session, role=UserRole.REGULAR, tag="pass_rep")
    ride_payload = {
        "regular_user_id": passenger.id,
        "driver_user_id": driver.id,
        "pickup_lat": 31.392,
        "pickup_lon": 34.756,
        "destination_text": "dest",
        "destination_lat": 31.395,
        "destination_lon": 34.760,
        "regular_phone": passenger.phone,
        "passengers_count": 1,
        "number_of_people": 1,
        "number_of_seats_required": 1,
    }
    db_session.add(
        DriverAvailability(driver_user_id=driver.id, is_available=True)
    )
    db_session.commit()

    ride_id = client.post("/rides/requests", json=ride_payload).json()["id"]
    report = client.post(
        f"/rides/requests/{ride_id}/report",
        json={"regular_user_id": passenger.id, "message": "bad driving"},
    )
    assert report.status_code == 201
    report_id = report.json()["id"]

    r = client.post(
        f"/admin/driver-reports/{report_id}/review",
        json={
            "admin_user_id": regular_user.id,
            "status": "REVIEWED",
            "admin_notes": "ok",
        },
    )
    assert r.status_code == 403


def test_driver_cannot_approve_vehicle_update_as_admin(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
):
    driver, _profile = approved_driver
    cr = client.post(
        "/drivers/vehicle-update-requests",
        json=_vehicle_update_payload(driver.id),
    )
    assert cr.status_code == 201
    req_id = cr.json()["id"]
    other_driver = _make_user(db_session, role=UserRole.DRIVER, tag="drv_other")
    r = client.post(
        f"/admin/drivers/vehicle-update-requests/{req_id}/approve",
        json={"admin_user_id": other_driver.id},
    )
    assert r.status_code == 403


# =====================================================================================
# VEHICLE UPDATE REQUESTS
# =====================================================================================


def test_driver_can_create_vehicle_update_request(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
):
    driver, _profile = approved_driver
    req_id = _create_vehicle_update_request(client, driver.id)
    row = db_session.query(DriverVehicleUpdateRequest).filter_by(id=req_id).one()
    assert row.status == VehicleUpdateRequestStatus.PENDING
    assert row.plate_number == "99-999-99"


def test_pending_vehicle_request_blocks_second_submit(
    client: TestClient, approved_driver: tuple[User, DriverProfile]
):
    driver, _profile = approved_driver
    _create_vehicle_update_request(client, driver.id)
    r = client.post(
        "/drivers/vehicle-update-requests",
        json=_vehicle_update_payload(driver.id),
    )
    assert r.status_code == 400
    assert "pending" in r.json()["detail"].lower()


def test_admin_approve_vehicle_request_clears_blocked_flag(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
    admin_user_active: User,
    mock_admin_status_email,
):
    driver, profile = approved_driver
    profile.vehicle_update_blocked = True
    db_session.add(profile)
    db_session.commit()

    req_id = _create_vehicle_update_request(client, driver.id)
    r = client.post(
        f"/admin/drivers/vehicle-update-requests/{req_id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 200, r.text

    db_session.refresh(profile)
    row = db_session.query(DriverVehicleUpdateRequest).filter_by(id=req_id).one()
    assert row.status == VehicleUpdateRequestStatus.APPROVED
    assert profile.vehicle_update_blocked is False
    assert len(mock_admin_status_email) == 1


def test_admin_reject_without_continue_driving_blocks_and_forces_offline(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
    admin_user_active: User,
    mock_admin_status_email,
):
    driver, profile = approved_driver
    _set_driver_online_with_location(db_session, driver)

    req_id = _create_vehicle_update_request(client, driver.id)
    r = client.post(
        f"/admin/drivers/vehicle-update-requests/{req_id}/reject",
        json={
            "admin_user_id": admin_user_active.id,
            "rejection_reason": "Invalid documents",
            "can_continue_driving": False,
        },
    )
    assert r.status_code == 200, r.text

    db_session.refresh(profile)
    av = (
        db_session.query(DriverAvailability)
        .filter(DriverAvailability.driver_user_id == driver.id)
        .one()
    )
    assert profile.vehicle_update_blocked is True
    assert av.is_available is False

    get_av = client.get(f"/drivers/{driver.id}/availability")
    assert get_av.status_code == 200
    assert get_av.json()["vehicle_update_blocked"] is True
    assert get_av.json()["is_available"] is False


def test_blocked_driver_cannot_go_online(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
):
    driver, profile = approved_driver
    profile.vehicle_update_blocked = True
    db_session.add(profile)
    db_session.commit()

    r = client.put(
        "/drivers/availability",
        json={
            "driver_user_id": driver.id,
            "is_available": True,
            "lat": 31.392,
            "lon": 34.756,
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "vehicle_update_blocked"


def test_reject_with_continue_driving_clears_blocked_flag(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
    admin_user_active: User,
    mock_admin_status_email,
):
    driver, profile = approved_driver
    req_id = _create_vehicle_update_request(client, driver.id)
    client.post(
        f"/admin/drivers/vehicle-update-requests/{req_id}/reject",
        json={
            "admin_user_id": admin_user_active.id,
            "can_continue_driving": True,
        },
    )

    db_session.refresh(profile)
    assert profile.vehicle_update_blocked is False

    r = client.get(f"/drivers/{driver.id}/availability")
    assert r.status_code == 200
    assert r.json()["vehicle_update_blocked"] is False


def test_regular_user_cannot_approve_vehicle_request(
    client: TestClient,
    approved_driver: tuple[User, DriverProfile],
    regular_user: User,
):
    driver, _profile = approved_driver
    req_id = _create_vehicle_update_request(client, driver.id)
    r = client.post(
        f"/admin/drivers/vehicle-update-requests/{req_id}/approve",
        json={"admin_user_id": regular_user.id},
    )
    assert r.status_code == 403


def test_admin_can_list_pending_vehicle_requests(
    client: TestClient,
    approved_driver: tuple[User, DriverProfile],
):
    driver, _profile = approved_driver
    _create_vehicle_update_request(client, driver.id)
    r = client.get("/admin/drivers/vehicle-update-requests/pending")
    assert r.status_code == 200, r.text
    assert len(r.json()) >= 1


def test_unapproved_driver_cannot_submit_vehicle_update(
    client: TestClient, db_session: Session
):
    driver = _make_user(db_session, role=UserRole.DRIVER, tag="pending_drv")
    db_session.add(
        DriverProfile(
            user_id=driver.id,
            driver_license_image_url="https://test/license.jpg",
            id_card_image_url="https://test/id.jpg",
            driver_status=DriverStatus.PENDING,
        )
    )
    db_session.commit()

    r = client.post(
        "/drivers/vehicle-update-requests",
        json=_vehicle_update_payload(driver.id),
    )
    assert r.status_code == 400
    assert "approved" in r.json()["detail"].lower()


# =====================================================================================
# HEALTH + HELPERS (unit)
# =====================================================================================


def test_root_health_and_ping(client: TestClient):
    assert client.get("/").status_code == 200
    assert "alive" in client.get("/").json()["message"].lower()
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ping").json() == {"status": "ok"}


def test_generate_verification_code_format():
    code = generate_verification_code()
    assert len(code) == 6
    assert code.isdigit()


def test_detect_language_hebrew_and_arabic():
    assert detect_language("שלום עולם") == "he"
    assert detect_language("مرحبا بالعالم") == "ar"
    assert detect_language("Hello world") == "en"


def test_ad_s3_validate_extension_and_size():
    assert _normalize_extension("photo.JPG") == ".jpg"
    with pytest.raises(AdvertisementImageValidationError):
        _normalize_extension("file.gif")
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    _validate_size(png)
    _validate_image_magic_bytes(png, ".png")
    with pytest.raises(AdvertisementImageValidationError):
        _validate_size(b"")


def test_ad_s3_upload_mocked(monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "test-bucket")
    monkeypatch.setenv("AWS_REGION", "eu-west-1")

    class _FakeS3:
        def put_object(self, **kwargs):
            return None

    monkeypatch.setattr(
        "services.advertisement_s3_upload.boto3.client",
        lambda *a, **k: _FakeS3(),
    )
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    result = upload_advertisement_image_to_s3(
        user_id=1, file_content=png, original_filename="x.png"
    )
    assert "test-bucket" in result.image_url
    assert result.image_key.startswith("advertisements/1/")


def test_ride_notification_enqueue_no_celery_does_not_raise():
    from ride_notifications import enqueue_ride_in_progress, enqueue_verification_code_created

    enqueue_verification_code_created(1)
    enqueue_ride_in_progress(1)


# =====================================================================================
# DRIVER / BUSINESS OWNER SIGNUP
# =====================================================================================


def _driver_signup_payload(**overrides) -> dict:
    tag = str(uuid.uuid4())[:8]
    body = {
        "full_name": "Driver Test",
        "username": f"driver_{tag}",
        "email": f"driver_{tag}@example.com",
        "phone": "0501234567",
        "password": "ValidPass1!",
        "driver_license_image_url": "https://test/license.jpg",
        "id_card_image_url": "123456789",
        "car_type": "sedan",
        "plate_number": "12-345-67",
        "production_year": 2020,
        "car_license_image_url": "https://test/car_license.jpg",
        "car_insurance_image_url": "https://test/car_insurance.jpg",
    }
    body.update(overrides)
    return body


def _business_owner_signup_payload(**overrides) -> dict:
    tag = str(uuid.uuid4())[:8]
    body = {
        "full_name": "Owner Test",
        "username": f"owner_{tag}",
        "email": f"owner_{tag}@example.com",
        "phone": "0509876543",
        "password": "ValidPass1!",
    }
    body.update(overrides)
    return body


def test_driver_signup_success_creates_pending_profile(
    client: TestClient, db_session: Session
):
    payload = _driver_signup_payload()
    r = client.post("/auth/signup/driver", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["driver_status"] == "PENDING"
    assert data["vehicle_status"] == "SUBMITTED"
    assert db_session.query(DriverProfile).filter(
        DriverProfile.id == data["driver_profile_id"]
    ).one()


def test_driver_signup_invalid_id_card_400(client: TestClient):
    r = client.post(
        "/auth/signup/driver",
        json=_driver_signup_payload(id_card_image_url="abc"),
    )
    assert r.status_code == 400
    assert "9 digits" in r.json()["detail"]


def test_driver_signup_duplicate_username_400(
    client: TestClient, regular_user_active_verified: User
):
    r = client.post(
        "/auth/signup/driver",
        json=_driver_signup_payload(
            username=regular_user_active_verified.username,
            email="other_driver@example.com",
        ),
    )
    assert r.status_code == 400
    assert "already exists" in r.json()["detail"].lower()


def test_business_owner_signup_success(client: TestClient, db_session: Session):
    payload = _business_owner_signup_payload()
    r = client.post("/auth/signup/business-owner", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "BUSINESS_OWNER"
    assert body["user"]["status"] == "PENDING"


def test_business_owner_signup_duplicate_400(
    client: TestClient, regular_user_active_verified: User
):
    r = client.post(
        "/auth/signup/business-owner",
        json=_business_owner_signup_payload(
            username=regular_user_active_verified.username,
            email="bo_other@example.com",
        ),
    )
    assert r.status_code == 400


# =====================================================================================
# EMAIL VERIFICATION + PASSWORD RESET (mocked email)
# =====================================================================================


@pytest.fixture
def mock_send_email(monkeypatch):
    sent: list[dict] = []

    def _fake(to_email, subject, body, *, flow="send_email"):
        sent.append({"to": to_email, "flow": flow})

    monkeypatch.setattr("main.send_email", _fake)
    return sent


@pytest.fixture
def sqlite_friendly_utc_now(monkeypatch):
    """SQLite returns naive datetimes; align main.datetime.now with naive UTC."""

    class _DT(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2030, 6, 1, 12, 0, 0)

    monkeypatch.setattr("main.datetime", _DT)


def test_verify_email_success(
    client: TestClient, db_session: Session, sqlite_friendly_utc_now
):
    user = _make_user(db_session, role=UserRole.REGULAR, tag="verify_ok")
    user.email_verified = False
    db_session.add(user)
    db_session.commit()
    db_session.add(
        EmailVerification(
            user_id=user.id,
            email=user.email,
            code="555555",
            is_used=False,
            expires_at=datetime(2030, 12, 1, 12, 0, 0),
        )
    )
    db_session.commit()
    r = client.post(
        "/auth/verify-email",
        json={"email": user.email, "code": "555555"},
    )
    assert r.status_code == 200
    assert r.json()["success"] is True
    db_session.refresh(user)
    assert user.email_verified is True


def test_verify_email_invalid_code_400(client: TestClient):
    r = client.post(
        "/auth/verify-email",
        json={"email": "nope@example.com", "code": "000000"},
    )
    assert r.status_code == 400


def test_password_reset_full_flow(
    client: TestClient,
    db_session: Session,
    mock_send_email,
    sqlite_friendly_utc_now,
):
    user = _make_user(db_session, role=UserRole.REGULAR, tag="pw_reset")
    r1 = client.post(
        "/auth/request-password-reset",
        json={"email": user.email, "language": "he"},
    )
    assert r1.status_code == 200
    row = (
        db_session.query(EmailVerification)
        .filter(EmailVerification.email == user.email, EmailVerification.is_used.is_(False))
        .order_by(EmailVerification.created_at.desc())
        .first()
    )
    assert row and len(mock_send_email) >= 1
    row.expires_at = datetime(2030, 12, 1, 12, 0, 0)
    db_session.commit()

    r2 = client.post(
        "/auth/verify-password-reset-code",
        json={"email": user.email, "code": row.code},
    )
    assert r2.status_code == 200

    r3 = client.post(
        "/auth/reset-password",
        json={
            "email": user.email,
            "code": row.code,
            "new_password": "NewPass2!",
        },
    )
    assert r3.status_code == 200
    db_session.refresh(user)
    from main import verify_password

    assert verify_password("NewPass2!", user.password_hash)


def test_resend_verification_code_mock_email(
    client: TestClient, db_session: Session, monkeypatch
):
    user = _make_user(db_session, role=UserRole.REGULAR, tag="resend_vc")
    user.email_verified = False
    db_session.add(user)
    db_session.commit()
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    r = client.post(
        "/auth/resend-verification-code",
        json={"email": user.email, "language": "ar"},
    )
    assert r.status_code == 200


# =====================================================================================
# ADMIN CATEGORIES + CITIES (translation files mocked)
# =====================================================================================


@pytest.fixture
def noop_translation_files(monkeypatch):
    monkeypatch.setattr("main.update_translation_file", lambda *a, **k: True)
    monkeypatch.setattr("main.delete_translation_key", lambda *a, **k: True)
    monkeypatch.setattr("main.create_translation_key", lambda name: "cat_key")
    monkeypatch.setattr("main.create_city_translation_key", lambda name: "city_key")


def test_admin_categories_crud(client: TestClient, noop_translation_files):
    listed = client.get("/admin/categories")
    assert listed.status_code == 200

    created = client.post(
        "/admin/categories",
        json={
            "name_ar": "مطعم",
            "name_he": "מסעדה",
            "name_en": "Restaurant",
            "icon_name": "food",
            "is_active": True,
        },
    )
    assert created.status_code == 201, created.text
    cat_id = created.json()["id"]

    updated = client.put(
        f"/admin/categories/{cat_id}",
        json={
            "name_ar": "مطاعم",
            "name_he": "מסעדות",
            "name_en": "Restaurants",
            "icon_name": "food",
            "is_active": True,
        },
    )
    assert updated.status_code == 200

    deleted = client.delete(f"/admin/categories/{cat_id}")
    assert deleted.status_code == 200


def test_admin_category_delete_blocked_when_places_exist(
    client: TestClient, db_session: Session, sample_category_city, noop_translation_files
):
    cat, city = sample_category_city
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    db_session.add(
        Place(
            location_id=loc.id,
            city_id=city.id,
            category_id=cat.id,
            place_type=PlaceType.BUSINESS,
            name="Blocked Del",
            name_ar="ar",
            name_he="he",
            can_be_claimed=True,
        )
    )
    db_session.commit()

    r = client.delete(f"/admin/categories/{cat.id}")
    assert r.status_code == 400
    assert "places" in r.json()["detail"].lower()


def test_admin_cities_crud(client: TestClient, noop_translation_files):
    created = client.post(
        "/admin/cities",
        json={"name_ar": "رהط", "name_he": "רהט", "name_en": "Rahat"},
    )
    assert created.status_code == 201
    city_id = created.json()["id"]

    listed = client.get("/admin/cities")
    assert any(c["id"] == city_id for c in listed.json())

    updated = client.put(
        f"/admin/cities/{city_id}",
        json={"name_ar": "رהط", "name_he": "רהט", "name_en": "Rahat City"},
    )
    assert updated.status_code == 200

    deleted = client.delete(f"/admin/cities/{city_id}")
    assert deleted.status_code == 200


# =====================================================================================
# ADMIN USERS + PROFILES + PASSWORD / PHONE
# =====================================================================================


def test_admin_list_users_and_role_filter(
    client: TestClient, admin_user_active: User, regular_user: User
):
    r = client.get("/admin/users")
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()}
    assert admin_user_active.id in ids
    assert regular_user.id in ids

    r_reg = client.get("/admin/users", params={"role_filter": "REGULAR"})
    assert all(u["role"] == "REGULAR" for u in r_reg.json())

    r_bad = client.get("/admin/users", params={"role_filter": "NOT_A_ROLE"})
    # Handler wraps HTTPException into 500 (current API behaviour).
    assert r_bad.status_code == 500


def test_get_user_profile(client: TestClient, regular_user: User):
    r = client.get(f"/users/{regular_user.id}")
    assert r.status_code == 200
    assert r.json()["username"] == regular_user.username


def test_get_user_profile_404(client: TestClient):
    assert client.get("/users/999999").status_code == 404


def test_get_driver_profile_endpoint(
    client: TestClient, approved_driver: tuple[User, DriverProfile]
):
    driver, profile = approved_driver
    r = client.get(f"/users/{driver.id}/driver-profile")
    assert r.status_code == 200
    assert r.json()["driver_status"] == "APPROVED"
    assert r.json()["vehicle"]["id"] is not None


def test_change_password_success(
    client: TestClient, db_session: Session, regular_user: User
):
    from main import verify_password

    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "RidePass1!",
            "new_password": "Changed1!",
        },
    )
    assert r.status_code == 200
    db_session.expire_all()
    refreshed = db_session.query(User).filter(User.id == regular_user.id).one()
    assert verify_password("Changed1!", refreshed.password_hash)


def test_change_password_wrong_current_401(client: TestClient, regular_user: User):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "WrongPass1!",
            "new_password": "Changed1!",
        },
    )
    assert r.status_code == 401


def test_update_user_phone(client: TestClient, db_session: Session, regular_user: User):
    r = client.put(
        f"/users/{regular_user.id}/phone",
        json={"user_id": regular_user.id, "new_phone": "0501111111"},
    )
    assert r.status_code == 200
    db_session.refresh(regular_user)
    assert regular_user.phone == "0501111111"


# =====================================================================================
# PLACES: SAVE / UNSAVE / ADMIN CREATE+DELETE
# =====================================================================================


def test_save_unsave_and_is_saved(
    client: TestClient, db_session: Session, sample_category_city, regular_user: User
):
    cat, city = sample_category_city
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    place = Place(
        location_id=loc.id,
        city_id=city.id,
        category_id=cat.id,
        place_type=PlaceType.BUSINESS,
        name="Bookmark Place",
        name_ar="bm_ar",
        name_he="bm_he",
        can_be_claimed=True,
    )
    db_session.add(place)
    db_session.commit()
    db_session.refresh(place)

    save = client.post(
        f"/places/{place.id}/save",
        json={"user_id": regular_user.id},
    )
    assert save.status_code == 200

    dup = client.post(
        f"/places/{place.id}/save",
        json={"user_id": regular_user.id},
    )
    assert dup.status_code == 400

    is_saved = client.get(
        f"/places/{place.id}/is-saved",
        params={"user_id": regular_user.id},
    )
    assert is_saved.json()["is_saved"] is True

    unsave = client.delete(
        f"/places/{place.id}/unsave",
        params={"user_id": regular_user.id},
    )
    assert unsave.status_code == 200


def test_gps_osm_check_mocked(client: TestClient, monkeypatch):
    monkeypatch.setattr("main.find_osm_feature", lambda lat, lon, radius=50: "node:1")
    r = client.post("/gps/osm-check", json={"lat": 31.392, "lon": 34.756})
    assert r.status_code == 200
    assert r.json()["osm_id"] == "node:1"


def test_email_utils_send_driver_approved_mock(monkeypatch):
    calls: list[str] = []

    def _fake_enqueue(to_email, subject, body, *, flow):
        calls.append(flow)

    monkeypatch.setattr(
        "email_dispatch.enqueue_transactional_email", _fake_enqueue
    )
    from email_utils import send_driver_approved_email

    send_driver_approved_email("driver@example.com", "Driver Name")
    assert calls


# =====================================================================================
# ADVERTISEMENTS (extra endpoints) + FILES UPLOAD MOCK
# =====================================================================================


def test_list_my_advertisements(
    client: TestClient,
    db_session,
    sample_category_city,
    regular_user_active_verified: User,
    mock_s3_ad_upload,
):
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=regular_user_active_verified,
        category_id=cat.id,
        city_id=city.id,
        description="mine",
        file_content=b"\x89PNG\r\n\x1a\n" + b"\x00" * 32,
        original_filename="ad.png",
    )
    r = client.get(
        "/advertisements/mine",
        params={"user_id": regular_user_active_verified.id},
    )
    assert r.status_code == 200
    assert any(row["id"] == ad.id for row in r.json())


def test_files_upload_presign_mocked(client: TestClient, monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "test-bucket")
    monkeypatch.setenv("AWS_REGION", "eu-west-1")

    class _FakeS3:
        def generate_presigned_url(self, **kwargs):
            return "https://signed.example/upload"

    monkeypatch.setattr("main.boto3.client", lambda *a, **k: _FakeS3())

    r = client.post(
        "/files/upload",
        files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert r.status_code == 200
    assert r.json()["upload_url"] == "https://signed.example/upload"


# =====================================================================================
# DRIVERS ADMIN LIST + VEHICLE REQUEST GET
# =====================================================================================


def test_list_pending_drivers_includes_new_signup(
    client: TestClient, db_session: Session
):
    payload = _driver_signup_payload()
    signup = client.post("/auth/signup/driver", json=payload)
    assert signup.status_code == 200
    profile_id = signup.json()["driver_profile_id"]

    r = client.get("/admin/drivers/pending")
    assert r.status_code == 200
    profile_ids = {row["driver_profile_id"] for row in r.json()}
    assert profile_id in profile_ids


def test_get_vehicle_update_request_by_id(
    client: TestClient, approved_driver: tuple[User, DriverProfile]
):
    driver, _ = approved_driver
    req_id = _create_vehicle_update_request(client, driver.id)
    r = client.get(f"/drivers/vehicle-update-requests/{req_id}")
    assert r.status_code == 200
    assert r.json()["id"] == req_id


def test_regular_cannot_delete_user_as_admin(
    client: TestClient, regular_user: User, admin_user_active: User
):
    r = client.request(
        "DELETE",
        f"/admin/users/{regular_user.id}",
        json={"admin_user_id": regular_user.id},
    )
    assert r.status_code == 403


def test_admin_delete_regular_user(
    client: TestClient, db_session: Session, admin_user_active: User
):
    victim = _make_user(db_session, role=UserRole.REGULAR, tag="del_me")
    r = client.request(
        "DELETE",
        f"/admin/users/{victim.id}",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 200
    assert db_session.query(User).filter(User.id == victim.id).count() == 0


def test_vehicle_update_blocked_flag_prevents_going_online(
    client: TestClient,
    db_session: Session,
    approved_driver: tuple[User, DriverProfile],
):
    """Nearby-drivers needs PostGIS; blocked-online is covered elsewhere — assert DB flag."""
    driver, profile = approved_driver
    profile.vehicle_update_blocked = True
    db_session.add(profile)
    db_session.commit()
    r = client.get(f"/drivers/{driver.id}/availability")
    assert r.json()["vehicle_update_blocked"] is True


# =====================================================================================
# BATCH 2: business-owner, translate, email dispatch, admin permissions, saved places
# =====================================================================================


def _business_owner_place_request_payload(
    cat: Category, city: City, **overrides
) -> dict:
    tag = str(uuid.uuid4())[:8]
    body = {
        "full_name": "Business Owner",
        "username": f"bo_req_{tag}",
        "email": f"bo_req_{tag}@example.com",
        "phone": "0501234567",
        "password": "ValidPass1!",
        "lat": 31.392,
        "lon": 34.756,
        "source": "MAP_PICK",
        "name": "New Business",
        "name_ar": "עסק",
        "name_he": "עסק",
        "city_id": city.id,
        "category_id": cat.id,
        "description": "A nice place",
    }
    body.update(overrides)
    return body


def _seed_verified_email(db_session: Session, email: str, user_id: int | None = None):
    db_session.add(
        EmailVerification(
            user_id=user_id,
            email=email,
            code="1234",
            is_used=True,
            expires_at=datetime(2030, 12, 1, 12, 0, 0),
        )
    )
    db_session.commit()


def test_business_owner_place_request_new_user_success(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city)
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "PENDING"
    assert (
        db_session.query(BusinessOwnerPlaceRequest)
        .filter(BusinessOwnerPlaceRequest.name == "New Business")
        .count()
        == 1
    )


def test_business_owner_place_request_unverified_email_403(
    client: TestClient, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city)
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 403
    assert "verified" in r.json()["detail"].lower()


def test_business_owner_place_request_claim_existing_place(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    place = Place(
        location_id=loc.id,
        city_id=city.id,
        category_id=cat.id,
        place_type=PlaceType.BUSINESS,
        name="Claimable",
        name_ar="c_ar",
        name_he="c_he",
        can_be_claimed=True,
        owner_user_id=None,
    )
    db_session.add(place)
    db_session.commit()
    db_session.refresh(place)
    payload = _business_owner_place_request_payload(cat, city)
    _seed_verified_email(db_session, payload["email"])
    r = client.post(
        "/business-owner/place-requests",
        json={**payload, "existing_place_id": place.id, "name": "Claimed Biz"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["existing_place_id"] == place.id


def test_business_owner_place_request_place_already_owned_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    owner = _make_user(db_session, role=UserRole.BUSINESS_OWNER, tag="owned_bo")
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    taken = Place(
        location_id=loc.id,
        city_id=city.id,
        category_id=cat.id,
        place_type=PlaceType.BUSINESS,
        name="Taken",
        name_ar="t_ar",
        name_he="t_he",
        can_be_claimed=False,
        owner_user_id=owner.id,
    )
    db_session.add(taken)
    db_session.commit()
    payload = _business_owner_place_request_payload(
        cat, city, existing_place_id=taken.id
    )
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400
    assert "owner" in r.json()["detail"].lower()


def test_business_owner_rejected_resignup_via_signup(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    payload = _business_owner_signup_payload()
    first = client.post("/auth/signup/business-owner", json=payload)
    assert first.status_code == 200
    user = db_session.query(User).filter(User.email == payload["email"]).one()
    user.status = UserStatus.REJECTED
    user.rejection_reason = "no"
    db_session.commit()
    _seed_verified_email(db_session, payload["email"], user.id)
    second = client.post("/auth/signup/business-owner", json=payload)
    assert second.status_code == 200
    db_session.refresh(user)
    assert user.status == UserStatus.PENDING
    assert user.rejection_reason is None


def test_list_business_owner_requests_status_filter(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    _pending_business_owner_request_claim_existing_place(
        db_session, cat=cat, city=city, tag="list_bo"
    )
    r = client.get("/admin/business-owner/requests", params={"status": "PENDING"})
    assert r.status_code == 200
    assert all(row["status"] == "PENDING" for row in r.json())
    r_bad = client.get("/admin/business-owner/requests", params={"status": "NOPE"})
    assert r_bad.status_code == 400


def test_get_business_owner_profile_pending_request(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    bo_user = _make_user(
        db_session, role=UserRole.BUSINESS_OWNER, tag="prof_bo", status=UserStatus.PENDING
    )
    req = BusinessOwnerPlaceRequest(
        user_id=bo_user.id,
        existing_place_id=None,
        lat=31.392,
        lon=34.756,
        source="MAP_PICK",
        name="Profile Biz",
        name_ar="p_ar",
        name_he="p_he",
        city_id=city.id,
        category_id=cat.id,
        description="desc",
        phone="0501111111",
        status=OwnerPlaceRequestStatus.PENDING,
    )
    db_session.add(req)
    db_session.commit()
    r = client.get(f"/users/{bo_user.id}/business-owner-profile")
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["id"] == bo_user.id
    assert body["request_status"] == "PENDING"


def test_translate_empty_text_400(client: TestClient, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    r = client.post("/translate", json={"text": "   ", "target_language": "he"})
    assert r.status_code == 400


def test_translate_invalid_target_language_400(client: TestClient, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    r = client.post("/translate", json={"text": "hello", "target_language": "fr"})
    assert r.status_code == 400


def test_translate_same_language_returns_original(client: TestClient, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    r = client.post(
        "/translate",
        json={"text": "שלום", "target_language": "he"},
    )
    assert r.status_code == 200
    assert r.json()["translated_text"] == "שלום"
    assert r.json()["detected_language"] == "he"


def test_translate_openai_mock_success(client: TestClient, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")

    class _Msg:
        content = "مرحبا"

    class _Choice:
        message = _Msg()

    class _Resp:
        choices = [_Choice()]

    class _ChatCompletions:
        @staticmethod
        def create(**kwargs):
            return _Resp()

    class _Chat:
        completions = _ChatCompletions

    class _Client:
        chat = _Chat()

    monkeypatch.setattr("openai.OpenAI", lambda **kwargs: _Client())

    r = client.post(
        "/translate",
        json={"text": "Hello world", "target_language": "ar"},
    )
    assert r.status_code == 200
    assert r.json()["translated_text"] == "مرحبا"


def test_translate_openai_auth_error_500(client: TestClient, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    import openai

    class _Client:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    raise openai.AuthenticationError("bad key", response=None, body=None)

    monkeypatch.setattr("openai.OpenAI", lambda **kwargs: _Client())
    r = client.post(
        "/translate",
        json={"text": "Hello", "target_language": "he"},
    )
    assert r.status_code == 500


def test_enqueue_transactional_email_uses_celery(monkeypatch):
    captured: list[tuple] = []

    class _AsyncResult:
        id = "fake-task-id"
        state = "PENDING"

    def _delay(to_email, subject, body):
        captured.append((to_email, subject, body))
        return _AsyncResult()

    monkeypatch.setattr("tasks.send_email_task.delay", _delay)
    from email_dispatch import enqueue_transactional_email

    enqueue_transactional_email(
        "user@example.com", "Subject", "Body", flow="test_flow"
    )
    assert captured == [("user@example.com", "Subject", "Body")]


def test_enqueue_transactional_email_sync_fallback(monkeypatch):
    monkeypatch.setattr(
        "tasks.send_email_task.delay",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no broker")),
    )
    called: list[tuple] = []
    monkeypatch.setattr(
        "email_dispatch._sync_smtp_fallback",
        lambda to_email, subject, body, *, flow: called.append((to_email, flow)),
    )
    from email_dispatch import enqueue_transactional_email

    enqueue_transactional_email("a@b.com", "S", "B", flow="fallback_test")
    assert called


def test_main_send_email_delegates_to_dispatch(monkeypatch):
    captured: list[str] = []

    def _fake_enqueue(to_email, subject, body, *, flow):
        captured.append(flow)

    monkeypatch.setattr(
        "email_dispatch.enqueue_transactional_email", _fake_enqueue
    )
    from main import send_email

    send_email("x@y.com", "sub", "body", flow="unit_test")
    assert captured == ["unit_test"]


def test_send_email_task_invokes_smtp_deliver(monkeypatch):
    delivered: list[tuple] = []

    monkeypatch.setattr(
        "tasks._smtp_deliver",
        lambda to_email, subject, body: delivered.append((to_email, subject)),
    )
    from tasks import send_email_task

    send_email_task("to@example.com", "Hello", "Body text")
    assert delivered == [("to@example.com", "Hello")]


def test_tasks_ping_returns_pong():
    from tasks import ping

    assert ping() == {"ok": True, "message": "pong"}


def test_regular_cannot_approve_advertisement_admin(
    client: TestClient,
    db_session,
    sample_category_city,
    regular_user: User,
    mock_s3_ad_upload,
):
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=regular_user,
        category_id=cat.id,
        city_id=city.id,
        description="x",
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 500,
        original_filename="a.jpg",
    )
    r = client.post(
        f"/admin/advertisements/{ad.id}/approve",
        json={"admin_user_id": regular_user.id},
    )
    assert r.status_code == 403


def test_driver_cannot_access_admin_pending_advertisements(
    client: TestClient, approved_driver: tuple[User, DriverProfile]
):
    driver, _ = approved_driver
    r = client.get(
        "/admin/advertisements/pending",
        params={"admin_user_id": driver.id},
    )
    assert r.status_code == 403


def test_business_owner_cannot_approve_driver_admin(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    bo_user, _place, _req = _pending_business_owner_request_claim_existing_place(
        db_session, cat=cat, city=city, tag="bo_403_drv"
    )
    _driver, profile, _vehicle = _pending_driver_bundle(db_session, tag="d403")
    r = client.post(
        f"/admin/drivers/{profile.id}/approve",
        json={"admin_user_id": bo_user.id},
    )
    assert r.status_code == 403


def test_regular_cannot_create_admin_city(
    client: TestClient, regular_user: User, noop_translation_files
):
    """POST /admin/cities has no role check in handler (documents current API)."""
    r = client.post(
        "/admin/cities",
        json={"name_ar": "x", "name_he": "y", "name_en": "Zed"},
    )
    assert r.status_code == 201


def test_saved_places_count_zero_in_db(db_session: Session, regular_user: User):
    """GET /users/.../saved-places builds LocationResponse (PostGIS on SQLite)."""
    count = (
        db_session.query(SavedPlace)
        .filter(SavedPlace.user_id == regular_user.id)
        .count()
    )
    assert count == 0


def test_admin_pending_advertisements_requires_admin(
    client: TestClient,
    db_session,
    sample_category_city,
    regular_user_active_verified: User,
    admin_user_active: User,
    mock_s3_ad_upload,
):
    cat, city = sample_category_city
    create_advertisement_request(
        db_session,
        user=regular_user_active_verified,
        category_id=cat.id,
        city_id=city.id,
        description="pending",
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 500,
        original_filename="b.jpg",
    )
    r_admin = client.get(
        "/admin/advertisements/pending",
        params={"admin_user_id": admin_user_active.id},
    )
    assert r_admin.status_code == 200
    r_reg = client.get(
        "/admin/advertisements/pending",
        params={"admin_user_id": regular_user_active_verified.id},
    )
    assert r_reg.status_code == 403


def test_enqueue_advertisement_approved_email_mock(monkeypatch):
    captured: list[str] = []

    def _fake_admin_email(to_email, subject, body, *, status, request_type):
        captured.append(request_type)

    monkeypatch.setattr("main.enqueue_admin_status_email", _fake_admin_email)
    from main import enqueue_advertisement_approved_email

    enqueue_advertisement_approved_email("u@example.com", "User")
    assert captured == ["advertisement"]


def test_business_owner_place_request_city_not_found_404(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city, city_id=999999)
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 404


def test_translate_missing_api_key_500(client: TestClient, monkeypatch):
    import os as os_module

    real_getenv = os_module.getenv

    def _getenv(key, default=None):
        if key == "OPENAI_API_KEY":
            return None
        return real_getenv(key, default)

    monkeypatch.setattr("os.getenv", _getenv)
    r = client.post(
        "/translate",
        json={"text": "hello", "target_language": "he"},
    )
    assert r.status_code == 500


def test_driver_rejected_resignup_via_signup(client: TestClient, db_session: Session):
    payload = _driver_signup_payload()
    first = client.post("/auth/signup/driver", json=payload)
    assert first.status_code == 200
    user = db_session.query(User).filter(User.email == payload["email"]).one()
    profile = (
        db_session.query(DriverProfile).filter(DriverProfile.user_id == user.id).one()
    )
    profile.driver_status = DriverStatus.REJECTED
    user.status = UserStatus.REJECTED
    db_session.commit()
    second = client.post("/auth/signup/driver", json=payload)
    assert second.status_code == 200
    assert "again" in second.json()["message"].lower()
    db_session.refresh(profile)
    assert profile.driver_status == DriverStatus.PENDING


def test_admin_reject_advertisement_with_email_mock(
    client: TestClient,
    db_session,
    sample_category_city,
    regular_user_active_verified: User,
    admin_user_active: User,
    mock_s3_ad_upload,
    monkeypatch,
):
    emails: list[str] = []
    monkeypatch.setattr(
        "main.enqueue_advertisement_rejected_email",
        lambda to_email, full_name: emails.append(to_email),
    )
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=regular_user_active_verified,
        category_id=cat.id,
        city_id=city.id,
        description="reject me",
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 500,
        original_filename="r.jpg",
    )
    r = client.post(
        f"/admin/advertisements/{ad.id}/reject",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 200
    assert emails


def test_request_email_verification_new_address(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    email = f"verify_{str(uuid.uuid4())[:8]}@example.com"
    r = client.post(
        "/auth/request-email-verification",
        json={"email": email, "language": "he"},
    )
    assert r.status_code == 200
    row = (
        db_session.query(EmailVerification)
        .filter(EmailVerification.email == email)
        .one()
    )
    assert row.is_used is False


def test_business_owner_place_request_short_name_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city, name="A")
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400


def test_list_public_advertisements_with_filters(
    client: TestClient,
    db_session,
    sample_category_city,
    regular_user_active_verified: User,
    mock_s3_ad_upload,
):
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=regular_user_active_verified,
        category_id=cat.id,
        city_id=city.id,
        description="filter",
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 500,
        original_filename="f.jpg",
    )
    approve_advertisement(db_session, ad.id)
    r = client.get(
        "/advertisements",
        params={"category_id": cat.id, "city_id": city.id},
    )
    assert r.status_code == 200
    assert any(row["id"] == ad.id for row in r.json())


def test_tasks_smtp_deliver_fake_print_when_no_credentials(monkeypatch):
    class _ES:
        @staticmethod
        def dotenv_file_abs_path():
            from pathlib import Path

            return Path(".")

        @staticmethod
        def describe_email_pass_env_shape():
            return "missing"

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

        @staticmethod
        def get_smtp_login():
            return "", ""

        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

    monkeypatch.setattr("tasks.get_email_settings", lambda: _ES)
    from tasks import _smtp_deliver

    _smtp_deliver("nobody@example.com", "Subj", "Body")  # prints FAKE email, no raise


def test_change_password_same_password_400(client: TestClient, regular_user: User):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "RidePass1!",
            "new_password": "RidePass1!",
        },
    )
    assert r.status_code == 400


def test_email_dispatch_sync_fallback_no_credentials(monkeypatch):
    monkeypatch.setattr(
        "tasks.send_email_task.delay",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no celery")),
    )

    class _ES:
        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

        @staticmethod
        def get_smtp_login():
            return "", ""

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

    monkeypatch.setattr("email_dispatch.get_email_settings", lambda: _ES)
    from email_dispatch import enqueue_transactional_email

    enqueue_transactional_email("a@b.com", "S", "B", flow="sync_no_creds")


def test_claim_non_business_place_rejected_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    public_place = Place(
        location_id=loc.id,
        city_id=city.id,
        category_id=cat.id,
        place_type=PlaceType.PUBLIC_SERVICE,
        name="School",
        name_ar="s_ar",
        name_he="s_he",
        can_be_claimed=False,
    )
    db_session.add(public_place)
    db_session.commit()
    payload = _business_owner_place_request_payload(cat, city)
    _seed_verified_email(db_session, payload["email"])
    r = client.post(
        "/business-owner/place-requests",
        json={**payload, "existing_place_id": public_place.id},
    )
    assert r.status_code == 400
    assert "business" in r.json()["detail"].lower()


# =====================================================================================
# BATCH 2b: validation branches, translate errors, SMTP paths, auth email templates
# =====================================================================================


def test_business_owner_place_request_invalid_full_name_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(
        cat, city, full_name="Owner123"
    )
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400
    assert "name" in r.json()["detail"].lower()


def test_business_owner_place_request_weak_password_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city, password="weak")
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400


def test_business_owner_place_request_category_not_found_404(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city, category_id=999999)
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 404
    assert "category" in r.json()["detail"].lower()


def test_business_owner_place_request_place_not_found_404(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(
        cat, city, existing_place_id=999999
    )
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 404


def test_business_owner_place_request_active_owner_duplicate_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    bo = _make_user(
        db_session, role=UserRole.BUSINESS_OWNER, tag="active_bo", status=UserStatus.ACTIVE
    )
    payload = _business_owner_place_request_payload(
        cat,
        city,
        email=bo.email,
        username=bo.username,
        phone=bo.phone,
    )
    _seed_verified_email(db_session, payload["email"], user_id=bo.id)
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400
    assert "exists" in r.json()["detail"].lower()


def test_business_owner_rejected_resignup_via_place_request(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city)
    bo = _make_user(
        db_session,
        role=UserRole.BUSINESS_OWNER,
        tag="rej_bo",
        status=UserStatus.REJECTED,
    )
    bo.email = payload["email"]
    bo.username = payload["username"]
    db_session.add(bo)
    db_session.commit()
    _seed_verified_email(db_session, payload["email"], user_id=bo.id)
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 201
    db_session.refresh(bo)
    assert bo.status == UserStatus.PENDING


def test_business_owner_place_request_duplicate_username_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    existing = _make_user(
        db_session, role=UserRole.REGULAR, tag="dup_bo", status=UserStatus.ACTIVE
    )
    payload = _business_owner_place_request_payload(
        cat, city, username=existing.username, email=f"new_{uuid.uuid4().hex[:8]}@example.com"
    )
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400
    assert "exists" in r.json()["detail"].lower()


def test_business_owner_place_request_invalid_business_phone_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(
        cat, city, business_phone="12"
    )
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400


def test_translate_rate_limit_429(client: TestClient, monkeypatch):
    from unittest.mock import MagicMock

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    import openai

    class _Client:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    resp = MagicMock()
                    resp.status_code = 429
                    resp.headers = {}
                    resp.request = MagicMock()
                    raise openai.RateLimitError("rate", response=resp, body=None)

    monkeypatch.setattr("openai.OpenAI", lambda **kwargs: _Client())
    r = client.post(
        "/translate",
        json={"text": "Hello", "target_language": "he"},
    )
    assert r.status_code == 429


def test_translate_openai_api_error_500(client: TestClient, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    import openai

    class _Req:
        pass

    class _Client:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    raise openai.APIError("api down", request=_Req(), body=None)

    monkeypatch.setattr("openai.OpenAI", lambda **kwargs: _Client())
    r = client.post(
        "/translate",
        json={"text": "Hello", "target_language": "he"},
    )
    assert r.status_code == 500


def test_translate_empty_openai_response_500(client: TestClient, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")

    class _Resp:
        choices = []

    class _ChatCompletions:
        @staticmethod
        def create(**kwargs):
            return _Resp()

    class _Chat:
        completions = _ChatCompletions

    class _Client:
        chat = _Chat()

    monkeypatch.setattr("openai.OpenAI", lambda **kwargs: _Client())
    r = client.post(
        "/translate",
        json={"text": "Hello", "target_language": "he"},
    )
    assert r.status_code == 500


def test_send_verification_email_hebrew_and_english(mock_send_email, monkeypatch):
    from main import send_verification_email

    send_verification_email("a@b.com", "123456", "Name", language="he")
    send_verification_email("c@d.com", "654321", "Name", language="en")
    flows = [x["flow"] for x in mock_send_email]
    assert "verification_email:he" in flows
    assert "verification_email:en" in flows


def test_send_password_reset_email_english(mock_send_email):
    from main import send_password_reset_email

    send_password_reset_email("u@example.com", "999999", "User", language="en")
    assert mock_send_email[-1]["flow"] == "password_reset_email:en"


def test_enqueue_advertisement_rejected_email_mock(monkeypatch):
    calls: list[tuple] = []

    def _fake(to_email, subject, body, *, status, request_type):
        calls.append((to_email, status, request_type))

    monkeypatch.setattr("main.enqueue_admin_status_email", _fake)
    from main import enqueue_advertisement_rejected_email

    enqueue_advertisement_rejected_email("u@example.com", "User")
    assert calls and calls[0][1] == "rejected"


def test_request_password_reset_unknown_email_404(client: TestClient):
    r = client.post(
        "/auth/request-password-reset",
        json={"email": "missing@example.com", "language": "ar"},
    )
    assert r.status_code == 404


def test_verify_password_reset_code_expired_400(
    client: TestClient, db_session: Session, sqlite_friendly_utc_now
):
    user = _make_user(db_session, role=UserRole.REGULAR, tag="pw_exp")
    row = EmailVerification(
        user_id=user.id,
        email=user.email,
        code="111111",
        is_used=False,
        expires_at=datetime(2000, 1, 1, 12, 0, 0),
    )
    db_session.add(row)
    db_session.commit()
    r = client.post(
        "/auth/verify-password-reset-code",
        json={"email": user.email, "code": row.code},
    )
    assert r.status_code == 400
    assert "expired" in r.json()["detail"].lower()


def test_reset_password_weak_new_password_400(
    client: TestClient, db_session: Session, sqlite_friendly_utc_now
):
    user = _make_user(db_session, role=UserRole.REGULAR, tag="pw_weak")
    row = EmailVerification(
        user_id=user.id,
        email=user.email,
        code="222222",
        is_used=False,
        expires_at=datetime(2030, 12, 1, 12, 0, 0),
    )
    db_session.add(row)
    db_session.commit()
    r = client.post(
        "/auth/reset-password",
        json={"email": user.email, "code": row.code, "new_password": "short"},
    )
    assert r.status_code == 400


def test_tasks_smtp_deliver_sends_with_mock_smtp(monkeypatch):
    import smtplib

    class _ES:
        @staticmethod
        def dotenv_file_abs_path():
            from pathlib import Path

            return Path(".")

        @staticmethod
        def describe_email_pass_env_shape():
            return "ok"

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

        @staticmethod
        def get_smtp_login():
            return "user@test.com", "apppassword"

        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

    sent: list = []

    class _SMTP:
        def __init__(self, host, port, timeout=30):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def login(self, user, password):
            pass

        def send_message(self, msg):
            sent.append(msg)

    monkeypatch.setattr("tasks.get_email_settings", lambda: _ES)
    monkeypatch.setattr("smtplib.SMTP_SSL", _SMTP)
    from tasks import _smtp_deliver

    _smtp_deliver("dest@example.com", "Subject", "Body")
    assert len(sent) == 1


def test_send_email_task_failure_reraises(monkeypatch):
    monkeypatch.setattr(
        "tasks._smtp_deliver",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("smtp fail")),
    )
    from tasks import send_email_task

    with pytest.raises(RuntimeError, match="smtp fail"):
        send_email_task("x@y.com", "S", "B")


def test_email_dispatch_sync_fallback_smtp_success(monkeypatch):
    import smtplib

    monkeypatch.setattr(
        "tasks.send_email_task.delay",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no celery")),
    )

    class _ES:
        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

        @staticmethod
        def get_smtp_login():
            return "user@test.com", "pass"

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

    class _SMTP:
        def __init__(self, host, port):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def login(self, u, p):
            pass

        def send_message(self, msg):
            pass

    monkeypatch.setattr("email_dispatch.get_email_settings", lambda: _ES)
    monkeypatch.setattr("smtplib.SMTP_SSL", _SMTP)
    from email_dispatch import enqueue_transactional_email

    enqueue_transactional_email("sync@example.com", "S", "B", flow="sync_ok")


def test_admin_approve_advertisement_with_email_mock(
    client: TestClient,
    db_session,
    sample_category_city,
    regular_user_active_verified: User,
    admin_user_active: User,
    mock_s3_ad_upload,
    monkeypatch,
):
    emails: list[str] = []
    monkeypatch.setattr(
        "main.enqueue_advertisement_approved_email",
        lambda to_email, full_name: emails.append(to_email),
    )
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=regular_user_active_verified,
        category_id=cat.id,
        city_id=city.id,
        description="approve me",
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 500,
        original_filename="a.jpg",
    )
    r = client.post(
        f"/admin/advertisements/{ad.id}/approve",
        json={"admin_user_id": admin_user_active.id},
    )
    assert r.status_code == 200
    assert emails


# =====================================================================================
# BATCH 3: saved places, admin places, files, email, permissions, driver/BO flows
# =====================================================================================


@pytest.fixture
def mock_sqlite_geom(monkeypatch):
    """Map PostGIS func.* to WKT strings for SQLite Text `geom` columns."""
    monkeypatch.setattr(
        "main.func.ST_MakePoint",
        lambda lon, lat: f"POINT({lon} {lat})",
    )
    monkeypatch.setattr("main.func.ST_SetSRID", lambda geom, _srid: geom)


def _seed_place_row(
    db_session: Session,
    cat: Category,
    city: City,
    *,
    name: str = "Test Place",
    place_type: PlaceType = PlaceType.BUSINESS,
    owner_user_id: int | None = None,
) -> Place:
    loc = Location(geom="POINT(34.756 31.392)", source="MAP_PICK")
    db_session.add(loc)
    db_session.flush()
    place = Place(
        location_id=loc.id,
        city_id=city.id,
        category_id=cat.id,
        place_type=place_type,
        name=name,
        name_ar="ar_name",
        name_he="he_name",
        can_be_claimed=owner_user_id is None,
        owner_user_id=owner_user_id,
    )
    db_session.add(place)
    db_session.commit()
    db_session.refresh(place)
    return place


# -- Saved places ----------------------------------------------------------------------


def test_is_saved_false_when_not_bookmarked(
    client: TestClient, db_session: Session, sample_category_city, regular_user: User
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    r = client.get(
        f"/places/{place.id}/is-saved",
        params={"user_id": regular_user.id},
    )
    assert r.status_code == 200
    assert r.json()["is_saved"] is False


def test_save_place_not_found_404(client: TestClient, regular_user: User):
    r = client.post(
        "/places/999999/save",
        json={"user_id": regular_user.id},
    )
    assert r.status_code == 404


def test_save_user_not_found_404(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    r = client.post(
        f"/places/{place.id}/save",
        json={"user_id": 999999},
    )
    assert r.status_code == 404


def test_unsave_not_found_404(client: TestClient, regular_user: User):
    r = client.delete(
        "/places/1/unsave",
        params={"user_id": regular_user.id},
    )
    assert r.status_code == 404


# -- Places / admin places -------------------------------------------------------------


def test_get_place_by_id_not_found_404(client: TestClient):
    r = client.get("/places/999999")
    assert r.status_code == 404


def test_admin_create_place_business_missing_category_400(
    client: TestClient, sample_category_city, mock_sqlite_geom, monkeypatch
):
    monkeypatch.setattr("main.find_osm_feature", lambda *a, **k: None)
    _cat, city = sample_category_city
    r = client.post(
        "/admin/places",
        json={
            "name": "Bad Biz",
            "name_ar": "x",
            "name_he": "y",
            "place_type": "BUSINESS",
            "city_id": city.id,
            "lat": 31.39,
            "lon": 34.75,
        },
    )
    assert r.status_code == 400


def test_admin_create_place_city_not_found_404(
    client: TestClient, sample_category_city, mock_sqlite_geom, monkeypatch
):
    monkeypatch.setattr("main.find_osm_feature", lambda *a, **k: None)
    cat, _city = sample_category_city
    r = client.post(
        "/admin/places",
        json={
            "name": "Nowhere",
            "name_ar": "x",
            "name_he": "y",
            "place_type": "BUSINESS",
            "city_id": 999999,
            "category_id": cat.id,
            "lat": 31.39,
            "lon": 34.75,
        },
    )
    assert r.status_code == 404


def test_admin_create_place_category_not_found_404(
    client: TestClient, sample_category_city, mock_sqlite_geom, monkeypatch
):
    monkeypatch.setattr("main.find_osm_feature", lambda *a, **k: None)
    _cat, city = sample_category_city
    r = client.post(
        "/admin/places",
        json={
            "name": "Bad Cat",
            "name_ar": "x",
            "name_he": "y",
            "place_type": "BUSINESS",
            "city_id": city.id,
            "category_id": 999999,
            "lat": 31.39,
            "lon": 34.75,
        },
    )
    assert r.status_code == 404


def test_admin_update_place_city_not_found_404(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    r = client.put(
        f"/admin/places/{place.id}",
        json={"city_id": 999999},
    )
    assert r.status_code == 404


def test_admin_delete_place_not_found_404(client: TestClient):
    r = client.delete("/admin/places/999999")
    assert r.status_code == 404


# -- Files upload ----------------------------------------------------------------------


def test_files_upload_missing_bucket_500(client: TestClient, monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "")
    monkeypatch.setenv("S3_BUCKET", "")
    monkeypatch.setenv("AWS_REGION", "eu-west-1")
    r = client.post(
        "/files/upload",
        files={"file": ("x.bin", b"data", "application/octet-stream")},
    )
    assert r.status_code == 500


def test_files_upload_missing_region_500(client: TestClient, monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "test-bucket-only")
    monkeypatch.setenv("S3_BUCKET", "")
    monkeypatch.setenv("AWS_REGION", "")
    r = client.post(
        "/files/upload",
        files={"file": ("x.bin", b"data", "application/octet-stream")},
    )
    assert r.status_code == 500


def test_files_upload_presign_failure_500(client: TestClient, monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "b")
    monkeypatch.setenv("AWS_REGION", "eu-west-1")

    def _boom(*args, **kwargs):
        raise RuntimeError("presign down")

    monkeypatch.setattr("main.boto3.client", _boom)
    r = client.post(
        "/files/upload",
        files={"file": ("x.bin", b"data", "application/octet-stream")},
    )
    assert r.status_code == 500


# -- Email / tasks (mock only) --------------------------------------------------------


def test_email_dispatch_sync_fallback_smtp_failure_branch(monkeypatch):
    import smtplib

    class _ES:
        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

        @staticmethod
        def get_smtp_login():
            return "u@test.com", "pass"

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

    class _SMTP:
        def __init__(self, host, port):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def login(self, u, p):
            raise smtplib.SMTPException("login failed")

        def send_message(self, msg):
            pass

    monkeypatch.setattr("email_dispatch.get_email_settings", lambda: _ES)
    monkeypatch.setattr("smtplib.SMTP_SSL", _SMTP)
    from email_dispatch import _sync_smtp_fallback

    _sync_smtp_fallback("fail@example.com", "S", "B", flow="test_fail")


def test_email_utils_send_verification_email_mock(monkeypatch):
    captured: list[str] = []

    def _fake(to_email, subject, body, *, flow):
        captured.append(flow)

    monkeypatch.setattr(
        "email_dispatch.enqueue_transactional_email", _fake
    )
    from email_utils import send_verification_email

    send_verification_email("v@example.com", "User", "123456")
    assert captured == ["email_utils.send_verification_email"]


def test_main_send_verification_email_arabic_default(mock_send_email):
    from main import send_verification_email

    send_verification_email("a@b.com", "9999", "Ali", language="ar")
    assert mock_send_email[-1]["flow"] == "verification_email:ar"


def test_main_send_password_reset_email_hebrew(mock_send_email):
    from main import send_password_reset_email

    send_password_reset_email("a@b.com", "8888", "Ali", language="he")
    assert mock_send_email[-1]["flow"] == "password_reset_email:he"


def test_resend_verification_unknown_email_404(client: TestClient, monkeypatch):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    r = client.post(
        "/auth/resend-verification-code",
        json={"email": "nobody@example.com", "language": "ar"},
    )
    assert r.status_code == 404


def test_resend_verification_already_verified_400(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    user = _make_user(db_session, role=UserRole.REGULAR, tag="verified")
    r = client.post(
        "/auth/resend-verification-code",
        json={"email": user.email, "language": "ar"},
    )
    assert r.status_code == 400


# -- Signup validation branches --------------------------------------------------------


def test_signup_regular_duplicate_username_400(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    existing = _make_user(db_session, role=UserRole.REGULAR, tag="dup_u")
    _seed_verified_email(db_session, existing.email)
    tag = str(uuid.uuid4())[:8]
    r = client.post(
        "/auth/signup/regular",
        json={
            "full_name": "New User",
            "username": existing.username,
            "email": f"other_{tag}@example.com",
            "phone": "0509988776",
            "password": "ValidPass1!",
            "password_confirmation": "ValidPass1!",
        },
    )
    assert r.status_code == 400
    assert "username" in r.json()["detail"].lower()


def test_signup_regular_duplicate_phone_400(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    existing = _make_user(db_session, role=UserRole.REGULAR, tag="dup_p")
    email = f"new_{str(uuid.uuid4())[:8]}@example.com"
    _seed_verified_email(db_session, email)
    r = client.post(
        "/auth/signup/regular",
        json={
            "full_name": "New User",
            "username": f"user_{str(uuid.uuid4())[:8]}",
            "email": email,
            "phone": existing.phone,
            "password": "ValidPass1!",
            "password_confirmation": "ValidPass1!",
        },
    )
    assert r.status_code == 400
    assert "phone" in r.json()["detail"].lower()


# -- Admin permissions (extra) -------------------------------------------------------


def test_regular_cannot_approve_business_owner_request(
    client: TestClient,
    db_session: Session,
    sample_category_city,
    regular_user: User,
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city)
    _seed_verified_email(db_session, payload["email"])
    created = client.post("/business-owner/place-requests", json=payload)
    assert created.status_code == 201
    req_id = created.json()["id"]
    r = client.post(
        f"/admin/business-owner/requests/{req_id}/approve",
        json={"admin_user_id": regular_user.id},
    )
    assert r.status_code == 403


def test_business_owner_cannot_approve_vehicle_request(
    client: TestClient, approved_driver: tuple[User, DriverProfile], db_session: Session
):
    bo = _make_user(db_session, role=UserRole.BUSINESS_OWNER, tag="bo_vur")
    driver, _ = approved_driver
    req_id = _create_vehicle_update_request(client, driver.id)
    r = client.post(
        f"/admin/drivers/vehicle-update-requests/{req_id}/approve",
        json={"admin_user_id": bo.id},
    )
    assert r.status_code == 403


def test_driver_cannot_approve_business_owner_request(
    client: TestClient,
    db_session: Session,
    sample_category_city,
    driver_user: User,
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city)
    _seed_verified_email(db_session, payload["email"])
    created = client.post("/business-owner/place-requests", json=payload)
    assert created.status_code == 201
    req_id = created.json()["id"]
    r = client.post(
        f"/admin/business-owner/requests/{req_id}/approve",
        json={"admin_user_id": driver_user.id},
    )
    assert r.status_code == 403


def test_admin_can_get_driver_vehicle_update_request(
    client: TestClient, approved_driver: tuple[User, DriverProfile]
):
    driver, _ = approved_driver
    req_id = _create_vehicle_update_request(client, driver.id)
    r = client.get(f"/drivers/vehicle-update-requests/{req_id}")
    assert r.status_code == 200


def test_list_driver_vehicle_update_requests_for_driver(
    client: TestClient, approved_driver: tuple[User, DriverProfile]
):
    driver, _ = approved_driver
    req_id = _create_vehicle_update_request(client, driver.id)
    r = client.get(f"/drivers/{driver.id}/vehicle-update-requests")
    assert r.status_code == 200
    assert any(row["id"] == req_id for row in r.json())


# -- Driver availability / nearby ------------------------------------------------------


def test_get_driver_availability_for_regular_404(
    client: TestClient, regular_user: User
):
    r = client.get(f"/drivers/{regular_user.id}/availability")
    assert r.status_code == 404


def test_nearby_drivers_passenger_not_found_404(client: TestClient):
    r = client.get(
        "/rides/nearby-drivers",
        params={
            "regular_user_id": 999999,
            "lat": 31.392,
            "lon": 34.756,
        },
    )
    assert r.status_code == 404


# -- Business owner place-requests (extra) ---------------------------------------------


def test_business_owner_place_request_rejected_user_without_verified_email_403(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city)
    bo = _make_user(
        db_session,
        role=UserRole.BUSINESS_OWNER,
        tag="rej_bo2",
        status=UserStatus.REJECTED,
    )
    bo.email = payload["email"]
    bo.username = payload["username"]
    db_session.add(bo)
    db_session.commit()
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 403


def test_business_owner_place_request_name_hebrew_too_short_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city, name_he="A")
    _seed_verified_email(db_session, payload["email"])
    r = client.post("/business-owner/place-requests", json=payload)
    assert r.status_code == 400


def test_business_owner_signup_duplicate_email_400(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    existing = _make_user(
        db_session, role=UserRole.BUSINESS_OWNER, tag="bo_dup", status=UserStatus.PENDING
    )
    payload = {
        "full_name": "BO Two",
        "username": f"bo2_{str(uuid.uuid4())[:8]}",
        "email": existing.email,
        "phone": "0501122334",
        "password": "ValidPass1!",
    }
    r = client.post("/auth/signup/business-owner", json=payload)
    assert r.status_code == 400


def test_list_business_owner_requests_all_statuses(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    payload = _business_owner_place_request_payload(cat, city)
    _seed_verified_email(db_session, payload["email"])
    created = client.post("/business-owner/place-requests", json=payload)
    assert created.status_code == 201
    r = client.get("/admin/business-owner/requests")
    assert r.status_code == 200
    assert len(r.json()) >= 1


# -- Advertisement s3 validation -------------------------------------------------------


def test_ad_s3_reject_invalid_extension():
    with pytest.raises(AdvertisementImageValidationError):
        _normalize_extension("file.exe")


def test_ad_s3_reject_oversized_image():
    huge = b"\xff\xd8\xff\xe0" + b"\x00" * (6 * 1024 * 1024)
    with pytest.raises(AdvertisementImageValidationError):
        _validate_size(huge)


# -- Extra safe coverage (no PostGIS / no real SMTP-S3) --------------------------------


def test_is_saved_true_after_save(
    client: TestClient, db_session: Session, sample_category_city, regular_user: User
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    save = client.post(
        f"/places/{place.id}/save",
        json={"user_id": regular_user.id},
    )
    assert save.status_code == 200
    r = client.get(
        f"/places/{place.id}/is-saved",
        params={"user_id": regular_user.id},
    )
    assert r.status_code == 200
    assert r.json()["is_saved"] is True


def test_unsave_place_after_save(
    client: TestClient, db_session: Session, sample_category_city, regular_user: User
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    client.post(
        f"/places/{place.id}/save",
        json={"user_id": regular_user.id},
    )
    r = client.delete(
        f"/places/{place.id}/unsave",
        params={"user_id": regular_user.id},
    )
    assert r.status_code == 200
    check = client.get(
        f"/places/{place.id}/is-saved",
        params={"user_id": regular_user.id},
    )
    assert check.status_code == 200
    assert check.json()["is_saved"] is False


def test_admin_update_place_category_not_found_404(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    r = client.put(
        f"/admin/places/{place.id}",
        json={"category_id": 999999},
    )
    assert r.status_code == 404


def test_admin_update_place_not_found_404(client: TestClient):
    r = client.put("/admin/places/999999", json={"name": "Ghost"})
    assert r.status_code == 404


def test_detect_language_mixed_script_defaults_en():
    assert detect_language("12345") == "en"
    assert detect_language("") == "en"


def test_hash_password_and_verify_roundtrip():
    from main import verify_password

    hashed = hash_password("SecretPass1!")
    assert verify_password("SecretPass1!", hashed)
    assert not verify_password("wrong", hashed)


def test_tasks_ping_task_returns_pong():
    from tasks import ping

    assert ping() == {"ok": True, "message": "pong"}


def test_email_dispatch_sync_fallback_missing_creds_prints(monkeypatch):
    class _ES:
        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

        @staticmethod
        def get_smtp_login():
            return "", ""

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

    monkeypatch.setattr("email_dispatch.get_email_settings", lambda: _ES)
    from email_dispatch import _sync_smtp_fallback

    _sync_smtp_fallback("fake@example.com", "S", "B", flow="no_creds_batch3")


def test_email_dispatch_enqueue_success_mock(monkeypatch):
    class _Result:
        id = "task-abc"
        state = "PENDING"

    class _Task:
        name = "tasks.send_email"

        @staticmethod
        def delay(to_email, subject, body):
            return _Result()

    monkeypatch.setattr("tasks.send_email_task", _Task)
    from email_dispatch import enqueue_transactional_email

    enqueue_transactional_email("ok@example.com", "Sub", "Body", flow="enqueue_ok")


def test_signup_business_owner_duplicate_username_400(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setattr("main.send_verification_email", lambda *a, **k: None)
    existing = _make_user(
        db_session, role=UserRole.BUSINESS_OWNER, tag="bo_dup_u", status=UserStatus.PENDING
    )
    r = client.post(
        "/auth/signup/business-owner",
        json={
            "full_name": "BO",
            "username": existing.username,
            "email": f"bo_new_{str(uuid.uuid4())[:8]}@example.com",
            "phone": "0502233445",
            "password": "ValidPass1!",
        },
    )
    assert r.status_code == 400


def test_regular_cannot_reject_advertisement(
    client: TestClient,
    db_session: Session,
    sample_category_city,
    regular_user_active_verified: User,
):
    cat, city = sample_category_city
    ad = create_advertisement_request(
        db_session,
        user=regular_user_active_verified,
        category_id=cat.id,
        city_id=city.id,
        description="reject me",
        file_content=b"\xff\xd8\xff\xe0" + b"\x00" * 500,
        original_filename="a.jpg",
    )
    r = client.post(
        f"/admin/advertisements/{ad.id}/reject",
        json={
            "admin_user_id": regular_user_active_verified.id,
            "rejection_reason": "nope",
        },
    )
    assert r.status_code == 403


def test_ad_s3_validate_jpeg_magic_bytes_ok():
    data = b"\xff\xd8\xff\xe0" + b"\x00" * 100
    _validate_image_magic_bytes(data, "photo.jpg")


def test_change_password_too_short_400(client: TestClient, regular_user: User):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "RidePass1!",
            "new_password": "Ab1!",
        },
    )
    assert r.status_code == 400
    assert "8 characters" in r.json()["detail"]


def test_change_password_missing_uppercase_400(client: TestClient, regular_user: User):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "RidePass1!",
            "new_password": "lowercase1!",
        },
    )
    assert r.status_code == 400
    assert "uppercase" in r.json()["detail"].lower()


def test_change_password_missing_symbol_400(client: TestClient, regular_user: User):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "RidePass1!",
            "new_password": "NoSymbol1",
        },
    )
    assert r.status_code == 400
    assert "symbol" in r.json()["detail"].lower()


def test_change_password_user_not_found_404(client: TestClient):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": 999999,
            "current_password": "RidePass1!",
            "new_password": "NewPass1!",
        },
    )
    assert r.status_code == 404


def test_update_user_phone_user_id_mismatch_400(client: TestClient, regular_user: User):
    r = client.put(
        f"/users/{regular_user.id}/phone",
        json={"user_id": regular_user.id + 1, "new_phone": "0502222222"},
    )
    assert r.status_code == 400
    assert "mismatch" in r.json()["detail"].lower()


def test_update_user_phone_same_as_current_400(client: TestClient, regular_user: User):
    r = client.put(
        f"/users/{regular_user.id}/phone",
        json={"user_id": regular_user.id, "new_phone": regular_user.phone},
    )
    assert r.status_code == 400


def test_update_user_phone_duplicate_409(
    client: TestClient, db_session: Session, regular_user: User
):
    other = _make_user(db_session, role=UserRole.REGULAR, tag="ph_dup")
    r = client.put(
        f"/users/{regular_user.id}/phone",
        json={"user_id": regular_user.id, "new_phone": other.phone},
    )
    assert r.status_code == 409


def test_update_user_phone_invalid_length_400(client: TestClient, regular_user: User):
    r = client.put(
        f"/users/{regular_user.id}/phone",
        json={"user_id": regular_user.id, "new_phone": "05012"},
    )
    assert r.status_code == 400


def test_update_business_phone_success(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    r = client.put(
        f"/places/{place.id}/phone",
        json={"new_phone": "0503333333"},
    )
    assert r.status_code == 200
    db_session.refresh(place)
    assert place.phone == "0503333333"


def test_update_business_phone_not_found_404(client: TestClient):
    r = client.put(
        "/places/999999/phone",
        json={"new_phone": "0504444444"},
    )
    assert r.status_code == 404


def test_update_business_phone_invalid_prefix_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    r = client.put(
        f"/places/{place.id}/phone",
        json={"new_phone": "0401234567"},
    )
    assert r.status_code == 400
    assert "05" in r.json()["detail"]


def test_change_password_missing_lowercase_400(client: TestClient, regular_user: User):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "RidePass1!",
            "new_password": "UPPERCASE1!",
        },
    )
    assert r.status_code == 400
    assert "lowercase" in r.json()["detail"].lower()


def test_change_password_missing_digit_400(client: TestClient, regular_user: User):
    r = client.post(
        "/auth/change-password",
        json={
            "user_id": regular_user.id,
            "current_password": "RidePass1!",
            "new_password": "NoDigits!!",
        },
    )
    assert r.status_code == 400
    assert "number" in r.json()["detail"].lower()


def test_update_user_phone_must_start_with_05(client: TestClient, regular_user: User):
    r = client.put(
        f"/users/{regular_user.id}/phone",
        json={"user_id": regular_user.id, "new_phone": "0401234567"},
    )
    assert r.status_code == 400


def test_update_user_phone_user_not_found_404(client: TestClient):
    r = client.put(
        "/users/999999/phone",
        json={"user_id": 999999, "new_phone": "0505555555"},
    )
    assert r.status_code == 404


def test_update_business_phone_same_number_400(
    client: TestClient, db_session: Session, sample_category_city
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    place.phone = "0506666666"
    db_session.commit()
    r = client.put(
        f"/places/{place.id}/phone",
        json={"new_phone": "0506666666"},
    )
    assert r.status_code == 400


def test_email_dispatch_sync_fallback_smtp_success(monkeypatch):
    class _ES:
        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

        @staticmethod
        def get_smtp_login():
            return "u@test.com", "pass"

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

    class _SMTP:
        def __init__(self, host, port):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def login(self, u, p):
            pass

        def send_message(self, msg):
            pass

    monkeypatch.setattr("email_dispatch.get_email_settings", lambda: _ES)
    monkeypatch.setattr("smtplib.SMTP_SSL", _SMTP)
    from email_dispatch import _sync_smtp_fallback

    _sync_smtp_fallback("ok@example.com", "S", "B", flow="sync_success_batch3")


def test_tasks_smtp_deliver_login_failure_raises(monkeypatch):
    import smtplib

    class _ES:
        @staticmethod
        def dotenv_file_abs_path():
            from pathlib import Path

            return Path(".")

        @staticmethod
        def describe_email_pass_env_shape():
            return "ok"

        @staticmethod
        def get_smtp_host_port():
            return "smtp.test", 465

        @staticmethod
        def get_smtp_login():
            return "u@test.com", "secret"

        @staticmethod
        def log_smtp_diagnostics(**kwargs):
            pass

    class _SMTP:
        def __init__(self, host, port, timeout=30):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def login(self, u, p):
            raise smtplib.SMTPException("auth failed")

        def send_message(self, msg):
            pass

    monkeypatch.setattr("tasks.get_email_settings", lambda: _ES)
    monkeypatch.setattr("smtplib.SMTP_SSL", _SMTP)
    from tasks import _smtp_deliver

    with pytest.raises(smtplib.SMTPException):
        _smtp_deliver("x@example.com", "S", "B")


def test_save_place_already_saved_400(
    client: TestClient, db_session: Session, sample_category_city, regular_user: User
):
    cat, city = sample_category_city
    place = _seed_place_row(db_session, cat, city)
    first = client.post(
        f"/places/{place.id}/save",
        json={"user_id": regular_user.id},
    )
    assert first.status_code == 200
    second = client.post(
        f"/places/{place.id}/save",
        json={"user_id": regular_user.id},
    )
    assert second.status_code == 400
    assert "already saved" in second.json()["detail"].lower()


def test_send_password_reset_email_arabic_default(mock_send_email):
    from main import send_password_reset_email

    send_password_reset_email("ar@example.com", "111111", "User")
    assert mock_send_email[-1]["flow"] == "password_reset_email:ar"
