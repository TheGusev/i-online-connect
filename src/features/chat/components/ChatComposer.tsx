import { Mic, Pencil, Reply, SendHorizontal, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { useVoiceRecorder, type VoiceRecording } from "@/features/chat/useVoiceRecorder";
import { LiveVoiceWave } from "@/features/chat/components/VoiceWave";

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
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const setInputRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (inputRef) inputRef.current = node;
    },
    [inputRef],
  );
  const voice = useVoiceRecorder((recording) => onVoice?.(recording));

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
      {replyTo ? (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs [-webkit-touch-callout:none] [-webkit-user-select:none]">
          <Reply className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-primary-ink">{replyTo.authorName}</span>
            <span className="text-muted-foreground"> · {replyTo.preview}</span>
          </span>
          <button
            type="button"
            aria-label="Отменить ответ"
            onClick={onCancelReply}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {voice.error ? (
        <p className="px-4 pt-2 text-xs text-destructive" role="alert">
          {voice.error}
        </p>
      ) : null}

      <form
        className={cn(
          "grid items-end gap-2 px-3 py-2.5 sm:px-4 sm:py-3",
          // Долгое нажатие для записи не должно вызывать лупу и меню выделения iOS.
          "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
          leading ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending && !voice.recording) onSend();
        }}
      >
        {leading ? (
          <div className="shrink-0">
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
              leading
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
