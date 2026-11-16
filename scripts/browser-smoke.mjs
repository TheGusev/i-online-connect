import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const root = fs.realpathSync(process.argv[2]);
const out = process.argv[3];
if (!out) throw new Error("Output directory required");
fs.mkdirSync(out, { recursive: true });
const origin = "https://xn--41a.site";
const me = "11111111-1111-4111-8111-111111111111";
const peer = "22222222-2222-4222-8222-222222222222";
const cid = "33333333-3333-4333-8333-333333333333";
const now = new Date().toISOString();
const token = "audit." +
  Buffer.from(JSON.stringify({ sub: me, exp: Math.floor(Date.now()/1000)+3600 }))
    .toString("base64url") + ".synthetic";

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
  for (const mode of [
    "list", "existing-thread", "people", "invite",
    "invite-accept", "invite-cancel", "invite-resume", "invite-account-mismatch",
    "city-select", "city-retry"
  ]) {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 }
    });
    const errors = [];
    const unknown = new Set();
    const missing = new Set();
    const requests = [];
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

    await context.addInitScript(({ token }) => {
      localStorage.setItem("ya-online.token", token);
    }, { token });

    await context.route("**/*", async route => {
      const req = route.request();
      const url = new URL(req.url());
      requests.push({ method: req.method(), path: url.pathname });

      const json = data => route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(data)
      });

      if (
        url.origin === "https://mc.yandex.ru" &&
        url.pathname === "/metrika/tag.js"
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: "/* Analytics disabled in isolated audit. */"
        });
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
            return route.fulfill({
              status: 400, contentType: "application/json",
              body: JSON.stringify({ message: "Unexpected placeId" })
            });
          }
          citySaveAttempts++;
          if (mode === "city-retry" && citySaveAttempts === 1) {
            return route.fulfill({
              status: 503, contentType: "application/json",
              body: JSON.stringify({ message: "AUDIT_SAVE_FAILED" })
            });
          }
          cityConfirmed = true;
          return json({ status: "resolved", place: auditPlace, demoReady: true });
        }
        if (p === "/api/auth/me") return json(user);
        if (p === "/api/auth/refresh") return json({ token });
        if (p === "/api/auth/identities") return json([]);
        if (p === "/api/chat/conversations") {
          if (req.method() === "POST") {
            const body = req.postDataJSON();
            if (body?.participantId !== peer) {
              return route.fulfill({ status: 400, body: "Unexpected participant" });
            }
            return json({ conversationId: cid, created: false });
          }
          return json([conversation]);
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
            return route.fulfill({ status: 400, body: "Unexpected invite request" });
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
          return route.fulfill({ status: 204 });
        }
        if (p === `/api/chat/conversations/${cid}`) return json(conversation);
        if (p === `/api/chat/conversations/${cid}/messages`) {
          return json({ items: [message], hasMore: false, nextBefore: null });
        }
        if (p === `/api/chat/conversations/${cid}/starters`) return json([]);
        if (p.endsWith("/read")) return route.fulfill({ status: 204 });
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
        return route.fulfill({
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
          return route.fulfill({ status: 404, body: "audit: missing static" });
        }
      }
      return route.fulfill({
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
      if (m.type() === "error") errors.push("console: " + m.text());
    });

    let expectedVisible = false;
    try {

      if (mode.startsWith("city-")) {
        await page.goto(origin + "/spaces", {
          waitUntil: "domcontentloaded", timeout: 30000
        });
        await page.getByRole("button", {
          name: "Выбрать город", exact: true
        }).waitFor({ state: "visible", timeout: 15000 });

        const before = requests.filter(r =>
          r.path === "/api/spaces" || r.path === "/api/spaces/"
        ).length;

        await page.getByRole("button", {
          name: "Выбрать город", exact: true
        }).click();
        const input = page.getByLabel("Поиск населённого пункта");
        const confirm = page.getByRole("button", {
          name: "Подтвердить город", exact: true
        });

        if (!await confirm.isDisabled()) {
          throw new Error("City confirmation enabled without selection");
        }

        await input.fill("A");
        await page.waitForTimeout(700);
        if (requests.some(r => r.path === "/api/geo/places")) {
          throw new Error("City search sent a one-character request");
        }
        console.log("PASS city: one character does not trigger search");

        await input.fill("UNKNOWN_AUDIT_CITY_NAME");
        // This fixture query must not contain the matching word.
        await input.fill("NO_SUCH_CITY");
        await page.getByText(
          "Населённый пункт не найден. Уточните название.",
          { exact: true }
        ).waitFor({ state: "visible", timeout: 7000 });
        console.log("PASS city: unknown place has empty result");

        await input.fill("Audit");
        await page.getByRole("button", {
          name: "Audit City — региональный центр: Audit Center", exact: true
        }).waitFor({ state: "visible", timeout: 7000 });

        if (!await confirm.isDisabled()) {
          throw new Error("Typing city enabled save without selecting a result");
        }
        await page.getByRole("button", {
          name: "Audit City — региональный центр: Audit Center", exact: true
        }).click();
        await confirm.click();

        if (mode === "city-retry") {
          await page.getByRole("alert").filter({
            hasText: "AUDIT_SAVE_FAILED"
          }).waitFor({ state: "visible", timeout: 7000 });
          if (cityConfirmed) throw new Error("Failed save changed city");
          await confirm.waitFor({ state: "visible" });
          if (await confirm.isDisabled()) {
            throw new Error("Cannot retry city save");
          }
          console.log("PASS city: save error is visible; selection retained");
          await confirm.click();
        }

        await page.getByText("Ваш город: Audit City", { exact: true })
          .waitFor({ state: "visible", timeout: 7000 });
        await page.getByRole("button", {
          name: "Изменить город", exact: true
        }).waitFor({ state: "visible", timeout: 5000 });

        const after = requests.filter(r =>
          r.path === "/api/spaces" || r.path === "/api/spaces/"
        ).length;
        if (after <= before) {
          throw new Error("Community list was not refreshed after city save");
        }
        const expectedAttempts = mode === "city-retry" ? 2 : 1;
        if (citySaveAttempts !== expectedAttempts) {
          throw new Error("Unexpected city save attempts: " + citySaveAttempts);
        }
        console.log("PASS city: selected place saved; city and community list refreshed");
        console.log("expected_http_503_console_events=" + expectedSaveErrors);
      } else {
      await page.goto(origin + (
        mode === "existing-thread" ? `/chat/${cid}` :
        ["invite-accept", "invite-cancel"].includes(mode)
          ? "/chat#chatInvite=" + "B".repeat(43)
          : "/chat"
      ), {
        waitUntil: "domcontentloaded", timeout: 30000
      });
      await page.getByText(
        ["existing-thread", "invite-resume"].includes(mode)
          ? "AUDIT_MESSAGE_VISIBLE"
          : mode === "invite-account-mismatch"
            ? "Аккаунт изменился. Отмените приглашение и откройте ссылку заново."
            : "Audit Peer",
        { exact: true }
      ).first().waitFor({ state: "visible", timeout: 15000 });

      }

      if (mode === "list") {
        const search = page.getByLabel("Поиск по моим чатам");
        await search.fill("AUDIT PEER");
        await page.getByText("Audit Peer", { exact: true })
          .first().waitFor({ state: "visible", timeout: 5000 });
        console.log("PASS search: name matches");

        await search.fill("NO_SUCH_PERSON_AUDIT");
        await page.getByText(
          "В выбранной вкладке чатов с таким именем нет. Измените запрос или выберите «Все».",
          { exact: true }
        ).waitFor({ state: "visible", timeout: 5000 });
        if (await page.getByText("Audit Peer", { exact: true }).count()) {
          throw new Error("Search did not hide unmatched conversation");
        }
        console.log("PASS search: unmatched name hides conversation");

        await page.getByRole("button", {
          name: "Очистить поиск", exact: true
        }).click();
        await page.getByText("Audit Peer", { exact: true })
          .first().waitFor({ state: "visible", timeout: 5000 });
        console.log("PASS search: clear restores conversation");

        await page.getByText("Audit Peer", { exact: true }).first().click();
        await page.waitForURL(origin + "/chat/" + cid, { timeout: 10000 });
        await page.getByText("AUDIT_MESSAGE_VISIBLE", { exact: true })
          .first().waitFor({ state: "visible", timeout: 10000 });
        console.log("PASS navigation: list -> existing conversation");
      }

      if (mode === "people") {
        await page.getByRole("button", {
          name: "Найти людей", exact: true
        }).click();

        const input = page.getByLabel("Имя пользователя");
        await input.fill("A");
        await page.waitForTimeout(800);
        if (requests.some(r => r.path === "/api/contacts/search")) {
          throw new Error("People search sent a request for one character");
        }
        console.log("PASS people: one character does not trigger search");

        await input.fill("NO_SUCH_PERSON");
        await page.getByText("Никого не нашли. Проверьте имя.", {
          exact: true
        }).waitFor({ state: "visible", timeout: 7000 });
        console.log("PASS people: empty search result");

        await input.fill("Audit");
        const allowed = page.locator("li").filter({
          has: page.getByText("Audit Search Person", { exact: true })
        });
        const restricted = page.locator("li").filter({
          has: page.getByText("Audit Restricted Person", { exact: true })
        });

        await allowed.waitFor({ state: "visible", timeout: 7000 });
        if (!await restricted.getByRole("button", {
          name: "Написать", exact: true
        }).isDisabled()) {
          throw new Error("Restricted person's message button is enabled");
        }
        console.log("PASS people: restricted account cannot be messaged in UI");

        await allowed.getByRole("button", {
          name: "Написать", exact: true
        }).click();
        await page.waitForURL(origin + "/chat/" + cid, { timeout: 10000 });
        await page.getByText("AUDIT_MESSAGE_VISIBLE", {
          exact: true
        }).first().waitFor({ state: "visible", timeout: 10000 });

        if (!requests.some(r =>
          r.method === "POST" && r.path === "/api/chat/conversations"
        )) {
          throw new Error("Conversation-opening API was not called");
        }
        console.log("PASS people: Write opens conversation");
      }

      if (mode === "invite") {
        await page.getByRole("button", {
          name: "Пригласить в чат", exact: true
        }).click();
        await page.getByRole("button", {
          name: "Создать приглашение", exact: true
        }).click();

        const linkInput = page.getByLabel("Ссылка для приглашения");
        await linkInput.waitFor({ state: "visible", timeout: 7000 });

        const expectedLink = origin + "/#chatInvite=" + "A".repeat(43);
        if (await linkInput.inputValue() !== expectedLink) {
          throw new Error("Unexpected invitation link");
        }

        await page.locator('svg[width="208"][height="208"]')
          .waitFor({ state: "visible", timeout: 5000 });
        console.log("PASS invite: link and QR rendered");

        await page.getByRole("button", {
          name: "Отозвать это приглашение", exact: true
        }).click();
        await page.getByText("Приглашение отозвано", {
          exact: true
        }).waitFor({ state: "visible", timeout: 7000 });

        if (await page.getByLabel("Ссылка для приглашения").count()) {
          throw new Error("Revoked invitation is still displayed");
        }
        if (!requests.some(r =>
          r.method === "DELETE" &&
          r.path === "/api/contacts/invites/66666666-6666-4666-8666-666666666666"
        )) {
          throw new Error("Revoke API was not called");
        }
        console.log("PASS invite: revoke removes invitation from UI");
      }

      const acceptCalls = () => requests.filter(r =>
        r.method === "POST" && r.path === "/api/contacts/invites/accept"
      ).length;

      if (mode === "invite-accept" || mode === "invite-cancel") {
        await page.getByText(
          "Audit Inviter приглашает вас в «Я Онлайн»", { exact: true }
        ).waitFor({ state: "visible", timeout: 7000 });

        await page.waitForFunction(() => !location.hash.includes("chatInvite"));
        if (acceptCalls() !== 0) {
          throw new Error("Invitation accepted before consent");
        }
        console.log("PASS recipient: preview shown, hash cleared, no auto-accept");

        if (mode === "invite-cancel") {
          await page.getByRole("button", {
            name: "Отменить приглашение", exact: true
          }).click();
          await page.getByRole("button", {
            name: "Присоединиться", exact: true
          }).waitFor({ state: "hidden", timeout: 5000 });

          if (acceptCalls() !== 0) throw new Error("Cancel called accept API");
          const pending = await page.evaluate(() =>
            localStorage.getItem("ya-online.personal-chat-invite.v1")
          );
          if (pending !== null) throw new Error("Cancel left a pending invitation");
          console.log("PASS recipient: cancellation does not accept invitation");
        } else {
          await page.getByRole("button", {
            name: "Присоединиться", exact: true
          }).click();
          await page.waitForURL(origin + "/chat/" + cid, { timeout: 10000 });
          await page.getByText("AUDIT_MESSAGE_VISIBLE", {
            exact: true
          }).first().waitFor({ state: "visible", timeout: 10000 });
          if (acceptCalls() !== 1) throw new Error("Expected one accept call");
          const pending = await page.evaluate(() =>
            localStorage.getItem("ya-online.personal-chat-invite.v1")
          );
          if (pending !== null) throw new Error("Accepted invitation not cleared");
          console.log("PASS recipient: consent opens chat and clears pending invitation");
        }
      }

      if (mode === "invite-resume") {
        await page.waitForURL(origin + "/chat/" + cid, { timeout: 10000 });
        if (acceptCalls() !== 1) {
          throw new Error("Saved invitation did not produce exactly one accept");
        }
        const pending = await page.evaluate(() =>
          localStorage.getItem("ya-online.personal-chat-invite.v1")
        );
        if (pending !== null) throw new Error("Resumed invitation not cleared");
        console.log("PASS recipient: saved unbound invitation resumes after session restore");
      }

      if (mode === "invite-account-mismatch") {
        if (acceptCalls() !== 0) {
          throw new Error("Invitation accepted by a different account");
        }
        console.log("PASS recipient: account mismatch blocks accept API");
      }

      if (mode.startsWith("invite-")) {
        const sentMessages = requests.filter(r =>
          r.method === "POST" &&
          r.path === "/api/chat/conversations/" + cid + "/messages"
        );
        if (sentMessages.length) {
          throw new Error("Invitation automatically sent a message");
        }
        console.log("PASS recipient: no automatic messages");
      }

      expectedVisible = true;
    } catch (e) {
      errors.push("scenario: " + e.message);
    }

    await page.screenshot({ path: path.join(out, mode + ".png"), fullPage: true });
    const text = await page.locator("body").innerText();
    const result = {
      mode, expectedVisible, errors,
      unmocked: [...unknown], missing: [...missing],
      bodyPreview: text.slice(0, 1800), requests
    };
    results.push(result);
    console.log(`\n===== ${mode} =====`);
    console.log("expected_visible=" + expectedVisible);
    console.log("errors=" + errors.length);
    console.log("unmocked=" + unknown.size);
    console.log("missing=" + missing.size);
    for (const e of errors.slice(0, 5)) console.log(e.slice(0, 2500));
    for (const p of unknown) console.log("UNMOCKED " + p);
    for (const p of missing) console.log("MISSING " + p);

    await context.close();
  }
} finally {
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
  if (browser) await browser.close();
}
if (results.some(r =>
  !r.expectedVisible || r.errors.length || r.unmocked.length || r.missing.length
)) process.exitCode = 1;
