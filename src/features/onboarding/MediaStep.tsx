import { useEffect, useRef, useState } from "react";
import { Camera, Check, Image as ImageIcon, Square, Upload, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ds";

const MAX_SECONDS = 15;

export function MediaStep({
  photoName,
  videoName,
  onPhoto,
  onVideo,
  onSubmit,
  onSkipVideo,
}: {
  photoName: string | null;
  videoName: string | null;
  onPhoto: (name: string | null) => void;
  onVideo: (name: string | null) => void;
  onSubmit: () => void;
  onSkipVideo: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [cameraError, setCameraError] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => stopStream, []);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stopRecording();
  }, [recording, seconds]);

  const startRecording = async () => {
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.onstop = () => {
        onVideo(`video-intro-${new Date().toISOString().slice(0, 19)}.webm`);
        stopStream();
        if (videoRef.current) videoRef.current.srcObject = null;
      };
      recorder.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setCameraError(true);
      stopStream();
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  return (
    <div className="space-y-5">
      {/* Фото */}
      <div className="rounded-3xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ImageIcon className="size-4 text-primary" aria-hidden="true" />
          {t("onboarding.s4.photo")}
        </p>
        <div className="mt-4 flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="size-full object-cover" />
            ) : (
              <Camera className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onPhoto(file.name);
                setPhotoPreview(URL.createObjectURL(file));
              }}
            />
            <span className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold shadow-soft">
              <Upload className="size-4" aria-hidden="true" />
              {t("onboarding.s4.photoUpload")}
            </span>
          </label>
          {photoName && (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <Check className="size-4" aria-hidden="true" />
              {t("onboarding.s4.photoReady")}
            </span>
          )}
        </div>
      </div>

      {/* Видео */}
      <div className="rounded-3xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Video className="size-4 text-primary" aria-hidden="true" />
          {t("onboarding.s4.video")}
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl bg-foreground/5">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`aspect-video w-full object-cover ${recording ? "" : "hidden"}`}
          />
          {!recording && (
            <div className="grid aspect-video w-full place-items-center text-sm text-muted-foreground">
              {videoName ? (
                <span className="flex items-center gap-2 text-success">
                  <Check className="size-4" aria-hidden="true" />
                  {t("onboarding.s4.videoReady")}
                </span>
              ) : (
                <Video className="size-7 opacity-40" aria-hidden="true" />
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {recording ? (
            <Button variant="danger" onClick={stopRecording}>
              <Square aria-hidden="true" />
              {t("onboarding.s4.stop")}
            </Button>
          ) : (
            <Button variant="secondary" onClick={startRecording}>
              <Camera aria-hidden="true" />
              {videoName ? t("onboarding.s4.rerecord") : t("onboarding.s4.record")}
            </Button>
          )}

          <label className="cursor-pointer">
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onVideo(file.name);
              }}
            />
            <span className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-foreground hover:bg-accent">
              <Upload className="size-4" aria-hidden="true" />
              {t("onboarding.s4.videoUpload")}
            </span>
          </label>

          {recording && (
            <span className="text-xs text-muted-foreground">
              {t("onboarding.s4.recording", { seconds })}
            </span>
          )}
        </div>

        {cameraError && (
          <p className="mt-3 text-xs text-warning-foreground">{t("onboarding.s4.cameraError")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={onSkipVideo}>
          {t("onboarding.s4.skipVideo")}
        </Button>
        <Button onClick={onSubmit} disabled={recording}>
          {t("onboarding.chat.next")}
        </Button>
      </div>
    </div>
  );
}
