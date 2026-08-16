import { Camera, CameraOff, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ds";

/**
 * Live-селфи через камеру с рамкой-подсказкой.
 * Кадр остаётся на устройстве: наружу уходит только data URL для мок-сверки.
 */
export function SelfieCapture({
  shot,
  onShot,
  onRetake,
}: {
  shot: string | null;
  onShot: (dataUrl: string) => void;
  onRetake: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "live" | "denied">("idle");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("live");
    } catch {
      setStatus("denied");
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const size = Math.min(video.videoWidth || 720, video.videoHeight || 720);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      video,
      ((video.videoWidth || size) - size) / 2,
      ((video.videoHeight || size) - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size,
    );
    onShot(canvas.toDataURL("image/jpeg", 0.9));
    stop();
    setStatus("idle");
  };

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-secondary">
        {shot ? (
          <img src={shot} alt="Твоё селфи для верификации" className="size-full object-cover" />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full scale-x-[-1] object-cover"
            />
            {/* Рамка-подсказка */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-[72%] w-[56%] rounded-[50%] border-2 border-dashed border-primary/80 shadow-[0_0_0_9999px_color-mix(in_oklab,var(--color-foreground)_28%,transparent)]" />
            </div>
            <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs font-semibold text-primary-foreground">
              {status === "live"
                ? "Расположите лицо в овале"
                : status === "denied"
                  ? "Нет доступа к камере"
                  : "Камера пока выключена"}
            </p>
          </>
        )}
      </div>

      {shot ? (
        <Button variant="secondary" fullWidth onClick={onRetake}>
          <RotateCcw aria-hidden="true" />
          Сделать другое селфи
        </Button>
      ) : status === "live" ? (
        <Button fullWidth onClick={capture}>
          <Camera aria-hidden="true" />
          Снять селфи
        </Button>
      ) : (
        <div className="space-y-2">
          <Button fullWidth onClick={() => void start()}>
            <Camera aria-hidden="true" />
            Включить камеру
          </Button>
          {status === "denied" ? (
            <p className="inline-flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <CameraOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Камера недоступна — разреши доступ в настройках браузера. Ничего страшного, к
              верификации можно вернуться в любой момент.
            </p>
          ) : null}
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Кадр нужен только для сверки с фото в профиле. Он не появляется в ленте и удаляется после
        проверки.
      </p>
    </div>
  );
}
