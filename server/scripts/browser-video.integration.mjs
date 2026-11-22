import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.env.APP_ROOT || path.resolve(import.meta.dirname, "../..");
const out = process.env.ARTIFACT_DIR || path.join(root, ".test-artifacts/real-api");
fs.mkdirSync(out, { recursive: true });
const database = new URL(process.env.DATABASE_URL);
assert.equal(process.env.NODE_ENV, "test");
assert.equal(database.hostname, "127.0.0.1");
assert.ok(database.pathname.startsWith("/browser_e2e_"));

const require = createRequire(path.join(process.env.BROWSER_TOOLS || root, "package.json"));
const { chromium } = require("playwright-core");
const moduleFromServer = relative =>
  import(pathToFileURL(path.join(root, "server", relative)).href);

const { pool } = await moduleFromServer("src/db.ts");
const { hashPassword } = await moduleFromServer("src/auth/passwords.ts");
const { registerErrorHandler } = await moduleFromServer("src/http.ts");
const serverRequire = createRequire(path.join(root, "server/package.json"));
const Fastify = serverRequire("fastify");
const app = Fastify({ logger: false });
registerErrorHandler(app);

let browser;
const errors = [];
let stage = "initialization";
const failedApi = [];
const origin = "https://xn--41a.site";
const staticRoot = fs.realpathSync(path.join(root, "dist/static"));

try {
  await app.register(serverRequire("@fastify/cookie"));
  const { registerPrivateMediaGuard } =
    await moduleFromServer("src/media/private-guard.ts");
  registerPrivateMediaGuard(app);
  assert.ok(process.env.MEDIA_DIR, "Isolated MEDIA_DIR required");
  fs.mkdirSync(process.env.MEDIA_DIR, { recursive: true });
  await app.register(serverRequire("@fastify/static"), {
    root: path.resolve(process.env.MEDIA_DIR),
    prefix: "/api/media-file/",
    decorateReply: false,
  });
  await app.register(serverRequire("@fastify/multipart"));

  for (const [name, prefix] of [
    ["auth", "/api/auth"], ["contacts", "/api/contacts"],
    ["chat", "/api/chat"], ["spaces", "/api/spaces"],
    ["geo", "/api/geo"], ["profile", "/api/profiles"],
    ["notifications", "/api/notifications"], ["presence", "/api/presence"],
    ["trust", "/api/trust"], ["push", "/api/push"],
    ["settings", "/api/settings"],
    ["stories", "/api/stories"]
  ]) {
    const module = await moduleFromServer("src/routes/" + name + ".ts");
    const routes = Object.entries(module).filter(
      ([key, value]) => key.endsWith("Routes") && typeof value === "function"
    );
    assert.equal(routes.length, 1, "Ambiguous route export: " + name);
    await app.register(routes[0][1], { prefix });
  }
  await app.ready();

  const password = "Audit-" + randomUUID() + "-Password9";
  const passwordHash = await hashPassword(password);
  const owner = randomUUID();
  const recipient = randomUUID();
  const seed = randomUUID();

  for (const [id, name, isSeed] of [
    [owner, "E2E Owner", false],
    [recipient, "E2E Recipient", false],
    [seed, "E2E Demo Author", true]
  ]) {
    await pool.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
      [id, id + (isSeed ? "@seed.local" : "@example.invalid"), passwordHash]
    );
    await pool.query(
      "INSERT INTO profiles(user_id,name,age,is_seed) VALUES($1,$2,30,$3)",
      [id, name, isSeed]
    );
    await pool.query(
      "INSERT INTO privacy_settings(user_id,who_can_message) VALUES($1,'everyone')",
      [id]
    );
    await pool.query("INSERT INTO notification_prefs(user_id) VALUES($1)", [id]);
  }

  await pool.query(
    "INSERT INTO demo_regions(id,center_city) VALUES('e2e-region','Сквозной центр')"
  );
  await pool.query(`
    INSERT INTO geo_places(id,city,normalized_name,region_id,source)
    VALUES('e2e-place','Сквозной город','сквозной город','e2e-region','test fixture')
  `);

  const cache = path.join(process.env.HOME, ".cache/ms-playwright");
  const executable = fs.readdirSync(cache).sort().reverse()
    .filter(name => name.startsWith("chromium-"))
    .flatMap(name => [
      path.join(cache, name, "chrome-linux64/chrome"),
      path.join(cache, name, "chrome-linux/chrome")
    ]).find(file => fs.existsSync(file));
  assert.ok(executable, "Chromium not found");
  browser = await chromium.launch({ executablePath: executable, headless: true });

  const mime = {
    ".html": "text/html", ".js": "application/javascript",
    ".css": "text/css", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png",
    ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"
  };

  async function session(id) {
    const context = await browser.newContext({
      serviceWorkers: "block", viewport: { width: 390, height: 844 }
    });
    await context.routeWebSocket("**/*", ws => ws.close());

    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.origin === "https://mc.yandex.ru" &&
          url.pathname === "/metrika/tag.js") {
        return route.fulfill({
          status: 200, contentType: "application/javascript", body: ""
        });
      }
      if (url.origin !== origin) {
        errors.push("Unexpected external request: " + url.origin + url.pathname);
        return route.abort();
      }
      if (url.pathname === "/__audit__") {
        return route.fulfill({
          status: 200, contentType: "text/html", body: "<html><body></body></html>"
        });
      }

      if (url.pathname.startsWith("/api/")) {
        const headers = { ...request.headers() };
        delete headers.host;
        delete headers["content-length"];
        const response = await app.inject({
          method: request.method(),
          url: url.pathname + url.search,
          headers,
          ...(request.postDataBuffer()
            ? { payload: request.postDataBuffer() } : {})
        });
        if (response.statusCode >= 400) {
          failedApi.push({
            method: request.method(), path: url.pathname,
            status: response.statusCode
          });
        }
        const responseHeaders = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined &&
              !["connection", "transfer-encoding", "content-length"].includes(key)) {
            responseHeaders[key] = Array.isArray(value)
              ? value.join("\n") : String(value);
          }
        }
        return route.fulfill({
          status: response.statusCode,
          headers: responseHeaders,
          body: response.rawPayload
        });
      }

      const candidate = path.resolve(staticRoot, "." + decodeURIComponent(url.pathname));
      if (!candidate.startsWith(staticRoot + path.sep) && candidate !== staticRoot) {
        return route.abort();
      }
      let file = candidate;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (request.resourceType() !== "document") {
          errors.push("Missing static: " + url.pathname);
          return route.fulfill({ status: 404, body: "" });
        }
        file = path.join(staticRoot, "index.html");
      }
      return route.fulfill({
        status: 200,
        contentType: mime[path.extname(file)] || "application/octet-stream",
        body: fs.readFileSync(file)
      });
    });

    const page = await context.newPage();
    const account = id === owner ? "owner" : "recipient";
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) {
        console.log("NAV " + JSON.stringify({
          account, stage, url: frame.url().split("#")[0]
        }));
      }
    });
    page.on("pageerror", error => {
      const entry = {
        event: "pageerror", account, stage,
        url: page.url().split("#")[0],
        error: error.stack || error.message
      };
      errors.push(entry);
      console.log("BROWSER_ERROR " + JSON.stringify(entry));
    });
    page.on("console", message => {
      if (message.type() === "error") {
        const entry = {
          event: "console", account, stage,
          url: page.url().split("#")[0],
          location: message.location(),
          error: message.text()
        };
        errors.push(entry);
        console.log("BROWSER_ERROR " + JSON.stringify(entry));
      }
    });
    await page.goto(origin + "/__audit__");

    const login = await page.evaluate(async ({ email, password }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!response.ok) return { status: response.status, ok: false };
      const data = await response.json();
      localStorage.setItem("ya-online.token", data.token);
      return { status: response.status, ok: Boolean(data.user?.id && data.token) };
    }, { email: id + "@example.invalid", password });
    assert.equal(login.status, 200);
    assert.equal(login.ok, true);
    assert.ok((await context.cookies()).some(cookie =>
      cookie.name === "ya_refresh" && cookie.httpOnly
    ));
    stage = "PASS real login API and httpOnly refresh cookie"; console.log("PASS real login API and httpOnly refresh cookie");
    return { context, page };
  }

  const first = await session(owner);
  await first.page.goto(origin + "/chat");
  await first.page.getByRole("button", {
    name: "Новый чат", exact: true
  }).click();
  await first.page.getByRole("button", {
    name: "Пригласить в чат", exact: true
  }).click();
  await first.page.getByRole("button", {
    name: "Создать приглашение", exact: true
  }).click();
  const inviteInput = first.page.getByLabel("Ссылка для приглашения");
  await inviteInput.waitFor({ state: "visible", timeout: 15000 });
  const inviteLink = await inviteInput.inputValue();
  assert.match(new URL(inviteLink).hash, /^#chatInvite=[A-Za-z0-9_-]{43}$/);
  stage = "PASS real invitation created through browser"; console.log("PASS real invitation created through browser");

  const second = await session(recipient);
  await second.page.goto(inviteLink);
  await second.page.getByRole("button", {
    name: "Присоединиться", exact: true
  }).click();
  await second.page.waitForURL(/\/chat\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const conversationId = new URL(second.page.url()).pathname.split("/").pop();
  const before = await pool.query(
    "SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1",
    [conversationId]
  );
  assert.equal(before.rows[0].n, 0);
  stage = "PASS real invitation accepted; no artificial messages"; console.log("PASS real invitation accepted; no artificial messages");

  const text = "E2E_REAL_MESSAGE_" + randomUUID();
  await second.page.getByRole("textbox", { name: "Сообщение", exact: true }).fill(text);
  const sentResponse = second.page.waitForResponse(response =>
    new URL(response.url()).pathname ===
      "/api/chat/conversations/" + conversationId + "/messages" &&
    response.request().method() === "POST"
  );
  await second.page.getByRole("button", { name: "Отправить", exact: true }).click();
  assert.equal((await sentResponse).status(), 200);
  const saved = await pool.query(
    "SELECT author_id FROM messages WHERE conversation_id=$1 AND text=$2",
    [conversationId, text]
  );
  assert.equal(saved.rows.length, 1);
  assert.equal(saved.rows[0].author_id, recipient);
  stage = "PASS browser message persisted in PostgreSQL"; console.log("PASS browser message persisted in PostgreSQL");

  await first.page.goto(origin + "/chat/" + conversationId);
  await first.page.getByText(text, { exact: true }).first()
    .waitFor({ state: "visible", timeout: 15000 });
  stage = "PASS other account reads persisted message after opening chat"; console.log("PASS other account reads persisted message after opening chat");

  stage = "video upload through composer";
  await pool.query(
    "INSERT INTO verifications(user_id,status,selfie_path,reference_url) VALUES($1,'verified','test','test')",
    [owner],
  );
  await first.page.reload();
  const { runVideoTool } = await moduleFromServer("src/media/chat-video.ts");
  const fixture = path.join(out, "browser-fixture.mov");
  await runVideoTool(process.env.FFMPEG_PATH || "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=15",
    "-t", "3", "-an", "-c:v", "libx264", "-preset", "ultrafast",
    "-threads", "1", fixture,
  ], 15000);
  const uploadedResponse = first.page.waitForResponse(response =>
    new URL(response.url()).pathname ===
      "/api/chat/conversations/" + conversationId + "/media" &&
    response.request().method() === "POST");
  await first.page.locator('input[aria-label="Выбрать файл"]').setInputFiles({
    name: "browser-fixture.mov",
    mimeType: "application/octet-stream",
    buffer: fs.readFileSync(fixture),
  });
  const uploaded = await uploadedResponse;
  assert.equal(uploaded.status(), 200, await uploaded.text());
  const videoMessage = await uploaded.json();
  assert.equal(videoMessage.kind, "video");
  assert.equal(videoMessage.mediaMime, "video/mp4");
  const bubble = first.page.locator("#message-" + videoMessage.id);
  await bubble.waitFor({ state: "visible", timeout: 15000 });
  const video = bubble.locator("video");
  assert.match(await video.getAttribute("poster"), /chat-video-poster/);
  const posterResult = await first.page.evaluate(async url => {
    const response = await fetch(url, { credentials: "include" });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, jpeg: bytes[0] === 255 && bytes[1] === 216 };
  }, await video.getAttribute("poster"));
  assert.deepEqual(posterResult, { status: 200, jpeg: true });
  console.log("PASS browser MOV upload and private JPEG poster");

  stage = "video playback";
  await bubble.getByRole("button", { name: "Воспроизвести видео", exact: true }).click();
  await video.evaluate(async element => { await element.play(); });
  await first.page.waitForFunction(id => {
    const v = document.querySelector("#message-" + id + " video");
    return v && v.currentTime > 0;
  }, videoMessage.id, { timeout: 10000 });
  await video.evaluate(element => element.pause());
  console.log("PASS normalized video plays in Chromium");

  stage = "video reaction";
  await bubble.locator("[data-bubble]").click({ button: "right" });
  const actions = first.page.getByRole("dialog", { name: "Действия с сообщением" });
  await actions.waitFor({ state: "visible" });
  await first.page.waitForTimeout(450);
  const reactionButton = actions.getByRole("button", { name: /^Реакция / }).first();
  const emoji = (await reactionButton.getAttribute("aria-label")).replace("Реакция ", "");
  const reactionResponse = first.page.waitForResponse(response =>
    response.url().includes(videoMessage.id) &&
    response.url().includes("/reactions") &&
    response.request().method() === "PUT");
  await reactionButton.click();
  assert.equal((await reactionResponse).status(), 200);
  await first.page.waitForFunction(({ id, emoji }) =>
    document.getElementById("message-" + id)?.textContent?.includes(emoji),
    { id: videoMessage.id, emoji });
  const overlay = bubble.locator("span.pointer-events-none.absolute").first();
  assert.ok(await overlay.isVisible(), "Video reactions overlay must remain visible");
  await bubble.screenshot({ path: path.join(out, "video-with-reaction.png") });
  console.log("PASS reaction is displayed on video after playback");

  stage = "video download";
  await bubble.locator("[data-bubble]").click({ button: "right" });
  await actions.waitFor({ state: "visible" });
  await first.page.waitForTimeout(450);
  const downloaded = first.page.waitForEvent("download", { timeout: 15000 });
  await actions.getByRole("button", { name: "Сохранить", exact: true }).click();
  const download = await downloaded;
  assert.match(download.suggestedFilename(), /\.mp4$/);
  assert.equal(await download.failure(), null);
  console.log("PASS video download from message actions");

  stage = "recipient views video";
  await second.page.goto(origin + "/chat/" + conversationId);
  const received = second.page.locator("#message-" + videoMessage.id);
  await received.waitFor({ state: "visible", timeout: 15000 });
  const receivedVideo = received.locator("video");
  assert.match(await receivedVideo.getAttribute("poster"), /chat-video-poster/);
  const recipientPoster = await second.page.evaluate(async url => {
    const response = await fetch(url, { credentials: "include" });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, jpeg: bytes[0] === 255 && bytes[1] === 216 };
  }, await receivedVideo.getAttribute("poster"));
  assert.deepEqual(recipientPoster, { status: 200, jpeg: true });
  await received.getByRole("button", {
    name: "Воспроизвести видео", exact: true,
  }).click();
  await receivedVideo.evaluate(async element => { await element.play(); });
  await second.page.waitForFunction(id => {
    const v = document.querySelector("#message-" + id + " video");
    return v && v.currentTime > 0;
  }, videoMessage.id, { timeout: 10000 });
  await receivedVideo.evaluate(element => element.pause());
  console.log("PASS recipient sees poster and plays received video");

  stage = "recipient video gallery";
  await second.page.getByRole("button", {
    name: "Фото и видео", exact: true,
  }).click();
  const gallery = second.page.getByRole("dialog", {
    name: "Фото и видео", exact: true,
  });
  await gallery.waitFor({ state: "visible" });
  await gallery.getByRole("button", {
    name: "Открыть видео", exact: true,
  }).first().click();
  const viewer = second.page.getByRole("dialog", {
    name: "Просмотр вложения", exact: true,
  });
  await viewer.waitFor({ state: "visible" });
  const galleryVideo = viewer.locator("video[controls]");
  await galleryVideo.waitFor({ state: "visible" });
  assert.match(await galleryVideo.getAttribute("poster"), /chat-video-poster/);
  await galleryVideo.evaluate(async element => { await element.play(); });
  await second.page.waitForFunction(() => {
    const dialog = document.querySelector('[aria-label="Просмотр вложения"]');
    const v = dialog?.querySelector("video[controls]");
    return v && v.currentTime > 0;
  }, undefined, { timeout: 10000 });
  await second.page.screenshot({ path: path.join(out, "recipient-video-gallery.png") });

  const galleryDownloadPromise = second.page.waitForEvent("download", {
    timeout: 15000,
  });
  await viewer.getByRole("button", { name: "Сохранить", exact: true }).click();
  const galleryDownload = await galleryDownloadPromise;
  assert.match(galleryDownload.suggestedFilename(), /\.mp4$/);
  assert.equal(await galleryDownload.failure(), null);
  console.log("PASS recipient gallery video download");
  await viewer.getByRole("button", { name: "Закрыть", exact: true }).click();
  await gallery.getByRole("button", {
    name: "Закрыть галерею", exact: true,
  }).click();


  await second.page.goto(origin + "/spaces");
  await second.page.locator('button[aria-haspopup="listbox"]').click();
  await second.page.getByRole("button", {
    name: "Другой город…", exact: true
  }).click();
  await second.page.getByRole("button", {
    name: "Выбрать город", exact: true
  }).click();
  await second.page.getByLabel("Поиск населённого пункта").fill("Сквозной");
  await second.page.getByRole("button", {
    name: "Сквозной город — региональный центр: Сквозной центр", exact: true
  }).click();
  await second.page.getByRole("button", {
    name: "Подтвердить город", exact: true
  }).click();
  await second.page.getByText("Ваш город: Сквозной город", { exact: true })
    .waitFor({ state: "visible", timeout: 15000 });

  const profile = await pool.query(
    "SELECT geo_place_id FROM profiles WHERE user_id=$1", [recipient]
  );
  assert.equal(profile.rows[0].geo_place_id, "e2e-place");
  const communities = await pool.query(
    "SELECT count(*)::int AS n FROM spaces WHERE region_id='e2e-region' AND is_seed"
  );
  assert.equal(communities.rows[0].n, 14);
  stage = "PASS browser city selection persisted; 14 regional demos created"; console.log("PASS browser city selection persisted; 14 regional demos created");

  await first.page.screenshot({ path: path.join(out, "owner-chat.png") });
  await second.page.screenshot({ path: path.join(out, "recipient-city.png") });
  assert.deepEqual(failedApi, [], "Unexpected failed API responses");
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log("REAL_API_BROWSER_PASS");
  console.log("VIDEO_BROWSER_PASS");
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(out, "diagnostics.json"),
    JSON.stringify({ errors, failedApi }, null, 2));
  if (browser) await browser.close();
  try { await app.close(); }
  finally { await pool.end(); }
}
