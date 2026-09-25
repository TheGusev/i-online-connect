import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_VOICE_SECONDS = 180;
/** Короче этого не отправляем — сервер всё равно отклонит запись без звука. */
export const MIN_VOICE_MS = 500;

export interface VoiceRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

/**
 * Реальная длительность записи в браузере: контейнер потоковой записи часто
 * не содержит длительности, поэтому ждём метаданные у <audio> и проверяем сами.
 */
function measureBlobDurationMs(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") {
      resolve(0);
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let done = false;
    const finish = (value: number) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : 0);
    };
    const timer = window.setTimeout(() => finish(0), 2500);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (audio.duration === Infinity) {
        // Safari/Chrome для потоковой записи сначала отдают Infinity — досматриваем до конца.
        audio.currentTime = 1e101;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          finish(audio.duration);
        };
        return;
      }
      finish(audio.duration);
    };
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

function supportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function voiceRecordingSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function microphoneError(cause: unknown) {
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Доступ к микрофону запрещён. Разрешите его в настройках браузера.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Микрофон не найден. Проверьте подключение устройства.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Микрофон занят другим приложением. Закройте его и попробуйте снова.";
  }
  return "Не удалось начать запись. Попробуйте ещё раз.";
}

export function useVoiceRecorder(onRecorded: (recording: VoiceRecording) => void) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const pendingStopRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    analyserRef.current = null;
    sampleRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }, []);

  /** Текущая громкость 0..1 из уже открытого потока — отдельный доступ не нужен. */
  const getLevel = useCallback(() => {
    const analyser = analyserRef.current;
    const sample = sampleRef.current;
    if (!analyser || !sample) return 0;
    analyser.getFloatTimeDomainData(sample);
    let sum = 0;
    for (let i = 0; i < sample.length; i += 1) sum += sample[i]! * sample[i]!;
    return Math.sqrt(sum / sample.length);
  }, []);

  const stop = useCallback((cancel = false) => {
    cancelledRef.current = cancel;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    // Кнопку отпустили раньше, чем рекордер реально стартовал — остановим в onstart.
    else if (recorder) pendingStopRef.current = true;
  }, []);

  const start = useCallback(async () => {
    if (!voiceRecordingSupported() || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedMimeType();
      // Некоторые версии Safari умеют MediaRecorder, но возвращают false для
      // всех isTypeSupported. В таком случае браузер сам выбирает MP4/AAC.
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      // Диагностика на реальных устройствах: какой формат реально выдал
      // браузер (на iPhone Safari это MP4/AAC, на Android — WebM/Opus).
      console.info(
        "[voice] MediaRecorder mimeType:",
        recorder.mimeType || mimeType || "по умолчанию",
      );
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      pendingStopRef.current = false;
      startedAtRef.current = 0;
      // Анализатор поверх того же потока: второй запрос микрофона не нужен.
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.8;
          ctx.createMediaStreamSource(stream).connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
          sampleRef.current = new Float32Array(analyser.fftSize);
        }
      } catch {
        // Без визуализации запись всё равно работает.
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("Запись прервалась. Попробуйте ещё раз.");
        setRecording(false);
        cleanup();
      };
      // Таймер и индикатор включаем только когда рекордер реально пишет звук,
      // иначе интерфейс показывает больше, чем попало в файл.
      recorder.onstart = () => {
        startedAtRef.current = Date.now();
        setSeconds(0);
        setRecording(true);
        if (pendingStopRef.current) {
          pendingStopRef.current = false;
          if (recorder.state === "recording") recorder.stop();
        }
      };
      recorder.onstop = () => {
        const heldMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
        const outputType = recorder.mimeType || mimeType || chunksRef.current[0]?.type || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: outputType });
        setRecording(false);
        setSeconds(0);
        cleanup();
        if (cancelledRef.current) return;
        void measureBlobDurationMs(blob).then((measuredMs) => {
          const durationMs = Math.min(MAX_VOICE_SECONDS * 1000, measuredMs || heldMs);
          console.info(
            "[voice] blob:",
            blob.size,
            "байт",
            blob.type,
            "длительность(мс):",
            measuredMs,
            "удержание(мс):",
            heldMs,
          );
          // Слишком короткую запись просто не отправляем — без предупреждений.
          if (blob.size < 512 || durationMs < MIN_VOICE_MS) return;
          onRecorded({ blob, durationMs, mimeType: blob.type || outputType });
        });
      };
      recorder.start();
      setSeconds(0);
    } catch (cause) {
      cleanup();
      setError(microphoneError(cause));
    }
  }, [cleanup, onRecorded, recording]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) stop(false);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, stop]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      cleanup();
    },
    [cleanup],
  );

  return {
    supported: voiceRecordingSupported(),
    recording,
    seconds,
    error,
    setError,
    start,
    stop,
    getLevel,
  };
}
