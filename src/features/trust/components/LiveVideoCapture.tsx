import { AlertTriangle, Camera, CircleStop, RotateCcw, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ds";

const MIN_SECONDS = 4;
const MAX_SECONDS = 8;
/** Сколько ждём ответа от камеры, прежде чем считать, что она не откроется. */
const CAMERA_TIMEOUT_MS = 15_000;

/** Первый поддерживаемый браузером контейнер: Safari умеет только mp4. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Что мешает записать видео в этом браузере. null — всё в порядке.
 *
 * Проверяем до запроса камеры: на iOS Safari по http `mediaDevices` вообще
 * отсутствует, и без этой проверки экран просто «зависал» без объяснений.
 */
function supportProblem(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return "Камера работает только на защищённом соединении (https). Откройте сайт по адресу с https — и запись станет доступна.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Этот браузер не даёт доступ к камере. Откройте страницу в Safari или Chrome посвежее — или напишите нам в поддержку, проверим вручную.";
  }
  if (typeof MediaRecorder === "undefined") {
    return "Этот браузер не умеет записывать видео. Попробуйте Safari или Chrome посвежее — или напишите нам в поддержку.";
  }
  return null;
}

/** Понятная причина отказа камеры вместо технического кода ошибки. */
function cameraErrorText(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Доступ к камере запрещён. Разрешите камеру для этого сайта в настройках браузера и нажмите «Попробовать снова» — запись видит только проверка.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Не нашли фронтальную камеру. Проверьте, что камера есть и не отключена, затем попробуйте снова.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Камера занята другим приложением. Закройте видеозвонки и другие вкладки с камерой и попробуйте снова.";
  }
  return "Не получилось включить камеру. Проверьте разрешения браузера и попробуйте снова — запись видит только проверка.";
}

/**
 * Запись живого видео-селфи: 4–8 секунд с фронтальной камеры.
 *
 * Камера включается только по нажатию кнопки: iOS Safari требует явный
 * пользовательский жест, иначе запрос молча не срабатывает.
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

  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  // Поддержку проверяем на клиенте: при SSR никаких navigator нет.
  useEffect(() => setUnsupported(supportProblem()), []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  // Поток гасим, когда компонент уходит или уже есть записанное видео.
  useEffect(() => {
    if (video) stopStream();
    return () => stopStream();
  }, [video, stopStream]);

  const enableCamera = useCallback(async () => {
    const problem = supportProblem();
    if (problem) {
      setUnsupported(problem);
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 } },
          audio: true,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("camera-timeout")),
            CAMERA_TIMEOUT_MS,
          ),
        ),
      ]);
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play().catch(() => undefined);
      }
      setReady(true);
    } catch (cause) {
      stopStream();
      setError(
        cause instanceof Error && cause.message === "camera-timeout"
          ? "Камера не ответила за 15 секунд. Проверьте разрешения браузера и попробуйте снова."
          : cameraErrorText(cause),
      );
    } finally {
      setStarting(false);
    }
  }, [stopStream]);

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

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setError("Этот браузер не смог начать запись. Попробуйте Safari или Chrome посвежее.");
      return;
    }
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      setRecording(false);
      setError("Запись прервалась. Попробуйте ещё раз.");
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

  if (unsupported) {
    return (
      <div className="rounded-3xl border border-border bg-secondary p-5">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
          {unsupported}
        </p>
        <Button variant="ghost" className="mt-3" type="button" onClick={() => setUnsupported(supportProblem())}>
          <RotateCcw aria-hidden="true" />
          Проверить снова
        </Button>
      </div>
    );
  }

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
        {!ready ? (
          <span className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-muted-foreground">
            {starting ? "Включаем камеру…" : "Камера включится после нажатия кнопки"}
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm leading-relaxed text-destructive">{error}</p> : null}

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
        ) : ready ? (
          <Button type="button" onClick={start} disabled={disabled}>
            <Video aria-hidden="true" />
            Начать запись
          </Button>
        ) : (
          <Button type="button" onClick={() => void enableCamera()} disabled={starting || disabled}>
            <Camera aria-hidden="true" />
            {starting ? "Включаем…" : error ? "Попробовать снова" : "Включить камеру"}
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
