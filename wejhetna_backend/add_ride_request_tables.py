from sqlalchemy import text
from db import engine
from models import DriverAvailability, RideRequest


def _ensure_status_column_is_varchar(conn) -> None:
    """Align ride_requests.status with String(32) model; fixes PG enum mismatch 5xx on INSERT/SELECT."""
    row = conn.execute(
        text(
            """
            SELECT data_type, udt_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'ride_requests' AND column_name = 'status'
            """
        )
    ).fetchone()
    if not row:
        return
    data_type, udt_name = row[0], row[1]
    if data_type in ("character varying", "text"):
        return
    conn.execute(text("ALTER TABLE ride_requests ALTER COLUMN status DROP DEFAULT"))
    conn.execute(
        text(
            """
            ALTER TABLE ride_requests
              ALTER COLUMN status TYPE VARCHAR(32)
              USING (
                CASE status::text
                  WHEN 'PENDING' THEN 'pending'
                  WHEN 'ACCEPTED' THEN 'accepted'
                  WHEN 'REJECTED' THEN 'rejected'
                  WHEN 'CANCELLED' THEN 'cancelled'
                  WHEN 'DRIVING_TO_CUSTOMER' THEN 'driving_to_customer'
                  WHEN 'pending' THEN 'pending'
                  WHEN 'accepted' THEN 'accepted'
                  WHEN 'rejected' THEN 'rejected'
                  WHEN 'cancelled' THEN 'cancelled'
                  WHEN 'driving_to_customer' THEN 'driving_to_customer'
                  ELSE 'pending'
                END
              )
            """
        )
    )
    conn.execute(text("ALTER TABLE ride_requests ALTER COLUMN status SET DEFAULT 'pending'"))


def main() -> None:
    DriverAvailability.__table__.create(bind=engine, checkfirst=True)
    RideRequest.__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS number_of_people INTEGER"))
        conn.execute(text("ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS number_of_seats_required INTEGER"))
        conn.execute(text("ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS eta_to_user INTEGER"))
        conn.execute(text("ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS estimated_trip_time INTEGER"))
        conn.execute(text("ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS verification_code VARCHAR(32)"))
        conn.execute(
            text("ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ")
        )
        _ensure_status_column_is_varchar(conn)
    print("Ride request tables ensured (driver_availability, ride_requests).")


if __name__ == "__main__":
    main()
