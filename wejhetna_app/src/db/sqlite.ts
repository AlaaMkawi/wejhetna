/**
 * Offline SQLite entry point.
 * Uses react-native-nitro-sqlite (Nitro Modules).
 * Key-value rows live in `kv_store` (see `offlineKv.ts`).
 */
import { open, type NitroSQLiteConnection } from "react-native-nitro-sqlite";

/** Database file name (app documents / files directory per platform). */
export const OFFLINE_DB_NAME = "wejhetna.sqlite";

let connection: NitroSQLiteConnection | null = null;

export function getOfflineSQLite(): NitroSQLiteConnection {
  if (connection == null) {
    connection = open({ name: OFFLINE_DB_NAME });
  }
  return connection;
}
