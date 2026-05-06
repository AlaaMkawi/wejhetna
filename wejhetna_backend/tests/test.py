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
from main import app, hash_password
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
    Location,
    OwnerPlaceRequestStatus,
    Place,
    PlaceType,
    RideRequest,
    RideRequestStatus,
    User,
    UserRole,
    UserStatus,
    VehicleStatus,
)
from services.advertisement_s3_upload import AdvertisementImageUploadResult
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
    if "car_photos_urls" in models.DriverVehicle.__table__.c:
        col = models.DriverVehicle.__table__.c.car_photos_urls
        col.type = Text()
        col.nullable = True


# Backwards-compat alias (older tests/imports may reference the original name).
_patch_city_boundary_for_sqlite = _patch_pg_only_columns_for_sqlite


def _create_ad_tables(engine) -> None:
    _patch_pg_only_columns_for_sqlite()
    User.__table__.create(engine, checkfirst=True)
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
    DriverAvailability.__table__.create(engine, checkfirst=True)
    RideRequest.__table__.create(engine, checkfirst=True)
    DriverRating.__table__.create(engine, checkfirst=True)
    DriverReport.__table__.create(engine, checkfirst=True)


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
    assert r.json() == {"is_available": False}


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
