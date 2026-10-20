import { test } from "node:test";
import assert from "node:assert/strict";
import { clipFilesToDelete, staleSessionIds, resolveLiveClipRetry, toLiveClipDto } from "../src/live/clips.ts";

const resolve = (u) => (u.startsWith("/media/") ? `/data${u.slice(6)}` : null);

test("файлы к удалению: пустые и чужие пропускаются, дубли схлопываются", () => {
  assert.deepEqual(
    clipFilesToDelete(["/media/a.m4a", "", null, "https://evil/x", "/media/a.m4a", "/media/b.webm"], resolve),
    ["/data/a.m4a", "/data/b.webm"],
  );
});

test("зависшие сессии — открытые в базе, но не в памяти", () => {
  assert.deepEqual(staleSessionIds(["s1", "s2", "s3"], ["s2"]), ["s1", "s3"]);
  assert.deepEqual(staleSessionIds(["s1"], []), ["s1"]);
});

test("повтор с тем же clientTempId возвращает существующий клип", () => {
  const clip = { id: "c1" };
  assert.deepEqual(resolveLiveClipRetry(clip), { reuse: true, clip });
  assert.deepEqual(resolveLiveClipRetry(null), { reuse: false });
});

test("формат ответа live-ветки", () => {
  const dto = toLiveClipDto({ id: "c1", client_temp_id: "t1", media_url: "/media/a.m4a", media_mime: "audio/mp4", duration_ms: 1200, created_at: "2026-10-20T00:00:00Z" });
  assert.deepEqual(dto, { id: "c1", clientTempId: "t1", audioUrl: "/media/a.m4a", mime: "audio/mp4", durationMs: 1200, createdAt: "2026-10-20T00:00:00.000Z", live: true });
});
