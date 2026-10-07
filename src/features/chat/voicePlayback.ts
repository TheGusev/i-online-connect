import { useSyncExternalStore } from "react";

/** Общий плеер голосовых: одно играет, скорость, автопрослушивание подряд. */
const players = new Map<string, { audio: HTMLAudioElement; play: () => void }>();

export function registerVoice(id: string, audio: HTMLAudioElement, play: () => void) {
  players.set(id, { audio, play });
  audio.playbackRate = getRate();
  return () => {
    if (players.get(id)?.audio === audio) players.delete(id);
  };
}

/** Перед стартом одного — пауза у всех остальных. */
export function pauseOthers(id: string) {
  players.forEach((p, key) => {
    if (key !== id && !p.audio.paused) p.audio.pause();
  });
}

export function stopAllVoice() {
  players.forEach((p) => {
    if (!p.audio.paused) p.audio.pause();
  });
}

/** Следующее сообщение в том же списке, если оно голосовое. */
export function playNextAfter(id: string) {
  const el = document.querySelector(`[data-voice-id="${CSS.escape(id)}"]`);
  const item = el?.closest("li,[id^='message-']");
  const next = item?.nextElementSibling;
  const nextVoice = next?.querySelector<HTMLElement>("[data-voice-id]");
  if (!nextVoice) return;
  const nextId = nextVoice.dataset.voiceId;
  if (nextId) players.get(nextId)?.play();
}

const RATE_KEY = "voice-rate";
const listeners = new Set<() => void>();
let rate: number | null = null;
export function getRate() {
  if (rate === null) {
    try { rate = localStorage.getItem(RATE_KEY) === "1.5" ? 1.5 : 1; } catch { rate = 1; }
  }
  return rate;
}
export function toggleRate() {
  rate = getRate() === 1 ? 1.5 : 1;
  try { localStorage.setItem(RATE_KEY, String(rate)); } catch { /* нет */ }
  players.forEach((p) => { p.audio.playbackRate = rate!; });
  listeners.forEach((l) => l());
}
export function useVoiceRate() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getRate,
    () => 1,
  );
}
