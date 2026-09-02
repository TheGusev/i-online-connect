/**
 * Собирает статический SPA-бандл для раздачи через Nginx.
 *
 * Запускается после `vite build --config vite.config.static.ts`
 * (см. npm-скрипт `build:static` и DEPLOY.md).
 *
 * Что делает:
 *   1. копирует клиентские артефакты из dist/client в dist/static;
 *   2. кладёт пререндеренный SPA-шелл (_shell.html) как index.html;
 *   3. удаляет служебные файлы, которые статике не нужны.
 *
 * Результат — dist/static: только статика, Node.js в рантайме не требуется.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const clientDir = path.join(root, "dist", "client");
const outDir = path.join(root, "dist", "static");
const shellPath = path.join(clientDir, "_shell.html");

/**
 * Версия сборки: короткий git-хэш, а если git недоступен (сборка из архива) —
 * timestamp. Значение попадает в dist/static/version.json; открытые вкладки
 * опрашивают этот файл и предлагают обновиться (см. src/hooks/useAppVersion.ts).
 */
function buildVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return `ts-${Date.now()}`;
  }
}

function fail(message) {
  console.error(`[build-static] ${message}`);
  process.exit(1);
}

async function main() {
  if (!existsSync(clientDir)) {
    fail("dist/client не найден — сначала выполните `npm run build:static`.");
  }
  if (!existsSync(shellPath)) {
    fail(
      "dist/client/_shell.html не найден: SPA-шелл не был пререндерен. " +
        "Убедитесь, что сборка идёт с конфигом vite.config.static.ts.",
    );
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(clientDir, outDir, { recursive: true });

  const shell = await readFile(shellPath, "utf8");
  await writeFile(path.join(outDir, "index.html"), shell, "utf8");

  // Служебные файлы: не нужны при раздаче через Nginx.
  await rm(path.join(outDir, "_shell.html"), { force: true });
  await rm(path.join(outDir, "_headers"), { force: true });
  await rm(path.join(outDir, ".vite"), { recursive: true, force: true });

  const version = buildVersion();
  await writeFile(
    path.join(outDir, "version.json"),
    `${JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );

  console.log(`[build-static] version.json: ${version}`);
  console.log("[build-static] Готово: dist/static (index.html + assets).");
  console.log("[build-static] Раздавайте эту папку через Nginx (см. DEPLOY.md).");
}

await main();
