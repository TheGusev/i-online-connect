import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(test|spec)\.tsx?$/.test(entry.name)) files.push(file);
  }
}
walk(path.join(root, "src"));
if (!files.length) throw new Error("No frontend tests found");

const loader = pathToFileURL(require.resolve("tsx")).href;
const result = spawnSync(process.execPath, [
  "--import", loader, "--test", "--test-concurrency=2", ...files.sort()
], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://invalid@127.0.0.1:1/forbidden",
    VITE_API_URL: "https://audit.invalid/api",
    VITE_WS_URL: "wss://audit.invalid/ws"
  },
  stdio: "inherit"
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
