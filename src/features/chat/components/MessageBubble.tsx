import { AlertCircle, Check, CheckCheck, CalendarHeart, Clock, Reply } from "lucide-react";

import type { Message, MessageQuote } from "@/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/useSessionStore";
import { mediaUrl } from "@/api";
import { VoicePlayer } from "./VoicePlayer";
import { MediaAttachment } from "./MediaAttachment";
import { useMessageGestures, useReaction } from "@/features/chat/useMessageGestures";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Короткий текст цитаты: голос и встреча подписываются словами. */
export function quotePreview(quote: MessageQuote) {
  if (quote.deleted) return "Сообщение удалено";
  if (quote.kind === "voice") return "Голосовое сообщение";
  if (quote.kind === "image") return "Фото";
  if (quote.kind === "video") return "Видео";
  if (quote.kind === "meeting") return "Приглашение на встречу";
  return quote.text || "Сообщение";
}

/** Блокировки системного выделения и лупы iOS при удержании и свайпе. */
const NO_SELECT =
  "select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]";

export function MessageBubble({
  message,
  onRetry,
  onActions,
  onReply,
  onQuoteClick,
  participantName,
}: {
  message: Message;
  /** Повторить отправку, если сообщение не ушло. */
  onRetry?: (message: Message) => void;
  /** Долгое нажатие, правый клик или свайп влево — меню действий. */
  onActions?: (message: Message) => void;
  /** Свайп вправо — ответить на сообщение. */
  onReply?: (message: Message) => void;
  /** Нажатие на цитату — переход к исходному сообщению. */
  onQuoteClick?: (messageId: string) => void;
  /** Имя собеседника для подписи цитаты. */
  participantName?: string;
}) {
  const myId = useSessionStore((s) => s.user?.id);
  const mine = message.authorId === myId || message.authorId === "me";
  const meeting = message.kind === "meeting";
  const voice = message.kind === "voice";
  const media = message.kind === "image" || message.kind === "video";
  const failed = message.status === "failed";
  const deleted = Boolean(message.deletedAt);
  const replyable =
    Boolean(onReply) && !deleted && message.status !== "sending" && message.status !== "failed";
  const reaction = useReaction(message.id);
  const gestures = useMessageGestures({
    ...(onActions && !deleted ? { onHold: () => onActions(message) } : {}),
    ...(replyable ? { onReply: () => onReply?.(message) } : {}),
  });
  const swipe = gestures;

  const quote = message.replyTo;

  // Время и галочки: у голосовых показываем их в одной строке с длительностью.
  const stamp = (
    <>
      {message.editedAt && !deleted ? <span className="opacity-80">изменено</span> : null}
      {time(message.createdAt)}
      {mine && !deleted ? (
        message.status === "sending" ? (
          <Clock className="size-3.5" aria-label="Отправляется" />
        ) : message.status === "read" ? (
          <CheckCheck className="size-3.5" aria-label="Прочитано" />
        ) : (
          <Check className="size-3.5" aria-label="Отправлено" />
        )
      ) : null}
    </>
  );
  const voiceInline = voice && Boolean(message.mediaUrl) && !deleted && !failed;


  return (
    <li
      id={`message-${message.id}`}
      className={cn("flex scroll-mt-24 transition-shadow", NO_SELECT, reaction && "mb-3", mine ? "justify-end" : "justify-start")}
    >
      {swipe.offset > 12 ? (
        <span className={cn("mr-1 self-center text-primary transition-opacity", swipe.offset < 40 && "opacity-50")} aria-hidden="true">
          <Reply className="size-4" />
        </span>
      ) : null}
      <div
        draggable={false}
        {...gestures.handlers}
        style={{
          touchAction: "pan-y",
          transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined,
          transition: swipe.offset ? undefined : "transform 260ms cubic-bezier(.34,1.56,.64,1)",
        }}
        className={cn(
          "relative max-w-[78%] touch-pan-y rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-soft",
          // Долгое нажатие и свайп не должны вызывать выделение текста и лупу iOS.
          NO_SELECT,
          mine
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : "rounded-bl-lg border border-border bg-card text-foreground",
          // Голосовые компактнее и без лишней рамки вокруг плеера.
          voiceInline && "px-3 py-2",
          voiceInline && !mine && "border-transparent bg-card/70",
          // Фото и видео занимают пузырь целиком — отступы минимальные.
          media && !deleted && "px-1.5 pb-1.5 pt-1.5",
          meeting && !mine && "border-primary/25 bg-gradient-warm",
          message.status === "sending" && "opacity-70",
          failed && "ring-2 ring-destructive/60",
          deleted && "border border-dashed border-border bg-secondary/40 text-muted-foreground",
        )}
      >
        {quote ? (
          <button
            type="button"
            onClick={() => onQuoteClick?.(quote.id)}
            className={cn(
              "mb-2 flex w-full flex-col items-start gap-0.5 rounded-2xl border-l-2 px-2.5 py-1.5 text-left text-xs",
              NO_SELECT,
              mine
                ? "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground/85"
                : "border-primary bg-secondary/70 text-muted-foreground",
            )}
          >
            <span className="font-semibold">
              {quote.authorId === myId ? "Вы" : (participantName ?? "Собеседник")}
            </span>
            <span className="line-clamp-2 break-words opacity-90">{quotePreview(quote)}</span>
          </button>
        ) : null}
        {deleted ? (
          <p className="italic">Сообщение удалено</p>
        ) : (
          <>
            {meeting ? (
              <span
                className={cn(
                  "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
                  mine ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                <CalendarHeart className="size-3.5" aria-hidden="true" />
                Приглашение на встречу
              </span>
            ) : null}
            {voice && message.mediaUrl ? (
              <div data-no-gesture>
                <VoicePlayer
                  src={mediaUrl(message.mediaUrl) ?? message.mediaUrl}
                  duration={message.durationMs ?? 0}
                  mine={mine}
                  {...(voiceInline ? { meta: stamp } : {})}
                />
              </div>
            ) : media && message.mediaUrl ? (
              <MediaAttachment
                kind={message.kind === "video" ? "video" : "image"}
                src={message.mediaUrl}
                durationMs={message.durationMs}
                className="w-[min(18rem,70vw)]"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
            )}
          </>
        )}
        <span
          className={cn(
            "mt-1.5 flex items-center justify-end gap-1 text-[11px]",
            mine && !deleted ? "text-primary-foreground/75" : "text-muted-foreground",
            voiceInline && "hidden",
          )}
        >
          {failed ? (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              className="inline-flex flex-col items-end gap-0.5 text-right font-semibold"
            >
              <span className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                <AlertCircle className="size-3.5" aria-hidden="true" />
                Не отправлено · повторить
              </span>
              {message.errorMessage ? (
                <span className="font-normal opacity-90">{message.errorMessage}</span>
              ) : null}
            </button>
          ) : (
            stamp
          )}
        </span>
        {reaction ? (
          <span className={cn("absolute -bottom-3 rounded-full border border-border bg-card px-1.5 text-xs leading-5", mine ? "left-2" : "right-2")}>{reaction}</span>
        ) : null}
      </div>
      {swipe.offset < -12 ? (
        <span className={cn("ml-1 self-center text-primary transition-opacity", swipe.offset > -40 && "opacity-50")} aria-hidden="true">
          <Reply className="size-4 -scale-x-100" />
        </span>
      ) : null}
    </li>
  );
}
