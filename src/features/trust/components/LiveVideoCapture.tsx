import { Camera, CircleStop, RotateCcw, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ds";

const MIN_SECONDS = 4;
const MAX_SECONDS = 8;

/** Первый поддерживаемый браузером контейнер: Safari умеет только mp4. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Запись живого видео-селфи: 4–8 секунд с фронтальной камеры.
 *
 * Ничего не отправляем сами — отдаём готовый Blob наверх, чтобы экран
 * верификации решал, когда его показать и когда загрузить.
 */
export function LiveVideoCapture({
  video,
  onRecorded,
  onRetake,
  disabled,
}: {
  video: Blob | null;
  onRecorded: (blob: Blob) => void;
  onRetake: () => void;
  disabled?: boolean;
}) {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  // Камеру просим только когда запись действительно нужна.
  useEffect(() => {
    if (video) return;
    let cancelled = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          await previewRef.current.play().catch(() => undefined);
        }
        setReady(true);
        setError(null);
      } catch {
        setError(
          "Не получилось включить камеру. Разреши доступ в настройках браузера — запись видит только проверка.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [video, stopStream]);

  // Превью записанного видео.
  useEffect(() => {
    if (!video) {
      setPlaybackUrl(null);
      return;
    }
    const url = URL.createObjectURL(video);
    setPlaybackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);

  // Таймер записи: сами останавливаемся на MAX_SECONDS.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) recorderRef.current?.stop();
  }, [recording, seconds]);

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === "undefined") {
      setError("Этот браузер не умеет записывать видео. Попробуй Chrome или Safari посвежее.");
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      setRecording(false);
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      stopStream();
      onRecorded(blob);
    };

    recorderRef.current = recorder;
    setSeconds(0);
    setRecording(true);
    recorder.start(500);
  };

  if (video) {
    return (
      <div>
        <video
          ref={playbackRef}
          src={playbackUrl ?? undefined}
          controls
          playsInline
          className="aspect-[3/4] w-full max-w-sm rounded-3xl border border-border bg-secondary object-cover"
        />
        <Button
          variant="ghost"
          className="mt-3"
          onClick={onRetake}
          disabled={disabled}
          type="button"
        >
          <RotateCcw aria-hidden="true" />
          Записать заново
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-secondary">
        <video
          ref={previewRef}
          muted
          playsInline
          className="aspect-[3/4] w-full scale-x-[-1] object-cover"
        />
        {recording ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-foreground/80 px-3 py-1 text-xs font-semibold text-background">
            <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            Запись {seconds}s / {MAX_SECONDS}s
          </span>
        ) : null}
        {!ready && !error ? (
          <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Включаем камеру…
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {recording ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => recorderRef.current?.stop()}
            disabled={seconds < MIN_SECONDS}
          >
            <CircleStop aria-hidden="true" />
            {seconds < MIN_SECONDS ? `Ещё ${MIN_SECONDS - seconds} с…` : "Остановить"}
          </Button>
        ) : (
          <Button type="button" onClick={start} disabled={!ready || disabled}>
            <Video aria-hidden="true" />
            Начать запись
          </Button>
        )}
      </div>

      <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Camera className="size-3.5" aria-hidden="true" />
        4–8 секунд, звук включён. Запись видит только проверка — в профиль она не попадает.
      </p>
    </div>
  );
}
