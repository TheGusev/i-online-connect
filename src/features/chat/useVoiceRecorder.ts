import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_VOICE_SECONDS = 180;

export interface VoiceRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
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
    typeof MediaRecorder !== "undefined" &&
    Boolean(supportedMimeType())
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
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const stop = useCallback((cancel = false) => {
    cancelledRef.current = cancel;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (!voiceRecordingSupported() || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedMimeType();
      if (!mimeType) throw new Error("unsupported");
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("Запись прервалась. Попробуйте ещё раз.");
        setRecording(false);
        cleanup();
      };
      recorder.onstop = () => {
        const durationMs = Math.min(MAX_VOICE_SECONDS * 1000, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        setRecording(false);
        setSeconds(0);
        cleanup();
        if (cancelledRef.current) return;
        if (blob.size < 512 || durationMs < 400) {
          setError("Запись слишком короткая. Удерживайте микрофон чуть дольше.");
          return;
        }
        onRecorded({ blob, durationMs, mimeType: blob.type || mimeType });
      };
      recorder.start();
      setSeconds(0);
      setRecording(true);
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

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    cleanup();
  }, [cleanup]);

  return { supported: voiceRecordingSupported(), recording, seconds, error, setError, start, stop };
}