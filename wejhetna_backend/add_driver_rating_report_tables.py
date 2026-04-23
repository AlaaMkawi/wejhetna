"""
Creates the driver_ratings + driver_reports tables (and the DriverReportStatus
enum type in PostgreSQL) without touching any existing data.

Usage:
    python add_driver_rating_report_tables.py
"""
from sqlalchemy import text

from db import engine
from models import DriverRating, DriverReport


def main() -> None:
    # `create_all` with checkfirst=True is safe to re-run; it simply does nothing
    # if the tables / enum already exist.
    DriverRating.__table__.create(bind=engine, checkfirst=True)
    DriverReport.__table__.create(bind=engine, checkfirst=True)

    # Index on (ride_request_id, regular_user_id) — unique so each passenger can
    # only rate a ride once. create_all applies the unique index, but we make
    # sure it exists on older databases too.
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS
                  idx_driver_ratings_ride_regular
                ON driver_ratings (ride_request_id, regular_user_id)
                """
            )
        )

    print("Driver rating/report tables ensured.")


if __name__ == "__main__":
    main()
