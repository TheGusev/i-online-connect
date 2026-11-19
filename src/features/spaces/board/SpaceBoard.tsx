import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, MessageCircle, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ds';
import { ChatBackground } from '@/features/chat/components/ChatBackground';
import { formatEventDate } from '@/features/spaces/labels';
import { LiveIcon } from '@/features/spaces/live/LiveIcon';
import { useSessionStore } from '@/store/useSessionStore';

import { AddPostSheet } from './AddPostSheet';
import { PostTile, ShelfBlock } from './BoardParts';
import { useAddPost, useBoard, useDeletePost, useMarkBoardRead, useNow, useUpdatePost } from './hooks';
import { PostDetailSheet } from './PostDetailSheet';
import { fieldCapacity, splitBoard } from './split';
import type { BoardAddInput } from './types';

export interface BoardEvent {
  id: string;
  title: string;
  startsAt: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Доска сообщества: сверху полка со старыми карточками (листается вправо и влево),
 * в середине чистое поле только со свежим, внизу панель действий как в эфире.
 */
export function SpaceBoard({
  spaceId,
  isMember,
  isHost,
  canPhoto,
  events,
  liveActive,
  onOpenLive,
  onOpenDiscussion,
}: {
  spaceId: string;
  isMember: boolean;
  isHost: boolean;
  canPhoto: boolean;
  events: BoardEvent[];
  liveActive: boolean;
  onOpenLive: () => void;
  onOpenDiscussion: () => void;
}) {
  const navigate = useNavigate();
  const myId = useSessionStore((state) => state.user?.id ?? null);
  const now = useNow();
  const board = useBoard(spaceId, isMember);
  const add = useAddPost(spaceId);
  const update = useUpdatePost(spaceId);
  const remove = useDeletePost(spaceId);
  const posts = useMemo(() => board.data?.posts ?? [], [board.data]);
  const latestId = posts[0]?.id ?? '';
  useMarkBoardRead(spaceId, isMember, latestId);

  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [capacity, setCapacity] = useState(4);

  useEffect(() => {
    const element = fieldRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setCapacity(fieldCapacity(element.clientHeight - 16));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { field, shelf } = useMemo(() => splitBoard(posts, now, capacity), [posts, now, capacity]);
  const openPost = openId ? (posts.find((post) => post.id === openId) ?? null) : null;

  const nextEvent = useMemo(
    () =>
      events
        .map((event) => ({ event, time: Date.parse(event.startsAt) }))
        .filter((item) => item.time > now && item.time - now < WEEK_MS)
        .sort((a, b) => a.time - b.time)[0]?.event,
    [events, now],
  );

  const submit = async (input: BoardAddInput): Promise<boolean> => {
    try {
      await add.mutateAsync(input);
      toast.success('Положили на стол');
      return true;
    } catch (error) {
      toast.error(messageOf(error, 'Не удалось добавить карточку'));
      return false;
    }
  };

  return (
    <section className='relative isolate flex min-h-0 flex-1 flex-col'>
      <ChatBackground />
      {shelf.length > 0 ? (
        <div className='shrink-0 px-4 pt-2 lg:px-6'>
          <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>Раньше · {shelf.length}</p>
          <ul
            aria-label='Прошлые карточки'
            className='mt-1 flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          >
            {shelf.map((post) => (
              <li key={post.id} className='shrink-0 snap-start'>
                <ShelfBlock post={post} now={now} onOpen={() => setOpenId(post.id)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {nextEvent ? (
        <div className='shrink-0 px-4 pt-1 lg:px-6'>
          <button
            type='button'
            onClick={() => void navigate({ to: '/spaces/$id', params: { id: spaceId }, search: { eventId: nextEvent.id } })}
            className='flex w-full items-center gap-2 rounded-xl bg-community-soft px-3 py-2 text-left text-xs text-community-ink'
          >
            <CalendarDays className='size-4 shrink-0' aria-hidden='true' />
            <span className='line-clamp-1'>
              <span className='font-semibold'>{formatEventDate(nextEvent.startsAt)}</span> — {nextEvent.title}
            </span>
          </button>
        </div>
      ) : null}

      <div ref={fieldRef} className='relative min-h-0 flex-1 overflow-hidden px-4 py-2 lg:px-6'>
        {!isMember ? (
          <div className='grid h-full place-items-center text-center'>
            <p className='max-w-xs text-sm text-muted-foreground'>Вступите в сообщество, чтобы видеть его доску.</p>
          </div>
        ) : board.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Загружаем доску…
          </p>
        ) : board.isError && posts.length === 0 ? (
          <p role='alert' className='text-sm text-destructive'>
            Не удалось загрузить доску. Попробуйте позже.
          </p>
        ) : field.length === 0 ? (
          <div className='grid h-full place-items-center text-center'>
            <div>
              <p className='text-sm font-semibold text-foreground'>Здесь чисто</p>
              <p className='mt-1 max-w-xs text-xs text-muted-foreground'>
                {isHost ? 'Добавьте материал: фото, ссылку, заметку или вопрос.' : 'Здесь появятся материалы создателя сообщества.'}
              </p>
            </div>
          </div>
        ) : (
          <ul className='grid grid-cols-2 gap-2'>
            {field.map((post) => (
              <li key={post.id} className='min-w-0'>
                <PostTile post={post} now={now} onOpen={() => setOpenId(post.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className='flex shrink-0 items-center justify-between gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 lg:px-6'>
        <Button
          variant='secondary'
          aria-label='Эфир'
          onClick={onOpenLive}
          className='h-12 shrink-0 gap-2 rounded-full px-4'
        >
          <LiveIcon active={liveActive} className='size-5' />
          <span>Эфир</span>
        </Button>

        {isHost ? (
          <button
            type='button'
            aria-label='Добавить материал'
            onClick={() => setAdding(true)}
            className='inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-95'
          >
            <Plus className='size-5 shrink-0' aria-hidden='true' />
            <span>Материал</span>
          </button>
        ) : null}

        <Button
          variant='secondary'
          aria-label='Архив обсуждения'
          onClick={onOpenDiscussion}
          className='h-12 min-w-0 gap-2 rounded-full px-3'
        >
          <MessageCircle className='size-5 shrink-0' aria-hidden='true' />
          <span className='text-xs'>Архив</span>
        </Button>
      </footer>

      {isHost ? <AddPostSheet open={adding} onClose={() => setAdding(false)} canPhoto={canPhoto} onSubmit={submit} /> : null}
      <PostDetailSheet
        spaceId={spaceId}
        post={openPost}
        now={now}
        myId={myId}
        isHost={isHost}
        onClose={() => setOpenId(null)}
        onResolve={(post, status) =>
          update.mutate({ postId: post.id, status }, { onError: (error) => toast.error(messageOf(error, 'Не удалось изменить карточку')) })
        }
        onPin={(post, pinned) =>
          update.mutate({ postId: post.id, pinned }, { onError: (error) => toast.error(messageOf(error, 'Не удалось закрепить карточку')) })
        }
        onDelete={(post) =>
          remove.mutate(post.id, { onError: (error) => toast.error(messageOf(error, 'Не удалось удалить карточку')) })
        }
      />
    </section>
  );
}
