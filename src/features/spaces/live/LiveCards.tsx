import { Check, ExternalLink, HelpCircle, Image as ImageIcon, Link2, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { mediaUrl } from "@/api";
import type { LiveCard } from "@/api/types";
import { BottomSheet, Button } from "@/components/ds";
import { compressListingPhoto } from "@/features/nearby/compress-image";
import { cn } from "@/lib/utils";

import { canManageCard, MAX_CARD_TEXT, safeLink, tableCards } from "./cards";
import type { LiveCardActions } from "./useLiveRoom";

const LAYER = "z-[95]";
const KIND_LABEL: Record<LiveCard["kind"], string> = { photo: "Фото", link: "Ссылка", note: "Заметка", question: "Вопрос" };
const KIND_ICON = { photo: ImageIcon, link: Link2, note: StickyNote, question: HelpCircle } as const;

const src = (card: LiveCard) => (card.mediaUrl ? (card.mediaUrl.startsWith("blob:") ? card.mediaUrl : (mediaUrl(card.mediaUrl) ?? card.mediaUrl)) : null);

/** Плитки в центре стола: последние 4 карточки сеткой 2×2, «ещё N» открывает список. */
export function TableCards({ cards, onOpen, onAll }: { cards: LiveCard[]; onOpen: (card: LiveCard) => void; onAll: () => void }) {
  const { shown, more } = tableCards(cards);
  if (cards.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-[17%] inset-y-[16%] flex flex-col items-center justify-center gap-2">
      <div className="grid w-full max-w-xs grid-cols-2 gap-2">
        {shown.map((card) => (
          <CardTile key={card.clientTempId} card={card} onClick={() => onOpen(card)} />
        ))}
      </div>
      {more > 0 ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAll(); }} className="pointer-events-auto rounded-full bg-card/90 px-3 py-1 text-xs font-semibold text-primary">
          ещё {more}
        </button>
      ) : null}
    </div>
  );
}

function CardTile({ card, onClick }: { card: LiveCard; onClick: () => void }) {
  const Icon = KIND_ICON[card.kind];
  const image = card.kind === "photo" ? src(card) : null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn("live-card pointer-events-auto relative flex h-16 min-w-0 items-center gap-2 overflow-hidden rounded-2xl border-2 p-2 text-left backdrop-blur-md", `live-card-${card.kind}`)}
    >
      {image ? <img src={image} alt="" className="size-11 shrink-0 rounded-lg object-cover" /> : <Icon className="size-4 shrink-0" aria-hidden="true" />}
      <span className="line-clamp-2 min-w-0 flex-1 text-[11px] font-semibold leading-tight text-foreground">
        {card.kind === "link" ? (card.domain ?? card.text) : card.text || KIND_LABEL[card.kind]}
      </span>
      {card.kind === "question" && card.status === "resolved" ? <Check className="absolute right-1 top-1 size-3.5 text-success" aria-label="Отвечен" /> : null}
    </button>
  );
}

/** Список всех карточек эфира. */
export function AllCardsSheet({ open, cards, onClose, onOpen }: { open: boolean; cards: LiveCard[]; onClose: () => void; onOpen: (card: LiveCard) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Карточки на столе" layerClassName={LAYER}>
      <div className="grid grid-cols-2 gap-2 pb-4">
        {cards.map((card) => <CardTile key={card.clientTempId} card={card} onClick={() => onOpen(card)} />)}
      </div>
    </BottomSheet>
  );
}

/** «Добавить на стол»: фото, ссылка, заметка или вопрос. */
export function AddCardSheet({ open, onClose, actions, canPhoto }: { open: boolean; onClose: () => void; actions?: LiveCardActions; canPhoto: boolean }) {
  const [kind, setKind] = useState<LiveCard["kind"] | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setKind(null); setText(""); setUrl(""); setError(null);
    if (file) URL.revokeObjectURL(file.preview);
    setFile(null);
    onClose();
  };

  const submit = async () => {
    if (!actions || !kind || busy) return;
    setError(null);
    const value = text.trim();
    if (kind === "link") {
      const link = safeLink(url);
      if (!link) { setError("Нужна ссылка, начинающаяся с http:// или https://"); return; }
      setBusy(true);
      const ok = await actions.addCard({ kind, url: link.url, ...(value ? { text: value } : {}) });
      setBusy(false);
      if (ok) close();
      return;
    }
    if (kind === "photo") {
      if (!file) { setError("Выберите фото"); return; }
      setBusy(true);
      const ok = await actions.addCard({ kind, file: file.file, previewUrl: file.preview });
      setBusy(false);
      if (ok) { setFile(null); close(); }
      return;
    }
    if (!value) { setError("Напишите текст"); return; }
    setBusy(true);
    const ok = await actions.addCard({ kind, text: value });
    setBusy(false);
    if (ok) close();
  };

  const field = "w-full rounded-2xl border border-input bg-background px-4 py-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <BottomSheet open={open} onClose={close} title="Добавить на стол" layerClassName={LAYER}>
      <div className="space-y-3 pb-4">
        <div className="grid grid-cols-4 gap-2">
          {(["photo", "link", "note", "question"] as const).map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => { setKind(k); setError(null); }}
                className={cn("flex flex-col items-center gap-1 rounded-2xl border p-2 text-xs font-semibold", kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground")}
              >
                <Icon className="size-5" aria-hidden="true" />
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>

        {kind === "photo" ? (
          canPhoto ? (
            <label className="block">
              <span className="sr-only">Фото</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                className={field}
                onChange={async (event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = "";
                  if (!picked) return;
                  try {
                    const ready = await compressListingPhoto(picked);
                    if (file) URL.revokeObjectURL(file.preview);
                    setFile({ file: ready, preview: URL.createObjectURL(ready) });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Не удалось подготовить фото");
                  }
                }}
              />
              {file ? <img src={file.preview} alt="Выбранное фото" className="mt-2 h-32 w-full rounded-2xl object-cover" /> : null}
            </label>
          ) : (
            <p className="rounded-2xl bg-secondary p-3 text-sm text-muted-foreground">Фото могут отправлять участники с подтверждённым профилем. Пройдите верификацию в разделе «Безопасность».</p>
          )
        ) : null}

        {kind === "link" ? (
          <input type="url" inputMode="url" maxLength={MAX_CARD_TEXT} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className={field} />
        ) : null}

        {kind && kind !== "photo" ? (
          <textarea
            rows={3}
            maxLength={MAX_CARD_TEXT}
            placeholder={kind === "question" ? "Ваш вопрос" : kind === "link" ? "Подпись (необязательно)" : "Текст заметки"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={cn(field, "resize-none")}
          />
        ) : null}

        {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
        {kind ? (
          <Button className="w-full" loading={busy} disabled={!actions || (kind === "photo" && !canPhoto)} onClick={() => void submit()}>
            Положить на стол
          </Button>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/** Полное содержимое карточки. */
export function CardDetailSheet({
  card, onClose, myId, startedBy, actions, onPhoto,
}: {
  card: LiveCard | null;
  onClose: () => void;
  myId: string | null;
  startedBy: string | null | undefined;
  actions?: LiveCardActions;
  onPhoto: (url: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const manage = card ? canManageCard(myId, card, startedBy) && !card.id.startsWith("temp-") : false;
  const close = () => { setConfirm(false); onClose(); };
  let body: ReactNode = null;
  if (card) {
    const image = src(card);
    if (card.kind === "photo" && image) {
      body = (
        <button type="button" onClick={() => onPhoto(image)} className="block w-full">
          <img src={image} alt="Фото с карточки" className="max-h-72 w-full rounded-2xl border-2 border-primary object-cover" />
        </button>
      );
    } else if (card.kind === "link") {
      body = (
        <div className="space-y-2">
          <p className="break-all font-semibold text-foreground">{card.url ? new URL(card.url).hostname : card.domain}</p>
          <p className="text-xs text-muted-foreground">Ссылка ведёт на внешний сайт</p>
          {card.url ? (
            <Button variant="secondary" onClick={() => window.open(card.url, "_blank", "noopener,noreferrer")}>
              <ExternalLink /> Открыть
            </Button>
          ) : null}
        </div>
      );
    }
  }
  return (
    <BottomSheet open={Boolean(card)} onClose={close} title={card ? KIND_LABEL[card.kind] : ""} layerClassName={LAYER}>
      {card ? (
        <div className="space-y-3 pb-4">
          {body}
          {card.text ? <p className="whitespace-pre-wrap break-words text-sm text-foreground">{card.text}</p> : null}
          {card.kind === "question" && card.status === "resolved" ? (
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="size-3.5" /> Отвечен</p>
          ) : null}
          {manage && actions ? (
            <div className="flex flex-wrap gap-2">
              {card.kind === "question" ? (
                <Button size="sm" variant="secondary" onClick={() => actions.resolveCard(card, card.status === "resolved" ? "open" : "resolved")}>
                  <Check /> {card.status === "resolved" ? "Снова открыт" : "Отвечен"}
                </Button>
              ) : null}
              {confirm ? (
                <>
                  <Button size="sm" variant="destructive" onClick={() => { actions.removeCard(card); close(); }}>Да, удалить</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Отмена</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} className="text-destructive">
                  <Trash2 /> Удалить
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}
