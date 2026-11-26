import * as Dialog from "@radix-ui/react-dialog";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Pause, Play, Plus, Trash2, Volume2, VolumeX, X, Star, SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, PointerEvent } from "react";
import { Avatar } from "@/components/ds";
import { getSessionRevision, isSessionCurrent } from "@/api/client";
import { storiesApi } from "./api";
import { groupStories } from "./model";
import type { StoryCursor, StoryItem, StoryPage } from "./model";
import { StoriesPreview } from "./StoriesPreview";
import { StoryContour } from "./StoryContour";

type Draft = { file: File; url: string; clientTempId: string; caption: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Не удалось выполнить действие";
const css = `
@keyframes live-stories-in{from{transform:translateY(-105%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes live-stories-out{from{transform:translateY(var(--stories-offset,0px));opacity:1}to{transform:translateY(-105%);opacity:0}}
@keyframes live-stories-fade-in{from{opacity:0}to{opacity:1}}
@keyframes live-stories-fade-out{from{opacity:1}to{opacity:0}}
.live-stories-sheet[data-state=open]{animation:live-stories-in 260ms ease-out}
.live-stories-sheet[data-state=closed]{animation:live-stories-out 240ms ease-in}
.live-stories-backdrop[data-state=open]{animation:live-stories-fade-in 260ms ease-out}
.live-stories-backdrop[data-state=closed]{animation:live-stories-fade-out 240ms ease-in}
@media(prefers-reduced-motion:reduce){.live-stories-sheet,.live-stories-backdrop{animation-duration:1ms!important}}
`;

/** Кнопки панели сторис: тот же вид, что у панели поста сообщества. */
const TOOL_BASE = "size-11 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
const TOOL = `${TOOL_BASE} grid text-muted-foreground hover:text-primary`;
const TOOL_ON = "bg-primary/10 text-primary";

export function StoriesButton({ ownerId }: { ownerId: string }) {
  const [preview, setPreview] = useState<boolean | null>(null);
  useEffect(() => {
    setPreview(new URLSearchParams(location.search).get("storiesPreview") === "1");
  }, []);
  if (preview === null) return null;
  return preview ? <StoriesPreview /> : <LiveStories ownerId={ownerId} />;
}

function LiveStories({ ownerId }: { ownerId: string }) {
  const client = useQueryClient();
  const key = useMemo(() => ["stories", ownerId, getSessionRevision()] as const, [ownerId]);
  const feed = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as StoryCursor | null,
    queryFn: ({ pageParam, signal }) => storiesApi.list(pageParam, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 15000, refetchInterval: 30000, retry: false,
  });
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const progress = useRef({ id: "", value: 0 });
  const progressBar = useRef<SVGPathElement>(null);
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [muted, setMuted] = useState(true);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [media, setMedia] = useState<{ id: string; url: string } | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [mediaRetry, setMediaRetry] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offset, setOffset] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const draftVideo = useRef<HTMLVideoElement>(null);
  const lifetime = useRef(0);
  const seenRequests = useRef(new Set<string>());
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const busy = uploading || deleting;
  const items = useMemo(() => feed.data?.pages.flatMap(page => page.items) ?? [], [feed.data]);
  const groups = useMemo(() => groupStories(items, ownerId, clock), [items, ownerId, clock]);
  const ordered = useMemo(() => {
    if (!open) return groups;
    const ranks = new Map(order.map((id, index) => [id, index]));
    return [...groups].sort((a, b) =>
      (ranks.get(a.id) ?? 100000) - (ranks.get(b.id) ?? 100000));
  }, [groups, open, order]);
  const flat = useMemo(() => ordered.flatMap(group => group.items), [ordered]);
  const current = flat.find(item => item.id === selected) ?? flat[0] ?? null;
  const position = current ? flat.findIndex(item => item.id === current.id) : -1;
  const authorGroup = ordered.find(group => group.id === current?.author.id);
  const authorPosition = Math.max(0,
    authorGroup?.items.findIndex(item => item.id === current?.id) ?? 0);
  const authorTotal = authorGroup?.items.length ?? 1;
  const finished = !!current && finishedId === current.id;
  const stopped = !open || paused || holding || hidden || !!draft || confirmDelete || busy || finished;
  const loaded = !!current && media?.id === current.id && readyId === current.id;
  const playable = loaded && (current?.kind === "image" || playingId === current?.id);
  const unseen = (feed.data?.pages[0]?.unseenCount ?? 0) > 0 ||
    groups.some(group => group.id !== ownerId && group.unseen);

  useEffect(() => () => { lifetime.current++; }, []);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), open ? 1000 : 30000);
    return () => window.clearInterval(timer);
  }, [open]);
  useEffect(() => {
    if (!draft) return;
    const url = draft.url;
    return () => URL.revokeObjectURL(url);
  }, [draft?.url]);
  useEffect(() => {
    if (hidden || !open) draftVideo.current?.pause();
  }, [hidden, open]);

  const choose = useCallback((id: string) => {
    setSelected(id);
    progress.current = { id, value: 0 };
    if (progressBar.current) {
      progressBar.current.style.strokeDashoffset = "100";
      progressBar.current.dataset["progressValue"] = "0";
    }
    setFinishedId(null);
    setPaused(false); setConfirmDelete(false); setError("");
  }, []);
  const next = useCallback(() => {
    if (!current) return;
    const target = flat[position + 1];
    if (target) choose(target.id);
    else setFinishedId(current.id);
  }, [flat, position, current, choose]);
  const previous = () => { if (position > 0) choose(flat[position - 1]!.id); };
  const changeOpen = (state: boolean) => {
    if (!state && busy) return;
    setOpen(state); setHolding(false); gesture.current = null;
    if (state) {
      setOffset(0); setClock(Date.now()); setOrder(groups.map(group => group.id));
      const target = groups.flatMap(group => group.items)
        .find(item => !item.mine && !item.seen) ?? groups.flatMap(group => group.items)[0];
      if (target) choose(target.id);
      void feed.refetch();
    } else {
      setDraft(null); setConfirmDelete(false); setError("");
    }
  };

  useEffect(() => {
    const id = current?.id;
    if (!open || !id) return;
    const controller = new AbortController();
    let active = true, url: string | undefined;
    setMedia(null); setMediaError(""); setReadyId(null); setPlayingId(null);
    void storiesApi.media(id, controller.signal).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setMedia({ id, url });
    }).catch(cause => {
      if (active && !controller.signal.aborted) setMediaError(message(cause));
    });
    return () => {
      active = false; controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, current?.id, mediaRetry]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    if (stopped || !current || media?.id !== current.id) element.pause();
    else void element.play().catch(() => { if (active) setPaused(true); });
    return () => { active = false; };
  }, [stopped, current?.id, media?.url]);

  const markSeen = useCallback(async (story: StoryItem) => {
    if (story.mine || story.seen || seenRequests.current.has(story.id)) return;
    seenRequests.current.add(story.id);
    const ticket = lifetime.current, revision = getSessionRevision();
    try {
      await storiesApi.view(story.id);
      if (lifetime.current !== ticket || !isSessionCurrent(revision)) return;
      client.setQueryData<InfiniteData<StoryPage>>(key, old => {
        if (!old) return old;
        const decrement = old.pages.some(page =>
          page.items.some(item => item.id === story.id && !item.seen));
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            unseenCount: Math.max(0, page.unseenCount - Number(decrement)),
            items: page.items.map(item =>
              item.id === story.id ? { ...item, seen: true } : item),
          })),
        };
      });
    } catch {
      if (lifetime.current === ticket && isSessionCurrent(revision)) {
        setError("Не удалось сохранить просмотр. Проверьте соединение.");
      }
    } finally { seenRequests.current.delete(story.id); }
  }, [client, key]);

  useEffect(() => {
    if (!current || stopped || !playable) return;
    const id = current.id;
    const kind = current.kind;
    let frame = 0;
    let previousTime = performance.now();

    const tick = (time: number) => {
      const elapsed = Math.max(0, time - previousTime);
      previousTime = time;
      let amount = progress.current.id === id ? progress.current.value : 0;

      if (kind === "image") {
        amount = Math.min(100, amount + elapsed / 5000 * 100);
      } else {
        const element = video.current;
        if (element && Number.isFinite(element.duration) && element.duration > 0) {
          amount = Math.min(100, Math.max(0,
            element.currentTime / element.duration * 100));
        }
      }

      progress.current = { id, value: amount };
      const bar = progressBar.current;
      if (bar) {
        bar.style.strokeDashoffset = String(100 - amount);
        bar.dataset["progressValue"] = String(amount);
      }

      if (kind === "image" && amount >= 100) {
        void markSeen(current);
        next();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [current, stopped, playable, next, markSeen]);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (busy || !event.isPrimary || event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    setHolding(true); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (dy < 0 && Math.abs(dy) > Math.abs(dx)) setOffset(dy);
  };
  const cancelGesture = () => {
    gesture.current = null; setHolding(false); setOffset(0);
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>, navigate: boolean) => {
    const start = gesture.current;
    gesture.current = null; setHolding(false);
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (dy < -70 && Math.abs(dy) > Math.abs(dx)) { changeOpen(false); return; }
    setOffset(0);
    if (!navigate || !current) return;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      const index = ordered.findIndex(group => group.id === current.author.id);
      const target = ordered[index + (dx < 0 ? 1 : -1)];
      const story = target?.items.find(item => !item.seen) ?? target?.items[0];
      if (story) choose(story.id);
    } else if (Math.abs(dx) < 14 && Math.abs(dy) < 14 && Date.now() - start.at < 250) {
      if (event.clientX < event.currentTarget.getBoundingClientRect().left + event.currentTarget.clientWidth / 2) previous();
      else next();
    }
  };
  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || busy) return;
    const image = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!image && !["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) {
      setError("Выберите JPEG, PNG, WebP, MP4, MOV или WebM"); return;
    }
    if (!file.size || file.size > (image ? 10 : 40) * 1024 * 1024) {
      setError(image ? "Фото — до 10 МБ" : "Видео — до 40 МБ"); return;
    }
    setDraftReady(false); setError(""); setUploadProgress(0);
    setDraft({ file, url: URL.createObjectURL(file), clientTempId: crypto.randomUUID(), caption: "" });
  };
  const publish = async () => {
    if (!draft || !draftReady || busy) return;
    const ticket = lifetime.current, revision = getSessionRevision();
    const valid = () => lifetime.current === ticket && isSessionCurrent(revision);
    setUploading(true); setError(""); setUploadProgress(0);
    try {
      const result = await storiesApi.publish(
        draft.file, draft.caption, draft.clientTempId,
        amount => { if (valid()) setUploadProgress(amount); },
      );
      if (!valid()) return;
      setDraft(null); choose(result.id);
      await client.invalidateQueries({ queryKey: key });
    } catch (cause) {
      if (valid()) setError(message(cause));
    } finally { if (valid()) setUploading(false); }
  };
  const remove = async () => {
    if (!current?.mine || busy) return;
    const id = current.id, ticket = lifetime.current, revision = getSessionRevision();
    const valid = () => lifetime.current === ticket && isSessionCurrent(revision);
    setDeleting(true); setError("");
    try {
      await storiesApi.remove(id);
      if (!valid()) return;
      client.setQueryData<InfiniteData<StoryPage>>(key, old => old ? ({
        ...old, pages: old.pages.map(page => ({
          ...page, items: page.items.filter(item => item.id !== id),
        })),
      }) : old);
      setConfirmDelete(false); setSelected(null);
      await client.invalidateQueries({ queryKey: key });
    } catch (cause) {
      if (valid()) setError(message(cause));
    } finally { if (valid()) setDeleting(false); }
  };

  return <>
    <style>{css}</style>
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button type="button"
          aria-label={unseen ? "Истории: есть непросмотренные" : "Истории"}
          className="grid size-11 shrink-0 place-items-center rounded-full text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <Star aria-hidden="true" className={`size-5 ${unseen ? "text-primary" : ""}`}
            style={unseen ? { filter: "drop-shadow(0 0 5px currentColor)" } : undefined} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="live-stories-backdrop fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content data-no-swipe
          onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={event => { if (busy) event.preventDefault(); }}
          className="live-stories-sheet fixed inset-0 z-[60] mx-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white shadow-2xl outline-none sm:inset-y-[3dvh] sm:h-[94dvh] sm:max-w-[520px] sm:rounded-2xl"
          style={{
            "--stories-offset": `${offset}px`,
            ...(open && offset ? { transform: `translateY(${offset}px)` } : {}),
          } as CSSProperties}>
          <Dialog.Title className="sr-only">Истории</Dialog.Title>
          <Dialog.Description className="sr-only">
            Истории ваших контактов. Нажмите слева или справа для переключения,
            удерживайте для паузы, смахните вверх для закрытия.
          </Dialog.Description>
          {current && !draft ? (
            <StoryContour key={current.id} progressRef={progressBar} />
          ) : null}
          <div data-story-toolbar=""
            className={`${draft ? "hidden" : "flex"} absolute inset-x-0 bottom-0 z-30 items-center gap-1 border-t border-border bg-card/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl`}>
            <div data-story-authors=""
              className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button type="button" disabled={busy} aria-label="Добавить историю"
                onClick={() => { setPaused(true); input.current?.click(); }}
                className={`${TOOL_BASE} grid border border-primary/40 text-primary hover:bg-primary/10`}>
                <Plus className="size-5" aria-hidden="true" />
                <span className="sr-only">Добавить</span>
              </button>
              {ordered.map(group => <button type="button" key={group.id} disabled={busy}
                aria-label={group.id === ownerId ? "Ваши истории" : `Истории: ${group.name}`}
                aria-current={group.id === current?.author.id ? "true" : undefined}
                onClick={() => {
                  setDraft(null);
                  const target = group.items.find(item => !item.seen) ?? group.items[0];
                  if (target) choose(target.id);
                }}
                className={`grid size-11 shrink-0 place-items-center rounded-full border-2 transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${group.id === current?.author.id ? "border-primary shadow-glow" : group.unseen ? "border-primary/50" : "border-border"}`}>
                <Avatar name={group.name} src={group.avatarUrl} size="sm" />
                <span className="sr-only">
                  {group.id === ownerId ? "Вы" : group.name}
                </span>
              </button>)}
              {feed.hasNextPage && <button type="button"
                disabled={busy || feed.isFetchingNextPage}
                onClick={() => { void feed.fetchNextPage(); }}
                className="h-11 shrink-0 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-primary disabled:opacity-40">
                {feed.isFetchingNextPage ? "…" : "Ещё"}
              </button>}
            </div>
            {current && !draft ? (
              <>
            {confirmDelete ? <div className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-card px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 text-sm">
              <span className="text-foreground">Удалить вашу историю?</span>
              <span className="flex items-center gap-1">
                <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}
                  className="h-11 rounded-full px-4 font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">Отмена</button>
                <button type="button" disabled={busy} onClick={() => { void remove(); }}
                  className="h-11 rounded-full px-4 font-semibold text-destructive disabled:opacity-40">
                  {deleting ? "Удаляем…" : "Удалить"}
                </button>
              </span>
            </div> : <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" aria-label="Предыдущая история" disabled={position <= 0}
                onClick={previous} className={`${TOOL_BASE} hidden text-muted-foreground hover:text-primary sm:grid`}><ChevronLeft className="size-5" aria-hidden="true" /></button>
              <button type="button" aria-label={paused || finished ? "Продолжить просмотр" : "Пауза"}
                onClick={() => {
                  if (finished) {
                    choose(current.id);
                    if (video.current) video.current.currentTime = 0;
                  } else setPaused(value => !value);
                }} className={`${TOOL} ${paused || finished ? TOOL_ON : ""}`}>
                {paused || finished ? <Play className="size-5" aria-hidden="true" /> : <Pause className="size-5" aria-hidden="true" />}
              </button>
              {current.kind === "video" && <button type="button"
                aria-label={muted ? "Включить звук" : "Выключить звук"}
                onClick={() => setMuted(value => !value)} className={`${TOOL} ${muted ? "" : TOOL_ON}`}>
                {muted ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />}
              </button>}
              {authorTotal > 1 ? (
                <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground"
                  aria-label={`История ${authorPosition + 1} из ${authorTotal}`}>
                  {authorPosition + 1} / {authorTotal}
                </span>
              ) : null}
              {current.mine ? (
                <span className="flex shrink-0 items-center gap-1 px-1 text-xs tabular-nums text-muted-foreground"
                  aria-label={`Просмотры: ${current.viewCount ?? 0}`}>
                  <Eye aria-hidden="true" className="size-4" />
                  {current.viewCount ?? 0}
                </span>
              ) : null}
              {current.mine && <button type="button" aria-label="Удалить свою историю"
                onClick={() => setConfirmDelete(true)} className={`${TOOL_BASE} grid text-destructive hover:bg-destructive/10`}><Trash2 className="size-5" aria-hidden="true" /></button>}
              <button type="button" aria-label="Следующая история" disabled={position >= flat.length - 1}
                onClick={next} className={`${TOOL_BASE} hidden text-muted-foreground hover:text-primary sm:grid`}><ChevronRight className="size-5" aria-hidden="true" /></button>
            </div>}

              </>
            ) : null}
          </div>
          <Dialog.Close disabled={busy} aria-label="Закрыть истории"
                className="absolute right-2 top-[max(.5rem,env(safe-area-inset-top))] z-50 grid size-11 place-items-center rounded-full bg-black/40 text-white disabled:opacity-40">
                <X className="size-5" />
              </Dialog.Close>
          <input ref={input} type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden" onChange={pickFile} />
          {(error || feed.error) && <div role="alert" className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+6rem)] z-40 rounded-xl bg-black/90 px-3 py-2 text-xs text-destructive">
            {error || message(feed.error)}
            {feed.error && <button type="button" onClick={() => { void feed.refetch(); }}
              className="ml-2 underline">Повторить</button>}
          </div>}

          {draft ? <>
            <p className="shrink-0 truncate px-4 py-1 text-xs text-muted-foreground">{draft.file.name}</p>
            <div className="relative min-h-0 flex-1 bg-black">
              {draft.file.type.startsWith("image/") ?
                <img src={draft.url} alt="Предпросмотр вашей истории" className="size-full object-contain"
                  onLoad={() => setDraftReady(true)}
                  onError={() => { setDraftReady(false); setError("Не удалось открыть фото"); }} /> :
                <video key={draft.clientTempId} ref={draftVideo} src={draft.url} controls playsInline
                  preload="metadata" className="size-full object-contain"
                  onLoadedMetadata={event => {
                    const duration = event.currentTarget.duration;
                    const valid = Number.isFinite(duration) && duration >= 0.2 && duration <= 30;
                    setDraftReady(valid);
                    if (!valid) setError("Выберите видео от 0,2 до 30 секунд");
                  }}
                  onError={() => { setDraftReady(false); setError("Браузер не смог открыть выбранное видео"); }} />}
            </div>
            <div className="shrink-0 space-y-2 p-3">
              <label className="block text-xs text-muted-foreground">
                Подпись
                <textarea maxLength={280} rows={1} disabled={busy} value={draft.caption}
                  onChange={event => {
                    const caption = event.target.value;
                    setDraft(old => old ? { ...old, caption, clientTempId: crypto.randomUUID() } : old);
                  }}
                  className="mt-1 block min-h-11 max-h-20 w-full resize-none overflow-y-auto rounded-2xl border border-border bg-background px-3 py-2.5 text-base leading-5 text-foreground sm:text-sm" />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Для контактов из личных чатов. Заблокированные не увидят.
              </p>
              {uploading && <div role="status" className="text-xs text-primary">
                {uploadProgress >= 99 ? "Обрабатываем и публикуем…" : `Загружаем: ${Math.floor(uploadProgress)}%`}
                <progress aria-label="Загрузка истории" max={100} value={uploadProgress} className="mt-1 block w-full" />
              </div>}
              <div className="flex items-center justify-end gap-1">
                <button type="button" disabled={busy} onClick={() => {
                  setDraft(null); setError(""); setPaused(false);
                }} className="grid size-11 place-items-center rounded-full border border-border text-white disabled:opacity-40">
                  <X className="size-5" aria-hidden="true" />
                  <span className="sr-only">Отмена</span>
                </button>
                <button type="button" disabled={!draftReady || busy} onClick={() => { void publish(); }}
                  className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                  <SendHorizontal className="size-5" aria-hidden="true" />
                  <span className="sr-only">{uploading ? "Публикуем…" : "Опубликовать"}</span>
                </button>
              </div>
            </div>
          </> : current ? <>
            <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-black"
              onPointerDown={pointerDown} onPointerMove={pointerMove}
              onPointerUp={event => pointerUp(event, true)}
              onPointerCancel={cancelGesture}
              onLostPointerCapture={() => { gesture.current = null; setHolding(false); }}>
              {current.kind === "image" && media?.id === current.id &&
                <img src={media.url} alt="" aria-hidden="true" draggable={false}
                  className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-35 blur-2xl" />}
              {media?.id === current.id ? current.kind === "image" ?
                <img key={current.id} src={media.url} alt={current.author.name} draggable={false}
                  className="pointer-events-none relative size-full object-contain"
                  onLoad={() => setReadyId(current.id)}
                  onError={() => setMediaError("Не удалось показать фото")} /> :
                <video key={current.id} ref={video} src={media.url} playsInline muted={muted}
                  className="pointer-events-none relative size-full object-contain"
                  onLoadedData={() => setReadyId(current.id)}
                  onPlaying={() => setPlayingId(current.id)}
                  onPause={() => setPlayingId(null)}
                  onWaiting={() => setPlayingId(null)}
                  onEnded={() => {
                    progress.current = { id: current.id, value: 100 };
                    if (progressBar.current) {
                      progressBar.current.style.strokeDashoffset = "0";
                      progressBar.current.dataset["progressValue"] = "100";
                    }
                    void markSeen(current);
                    next();
                  }}
                  onError={() => setMediaError("Видео не воспроизводится в этом браузере")} /> :
                <div role="status" className="grid size-full place-items-center px-5 text-center text-sm text-white">
                  {mediaError || "Загружаем историю…"}
                </div>}
              {current.caption && <p className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] whitespace-pre-wrap break-words bg-gradient-to-t from-black/75 to-transparent px-4 pb-2 pt-8 text-sm text-white">{current.caption}</p>}
            </div>
            {mediaError && <div className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-40 rounded-xl bg-black/90 px-3 py-2 text-xs text-destructive">
              {mediaError}
              <button type="button" className="ml-2 underline" onClick={() => {
                setMediaRetry(value => value + 1);
                void feed.refetch();
              }}>Повторить</button>
            </div>}
          </> : <div role="status" className="grid min-h-0 flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">
            {feed.isPending ? "Загружаем истории…" :
              feed.error ? "Истории пока недоступны. Попробуйте обновить." :
              "Пока нет историй. Поделитесь своим моментом через «Моя история»."}
          </div>}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
