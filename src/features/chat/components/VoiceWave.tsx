import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Живая волна во время записи: рисует сглаженный уровень с микрофона. */
export function LiveVoiceWave({
  getLevel,
  bars = 28,
  className,
}: {
  getLevel: () => number;
  bars?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const levelRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    const history: number[] = new Array(bars).fill(0);
    const tick = () => {
      // Экспоненциальное сглаживание: без него полосы дёргаются от кадра к кадру.
      levelRef.current = levelRef.current * 0.7 + getLevel() * 0.3;
      history.push(levelRef.current);
      history.shift();
      const nodes = containerRef.current?.children;
      if (nodes) {
        for (let i = 0; i < nodes.length; i += 1) {
          const value = history[i] ?? 0;
          const scaled = Math.min(1, Math.max(0.06, value * 2.6));
          (nodes[i] as HTMLElement).style.transform = `scaleY(${scaled.toFixed(3)})`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bars, getLevel]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("flex h-6 min-w-0 flex-1 items-center gap-[2px]", className)}
    >
      {Array.from({ length: bars }).map((_, index) => (
        <span
          key={index}
          className="h-full min-w-0 flex-1 origin-center rounded-full bg-primary shadow-glow"
          style={{ transform: "scaleY(0.06)" }}
        />
      ))}
    </div>
  );
}

interface VoiceAudioResult {
  audioUrl: string;
  peaks: number[] | null;
}

interface VoiceAudioState {
  audioUrl: string | null;
  peaks: number[] | null;
  error: boolean;
}

// Кэш и дедупликация запросов на уровне модуля: один и тот же голосовой файл
// скачивается максимум один раз за сессию, даже если сообщение
// повторно монтируется (скролл списка, повторный рендер).
const audioCache = new Map<string, VoiceAudioResult>();
const inFlight = new Map<string, Promise<VoiceAudioResult>>();

const FETCH_RETRIES = 2;
const FETCH_TIMEOUT_MS = 15000;
const RETRY_BASE_MS = 500;

/** Скачивание с таймаутом и повторными попытками — сеть на VPN/мобильном интернете нестабильна. */
async function fetchWithRetry(src: string): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(src, { credentials: "include", signal: controller.signal });
      window.clearTimeout(timer);
      if (!response.ok) throw new Error(`http ${response.status}`);
      return await response.arrayBuffer();
    } catch (error) {
      window.clearTimeout(timer);
      lastError = error;
      if (attempt < FETCH_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("voice fetch failed");
}

function computePeaks(buffer: ArrayBuffer, bars: number): Promise<number[] | null> {
  return new Promise((resolve) => {
    const Ctx =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext);
    if (!Ctx) {
      resolve(null);
      return;
    }
    const ctx = new Ctx();
    // decodeAudioData «съедает» буфер — отдаём копию, оригинал ещё нужен для Blob.
    ctx.decodeAudioData(
      buffer.slice(0),
      (audio) => {
        void ctx.close();
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / bars));
        const result: number[] = [];
        for (let i = 0; i < bars; i += 1) {
          let peak = 0;
          const start = i * step;
          for (let j = start; j < start + step && j < data.length; j += 1) {
            const value = Math.abs(data[j] ?? 0);
            if (value > peak) peak = value;
          }
          result.push(peak);
        }
        const max = Math.max(...result, 0.0001);
        resolve(result.map((value) => Math.min(1, Math.max(0.12, value / max))));
      },
      () => {
        void ctx.close();
        resolve(null);
      },
    );
  });
}

async function loadVoiceAudio(src: string, bars: number): Promise<VoiceAudioResult> {
  const buffer = await fetchWithRetry(src);
  const blob = new Blob([buffer]);
  const audioUrl = URL.createObjectURL(blob);
  const peaks = await computePeaks(buffer, bars);
  return { audioUrl, peaks };
}

/**
 * Единая загрузка голосового сообщения: один сетевой запрос на файл — из него
 * же строится и Blob-адрес для <audio>, и волна для визуализации. Раньше это
 * были два независимых запроса (audio-тег + отдельный fetch на волну), что
 * удваивало нагрузку на нестабильных сетях (VPN, мобильный интернет) и часто
 * приводило к тому, что часть голосовых не проигрывалась без единого сигнала
 * об ошибке. Здесь же есть ретраи и явное состояние ошибки с возможностью
 * повторить вручную.
 */
export function useVoiceAudio(src: string, bars: number) {
  const [state, setState] = useState<VoiceAudioState>(() => {
    const cached = audioCache.get(src);
    return cached
      ? { audioUrl: cached.audioUrl, peaks: cached.peaks, error: false }
      : { audioUrl: null, peaks: null, error: false };
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const cached = audioCache.get(src);
    if (cached) {
      setState({ audioUrl: cached.audioUrl, peaks: cached.peaks, error: false });
      return;
    }
    let alive = true;
    let promise = inFlight.get(src);
    if (!promise) {
      promise = loadVoiceAudio(src, bars);
      inFlight.set(src, promise);
    }
    promise
      .then((result) => {
        audioCache.set(src, result);
        if (alive) setState({ audioUrl: result.audioUrl, peaks: result.peaks, error: false });
      })
      .catch(() => {
        if (alive) setState({ audioUrl: null, peaks: null, error: true });
      })
      .finally(() => {
        inFlight.delete(src);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, bars, reloadToken]);

  const retry = useCallback(() => {
    audioCache.delete(src);
    inFlight.delete(src);
    setState({ audioUrl: null, peaks: null, error: false });
    setReloadToken((token) => token + 1);
  }, [src]);

  return { ...state, retry };
}

/** Статичный waveform с плавно движущимся прогрессом воспроизведения. */
export function VoiceWaveform({
  peaks,
  progress,
  bars,
  mine,
}: {
  peaks: number[] | null;
  progress: number;
  bars: number;
  mine: boolean;
}) {
  const shape = peaks ?? new Array(bars).fill(0.4);
  const played = (progress / 100) * shape.length;

  return (
    <div className="flex h-6 w-full items-center gap-[2px]" aria-hidden="true">
      {shape.map((value, index) => {
        const filled = played - index;
        const ratio = Math.min(1, Math.max(0, filled));
        return (
          <span
            key={index}
            className={cn(
              "min-w-0 flex-1 rounded-full transition-[opacity,background-color] duration-300 ease-out",
              ratio > 0.5
                ? mine
                  ? "bg-primary-foreground opacity-100"
                  : "bg-primary opacity-100 shadow-glow"
                : mine
                  ? "bg-primary-foreground opacity-35"
                  : "bg-muted-foreground opacity-40",
            )}
            style={{ height: `${Math.round(value * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
