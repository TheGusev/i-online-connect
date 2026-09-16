import { useEffect, useRef, useState } from "react";

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

const peaksCache = new Map<string, number[]>();

/** Пики записанного аудио: считаем один раз на сообщение и кэшируем по адресу файла. */
export function useVoicePeaks(src: string, bars: number) {
  const [peaks, setPeaks] = useState<number[] | null>(() => peaksCache.get(src) ?? null);

  useEffect(() => {
    const cached = peaksCache.get(src);
    if (cached) {
      setPeaks(cached);
      return;
    }
    let alive = true;
    const Ctx =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext);
    if (!Ctx) return;
    void (async () => {
      try {
        const response = await fetch(src, { credentials: "include" });
        const buffer = await response.arrayBuffer();
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buffer);
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
        const normalized = result.map((value) => Math.min(1, Math.max(0.12, value / max)));
        peaksCache.set(src, normalized);
        if (alive) setPeaks(normalized);
      } catch {
        // Формат не декодируется — остаётся ровный запасной вид, размеры те же.
      }
    })();
    return () => {
      alive = false;
    };
  }, [bars, src]);

  return peaks;
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
