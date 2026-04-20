-- Run once against your DB if tables already exist without these columns.
-- PostgreSQL:
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS passenger_verification_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS verification_failed_attempts INTEGER NOT NULL DEFAULT 0;

-- SQLite (run separately if needed; IF NOT EXISTS may not apply to columns on older SQLite):
-- ALTER TABLE ride_requests ADD COLUMN passenger_verification_unlocked BOOLEAN NOT NULL DEFAULT 0;
-- ALTER TABLE ride_requests ADD COLUMN verification_failed_attempts INTEGER NOT NULL DEFAULT 0;
