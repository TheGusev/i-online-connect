/**
 * Выдача роли администратора существующему пользователю + привязка TOTP.
 *
 * Публичная регистрация роль не выдаёт никогда: первый админ появляется
 * только этой командой, вручную, на сервере. Заодно генерируется секрет
 * второго фактора: QR печатается прямо в терминал (ASCII), никуда не
 * отправляется и в базе лежит зашифрованным (AES-256-GCM,
 * ключ TOTP_ENCRYPTION_KEY).
 *
 * Запуск:
 *   npm run grant-admin -- admin@example.com            (роль + новый TOTP)
 *   npm run grant-admin -- admin@example.com --keep-totp (роль, TOTP не менять)
 *   npm run grant-admin -- admin@example.com --revoke    (снять роль и TOTP)
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { authenticator } from "otplib";
import qrcode from "qrcode-terminal";
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
const keepTotp = args.includes("--keep-totp");
const email = args.find((value) => !value.startsWith("--"));

if (!email) {
  console.error("[grant-admin] Укажите email: npm run grant-admin -- admin@example.com");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("[grant-admin] DATABASE_URL не задан. См. server/.env.example");
  process.exit(1);
}

const encryptionKey = process.env.TOTP_ENCRYPTION_KEY ?? "";
const needTotp = !revoke && !keepTotp;
if (needTotp && encryptionKey.length < 32) {
  console.error(
    "[grant-admin] TOTP_ENCRYPTION_KEY не задан или короче 32 символов.\n" +
      "  Сгенерируйте ключ:  openssl rand -base64 48\n" +
      "  и добавьте в server/.env, затем повторите команду.",
  );
  process.exit(1);
}

/** AES-256-GCM, формат v1:<iv>:<tag>:<ciphertext> — как в src/security/secret-box.ts. */
function encryptSecret(plain, keySource) {
  const key = createHash("sha256").update(keySource, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  let secret = null;
  let uri = null;
  let encrypted = null;

  if (needTotp) {
    authenticator.options = { step: 30 };
    secret = authenticator.generateSecret(20);
    uri = authenticator.keyuri(email, "Я Онлайн", secret);
    encrypted = encryptSecret(secret, encryptionKey);
  }

  // revoke снимает и роль, и второй фактор: аккаунт возвращается к обычному.
  const { rows } = await client.query(
    `UPDATE users
        SET role = $2,
            totp_secret = CASE
              WHEN $3::boolean THEN NULL
              WHEN $4::text IS NOT NULL THEN $4
              ELSE totp_secret END,
            totp_confirmed_at = CASE
              WHEN $3::boolean THEN NULL
              WHEN $4::text IS NOT NULL THEN now()
              ELSE totp_confirmed_at END,
            updated_at = now()
      WHERE email = $1 AND deleted_at IS NULL
      RETURNING id, email, role, (totp_secret IS NOT NULL) AS has_totp`,
    [email, revoke ? "user" : "admin", revoke, encrypted],
  );

  if (rows.length === 0) {
    console.error(
      `[grant-admin] Пользователь ${email} не найден. Сначала зарегистрируйте аккаунт в приложении.`,
    );
    process.exitCode = 1;
  } else {
    const user = rows[0];
    console.log(`[grant-admin] ${user.email} → role=${user.role} (id=${user.id})`);

    if (secret) {
      console.log("\n  Отсканируйте QR в Google Authenticator / Яндекс.Ключе:\n");
      qrcode.generate(uri, { small: true });
      console.log(`  Код вручную: ${secret}`);
      console.log(
        "\n  Секрет показан один раз и больше не выводится: в базе он зашифрован.\n" +
          "  Потеряли — выполните команду заново, старый код перестанет работать.\n",
      );
    } else if (!revoke && !user.has_totp) {
      console.warn(
        "[grant-admin] Внимание: у аккаунта нет привязанного TOTP — войти в админку нельзя.\n" +
          "  Запустите команду без --keep-totp.",
      );
    }
  }
} finally {
  await client.end();
}

