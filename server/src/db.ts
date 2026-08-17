/**
 * Пул соединений с PostgreSQL.
 *
 * Правило: только параметризованные запросы ($1, $2, ...).
 * Никогда не склеивайте SQL со строками из запроса пользователя —
 * это прямой путь к SQL-инъекции.
 */
import pg from "pg";

import { env } from "./env.ts";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Локальный Postgres по loopback — TLS не нужен.
  // Для внешней БД: ssl: { rejectUnauthorized: true }
});

pool.on("error", (error) => {
  console.error("[db] Ошибка простаивающего соединения:", error.message);
});

export type SqlParam = string | number | boolean | null | Date | string[];

/** Запрос со множеством строк. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

/** Запрос, от которого ожидается одна строка (или её отсутствие). */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Несколько запросов в одной транзакции. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function healthcheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
