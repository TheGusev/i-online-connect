export const MESSAGE_HIGHLIGHT_MS = 1900;

type HighlightClock = {
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (id: number) => void;
};

const active = new WeakMap<
  HTMLElement,
  { id: number; clock: HighlightClock }
>();

export function highlightMessageBubble(
  bubble: HTMLElement,
  clock: HighlightClock = window,
): void {
  const previous = active.get(bubble);
  if (previous) previous.clock.clearTimeout(previous.id);

  bubble.classList.remove("msg-flash");
  void bubble.offsetWidth;
  bubble.classList.add("msg-flash");

  const id = clock.setTimeout(() => {
    bubble.classList.remove("msg-flash");
    active.delete(bubble);
  }, MESSAGE_HIGHLIGHT_MS);
  active.set(bubble, { id, clock });
}
