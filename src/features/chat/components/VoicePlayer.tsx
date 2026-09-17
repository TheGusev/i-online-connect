import { Pause, Play, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { VoiceWaveform, useVoiceAudio } from "@/features/chat/components/VoiceWave";

const WAVE_BARS = 32;

function formatDuration(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function VoicePlayer({
  src,
  duration,
  mine,
}: {
  src: string;
  duration: number;
  mine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { audioUrl, peaks, error, retry } = useVoiceAudio(src, WAVE_BARS);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [playError, setPlayError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => setCurrent(audio.currentTime);
    const stop = () => setPlaying(false);
    const onError = () => {
      setPlaying(false);
      setPlayError(true);
    };
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", stop);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    setPlayError(false);
  }, [audioUrl]);

  const total = audioRef.current?.duration || duration / 1000;
  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const failed = error || playError;

  const handleRetry = () => {
    setPlayError(false);
    retry();
  };

  return (
    <div className="flex min-w-48 items-center gap-2.5">
      {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="metadata" /> : null}
      <Button
        type="button"
        size="icon"
        variant={mine ? "secondary" : "ghost"}
        className="size-9 shrink-0"
        aria-label={
          failed
            ? "Повторить загрузку голосового сообщения"
            : playing
              ? "Пауза"
              : "Воспроизвести голосовое сообщение"
        }
        disabled={!audioUrl && !failed}
        onClick={() => {
          if (failed) {
            handleRetry();
            return;
          }
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) {
            audio
              .play()
              .then(() => setPlaying(true))
              .catch(() => {
                setPlaying(false);
                setPlayError(true);
              });
          } else {
            audio.pause();
          }
        }}
      >
        {failed ? (
          <RotateCw className="size-4" aria-hidden="true" />
        ) : playing ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
      </Button>
      <div className="min-w-0 flex-1">
        <VoiceWaveform peaks={peaks} progress={progress} bars={WAVE_BARS} mine={mine} />
        <span className="sr-only" role="progressbar" aria-valuenow={Math.round(progress)}>
          Прогресс голосового сообщения
        </span>
        <p
          className={cn(
            "mt-1 text-[11px]",
            mine ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {failed ? "Не удалось загрузить — нажмите, чтобы повторить" : formatDuration(current || total)}
        </p>
      </div>
    </div>
  );
}
