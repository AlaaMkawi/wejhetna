/**
 * Typed key-value storage in the offline SQLite DB (single table).
 * Used for small JSON snapshots (navigation route, profile cache).
 */
import { getOfflineSQLite } from "./sqlite";

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;
  const db = getOfflineSQLite();
  db.execute(
    "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"
  );
  schemaReady = true;
}

export function kvGet(key: string): string | null {
  ensureSchema();
  const r = getOfflineSQLite().execute("SELECT value FROM kv_store WHERE key = ?", [key]);
  if (r.rows.length === 0) return null;
  const row = r.rows.item(0);
  if (!row || row.value == null) return null;
  return String(row.value);
}

export function kvSet(key: string, value: string): void {
  ensureSchema();
  getOfflineSQLite().execute(
    "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
    [key, value]
  );
}

export function kvDelete(key: string): void {
  ensureSchema();
  getOfflineSQLite().execute("DELETE FROM kv_store WHERE key = ?", [key]);
}

/** Clears all offline KV data (call on logout). */
export function kvClearAll(): void {
  ensureSchema();
  getOfflineSQLite().execute("DELETE FROM kv_store");
}
