import { ImagePlus, Mic, Pencil, Reply, SendHorizontal, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { useVoiceRecorder, type VoiceRecording } from "@/features/chat/useVoiceRecorder";
import { LiveVoiceWave } from "@/features/chat/components/VoiceWave";
import {
  CHAT_MEDIA_ACCEPT,
  prepareChatMedia,
  type PreparedMedia,
} from "@/features/chat/media";

const MAX_TEXTAREA_HEIGHT = 128;

function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onTyping,
  onFocus,
  sending = false,
  disabled = false,
  placeholder = "Напишите сообщение…",
  leading,
  onVoice,
  voiceSending = false,
  inputRef,
  editing = false,
  onCancelEdit,
  replyTo,
  onCancelReply,
  onMedia,
  mediaSending = false,
  mediaHint,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onTyping?: () => void;
  onFocus?: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  leading?: ReactNode;
  onVoice?: (recording: VoiceRecording) => void;
  voiceSending?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Идёт правка отправленного сообщения. */
  editing?: boolean;
  onCancelEdit?: () => void;
  /** Цитата: на какое сообщение отвечаем. */
  replyTo?: { authorName: string; preview: string } | null;
  onCancelReply?: () => void;
  /** Выбранное фото или видео готово к отправке. */
  onMedia?: (media: PreparedMedia) => void;
  mediaSending?: boolean;
  /** Почему кнопка вложения недоступна (например, нужна верификация). */
  mediaHint?: string;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const setInputRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (inputRef) inputRef.current = node;
    },
    [inputRef],
  );
  const voice = useVoiceRecorder((recording) => onVoice?.(recording));

  /** Выбор файла: проверяем и уменьшаем фото до отправки. */
  const pickMedia = async (file: File | undefined) => {
    if (!file || !onMedia) return;
    setMediaError(null);
    try {
      onMedia(await prepareChatMedia(file));
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Не удалось подготовить вложение");
    }
  };

  const resize = useCallback(() => {
    const input = localRef.current;
    if (!input) return;
    input.style.height = "0px";
    const height = Math.min(MAX_TEXTAREA_HEIGHT, Math.max(44, input.scrollHeight));
    input.style.height = `${height}px`;
    input.style.overflowY = input.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => resize(), [value, resize]);

  return (
    <div>
      {editing ? (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs text-primary-ink">
          <Pencil className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Изменение сообщения</span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="font-semibold text-muted-foreground underline-offset-2 hover:underline"
          >
            Отмена
          </button>
        </div>
      ) : null}
      <ReplyPanel replyTo={replyTo ?? null} {...(onCancelReply ? { onCancel: onCancelReply } : {})} />
      {voice.error || mediaError ? (
        <p className="px-4 pt-2 text-xs text-destructive" role="alert">
          {voice.error ?? mediaError}
        </p>
      ) : null}

      <form
        className={cn(
          "grid items-end gap-2 px-3 py-2.5 sm:px-4 sm:py-3",
          // Долгое нажатие для записи не должно вызывать лупу и меню выделения iOS.
          "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
          leading || onMedia || voice.recording
            ? "grid-cols-[auto_minmax(0,1fr)_auto]"
            : "grid-cols-[minmax(0,1fr)_auto]",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending && !voice.recording) onSend();
        }}
      >
        {leading || onMedia || voice.recording ? (
          <div className="flex shrink-0 items-center gap-1">
            {voice.recording ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Отменить запись"
                onClick={() => voice.stop(true)}
                className="shrink-0 border border-primary/60 bg-background text-primary shadow-glow hover:bg-primary/10"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : (
              <>
                {onMedia ? (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={CHAT_MEDIA_ACCEPT}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void pickMedia(file);
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      aria-label="Отправить фото или видео"
                      {...(mediaHint ? { title: mediaHint } : {})}
                      loading={mediaSending}
                      disabled={disabled || mediaSending}
                      onClick={() => fileRef.current?.click()}
                      className="shrink-0 border border-primary/40 text-primary hover:bg-primary/10"
                    >
                      <ImagePlus aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
                {leading}
              </>
            )}
          </div>
        ) : null}
        {voice.recording ? (
          <div className="flex h-11 min-w-0 select-none items-center gap-2 rounded-3xl border border-primary/40 bg-primary/10 px-3 shadow-glow [-webkit-touch-callout:none] [-webkit-user-select:none]">
            <span className="shrink-0 text-sm font-semibold tabular-nums text-primary-ink">
              {durationLabel(voice.seconds)}
            </span>
            <LiveVoiceWave getLevel={voice.getLevel} />
          </div>
        ) : (
          <textarea
            ref={setInputRef}
            rows={1}
            value={value}
            disabled={disabled || sending || voiceSending}
            onFocus={onFocus}
            onChange={(event) => {
              onChange(event.target.value);
              if (event.target.value.trim()) onTyping?.();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={placeholder}
            aria-label="Сообщение"
            className="min-h-11 min-w-0 resize-none rounded-3xl border border-input bg-background px-4 py-3 text-base leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:text-sm"
          />
        )}
        {value.trim() || !onVoice ? (
          <Button
            type="submit"
            size="icon"
            aria-label="Отправить"
            loading={sending}
            disabled={disabled || sending || voiceSending || !value.trim() || voice.recording}
            className="shrink-0"
          >
            <SendHorizontal aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            variant={voice.recording ? "primary" : "secondary"}
            aria-label={
              voice.recording
                ? "Отправить голосовое сообщение"
                : "Записать голосовое сообщение"
            }
            disabled={disabled || voiceSending}
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
            className={cn(
              "shrink-0 touch-none select-none",
              "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]",
              voice.recording
                ? "bg-primary text-primary-foreground shadow-glow animate-pulse"
                : "border border-primary/40 text-primary hover:bg-primary/10",
            )}
            onClick={() => {
              // Одно нажатие — старт записи, повторное — отправка.
              if (voice.recording) voice.stop(false);
              else void voice.start();
            }}
          >
            {voice.recording ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>
        )}
      </form>
    </div>
  );
}

/** Панель «ответ на сообщение» над полем ввода; плавно появляется и исчезает. */
function ReplyPanel({ replyTo, onCancel }: { replyTo: { authorName: string; preview: string } | null; onCancel?: () => void }) {
  const [last, setLast] = useState(replyTo);
  useEffect(() => { if (replyTo) setLast(replyTo); }, [replyTo]);
  const shown = replyTo ?? last;
  const open = Boolean(replyTo);
  const kind = shown?.preview === "Фото" ? "image" : shown?.preview === "Видео" ? "video" : shown?.preview === "Голосовое сообщение" ? "voice" : null;
  const KindIcon = kind === "image" ? ImageIcon : kind === "video" ? Video : kind === "voice" ? Mic : null;
  return (
    <div
      className={cn("grid transition-[grid-template-rows] duration-160 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        {shown ? (
          <div
            className={cn(
              "mx-3 mt-2 flex items-center gap-2 rounded-3xl border border-border bg-card py-1.5 pl-3 pr-2 transition-[opacity,transform] duration-160 ease-out motion-reduce:transition-none sm:mx-4",
              "[-webkit-touch-callout:none] [-webkit-user-select:none]",
              open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="w-0.5 self-stretch rounded-full bg-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-xs">
              <span className="flex items-center gap-1 font-bold text-primary">
                <Reply className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{shown.authorName}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                {KindIcon ? <KindIcon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                <span className="truncate">{kind === "voice" ? "Голосовое" : shown.preview}</span>
              </span>
            </div>
            <button
              type="button"
              aria-label="Отменить ответ"
              onClick={onCancel}
              tabIndex={open ? 0 : -1}
              className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
            >
              <span className="grid size-7 place-items-center rounded-full bg-foreground/[0.06]">
                <X className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
