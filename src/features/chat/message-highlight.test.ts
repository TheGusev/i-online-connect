import assert from "node:assert/strict";
import test from "node:test";
import {
  highlightMessageBubble,
  MESSAGE_HIGHLIGHT_MS,
} from "./message-highlight";

function fixture() {
  const classes = new Set<string>();
  const timers = new Map<number, () => void>();
  const delays: number[] = [];
  const cleared: number[] = [];
  let serial = 0;
  let layouts = 0;
  const bubble = {
    classList: {
      add: (name: string) => { classes.add(name); },
      remove: (name: string) => { classes.delete(name); },
    },
    get offsetWidth() { layouts++; return 180; },
  } as unknown as HTMLElement;
  const clock = {
    setTimeout(callback: () => void, delay: number) {
      delays.push(delay);
      const id = ++serial;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id: number) {
      cleared.push(id);
      timers.delete(id);
    },
  };
  return {
    bubble, clock, classes, timers, delays, cleared,
    layouts: () => layouts,
  };
}

test("reply outline starts without changing element geometry", () => {
  const f = fixture();
  highlightMessageBubble(f.bubble, f.clock);
  assert.ok(f.classes.has("msg-flash"));
  assert.equal(f.layouts(), 1);
  assert.deepEqual(f.delays, [MESSAGE_HIGHLIGHT_MS]);
});

test("repeat highlight cancels previous removal timer", () => {
  const f = fixture();
  highlightMessageBubble(f.bubble, f.clock);
  highlightMessageBubble(f.bubble, f.clock);
  assert.deepEqual(f.cleared, [1]);
  assert.equal(f.timers.size, 1);
  assert.ok(f.timers.has(2));
  assert.equal(f.layouts(), 2);
});

test("timeout removes outline and releases active state", () => {
  const f = fixture();
  highlightMessageBubble(f.bubble, f.clock);
  f.timers.get(1)!();
  assert.equal(f.classes.has("msg-flash"), false);
  highlightMessageBubble(f.bubble, f.clock);
  assert.deepEqual(f.cleared, []);
});

test("different message outlines have independent timers", () => {
  const a = fixture();
  const b = fixture();
  highlightMessageBubble(a.bubble, a.clock);
  highlightMessageBubble(b.bubble, b.clock);
  highlightMessageBubble(a.bubble, a.clock);
  assert.deepEqual(a.cleared, [1]);
  assert.deepEqual(b.cleared, []);
  assert.ok(b.classes.has("msg-flash"));
});
