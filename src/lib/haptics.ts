/**
 * Тактильный отклик. Android: navigator.vibrate. iPhone: вибрации из скрипта нет, поэтому
 * поверх элемента кладётся прозрачный label со скрытым нативным switch — тик играет система
 * от настоящего тапа (hapticTrigger). Выключатель хранится в localStorage.
 */
const KEY = "ya:haptics";
const PATTERNS = { light: 8, selection: 10, medium: 14, success: [10, 30, 12], error: [24, 40, 24] } as const;
export type HapticKind = keyof typeof PATTERNS;

export function hapticsEnabled() {
  try { return window.localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setHapticsEnabled(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* приватный режим */ }
  document.documentElement.dataset["haptics"] = on ? "on" : "off";
}

if (typeof document !== "undefined") {
  document.documentElement.dataset["haptics"] = hapticsEnabled() ? "on" : "off";
}

export function buzz(kind: HapticKind = "light") {
  if (typeof navigator === "undefined" || !hapticsEnabled()) return;
  try { navigator.vibrate?.(PATTERNS[kind] as number | number[]); } catch { /* не поддерживается */ }
}

const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** ref-колбэк: на iPhone кладёт поверх элемента label со скрытым switch. */
export function hapticTrigger(element: HTMLElement | null) {
  if (!element || !isIos() || element.querySelector(":scope > [data-haptic-trigger]")) return;
  const label = document.createElement("label");
  label.setAttribute("data-haptic-trigger", "");
  label.setAttribute("aria-hidden", "true");
  Object.assign(label.style, { position: "absolute", inset: "0", touchAction: "manipulation" });
  label.style.setProperty("-webkit-tap-highlight-color", "transparent");
  const sw = document.createElement("input");
  sw.type = "checkbox";
  sw.setAttribute("switch", "");
  sw.tabIndex = -1;
  Object.assign(sw.style, { position: "absolute", width: "1px", height: "1px", margin: "0", visibility: "hidden" });
  sw.addEventListener("click", (event) => event.stopPropagation());
  label.append(sw);
  if (getComputedStyle(element).position === "static") element.style.position = "relative";
  element.append(label);
}
