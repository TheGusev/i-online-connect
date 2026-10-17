import { useEffect, useRef, useState } from "react";
import { mediaUrl, type Message, type SpaceMessage } from "@/api";
import { Avatar } from "@/components/ds";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { MessageBubble, quotePreview } from "@/features/chat/components/MessageBubble";
import { MessageActions } from "@/features/chat/components/MessageActions";
import type { PreparedMedia } from "@/features/chat/media";
import type { VoiceRecording } from "@/features/chat/useVoiceRecorder";
import { ChatBackground } from "@/features/chat/components/ChatBackground";
import { cn } from "@/lib/utils";
import { MediaAlbum } from "@/features/chat/components/MediaAlbum";
import { groupMessages } from "@/features/chat/albums";
import { useKeyboardOpen } from "@/hooks/useViewportHeight";
import { useSessionStore } from "@/store/useSessionStore";

export function SpaceChat({ messages, canWrite, onSend, onVoice, onMedia, onPhotos, onRetryPhoto, onEdit, onDelete, isHost = false, sending, voiceSending, mediaSending, error, fill = false }: {
  fill?: boolean;
  messages: SpaceMessage[];
  canWrite: boolean;
  isHost?: boolean;
  onSend: (text: string, replyToId?: string) => Promise<void>;
  onVoice: (recording: VoiceRecording, replyToId?: string) => void;
  onMedia?: ((media: PreparedMedia, replyToId?: string) => void) | undefined;
  onPhotos?: ((photos: PreparedMedia[], caption: string, replyToId?: string) => void) | undefined;
  onRetryPhoto?: ((clientTempId: string) => void) | undefined;
  onEdit: (messageId: string, text: string) => Promise<void>;
  onDelete: (messageId: string) => void;
  sending?: boolean | undefined;
  voiceSending?: boolean | undefined;
  mediaSending?: boolean | undefined;
  error?: string | null | undefined;
}) {
  const keyboardOpen = useKeyboardOpen();
  const myId = useSessionStore((s) => s.user?.id);
  const [text, setText] = useState("");
  const [actions, setActions] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [reply, setReply] = useState<Message | null>(null);
  const [replyAlbum, setReplyAlbum] = useState<Message[] | null>(null);
  const [actionsAlbum, setActionsAlbum] = useState<Message[] | null>(null);
  const [editPending, setEditPending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollToBottom = () => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };
  useEffect(() => { scrollToBottom(); }, [messages.length, keyboardOpen]);
  const startReply = (message: Message, album?: Message[]) => {
    setEditing(null);
    setReplyAlbum(album && album.length > 1 ? album : null);
    setReply(message);
    inputRef.current?.focus();
  };
  const jump = (messageId: string) => {
    const node = document.getElementById(`message-${messageId}`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    const bubble = node?.querySelector("[data-bubble]");
    bubble?.classList.add("msg-flash");
    window.setTimeout(() => bubble?.classList.remove("msg-flash"), 1300);
  };
  const submit = async () => {
    const value = text.trim();
    if (!value || !canWrite || editPending) return;
    if (editing) {
      setEditPending(true);
      try {
        await onEdit(editing.id, value);
        setEditing(null);
        setText("");
      } finally { setEditPending(false); }
    } else {
      await onSend(value, reply?.id);
      setText((current) => current === text ? "" : current);
      setReply(null);
    }
  };
  return (
    <div className={cn("overflow-hidden bg-background", fill ? "flex min-h-0 flex-1 flex-col" : "border-y border-border", !fill && keyboardOpen && "keyboard-viewport-fixed z-50 flex flex-col rounded-none border-0")}>
      <div className={cn("relative isolate flex flex-col", fill || keyboardOpen ? "min-h-0 flex-1" : "")}>
        <ChatBackground />
        <div ref={scrollerRef} className={cn("relative overflow-y-auto overscroll-contain px-1 py-4", fill || keyboardOpen ? "min-h-0 flex-1" : "min-h-28 max-h-[clamp(7rem,calc(100dvh-34rem),24rem)]")}>
          {messages.length === 0 ? <p className="text-sm text-muted-foreground">В чате пока тихо. Можно поздороваться и спросить, как обычно проходят встречи.</p> : (
            <ul className="space-y-3">
              {groupMessages(messages).map((group) => {
                if (group.type === "album") {
                  const first = group.messages[0]!;
                  const mine = first.authorId === myId;
                  return (
                    <li key={`album-${first.clientTempId ?? first.id}`} className={cn("flex min-w-0 gap-2", mine && "flex-row-reverse")}>
                      <Avatar name={first.authorName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className={cn("mb-1 text-xs text-muted-foreground", mine && "text-right")}>{first.authorName}</p>
                        <ul>
                          <MediaAlbum
                            messages={group.messages.map((m) => ({ ...m, conversationId: m.spaceId }))}
                            authorName={first.authorName}
                            onRetry={(m) => { if (m.clientTempId) onRetryPhoto?.(m.clientTempId); }}
                            {...(canWrite ? {
                              onActions: (m: Message, album: Message[]) => { setActionsAlbum(album); setActions(m); },
                              onReply: (album: Message[]) => startReply(album[0]!, album),
                              onDelete: (list: Message[]) => list.forEach((m) => onDelete(m.id)),
                            } : {})}
                          />
                        </ul>
                      </div>
                    </li>
                  );
                }
                const message = group.message;
                const mine = message.authorId === myId;
                const adapted: Message = { ...message, conversationId: message.spaceId };
                const author = messages.find((m) => m.authorId === message.replyTo?.authorId)?.authorName;
                return (
                  <li key={message.id} className={cn("flex min-w-0 gap-2", mine && "flex-row-reverse")}>
                    <Avatar name={message.authorName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className={cn("mb-1 text-xs text-muted-foreground", mine && "text-right")}>{message.authorName}</p>
                      <ul>
                        <MessageBubble message={adapted} participantName={author ?? message.authorName} onQuoteClick={jump} onRetry={(m) => { if (m.clientTempId) onRetryPhoto?.(m.clientTempId); }} {...(canWrite ? { onActions: (m: Message) => { setActionsAlbum(null); setActions(m); }, onReply: (m: Message) => startReply(m) } : {})} />
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className={cn("shrink-0 bg-background/95 backdrop-blur", !keyboardOpen && "pb-[env(safe-area-inset-bottom)]")}>
        {error ? <p className="px-4 pt-2 text-xs text-destructive" role="alert">{error}</p> : null}
        <ChatComposer
          value={text} onChange={setText} inputRef={inputRef} onFocus={scrollToBottom}
          sending={(sending ?? false) || editPending} disabled={!canWrite}
          editing={Boolean(editing)} onCancelEdit={() => { setEditing(null); setText(""); }}
          replyTo={reply ? { authorName: reply.authorId === myId ? "Вы" : (messages.find((m) => m.id === reply.id)?.authorName ?? "Участник"), preview: replyAlbum ? `Фото (${replyAlbum.length})` : quotePreview(reply), ...(replyAlbum?.[0]?.mediaUrl ? { thumb: replyAlbum[0].mediaUrl.startsWith("blob:") ? replyAlbum[0].mediaUrl : (mediaUrl(replyAlbum[0].mediaUrl) ?? undefined) } : {}) } : null}
          onCancelReply={() => { setReply(null); setReplyAlbum(null); }}
          {...(canWrite && !editing ? { onVoice: (recording: VoiceRecording) => { onVoice(recording, reply?.id); setReply(null); } } : {})}
          {...(canWrite && onPhotos && !editing ? { onPhotos: (photos: PreparedMedia[], caption: string) => { onPhotos(photos, caption, reply?.id); setReply(null); } } : {})}
          {...(canWrite && onMedia && !editing ? { onMedia: (media: PreparedMedia) => { onMedia(media, reply?.id); setReply(null); } } : {})}
          {...(voiceSending !== undefined ? { voiceSending } : {})}
          {...(mediaSending !== undefined ? { mediaSending } : {})}
          placeholder={canWrite ? "Написать в общий чат" : "Чат доступен участникам сообщества"}
          onSend={() => { void submit().catch(() => undefined); }}
        />
      </div>
      <MessageActions message={actions} mine={actions?.authorId === myId} canDelete={Boolean(actions && (actions.authorId === myId || isHost))} onClose={() => { setActions(null); setActionsAlbum(null); }} album={actionsAlbum} onDeleteAlbum={(list) => list.forEach((m) => onDelete(m.id))} onEdit={(message) => { setReply(null); setEditing(message); setText(message.text); inputRef.current?.focus(); }} onDelete={(message) => { onDelete(message.id); if (editing?.id === message.id) { setEditing(null); setText(""); } }} />
    </div>
  );
}
