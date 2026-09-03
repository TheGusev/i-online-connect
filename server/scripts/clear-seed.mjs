/**
 * Полная очистка демо-контента: одна команда — и в базе остаются только
 * реальные люди, объявления и сообщества.
 *
 * Удаляем демо-аккаунты (каскад уносит их анкеты, медиа, объявления,
 * участие в сообществах и сообщения), затем добиваем осиротевшие записи
 * с is_seed = true, если демо создавали вручную.
 *
 * Запуск: npm run seed:clear
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  const raw = await readFile(path.join(here, "..", ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* .env может отсутствовать */
}

if (!process.env.DATABASE_URL) {
  console.error("[seed:clear] DATABASE_URL не задан");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");

  // Сообщества ведут демо-хосты: host_id стоит ON DELETE RESTRICT,
  // поэтому сначала убираем сами сообщества.
  const spaces = await client.query("DELETE FROM spaces WHERE is_seed RETURNING id");
  const listings = await client.query("DELETE FROM listings WHERE is_seed RETURNING id");
  const messages = await client.query("DELETE FROM space_messages WHERE is_seed RETURNING id");
  const needs = await client.query("DELETE FROM user_needs WHERE is_seed RETURNING user_id");
  const users = await client.query(
    "DELETE FROM users WHERE email LIKE '%@seed.local' RETURNING id",
  );

  await client.query("COMMIT");

  console.log("[seed:clear] демо-контент удалён");
  console.log(`  анкеты: ${users.rowCount}`);
  console.log(`  объявления: ${listings.rowCount}`);
  console.log(`  сообщества: ${spaces.rowCount}`);
  console.log(`  сообщения сообществ: ${messages.rowCount}`);
  console.log(`  потребности: ${needs.rowCount}`);
} catch (cause) {
  await client.query("ROLLBACK");
  console.error("[seed:clear] ошибка:", cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
  await client.end();
}
