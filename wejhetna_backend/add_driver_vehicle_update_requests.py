"""
Creates driver_vehicle_update_requests table and vehicle_update_blocked column
on driver_profiles.

Usage:
    python add_driver_vehicle_update_requests.py
"""
from sqlalchemy import text

from db import engine
from models import DriverVehicleUpdateRequest


def main() -> None:
    DriverVehicleUpdateRequest.__table__.create(bind=engine, checkfirst=True)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                ALTER TABLE driver_profiles
                ADD COLUMN IF NOT EXISTS vehicle_update_blocked BOOLEAN NOT NULL DEFAULT FALSE
                """
            )
        )

    print("Driver vehicle update request storage ensured.")


if __name__ == "__main__":
    main()
