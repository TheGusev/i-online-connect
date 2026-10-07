import { Pause, Play, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { VoiceWaveform, useVoiceAudio } from "@/features/chat/components/VoiceWave";
import { pauseOthers, playNextAfter, registerVoice, toggleRate, useVoiceRate } from "@/features/chat/voicePlayback";

const WAVE_BARS = 32;

function formatDuration(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function VoicePlayer({
  id,
  src,
  duration,
  mine,
  meta,
}: {
  /** Идентификатор сообщения — для автопрослушивания подряд. */
  id?: string;
  src: string;
  duration: number;
  mine: boolean;
  /** Время отправки и галочки — в одной строке с длительностью. */
  meta?: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { audioUrl, peaks, error, retry } = useVoiceAudio(src, WAVE_BARS);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [playError, setPlayError] = useState(false);
  const rate = useVoiceRate();
  const key = id ?? src;

  const doPlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    pauseOthers(key);
    audio.playbackRate = rate;
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => {
        setPlaying(false);
        setPlayError(true);
      });
  };
  const playRef = useRef(doPlay);
  playRef.current = doPlay;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const unregister = registerVoice(key, audio, () => playRef.current());
    const sync = () => setCurrent(audio.currentTime);
    const pause = () => setPlaying(false);
    const ended = () => {
      setPlaying(false);
      setCurrent(0);
      playNextAfter(key);
    };
    const onError = () => {
      setPlaying(false);
      setPlayError(true);
    };
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("ended", ended);
    audio.addEventListener("pause", pause);
    audio.addEventListener("error", onError);
    return () => {
      unregister();
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("pause", pause);
      audio.removeEventListener("error", onError);
    };
  }, [audioUrl, key]);

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
    <div className="flex min-w-44 items-center gap-2" data-voice-id={key}>
      {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="metadata" /> : null}
      <Button
        type="button"
        size="icon"
        variant={mine ? "secondary" : "ghost"}
        className="size-8 shrink-0"
        data-no-gesture
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
          if (audio.paused) doPlay();
          else audio.pause();
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
        <div
          className={cn(
            "mt-0.5 flex items-center justify-between gap-2 text-[11px]",
            mine ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">
              {failed ? "Не удалось загрузить — нажмите, чтобы повторить" : formatDuration(current || total)}
            </span>
            {!failed ? (
              <button
                type="button"
                data-no-gesture
                onClick={toggleRate}
                aria-label={`Скорость ${rate === 1 ? "1×" : "1,5×"}, переключить`}
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold leading-4",
                  mine ? "bg-primary-foreground/20" : "bg-secondary",
                  rate !== 1 && (mine ? "bg-primary-foreground/35" : "bg-primary/25 text-primary"),
                )}
              >
                {rate === 1 ? "1×" : "1,5×"}
              </button>
            ) : null}
          </span>
          {meta ? <span className="flex shrink-0 items-center gap-1">{meta}</span> : null}
        </div>
      </div>
    </div>
  );
}
