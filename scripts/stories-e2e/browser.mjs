import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const root = fs.realpathSync(process.argv[2]);
const out = process.argv[3];
if (!out) throw new Error("Output directory required");
fs.mkdirSync(out, { recursive: true });
const origin = process.env.YA_STORIES_HTTPS_ORIGIN;
const me = process.env.YA_BROWSER_ME;
const peer = process.env.YA_BROWSER_PEER;
const cid = "33333333-3333-4333-8333-333333333333";
const now = new Date().toISOString();
const token = process.env.YA_BROWSER_TOKEN;

const user = {
  id: me, name: "Audit Owner", age: 30, city: "Тест",
  bio: "", interests: [], trustLevel: "new", trustScore: 0,
  online: true, adultConfirmed: true
};
const conversation = {
  id: cid,
  participant: {
    id: peer, name: "Audit Peer", online: false,
    trustLevel: "new", city: "Тест"
  },
  lastMessage: "AUDIT_MESSAGE_VISIBLE", lastMessageAt: now,
  unreadCount: 0, awaitingReply: false, sharedInterests: [],
  lastMessageFromMe: false, pinned: false, favorite: false
};
const message = {
  id: "44444444-4444-4444-8444-444444444444",
  conversationId: cid, authorId: peer,
  text: "AUDIT_MESSAGE_VISIBLE", kind: "text",
  createdAt: now, status: "sent", reactions: []
};

const cache = path.join(process.env.HOME, ".cache/ms-playwright");
const candidates = [];
for (const dir of fs.readdirSync(cache).sort().reverse()) {
  if (!dir.startsWith("chromium-")) continue;
  candidates.push(path.join(cache, dir, "chrome-linux64/chrome"));
  candidates.push(path.join(cache, dir, "chrome-linux/chrome"));
}
const executablePath = candidates.find(p => fs.existsSync(p));
if (!executablePath) throw new Error("Chromium executable not found");

const mime = {
  ".html": "text/html", ".js": "application/javascript",
  ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"
};

const results = [];
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  for (const mode of JSON.parse(
    process.env.YA_BROWSER_MODES || '["stories-live-320"]'
  )) {
    await globalThis.__STORIES_BROWSER_RESET__(mode);
    const context = await browser.newContext({
      serviceWorkers: "block",
      ignoreHTTPSErrors: true,
      viewport: { width: mode.endsWith("-320") ? 320 : mode.endsWith("-1280") ? 1280 : 390, height: 844 }
    });
    const errors = [];
    const unknown = new Set();
    const missing = new Set();
    const requests = [];
    const noteId = "77777777-7777-4777-8777-777777777777";
    let noteCreated = mode === "notes-rename";
    let noteTitle = "Аудит заметок";
    const noteMessages = [];
    const noteConversation = () => ({
      ...conversation,
      id: noteId,
      kind: "notes",
      participant: {
        id: me, name: noteTitle, online: false, trustLevel: "new"
      },
      lastMessage: noteMessages.at(-1)?.text ?? "",
      lastMessageFromMe: noteMessages.length > 0,
      unreadCount: 0,
      awaitingReply: false,
    });
    let cityConfirmed = false;
    let citySaveAttempts = 0;
    let expectedSaveErrors = 0;
    const auditPlace = {
      id: "audit-browser-place",
      city: "Audit City",
      regionId: "audit-region",
      regionalCenter: "Audit Center"
    };
    await context.routeWebSocket("**/*", ws => ws.close());
    await context.addInitScript(({ mode, me }) => {
      if (mode === "invite-resume" || mode === "invite-account-mismatch") {
        localStorage.setItem("ya-online.personal-chat-invite.v1", JSON.stringify({
          token: "B".repeat(43),
          savedAt: Date.now(),
          accountId: mode === "invite-resume"
            ? null
            : "99999999-9999-4999-8999-999999999999"
        }));
      }
    }, { mode, me });

    await context.addInitScript(({ token, mode }) => {
      if (!mode.startsWith("stories-guest")) localStorage.setItem("ya-online.token", token);
    }, { token, mode });

    await context.route("**/*", async route => {
      const req = route.request();
      const url = new URL(req.url());
      const fulfill = options => route.fulfill({
        ...options,
        headers: {
          ...options.headers,
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "authorization,content-type",
        },
      });
      requests.push({ method: req.method(), path: url.pathname });

      const json = data => fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(data)
      });

      if (
        url.origin === "https://mc.yandex.ru" &&
        url.pathname === "/metrika/tag.js"
      ) {
        return fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "/* Analytics disabled in isolated audit. */"
        });
      }

      const allowedApi = url.origin === origin ||
        url.origin === "https://stories-preview.invalid" ||
        url.origin === "https://xn--41a.site";
      if (allowedApi && /^\/api\/stories(?:\/|$)/.test(url.pathname)) {
        const target = new URL(url.pathname + url.search, process.env.YA_STORIES_HTTPS_ORIGIN);
        return route.continue({ url: target.href });
      }
      if (allowedApi && url.pathname.startsWith("/api/") && req.method() === "OPTIONS") {
        return fulfill({ status: 204 });
      }
      if (allowedApi && /^\/api\/stories(?:\/|$)/.test(url.pathname)) {
        if (req.method() === "POST" && url.pathname === "/api/stories/") {
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        const response = await globalThis.__STORIES_BROWSER_BRIDGE__({
          method: req.method(),
          url: url.pathname + url.search,
          headers: req.headers(),
          ...(req.postDataBuffer() ? { payload: req.postDataBuffer() } : {}),
        });
        const headers = { ...response.headers };
        for (const key of ["content-length", "connection", "transfer-encoding", "keep-alive"]) delete headers[key];
        return fulfill({
          status: response.statusCode, headers, body: response.rawPayload,
        });
      }
      if (url.origin === "https://stories-preview.invalid" ||
          url.origin === "https://xn--41a.site") {
        url.protocol = new URL(origin).protocol;
        url.host = new URL(origin).host;
      }
      if (url.origin !== origin) {
        unknown.add("EXTERNAL " + url.origin + url.pathname);
        return route.abort();
      }

      const p = url.pathname;
      if (p.startsWith("/api/")) {
        if (p === "/api/spaces" || p === "/api/spaces/") return json([]);

        if (p === "/api/geo/me" && req.method() === "GET") {
          return json({
            status: cityConfirmed ? "resolved" : "needs_city",
            profileCity: cityConfirmed ? auditPlace.city : "",
            place: cityConfirmed ? auditPlace : null,
            message: null,
            suggestion: null
          });
        }

        if (p === "/api/geo/places") {
          const q = (url.searchParams.get("q") || "").toLowerCase();
          return json({
            items: q.includes("audit") ? [auditPlace] : [],
            directoryOnly: true
          });
        }

        if (p === "/api/geo/me" && req.method() === "PUT") {
          const body = req.postDataJSON();
          if (body?.placeId !== auditPlace.id) {
            return fulfill({
              status: 400, contentType: "application/json",
              body: JSON.stringify({ message: "Unexpected placeId" })
            });
          }
          citySaveAttempts++;
          if (mode === "city-retry" && citySaveAttempts === 1) {
            return fulfill({
              status: 503, contentType: "application/json",
              body: JSON.stringify({ message: "AUDIT_SAVE_FAILED" })
            });
          }
          cityConfirmed = true;
          return json({ status: "resolved", place: auditPlace, demoReady: true });
        }
        if (p === "/api/auth/config" && req.method() === "GET") {
          return json({
            passwordResetEnabled: false,
            phoneLoginEnabled: false,
            emailConfirmationEnabled: false,
            providers: { yandex: false, telegram: false },
          });
        }
        if (p === "/api/auth/me") {
          if (mode.startsWith("stories-guest")) return fulfill({
            status: 401, contentType: "application/json",
            body: JSON.stringify({ message: "Isolated guest" }),
          });
          return json(user);
        }
        if (p === "/api/auth/refresh") {
          if (mode.startsWith("stories-guest")) return fulfill({
            status: 401, contentType: "application/json",
            body: JSON.stringify({ message: "Isolated guest" }),
          });
          return json({ token });
        }
        if (p === "/api/auth/identities") return json([]);
        if (p === "/api/chat/conversations") {
          if (req.method() === "POST") {
            const body = req.postDataJSON();
            if (body?.participantId !== peer) {
              return fulfill({ status: 400, body: "Unexpected participant" });
            }
            return json({ conversationId: cid, created: false });
          }
          return json([conversation, ...(noteCreated ? [noteConversation()] : [])]);
        }

        if (p === "/api/chat/blocks") return json([]);
        if (p === "/api/chat/notes" && req.method() === "POST") {
          const body = req.postDataJSON();
          if (!body?.title?.trim() || !body?.clientTempId) {
            throw new Error("Invalid notes creation request");
          }
          noteCreated = true;
          noteTitle = body.title;
          return json({ conversationId: noteId });
        }
        if (p === `/api/chat/notes/${noteId}` && req.method() === "PATCH") {
          noteTitle = req.postDataJSON().title;
          return json({ conversationId: noteId, title: noteTitle });
        }
        if (p === `/api/chat/conversations/${noteId}`) {
          return json(noteConversation());
        }
        if (p === `/api/chat/conversations/${noteId}/messages`) {
          if (req.method() === "POST") {
            const body = req.postDataJSON();
            let item = noteMessages.find(x => x.clientTempId === body.clientTempId);
            if (!item) {
              item = {
                id: "88888888-8888-4888-8888-888888888888",
                conversationId: noteId,
                authorId: me,
                text: body.text,
                clientTempId: body.clientTempId,
                createdAt: new Date().toISOString(),
                kind: "text", status: "sent", reactions: []
              };
              noteMessages.push(item);
            }
            return json(item);
          }
          return json({ items: noteMessages, hasMore: false, nextBefore: null });
        }
        if (p === `/api/contacts/conversations/${noteId}/origin`) {
          return json({ origin: null });
        }
        if (p === "/api/contacts/search") {
          const q = (url.searchParams.get("q") || "").toLowerCase();
          return json({
            items: q.includes("audit") ? [
              {
                id: peer, name: "Audit Search Person", city: "Тест",
                avatarUrl: null, canMessage: true
              },
              {
                id: "55555555-5555-4555-8555-555555555555",
                name: "Audit Restricted Person", city: "Тест",
                avatarUrl: null, canMessage: false
              }
            ] : []
          });
        }

        if (
          p === "/api/contacts/invites/preview" ||
          p === "/api/contacts/invites/accept"
        ) {
          const body = req.postDataJSON();
          if (req.method() !== "POST" || body?.token !== "B".repeat(43)) {
            return fulfill({ status: 400, body: "Unexpected invite request" });
          }
          return p.endsWith("/preview")
            ? json({ inviterName: "Audit Inviter", inviterAvatarUrl: null })
            : json({ conversationId: cid, created: false });
        }

        if (p === "/api/contacts/invites" && req.method() === "POST") {
          return json({
            id: "66666666-6666-4666-8666-666666666666",
            token: "A".repeat(43),
            expiresAt: new Date(Date.now() + 7*86400000).toISOString()
          });
        }

        if (
          p === "/api/contacts/invites/66666666-6666-4666-8666-666666666666" &&
          req.method() === "DELETE"
        ) {
          return fulfill({ status: 204 });
        }
        if (p === `/api/chat/conversations/${cid}`) return json(conversation);
        if (p === `/api/chat/conversations/${cid}/messages`) {
          return json({ items: [message], hasMore: false, nextBefore: null });
        }
        if (p === `/api/chat/conversations/${cid}/starters`) return json([]);
        if (p.endsWith("/read")) return fulfill({ status: 204 });
        if (p === "/api/chat/unread-count") return json({ count: 0 });
        if (p === "/api/notifications") {
          return json({ items: [], unreadCount: 0, hasMore: false, nextCursor: null });
        }
        if (p === "/api/presence/summary") {
          return json({ online: 1, onlineCount: 1, total: 2, totalCount: 2 });
        }
        if (p === "/api/trust/verification/status") {
          return json({ id: null, status: "none", reason: "", etaMinutes: 0 });
        }
        if (p === "/api/push/public-key") return json({ enabled: false, publicKey: "" });
        if (p === `/api/contacts/conversations/${cid}/origin`) {
          return json({ origin: null });
        }
        unknown.add(req.method() + " " + p);
        return fulfill({
          status: 501, contentType: "application/json",
          body: JSON.stringify({ message: "Unmocked audit endpoint" })
        });
      }

      let relative;
      try { relative = decodeURIComponent(p); }
      catch { return route.abort(); }
      const candidate = path.resolve(root, "." + relative);
      if (!candidate.startsWith(root + path.sep) && candidate !== root) {
        return route.abort();
      }

      let file = candidate;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (req.resourceType() === "document") {
          file = path.join(root, "index.html");
        } else {
          missing.add(p);
          return fulfill({ status: 404, body: "audit: missing static" });
        }
      }
      return fulfill({
        status: 200,
        contentType: mime[path.extname(file)] || "application/octet-stream",
        body: fs.readFileSync(file)
      });
    });

    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.stack || e.message));
    page.on("console", m => {
      if (
        mode === "city-retry" &&
        m.type() === "error" &&
        m.location().url === origin + "/api/geo/me" &&
        m.text().includes("503")
      ) {
        expectedSaveErrors++;
        return;
      }
      if (mode.startsWith("stories-guest") && m.type() === "error" &&
          m.text().includes("401") &&
          /\/api\/auth\/(me|refresh)(?:\?|$)/.test(m.location().url)) return;
      if (m.type() === "error") errors.push("console: " + m.text());
    });


    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) {
        try {
          console.log("BROWSER_NAVIGATION", mode, new URL(frame.url()).pathname);
        } catch {}
      }
    });
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(20000);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    let outcome;
    let watchdogExpired = false;
    const caseTimer = setTimeout(() => {
      watchdogExpired = true;
      console.log("BROWSER_CASE_WATCHDOG_45000MS", mode);
      void context.close().catch(() => {});
    }, 45000);
    const caseDirectory = path.join(out, mode);
    fs.mkdirSync(caseDirectory, { recursive: true });
    const ensure = (condition, description) => {
      if (!condition) throw new Error(description);
    };
    async function waitForTest(predicate, description, timeout = 12000) {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        if (await predicate()) return;
        await page.waitForTimeout(100);
      }
      throw new Error(description);
    }
    try {
      console.log("BROWSER_CASE_START", mode);
      if (mode.startsWith("stories-guest")) {
        const target = mode.endsWith("-auth") ? "/auth" : "/chat";
        await page.goto(origin + target, { waitUntil: "domcontentloaded" });
        await page.waitForURL(url => url.pathname === "/auth", {
          waitUntil: "domcontentloaded", timeout: 12000,
        });
        const emailEntry = page.getByRole("button", {
          name: "Войти по почте", exact: true,
        });
        await emailEntry.waitFor({ state: "visible" });
        await emailEntry.click();
        await page.locator('input[type="email"]').waitFor({ state: "visible" });
        await page.locator('input[type="password"]').waitFor({ state: "visible" });
        ensure(await page.getByRole("button", { name: /^Истории(?::|$)/ }).count() === 0,
          "Guest was shown authenticated stories button");
        await page.screenshot({ path: path.join(caseDirectory, "auth.png"), fullPage: true });
      } else {
        await page.goto(origin + "/chat", { waitUntil: "domcontentloaded" });
        await page.getByText("Audit Peer", { exact: true }).first().waitFor({ state: "visible" });
        const trigger = page.getByRole("button", { name: /^Истории(?::|$)/ });
        await waitForTest(async () =>
          (await trigger.getAttribute("aria-label"))?.includes("непросмотренные"),
          "Unread halo not reflected in button label");
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: "Истории", exact: true });
        await dialog.waitFor({ state: "visible" });
        await dialog.evaluate(async element => {
          await Promise.all(element.getAnimations({ subtree: true })
            .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {})));
        });
        const box = await dialog.boundingBox();
        ensure(box && box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1,
          "Stories panel outside viewport");
        ensure(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          "Horizontal page overflow");
        const viewer = dialog.locator("div.touch-none.select-none");
        await waitForTest(() => viewer.locator("img").evaluateAll(images =>
          images.some(image => image.complete && image.naturalWidth > 0)),
          "Real protected photo did not load");
        const bar = dialog.locator('[data-story-progress="active"]');
        const samples = await bar.evaluate(element => new Promise(resolve => {
          const values = [];
          const start = performance.now();
          const sample = time => {
            values.push(Number(element.dataset.progressValue ?? 0));
            if (time - start < 450) requestAnimationFrame(sample);
            else resolve(values);
          };
          requestAnimationFrame(sample);
        }));
        ensure(samples.length >= 3, "Not enough animation samples");
        ensure(samples.every((value, index) =>
          Number.isFinite(value) && (index === 0 || value >= samples[index - 1])),
          "Story progress moved backwards");
        const advancing = samples.slice(1)
          .filter((value, index) => value > samples[index]).length;
        ensure(advancing >= (samples.length - 1) / 2,
          "Story progress is still visibly stepped");
        ensure(await dialog.getByText("Свайп вверх — закрыть", { exact: true }).count() === 0,
          "Redundant bottom instruction is still visible");
        const area = await viewer.boundingBox();
        ensure(!!area, "No story interaction area");
        ensure(area.height >= box.height * 0.85,
          "Story does not occupy the viewer canvas");
        await page.mouse.move(area.x + area.width * 0.7, area.y + area.height * 0.5);
        await page.mouse.down();
        await page.waitForTimeout(100);
        const before = Number(await bar.getAttribute("data-progress-value"));
        await page.waitForTimeout(1100);
        const after = Number(await bar.getAttribute("data-progress-value"));
        ensure(Math.abs(after - before) <= 3, "Holding story did not pause progress");
        await page.mouse.up();
        await waitForTest(() => globalThis.__STORIES_BROWSER_VIEWCOUNT__(),
          "Browser did not record a real view");
        await page.screenshot({ path: path.join(caseDirectory, "panel.png"), fullPage: true });

        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        ensure(await trigger.evaluate(element => document.activeElement === element),
          "Focus not restored after Escape");
        await trigger.click();
        await dialog.waitFor({ state: "visible" });

        const caption = "Live photo " + mode;
        await dialog.locator('input[type="file"]').setInputFiles(
          path.join(process.env.YA_BROWSER_FIXTURES, "photo.jpg"));
        await dialog.getByLabel("Подпись", { exact: true }).fill(caption);
        const publish = dialog.getByRole("button", { name: "Опубликовать", exact: true });
        await waitForTest(async () => !await publish.isDisabled(), "Photo publish remains disabled");
        const published = page.waitForResponse(response =>
          new URL(response.url()).pathname === "/api/stories/" &&
          response.request().method() === "POST");
        await publish.click();
        const stage = await Promise.race([
          published.then(async response => {
            ensure(response.status() === 200,
              "Photo publication HTTP " + response.status() + ": " + (await response.text()).slice(0, 1000));
            return "completed";
          }),
          dialog.getByRole("progressbar", { name: "Загрузка истории" })
            .waitFor({ state: "visible" }).then(() => "progress"),
        ]);
        ensure(stage === "progress", "Upload progress was not observed");
        ensure(await dialog.getByRole("button", { name: "Закрыть истории", exact: true }).isDisabled(),
          "Closing was allowed during publication");
        const photoResponse = await published;
        ensure(photoResponse.status() === 200,
          "Photo publication HTTP " + photoResponse.status() + ": " + (await photoResponse.text()).slice(0, 1000));
        await viewer.getByText(caption, { exact: true }).waitFor({ state: "visible" });
        const stored = await globalThis.__STORIES_BROWSER_INSPECT__(caption);
        ensure(stored.length === 1 && stored[0].kind === "image", "Photo publication not persisted once");
        await dialog.getByRole("button", { name: "Удалить свою историю", exact: true }).click();
        const deleted = page.waitForResponse(response =>
          response.request().method() === "DELETE" &&
          new URL(response.url()).pathname === "/api/stories/" + stored[0].id &&
          response.status() === 200);
        await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
        await deleted;
        await viewer.getByText(caption, { exact: true }).waitFor({ state: "hidden" });
        ensure((await globalThis.__STORIES_BROWSER_INSPECT__(caption))[0].deleted_at !== null,
          "UI deletion not persisted");

        const videoCaption = "Live video " + mode;
        await dialog.locator('input[type="file"]').setInputFiles(
          path.join(process.env.YA_BROWSER_FIXTURES, "short.mp4"));
        await dialog.getByLabel("Подпись", { exact: true }).fill(videoCaption);
        await waitForTest(async () => !await publish.isDisabled(), "Video metadata did not enable publication");
        const videoPublished = page.waitForResponse(response =>
          new URL(response.url()).pathname === "/api/stories/" &&
          response.request().method() === "POST");
        await publish.click();
        const videoResponse = await videoPublished;
        ensure(videoResponse.status() === 200,
          "Video publication HTTP " + videoResponse.status() + ": " + (await videoResponse.text()).slice(0, 1000));
        await viewer.getByText(videoCaption, { exact: true }).waitFor({ state: "visible" });
        await waitForTest(() => viewer.locator("video").evaluateAll(elements =>
          elements.some(element => element.readyState >= 2 && element.duration > 0 &&
            element.duration <= 30 && element.currentSrc.startsWith("blob:"))),
          "Protected normalized video did not load");
        ensure((await globalThis.__STORIES_BROWSER_INSPECT__(videoCaption))[0].kind === "video",
          "Video not persisted");
        await dialog.getByRole("button", { name: "Включить звук", exact: true }).click();
        ensure(await viewer.locator("video").evaluate(element => !element.muted),
          "Sound control did not unmute video");
        await page.screenshot({ path: path.join(caseDirectory, "video.png"), fullPage: true });

        await dialog.evaluate(async element => {
          await Promise.all(element.getAnimations({ subtree: true })
            .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {})));
        });
        const swipe = await viewer.boundingBox();
        ensure(!!swipe, "No swipe area");
        const x = swipe.x + swipe.width / 2;
        const y = swipe.y + swipe.height * 0.7;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y - 110, { steps: 8 });
        await page.mouse.up();
        await dialog.waitFor({ state: "hidden" });
        ensure(await trigger.evaluate(element => document.activeElement === element),
          "Focus not restored after swipe");
      }
      ensure(unknown.size === 0, "Unmocked requests: " + [...unknown].join("; "));
      ensure(missing.size === 0, "Missing assets: " + [...missing].join("; "));
      ensure(errors.length === 0, "Browser errors: " + errors.join("; "));
      outcome = { case: mode, status: "PASS" };
    } catch (error) {
      console.log("BROWSER_FAILURE_STATE", JSON.stringify({
        case: mode,
        url: (() => {
          try { return new URL(page.url()).pathname; }
          catch { return "[unavailable]"; }
        })(),
        recentRequests: requests.slice(-20),
        unknown: [...unknown],
        browserErrors: errors,
      }));
      if (mode.startsWith("stories-guest")) {
        try {
          const body = await Promise.race([
            page.locator("body").innerText({ timeout: 1500 }),
            new Promise(resolve => setTimeout(() => resolve("[body read deadline]"), 2000)),
          ]);
          console.log("GUEST_PAGE_TEXT", String(body).slice(0, 2000));
        } catch (cause) {
          console.log("GUEST_PAGE_TEXT_UNAVAILABLE", cause.message);
        }
      }
      outcome = {
        case: mode, status: "FAIL", error: error.stack || error.message,
        browserErrors: errors, unknown: [...unknown], missing: [...missing],
      };
      try { await page.screenshot({ path: path.join(caseDirectory, "failure.png"), fullPage: true, timeout: 2500 }); }
      catch {}
    } finally {
      try { await context.tracing.stop({ path: path.join(caseDirectory, "trace.zip") }); }
      catch (error) { outcome = { ...outcome, status: "FAIL", traceError: error.message }; }
      clearTimeout(caseTimer);
      await context.close();
    }
    if (watchdogExpired) outcome = {
      ...outcome, status: "FAIL",
      error: "CASE_WATCHDOG: scenario exceeded 45 seconds. " + (outcome?.error || ""),
    };
    results.push(outcome);
    console.log("BROWSER_CASE_RESULT", JSON.stringify(outcome));
  }
} finally {
  if (browser) await browser.close();
}
fs.writeFileSync(path.join(out, "live-browser-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter(result => result.status !== "PASS");
console.log("STORIES_LIVE_BROWSER_RESULT", JSON.stringify({
  passed: results.length - failed.length, failed: failed.length,
}));
if (failed.length) throw new Error("Live browser scenarios failed: " + failed.map(item => item.case).join(", "));
