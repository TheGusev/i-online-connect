import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Pause, Play, Plus, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';

type Story = { id: string; author: string; name: string; kind: 'image' | 'video'; src: string };
const poster = (color: string, label: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#101827"/></linearGradient></defs><path fill="url(#g)" d="M0 0h540v960H0z"/><circle cx="410" cy="210" r="140" fill="white" opacity=".12"/><path d="M0 650 180 440 330 620 540 380V960H0Z" fill="white" opacity=".12"/><text x="40" y="760" fill="white" font-family="sans-serif" font-size="30">${label}</text><text x="40" y="810" fill="white" font-family="sans-serif" font-size="20">Демонстрационная история</text></svg>`);
const DEMO: Story[] = [
  { id: 'demo-1', author: 'demo-anna', name: 'Анна · демо', kind: 'image', src: poster('#7156b9', 'Вечерняя прогулка') },
  { id: 'demo-2', author: 'demo-anna', name: 'Анна · демо', kind: 'image', src: poster('#316b83', 'Момент дня') },
  { id: 'demo-3', author: 'demo-max', name: 'Максим · демо', kind: 'image', src: poster('#a26741', 'Рядом с нами') },
];
const css = `
@keyframes stories-in{from{transform:translateY(-105%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes stories-out{from{transform:translateY(0);opacity:1}to{transform:translateY(-105%);opacity:0}}
@keyframes stories-fade-in{from{opacity:0}to{opacity:1}}
@keyframes stories-fade-out{from{opacity:1}to{opacity:0}}
.stories-sheet[data-state=open]{animation:stories-in 260ms ease-out}
.stories-sheet[data-state=closed]{animation:stories-out 240ms ease-in}
.stories-backdrop[data-state=open]{animation:stories-fade-in 260ms ease-out}
.stories-backdrop[data-state=closed]{animation:stories-fade-out 240ms ease-in}
@media(prefers-reduced-motion:reduce){.stories-sheet,.stories-backdrop{animation-duration:1ms!important}}
`;

/** Local-only, explicitly opt-in prototype. No API, persistence or real contacts. */
export function StoriesPreview() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);
  const [finished, setFinished] = useState(false);
  const [muted, setMuted] = useState(true);
  const [draft, setDraft] = useState<Story | null>(null);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const stories = useMemo(() => [...DEMO, ...local], [local]);
  const current = stories[index]!;
  const authors = useMemo(() => [...new Map(stories.map(s => [s.author, s])).values()], [stories]);
  const blocked = !open || paused || holding || hidden || !!draft || !ready || finished;
  const unseen = stories.some(s => !seen.has(s.id));

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get('storiesPreview') === '1');
    const visibility = () => setHidden(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);
  const select = useCallback((next: number) => {
    const position = Math.max(0, Math.min(next, stories.length - 1));
    if (position !== index) setReady(false);
    setIndex(position); setProgress(0); setFinished(false); setError('');
  }, [index, stories.length]);
  const next = useCallback(() => {
    if (index + 1 < stories.length) select(index + 1);
    else setFinished(true);
  }, [index, stories.length, select]);
  const changeOpen = (value: boolean) => {
    setOpen(value); setHolding(false); gesture.current = null;
    if (value) { setPaused(false); select(Math.max(0, stories.findIndex(s => !seen.has(s.id)))); }
    else setDraft(null);
  };
  useEffect(() => {
    if (blocked) return;
    const timer = window.setTimeout(() => setSeen(old => new Set([...old, current.id])), 800);
    return () => window.clearTimeout(timer);
  }, [blocked, current.id]);
  useEffect(() => {
    if (blocked || current.kind !== 'image') return;
    const timer = window.setInterval(() => setProgress(p => Math.min(100, p + 2)), 100);
    return () => window.clearInterval(timer);
  }, [blocked, current.id, current.kind]);
  useEffect(() => { if (progress >= 100 && !finished && current.kind === 'image') next(); }, [progress, finished, current.kind, next]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (blocked) element.pause();
    else void element.play().catch(() => setPaused(true));
  }, [blocked, current.id]);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    setHolding(true); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>, navigate: boolean) => {
    const start = gesture.current; gesture.current = null; setHolding(false);
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (dy < -70 && Math.abs(dy) > Math.abs(dx)) { changeOpen(false); return; }
    if (!navigate) return;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      const author = authors.findIndex(s => s.author === current.author);
      const target = authors[author + (dx < 0 ? 1 : -1)];
      if (target) select(stories.findIndex(s => s.author === target.author));
    } else if (Math.abs(dx) < 14 && Math.abs(dy) < 14 && Date.now() - start.at < 250) {
      if (event.clientX < event.currentTarget.getBoundingClientRect().left + event.currentTarget.clientWidth / 2) select(index - 1);
      else next();
    }
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const image = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    const movie = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!image && !movie) { setError('Выберите JPEG, PNG, WebP, MP4, WebM или MOV.'); return; }
    if (file.size > (image ? 10 : 40) * 1024 * 1024) { setError(image ? 'Фото — до 10 МБ.' : 'Видео — до 40 МБ.'); return; }
    const src = URL.createObjectURL(file); urls.current.add(src); setError('');
    setDraft({ id: crypto.randomUUID(), author: 'local-me', name: 'Моя история · локально', kind: image ? 'image' : 'video', src });
  };

  if (!enabled) return null;
  return <>
    <style>{css}</style>
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label={unseen ? 'Истории: есть непросмотренные демо' : 'Истории — предпросмотр'} className="grid size-11 shrink-0 place-items-center rounded-full text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <Zap aria-hidden="true" className="size-5" style={unseen ? { color: 'var(--primary)', filter: 'drop-shadow(0 0 5px var(--primary))' } : undefined} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="stories-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content data-no-swipe className="stories-sheet fixed inset-x-2 top-[max(4rem,env(safe-area-inset-top))] z-[60] mx-auto flex h-[min(82dvh,760px)] max-h-[calc(100dvh-5rem)] max-w-lg flex-col overflow-hidden rounded-b-3xl rounded-t-xl border border-border bg-card text-foreground shadow-2xl outline-none">
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <Dialog.Title className="font-semibold">Истории</Dialog.Title>
            <Dialog.Close aria-label="Закрыть истории" className="grid size-11 place-items-center rounded-full hover:bg-secondary"><X className="size-5" /></Dialog.Close>
          </div>
          <Dialog.Description className="px-4 pb-2 text-xs text-muted-foreground">Предпросмотр. Демо и выбранные файлы видны только здесь. Отправка на сервер не подключена.</Dialog.Description>
          <div className="flex shrink-0 gap-3 overflow-x-auto px-4 py-2">
            <button type="button" onClick={() => input.current?.click()} className="flex min-w-16 flex-col items-center gap-1 text-xs"><span className="grid size-11 place-items-center rounded-full border border-dashed border-primary"><Plus className="size-5" /></span>Добавить</button>
            {authors.map(author => <button type="button" key={author.author} onClick={() => { setDraft(null); select(stories.findIndex(s => s.author === author.author)); }} className="flex min-w-20 flex-col items-center gap-1 text-xs"><span className={`grid size-11 place-items-center rounded-full border-2 ${stories.some(s => s.author === author.author && !seen.has(s.id)) ? 'border-primary' : 'border-border'}`}>{author.name[0]}</span><span>{author.name}</span></button>)}
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" className="hidden" onChange={chooseFile} />
          {error && <p role="alert" className="px-4 py-1 text-sm text-destructive">{error}</p>}
          {draft ? <>
            <div className="relative min-h-0 flex-1 bg-black">
              {draft.kind === 'image' ? <img src={draft.src} alt="Локальный предпросмотр выбранного фото" className="size-full object-contain" onError={() => setError('Фото не удалось открыть. Выберите другой файл.')} /> : <video key={draft.id} src={draft.src} controls playsInline muted preload="metadata" className="size-full object-contain" onLoadedMetadata={e => { if (!Number.isFinite(e.currentTarget.duration) || e.currentTarget.duration > 30) setError('Для прототипа выберите видео до 30 секунд.'); }} onError={() => setError('Видео не поддерживается этим браузером. Выберите другой файл.')} />}
            </div>
            <div className="flex shrink-0 flex-wrap justify-between gap-2 p-3">
              <button type="button" className="rounded-xl border border-border px-3 py-2 text-sm" onClick={() => { setDraft(null); setError(''); }}>Отмена</button>
              <button type="button" disabled={!!error} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={() => { setLocal(old => [...old, draft]); setIndex(stories.length); setReady(false); setProgress(0); setFinished(false); setDraft(null); }}>Добавить только локально</button>
            </div>
          </> : <>
            <div className="flex shrink-0 gap-1 px-3 pb-2" aria-hidden="true">{stories.filter(s => s.author === current.author).map(s => <span key={s.id} className="h-1 flex-1 overflow-hidden rounded bg-secondary"><span className="block h-full bg-primary" style={{ width: `${s.id === current.id ? progress : seen.has(s.id) ? 100 : 0}%` }} /></span>)}</div>
            <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-black" onPointerDown={pointerDown} onPointerUp={e => pointerUp(e, true)} onPointerCancel={() => { gesture.current = null; setHolding(false); }}>
              {current.kind === 'image' ? <img key={current.id} src={current.src} alt={current.name} draggable={false} className="pointer-events-none size-full object-contain" onLoad={() => setReady(true)} onError={() => { setReady(false); setError('Не удалось открыть историю. Можно перейти к следующей.'); }} /> : <video key={current.id} ref={video} src={current.src} playsInline muted={muted} preload="metadata" className="pointer-events-none size-full object-contain" onLoadedData={() => setReady(true)} onTimeUpdate={e => { const v = e.currentTarget; if (v.duration > 0) setProgress(Math.min(100, v.currentTime / v.duration * 100)); }} onEnded={() => { setSeen(old => new Set([...old, current.id])); next(); }} onError={() => { setReady(false); setError('Видео недоступно в этом браузере.'); }} />}
              <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-xs text-white">{current.name}</span>
            </div>
            <div className="flex shrink-0 items-center justify-between px-3 pt-1">
              <button type="button" aria-label="Предыдущая история" disabled={index === 0} onClick={() => select(index - 1)} className="grid size-11 place-items-center disabled:opacity-30"><ChevronLeft className="size-5" /></button>
              <button type="button" aria-label={paused || finished ? 'Продолжить просмотр' : 'Пауза'} onClick={() => { if (finished) { select(index); if (video.current) video.current.currentTime = 0; } setPaused(p => finished ? false : !p); }} className="grid size-11 place-items-center">{paused || finished ? <Play className="size-5" /> : <Pause className="size-5" />}</button>
              {current.kind === 'video' && <button type="button" aria-label={muted ? 'Включить звук' : 'Выключить звук'} onClick={() => setMuted(m => !m)} className="grid size-11 place-items-center">{muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}</button>}
              <span className="text-xs text-muted-foreground">{index + 1} / {stories.length}</span>
              <button type="button" aria-label="Следующая история" disabled={index === stories.length - 1} onClick={next} className="grid size-11 place-items-center disabled:opacity-30"><ChevronRight className="size-5" /></button>
            </div>
          </>}
          <div className="shrink-0 touch-none pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-[10px] text-muted-foreground" onPointerDown={pointerDown} onPointerUp={e => pointerUp(e, false)} onPointerCancel={() => { gesture.current = null; setHolding(false); }}><span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-border" />Свайп вверх — закрыть</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
