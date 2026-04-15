"""
Migration: advertisements table (Advertisement model, AdvertisementStatus enum).

Creates (when the table does not exist yet):
  - PostgreSQL enum: advertisementstatus ('PENDING', 'APPROVED', 'REJECTED')
  - Table advertisements with columns (in order):
      id, user_id, image_url, image_key, category_id, city_id, description,
      status, created_at, expires_at
  - Foreign keys: user_id -> users(id), category_id -> categories(id), city_id -> cities(id)
  - Defaults: status PENDING, created_at now(), expires_at now() + 7 days

Indexes:
  - idx_advertisements_status (status)
  - idx_advertisements_city_id (city_id)
  - idx_advertisements_category_id (category_id)
  - idx_advertisements_expires_at (expires_at)

Future S3: store advertisement assets only under the key prefix "advertisements/";
do not reuse generic "uploads/" or business/place upload paths.

If the table already exists, enum/table creation is skipped; missing indexes are still
created (CREATE INDEX IF NOT EXISTS).

Run once per database:
    python add_advertisements_table.py
"""

from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

try:
    from database import DATABASE_URL
except ImportError:
    try:
        from db import DATABASE_URL
    except ImportError:
        DATABASE_URL = os.getenv("DATABASE_URL")
        if not DATABASE_URL:
            print(
                "❌ Error: DATABASE_URL is not set. Please create a .env file or set an environment variable."
            )
            exit(1)


INDEX_DDL = (
    "CREATE INDEX IF NOT EXISTS idx_advertisements_status ON advertisements (status)",
    "CREATE INDEX IF NOT EXISTS idx_advertisements_city_id ON advertisements (city_id)",
    "CREATE INDEX IF NOT EXISTS idx_advertisements_category_id ON advertisements (category_id)",
    "CREATE INDEX IF NOT EXISTS idx_advertisements_expires_at ON advertisements (expires_at)",
)


def _ensure_indexes(conn):
    for stmt in INDEX_DDL:
        # "CREATE INDEX IF NOT EXISTS <name> ON ..."
        idx_name = stmt.split()[5]
        print(f"✅ {idx_name}...")
        conn.execute(text(stmt))
        conn.commit()


def migrate():
    engine = create_engine(DATABASE_URL)

    print("=" * 60)
    print("Advertisements migration (table + indexes)")
    print("=" * 60)

    with engine.connect() as conn:
        check = text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'advertisements'
            )
            """
        )
        table_exists = conn.execute(check).scalar()

        if table_exists:
            print("⚠️  Table 'advertisements' already exists. Skipping enum/table DDL.")
            print("   Ensuring indexes exist...")
            _ensure_indexes(conn)
            print("=" * 60)
            print("✅ Done (indexes verified).")
            print("=" * 60)
            return

        print("✅ Creating enum type advertisementstatus...")
        conn.execute(
            text(
                """
                DO $$ BEGIN
                    CREATE TYPE advertisementstatus AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END $$;
                """
            )
        )
        conn.commit()

        print("✅ Creating table advertisements...")
        conn.execute(
            text(
                """
                CREATE TABLE advertisements (
                    id SERIAL NOT NULL,
                    user_id INTEGER NOT NULL REFERENCES users (id),
                    image_url TEXT NOT NULL,
                    image_key VARCHAR NOT NULL,
                    category_id INTEGER NOT NULL REFERENCES categories (id),
                    city_id INTEGER NOT NULL REFERENCES cities (id),
                    description TEXT,
                    status advertisementstatus NOT NULL DEFAULT 'PENDING'::advertisementstatus,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days') NOT NULL,
                    PRIMARY KEY (id)
                )
                """
            )
        )
        conn.commit()

        print("✅ Creating indexes...")
        _ensure_indexes(conn)

    print("=" * 60)
    print("✅ Migration completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\nMake sure:")
        print("1. PostgreSQL is running")
        print("2. DATABASE_URL in .env is correct")
        print("3. You have permission to create tables and types")
