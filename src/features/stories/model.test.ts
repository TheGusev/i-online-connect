import test from "node:test";
import assert from "node:assert/strict";
import { groupStories } from "./model";
import type { StoryItem } from "./model";

const now = Date.parse("2026-11-22T12:00:00Z");
function story(id: string, author: string, extra: Partial<StoryItem> = {}): StoryItem {
  return {
    id, author: { id: author, name: author, avatarUrl: null },
    kind: "image", caption: "", durationMs: null,
    createdAt: "2026-11-22T10:00:00Z",
    expiresAt: "2026-11-23T10:00:00Z",
    seen: false, mine: author === "me", mediaPath: `/stories/${id}/media`,
    ...extra,
  };
}
test("stories: expired items are excluded at the expiry boundary", () => {
  assert.equal(groupStories([
    story("a", "peer", { expiresAt: new Date(now).toISOString() }),
  ], "me", now).length, 0);
});
test("stories: duplicate pages do not duplicate a story", () => {
  const item = story("a", "peer");
  assert.equal(groupStories([item, item], "me", now)[0]!.items.length, 1);
});
test("stories: own author appears first", () => {
  assert.equal(groupStories([story("a", "peer"), story("b", "me")], "me", now)[0]!.id, "me");
});
test("stories: unread authors precede read authors", () => {
  const groups = groupStories([
    story("a", "read", { seen: true }),
    story("b", "unread"),
  ], "me", now);
  assert.deepEqual(groups.map(group => group.id), ["unread", "read"]);
});
test("stories: one author's stories play oldest first", () => {
  const groups = groupStories([
    story("b", "peer", { createdAt: "2026-11-22T11:00:00Z" }),
    story("a", "peer"),
  ], "me", now);
  assert.deepEqual(groups[0]!.items.map(item => item.id), ["a", "b"]);
});
test("stories: an author remains unread while any story is unread", () => {
  assert.equal(groupStories([
    story("a", "peer", { seen: true }), story("b", "peer"),
  ], "me", now)[0]!.unseen, true);
});
