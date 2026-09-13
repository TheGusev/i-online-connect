import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function VoicePlayer({ src, duration, mine }: { src: string; duration: number; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => setCurrent(audio.currentTime);
    const stop = () => setPlaying(false);
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", stop);
    return () => {
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", stop);
    };
  }, []);

  const total = audioRef.current?.duration || duration / 1000;
  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    <div className="flex min-w-48 items-center gap-2.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <Button
        type="button"
        size="icon"
        variant={mine ? "secondary" : "ghost"}
        className="size-9 shrink-0"
        aria-label={playing ? "Пауза" : "Воспроизвести голосовое сообщение"}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) {
            void audio.play().then(() => setPlaying(true));
          } else {
            audio.pause();
          }
        }}
      >
        {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className={cn("h-1 overflow-hidden rounded-full", mine ? "bg-primary-foreground/25" : "bg-secondary")}>
          <progress
            className={cn("block h-full w-full accent-primary", mine && "accent-primary-foreground")}
            max={100}
            value={progress}
            aria-label="Прогресс голосового сообщения"
          />
        </div>
        <p className={cn("mt-1 text-[11px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {formatDuration(current || total)}
        </p>
      </div>
    </div>
  );
}