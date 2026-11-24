import fs from "node:fs";
import { chromium } from "playwright-core";

const helper = "";

globalThis.__outlineRunner = { chromium, helper };

let source = fs.readFileSync("scripts/browser-smoke.mjs", "utf8");
function once(old, next) {
  if (source.split(old).length !== 2) {
    throw new Error("Unexpected test structure: " + old);
  }
  source = source.replace(old, () => next);
}
once(
  'import { chromium } from "playwright-core";',
  'const { chromium } = globalThis.__outlineRunner;'
);
const loop = /for \(const mode of \[[\s\S]*?\]\) \{/g;
if ([...source.matchAll(loop)].length !== 1) {
  throw new Error("Unexpected scenario loop");
}
source = source.replace(loop, 'for (const mode of ["existing-thread"]) {');
const anchor = '      if (mode === "list") {';
once(anchor,
  fs.readFileSync("scripts/ui-regression/media-panel-checks.txt", "utf8") + "\n" + anchor
);
process.argv[2] = "dist/static";
process.argv[3] = ".test-artifacts/media-panel";
try {
  await import("data:text/javascript;base64," +
    Buffer.from(source).toString("base64"));
} catch (error) {
  console.error("OUTLINE_AUDIT_ERROR:", error?.message ?? String(error));
  process.exitCode = 1;
} finally {
  delete globalThis.__outlineRunner;
}
