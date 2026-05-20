/**
 * Simple key-value persistence in offline SQLite (`kv_store` table).
 */
import { getOfflineSQLite } from "./sqlite";

const KV_TABLE = "kv_store";
let schemaReady = false;

function ensureKvSchema(): void {
  if (schemaReady) return;
  getOfflineSQLite().execute(
    `CREATE TABLE IF NOT EXISTS ${KV_TABLE} (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`
  );
  schemaReady = true;
}

export function kvGet(key: string): string | null {
  ensureKvSchema();
  const result = getOfflineSQLite().execute<{ value: string }>(
    `SELECT value FROM ${KV_TABLE} WHERE key = ? LIMIT 1`,
    [key]
  );
  return result.rows.item(0)?.value ?? null;
}

export function kvSet(key: string, value: string): void {
  ensureKvSchema();
  getOfflineSQLite().execute(
    `INSERT INTO ${KV_TABLE} (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export function kvDelete(key: string): void {
  ensureKvSchema();
  getOfflineSQLite().execute(`DELETE FROM ${KV_TABLE} WHERE key = ?`, [key]);
}

export function kvClearAll(): void {
  ensureKvSchema();
  getOfflineSQLite().execute(`DELETE FROM ${KV_TABLE}`);
}
