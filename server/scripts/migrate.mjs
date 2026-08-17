/**
 * Прогон SQL-миграций из server/migrations в алфавитном порядке.
 *
 * Каждая миграция применяется один раз: имя пишется в таблицу
 * schema_migrations. Файл выполняется целиком в одной транзакции —
 * если что-то упало, БД остаётся в прежнем состоянии.
 *
 * Запуск:  npm run migrate       (нужен DATABASE_URL в окружении или .env)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "migrations");

// Минимальный разбор .env, чтобы не тянуть зависимость.
async function loadEnvFile() {
  try {
    const raw = await readFile(path.join(here, "..", ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, value] = match;
      if (!(key in process.env)) process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env может отсутствовать — переменные придут из окружения */
  }
}

await loadEnvFile();

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL не задан. См. server/.env.example");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const applied = new Set(
  (await client.query("SELECT name FROM schema_migrations")).rows.map((row) => row.name),
);

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

let count = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`[migrate] пропуск (уже применено): ${file}`);
    continue;
  }
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  console.log(`[migrate] применяю: ${file}`);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    await client.query("COMMIT");
    count += 1;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`[migrate] ОШИБКА в ${file}:`, error.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`[migrate] готово. Применено миграций: ${count}`);
