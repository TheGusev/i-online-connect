import { useEffect, useRef } from "react";

export type ActivityMode = "typing" | "voice" | "peer-voice";

const LABEL: Record<ActivityMode, string> = {
  typing: "печатает…",
  voice: "Запись голоса",
  "peer-voice": "записывает голосовое",
};

/** Фиксированный по размеру бейдж: появление и скрытие не меняют высоту переписки. */
export function ActivityBadge({ mode }: { mode: ActivityMode | null }) {
  const last = useRef<ActivityMode>("typing");
  if (mode) last.current = mode;
  const shown = mode ?? last.current;
  return (
    <span
      role="status"
      aria-live="polite"
      className="activity-badge"
      data-active={mode ? "true" : "false"}
      data-mode={shown === "typing" ? "typing" : "voice"}
    >
      <span className="activity-bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      {LABEL[shown]}
    </span>
  );
}

/** Пока идёт запись голоса, раз в секунду сообщает собеседнику через сокет. */
export function VoicePing({
  active,
  send,
}: {
  active: boolean;
  send: (mode: "text" | "voice") => void;
}) {
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!active) return undefined;
    sendRef.current("voice");
    const timer = window.setInterval(() => sendRef.current("voice"), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return null;
}
