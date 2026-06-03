# Backend testing guide (Wejhetna)

## Quick start

From `wejhetna_backend/`:

```powershell
pip install -r requirements.txt -r requirements-dev.txt
```

Required dev packages (in `requirements-dev.txt`):

| Package | Why |
|---------|-----|
| `pytest` | Test runner |
| `httpx` | FastAPI `TestClient` |
| `email-validator` | Pydantic `EmailStr` schemas |
| `python-multipart` | FastAPI file upload routes at import time |
| `pytest-cov` | Coverage plugin |
| `coverage` | Coverage reports |

## Run tests

All backend tests live in a **single file**:

```powershell
python -m pytest tests/test.py -v
```

Shorthand (same thing — `pytest.ini` uses `testpaths = tests`):

```powershell
python -m pytest -v
```

Tests use **in-memory SQLite** and `WEJHETNA_SKIP_DB_CREATE_ALL=1`. They never touch production Postgres, real email, or S3.

## Coverage

```powershell
python -m pytest tests/test.py --cov=. --cov-config=.coveragerc --cov-report=term-missing
```

HTML report:

```powershell
python -m pytest tests/test.py --cov=. --cov-config=.coveragerc --cov-report=html
```

Open `htmlcov/index.html` in a browser.

## Coverage scope (`.coveragerc`)

Omitted from coverage totals (one-off scripts / tooling, not the running API):

- `add_*.py`, `fix_*.py`, `seed_*.py`, `check_*.py`, `ensure_*.py`
- `create_admin.py`, `init_db.py`, `newplaces.py`, `search_laqiya.py`
- `celery_app.py`

## What `tests/test.py` covers

- Auth login and regular signup validation
- Advertisement service + HTTP lifecycle
- Full ride lifecycle, cancellations, OTP, availability
- Ratings, reports, admin report review
- Driver / business-owner admin approve & reject
- Vehicle update requests (`vehicle_update_blocked`, approve/reject)
- Role permissions (non-admin cannot call admin APIs)
- Places smoke tests (DB + 404; no PostGIS response on SQLite)

## Mocks

- **Email:** `mock_admin_status_email` fixture; signup uses pre-seeded `EmailVerification`
- **S3:** `mock_s3_ad_upload` fixture for advertisements
- **No internet** in test runs

## Files in this setup

| File | Purpose |
|------|---------|
| `tests/test.py` | All tests + fixtures |
| `pytest.ini` | Pytest config |
| `.coveragerc` | Coverage omit/report settings |
| `requirements-dev.txt` | Test dependencies |
| `TESTING.md` | This guide |
