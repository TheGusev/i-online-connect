import { useEffect, useRef, useState } from "react";
import type { SpaceMessage } from "@/api";
import { Avatar } from "@/components/ds";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { MediaAttachment } from "@/features/chat/components/MediaAttachment";
import { VoicePlayer } from "@/features/chat/components/VoicePlayer";
import type { PreparedMedia } from "@/features/chat/media";
import type { VoiceRecording } from "@/features/chat/useVoiceRecorder";
import { ChatBackground } from "@/features/chat/components/ChatBackground";
import { cn } from "@/lib/utils";
import { useKeyboardOpen } from "@/hooks/useViewportHeight";
import { useSessionStore } from "@/store/useSessionStore";
import { mediaUrl } from "@/api";

const timeFormatter = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Групповой чат сообщества — отдельно от личных диалогов. */
export function SpaceChat({
  messages,
  canWrite,
  onSend,
  onVoice,
  onMedia,
  sending,
  voiceSending,
  mediaSending,
  error,
  fill = false,
}: {
  /** Растянуть чат на всю оставшуюся высоту экрана. */
  fill?: boolean;
  messages: SpaceMessage[];
  canWrite: boolean;
  onSend: (text: string) => Promise<void>;
  onVoice: (recording: VoiceRecording) => void;
  /** Фото и видео: только для подтверждённых участников. */
  onMedia?: ((media: PreparedMedia) => void) | undefined;
  sending?: boolean | undefined;
  voiceSending?: boolean | undefined;
  mediaSending?: boolean | undefined;
  error?: string | null | undefined;
}) {
  const keyboardOpen = useKeyboardOpen();
  const myId = useSessionStore((s) => s.user?.id);
  const [text, setText] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, keyboardOpen]);

  return (
    <div
      className={cn(
        "overflow-hidden bg-background",
        fill ? "flex min-h-0 flex-1 flex-col" : "border-y border-border",
        !fill && keyboardOpen && "keyboard-viewport-fixed z-50 flex flex-col rounded-none border-0",
      )}
    >
      <div className={cn("relative isolate flex flex-col", fill || keyboardOpen ? "min-h-0 flex-1" : "")}>
        <ChatBackground />
      <div ref={scrollerRef} className={cn("relative space-y-3 overflow-y-auto overscroll-contain px-1 py-4", fill || keyboardOpen ? "min-h-0 flex-1" : "min-h-28 max-h-[clamp(7rem,calc(100dvh-34rem),24rem)]")}>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            В чате пока тихо. Можно поздороваться и спросить, как обычно проходят встречи.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.authorId === myId || message.authorId === "me";
            return (
              <div
                key={message.id}
                id={`message-${message.id}`}
                className={cn("flex gap-2", mine && "flex-row-reverse text-right")}
              >
                <Avatar name={message.authorName} size="sm" />
                <div className="min-w-0 max-w-[80%]">
                  <p className="text-xs text-muted-foreground">
                    {message.authorName} · {timeFormatter.format(new Date(message.createdAt))}
                  </p>
                  {message.kind === "voice" && message.mediaUrl ? (
                    <div className={cn("mt-1 text-sm", mine ? "text-primary-ink" : "text-foreground")}>
                      <VoicePlayer
                        src={mediaUrl(message.mediaUrl) ?? message.mediaUrl}
                        duration={message.durationMs ?? 0}
                        mine={false}
                      />
                    </div>
                  ) : (message.kind === "image" || message.kind === "video") && message.mediaUrl ? (
                    <div className="mt-1">
                      <MediaAttachment
                        kind={message.kind === "video" ? "video" : "image"}
                        src={message.mediaUrl}
                        durationMs={message.durationMs}
                        className="w-[min(16rem,66vw)]"
                      />
                    </div>
                  ) : (
                    <div className={cn("mt-1 rounded-2xl px-3.5 py-2 text-sm leading-relaxed", mine ? "bg-community text-community-foreground" : "bg-secondary text-secondary-foreground")}>
                      {message.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      </div>

      <div className={cn("shrink-0 bg-background/95 backdrop-blur", !keyboardOpen && "pb-[env(safe-area-inset-bottom)]")}>
        {error ? <p className="px-4 pt-2 text-xs text-destructive" role="alert">{error}</p> : null}
        <ChatComposer
          value={text}
          onChange={setText}
          onFocus={scrollToBottom}
          sending={sending ?? false}
          disabled={!canWrite}
          {...(canWrite ? { onVoice } : {})}
          {...(canWrite && onMedia ? { onMedia } : {})}
          {...(voiceSending !== undefined ? { voiceSending } : {})}
          {...(mediaSending !== undefined ? { mediaSending } : {})}
          placeholder={canWrite ? "Написать в общий чат" : "Чат доступен участникам сообщества"}
          onSend={() => {
            const value = text.trim();
            if (!value || !canWrite) return;
            void onSend(value).then(() => setText((current) => current === text ? "" : current)).catch(() => undefined);
          }}
        />
      </div>
    </div>
  );
}
