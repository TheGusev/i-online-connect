/** Ближайший прокручиваемый предок; иначе — окно документа. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Плавно (~350 мс, ease-out) ставит элемент сразу под липкой шапкой с отступом.
 * Если элемент уже там — ничего не делает. Reduced-motion — без анимации.
 */
export function scrollUnderHeader(el: HTMLElement, gap = 12, duration = 350): void {
  const container = scrollParent(el);
  const header = document.querySelector<HTMLElement>("header.sticky");
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const containerTop = container ? container.getBoundingClientRect().top : 0;
  const offset = el.getBoundingClientRect().top - Math.max(headerBottom, containerTop) - gap;
  if (Math.abs(offset) < 2) return;

  const get = () => (container ? container.scrollTop : window.scrollY);
  const set = (y: number) => (container ? (container.scrollTop = y) : window.scrollTo(0, y));
  const from = get();
  const to = Math.max(0, from + offset);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    set(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    set(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
