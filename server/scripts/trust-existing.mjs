import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { apply, inspect, restore } from './trust-existing-lib.mjs';

// Only loads the existing server configuration; never logs connection strings.
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const args = process.argv.slice(2);
const mode = args[0] ?? '--preview';
const backupPath = args[1];
if (!['--preview', '--apply', '--restore'].includes(mode) || args.length > 2
  || (mode !== '--preview' && !backupPath)) {
  console.error('Использование: node scripts/trust-existing.mjs --preview | --apply /защищённый/backup.json | --restore /защищённый/backup.json');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Нет доступа к базе: DATABASE_URL не задан в окружении или server/.env.');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  console.log('До операции:', await inspect(client));
  if (mode === '--apply') {
    const count = await apply(client, backup => writeFile(backupPath, JSON.stringify(backup, null, 2), { flag: 'wx', mode: 0o600 }));
    console.log('Назначен статус «Проверенный участник»:', count);
  } else if (mode === '--restore') {
    console.log('Восстановлено:', await restore(client, JSON.parse(await readFile(backupPath, 'utf8'))));
  }
  console.log('Итог:', await inspect(client));
} catch {
  console.error('Операция не завершена. Проверьте доступ к базе, путь резервной копии и изменения профилей; при ошибке транзакция отменяется.');
  process.exitCode = 1;
} finally { await client.end(); }