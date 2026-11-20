import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { cleanupLogoutState } from "./logout-cleanup.mjs";

test("local session is cleared before waiting for requests", async () => {
  const events: string[] = [];
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const cleanup = cleanupLogoutState({
    clearSession: () => { events.push("guest"); },
    cancelQueries: () => { events.push("cancel"); return pending; },
    clearCache: () => { events.push("clear"); },
  });
  assert.deepEqual(events, ["guest", "cancel"]);
  finish();
  await cleanup;
  assert.deepEqual(events, ["guest", "cancel", "clear"]);
});

test("cache is cleared after successful cancellation", async () => {
  let user: string | null = "account-a";
  const cache = new Map([["chat", "private-a"], ["settings", "settings-a"]]);
  await cleanupLogoutState({
    clearSession: () => { user = null; },
    cancelQueries: async () => {},
    clearCache: () => cache.clear(),
  });
  assert.equal(user, null);
  assert.equal(cache.size, 0);
});

test("cache is cleared even if cancellation rejects", async () => {
  const failure = new Error("cancellation failed");
  const events: string[] = [];
  await assert.rejects(cleanupLogoutState({
    clearSession: () => { events.push("guest"); },
    cancelQueries: async () => { throw failure; },
    clearCache: () => { events.push("clear"); },
  }), (error: unknown) => error === failure);
  assert.deepEqual(events, ["guest", "clear"]);
});

test("cache is cleared even if cancelQueries throws synchronously", async () => {
  let cleared = false;
  await assert.rejects(cleanupLogoutState({
    clearSession: () => {},
    cancelQueries: () => { throw new Error("sync failure"); },
    clearCache: () => { cleared = true; },
  }), /sync failure/);
  assert.equal(cleared, true);
});

test("cleanup can be repeated without retaining user data", async () => {
  const cache = new Map([["notifications", "account-a"]]);
  let user: string | null = "account-a";
  const dependencies = {
    clearSession: () => { user = null; },
    cancelQueries: async () => {},
    clearCache: () => cache.clear(),
  };
  await cleanupLogoutState(dependencies);
  await cleanupLogoutState(dependencies);
  assert.equal(user, null);
  assert.equal(cache.size, 0);
});

test("actual QueryClient loses previous account cache", async () => {
  const client = new QueryClient();
  try {
    client.setQueryData(["chat", "conversations"], ["private-a"]);
    client.setQueryData(["settings"], { account: "a" });
    client.setQueryData(["notifications"], ["notification-a"]);
    await cleanupLogoutState({
      clearSession: () => {},
      cancelQueries: () => client.cancelQueries(),
      clearCache: () => client.clear(),
    });
    assert.equal(client.getQueryCache().getAll().length, 0);
    assert.equal(client.getQueryData(["chat", "conversations"]), undefined);
  } finally { client.clear(); }
});

test("late query result does not refill cache after logout cancellation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finish: (value: string) => void = () => {};
  const pending = new Promise<string>((resolve) => { finish = resolve; });
  const request = client.fetchQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => pending,
  }).catch(() => undefined);
  try {
    await cleanupLogoutState({
      clearSession: () => {},
      cancelQueries: () => client.cancelQueries(),
      clearCache: () => client.clear(),
    });
    finish("private-a");
    await request;
    await Promise.resolve();
    assert.equal(client.getQueryData(["chat", "conversations"]), undefined);
    assert.equal(client.getQueryCache().getAll().length, 0);
  } finally { finish("private-a"); client.clear(); }
});
