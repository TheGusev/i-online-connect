import { test } from "node:test";
import assert from "node:assert/strict";
import type { Conversation } from "@/api";
import { DEFAULT_CONVERSATION_TAB, filterConversations } from "./conversation-list";

const base: Conversation = { id: "a", participant: { id: "p", name: "Тест", online: false, trustLevel: "new" }, lastMessage: "", lastMessageAt: "2026-11-02T00:00:00Z", unreadCount: 0, awaitingReply: false, sharedInterests: [], lastMessageFromMe: false };
const items = [base, { ...base, id: "b", favorite: true, awaitingReply: true, lastMessageAt: "2026-11-02T01:00:00Z" }, { ...base, id: "c", pinned: true, pinnedAt: "2026-11-02T02:00:00Z", favorite: true }, { ...base, id: "d", pinned: true, pinnedAt: "2026-11-02T03:00:00Z" }];
test("all is the default and includes answered conversations", () => { assert.equal(DEFAULT_CONVERSATION_TAB, "all"); assert.deepEqual(filterConversations(items, "all").map(x => x.id), ["d", "c", "b", "a"]); });
test("favorites only, pinned first", () => assert.deepEqual(filterConversations(items, "favorite").map(x => x.id), ["c", "b"]));
test("awaiting uses existing awaitingReply", () => assert.deepEqual(filterConversations(items, "awaiting").map(x => x.id), ["b"]));
test("favorites are empty without preferences", () => assert.deepEqual(filterConversations([base], "favorite"), []));