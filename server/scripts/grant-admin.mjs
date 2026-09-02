/**
 * Выдача роли администратора существующему пользователю.
 *
 * Публичная регистрация роль не выдаёт никогда: первый админ появляется
 * только этой командой, вручную, на сервере.
 *
 * Запуск:
 *   npm run grant-admin -- admin@example.com
 *   npm run grant-admin -- admin@example.com --revoke   (снять роль)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

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

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((value) => !value.startsWith("--"));

if (!email) {
  console.error("[grant-admin] Укажите email: npm run grant-admin -- admin@example.com");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("[grant-admin] DATABASE_URL не задан. См. server/.env.example");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const { rows } = await client.query(
    `UPDATE users SET role = $2, updated_at = now()
      WHERE email = $1 AND deleted_at IS NULL
      RETURNING id, email, role`,
    [email, revoke ? "user" : "admin"],
  );

  if (rows.length === 0) {
    console.error(
      `[grant-admin] Пользователь ${email} не найден. Сначала зарегистрируйте аккаунт в приложении.`,
    );
    process.exitCode = 1;
  } else {
    const user = rows[0];
    console.log(`[grant-admin] ${user.email} → role=${user.role} (id=${user.id})`);
  }
} finally {
  await client.end();
}
