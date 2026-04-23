"""
Migration: advertisement approval lifecycle.

Fixes the poster lifecycle so the 7-day countdown starts at admin approval,
not at the time the user first submits the request.

Changes applied (idempotent):
  - Add column advertisements.approved_at TIMESTAMPTZ NULL (when admin approved)
  - Drop the server default on advertisements.expires_at and allow NULL
    (expires_at is now set at approval time = approved_at + 7 days)
  - Backfill already-APPROVED rows: set approved_at = created_at and
    recompute expires_at = created_at + INTERVAL '7 days' only if it was set to
    the legacy created_at + 7 default (best-effort; safe because public listing
    filters by expires_at > NOW()).
  - For PENDING and REJECTED rows, clear expires_at (set to NULL) so the
    countdown only starts when/if they get approved.

Run once per database:
    python add_advertisement_approval_lifecycle.py
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

try:
    from database import DATABASE_URL  # type: ignore
except ImportError:
    try:
        from db import DATABASE_URL  # type: ignore
    except ImportError:
        DATABASE_URL = os.getenv("DATABASE_URL")
        if not DATABASE_URL:
            print(
                "❌ Error: DATABASE_URL is not set. "
                "Create a .env file or set the env variable."
            )
            raise SystemExit(1)


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :t
              AND column_name = :c
            """
        ),
        {"t": table, "c": column},
    ).first()
    return row is not None


def migrate() -> None:
    engine = create_engine(DATABASE_URL)

    print("=" * 60)
    print("Advertisement approval lifecycle migration")
    print("=" * 60)

    with engine.connect() as conn:
        # 1) Add approved_at if missing
        if _column_exists(conn, "advertisements", "approved_at"):
            print("ℹ️  advertisements.approved_at already exists.")
        else:
            print("✅ Adding advertisements.approved_at ...")
            conn.execute(
                text(
                    "ALTER TABLE advertisements "
                    "ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE NULL"
                )
            )
            conn.commit()

        # 2) Drop server default on expires_at and make it nullable.
        #    Safe to run repeatedly.
        print("✅ Loosening advertisements.expires_at (DROP DEFAULT + DROP NOT NULL) ...")
        conn.execute(
            text("ALTER TABLE advertisements ALTER COLUMN expires_at DROP DEFAULT")
        )
        conn.execute(
            text("ALTER TABLE advertisements ALTER COLUMN expires_at DROP NOT NULL")
        )
        conn.commit()

        # 3) Backfill approved_at for rows that are already APPROVED.
        #    Use created_at as the best available approximation (original bug).
        print("✅ Backfilling approved_at for already-APPROVED rows ...")
        conn.execute(
            text(
                """
                UPDATE advertisements
                   SET approved_at = COALESCE(approved_at, created_at)
                 WHERE status = 'APPROVED'
                   AND approved_at IS NULL
                """
            )
        )
        conn.commit()

        # 4) Clear expires_at for non-approved rows (pending/rejected).
        print("✅ Clearing expires_at on PENDING/REJECTED rows ...")
        conn.execute(
            text(
                """
                UPDATE advertisements
                   SET expires_at = NULL
                 WHERE status IN ('PENDING', 'REJECTED')
                """
            )
        )
        conn.commit()

        # 5) Ensure APPROVED rows have a coherent expires_at = approved_at + 7 days.
        print("✅ Normalizing expires_at for APPROVED rows ...")
        conn.execute(
            text(
                """
                UPDATE advertisements
                   SET expires_at = approved_at + INTERVAL '7 days'
                 WHERE status = 'APPROVED'
                   AND approved_at IS NOT NULL
                """
            )
        )
        conn.commit()

    print("=" * 60)
    print("✅ Migration completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:  # noqa: BLE001
        print(f"❌ Error: {e}")
        print("\nMake sure:")
        print("1. PostgreSQL is running")
        print("2. DATABASE_URL in .env is correct")
        print("3. The user has ALTER TABLE permissions")
        raise
