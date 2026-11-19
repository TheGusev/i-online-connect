import { Check, Pin } from 'lucide-react';

import { mediaUrl } from '@/api';
import { cn } from '@/lib/utils';

import { KIND_ICON, KIND_LABEL } from './kinds';
import { agoLabel, firstName } from './time';
import type { BoardPost } from './types';

function previewImage(post: BoardPost): string | null {
  if (post.kind !== 'photo' || !post.mediaUrl) return null;
  return mediaUrl(post.mediaUrl) ?? null;
}

function titleOf(post: BoardPost): string {
  if (post.kind === 'link') return post.domain ?? (post.text || KIND_LABEL.link);
  return post.text || KIND_LABEL[post.kind];
}

/** Плитка на поле: последние и закреплённые карточки, две колонки. */
export function PostTile({ post, now, onOpen }: { post: BoardPost; now: number; onOpen: () => void }) {
  const Icon = KIND_ICON[post.kind];
  const image = previewImage(post);
  return (
    <button
      type='button'
      onClick={onOpen}
      className={cn(
        'live-card relative flex h-20 w-full min-w-0 items-center gap-2 overflow-hidden rounded-2xl border-2 p-2 text-left',
        `live-card-${post.kind}`,
      )}
    >
      {image ? (
        <img src={image} alt='' loading='lazy' className='size-14 shrink-0 rounded-lg object-cover' />
      ) : (
        <Icon className='size-5 shrink-0' aria-hidden='true' />
      )}
      <span className='min-w-0 flex-1'>
        <span className='line-clamp-2 block text-xs font-semibold leading-tight text-foreground'>{titleOf(post)}</span>
        <span className='mt-1 block truncate text-[10px] text-muted-foreground'>
          {firstName(post.authorName)} · {agoLabel(post.createdAt, now)}
        </span>
      </span>
      {post.pinned ? <Pin className='absolute right-1 top-1 size-3.5 text-primary' aria-label='Закреплено' /> : null}
      {post.kind === 'question' && post.status === 'resolved' ? (
        <Check className='absolute bottom-1 right-1 size-3.5 text-success' aria-label='Отвечен' />
      ) : null}
    </button>
  );
}

/** Блок на полке: компактный, листается вправо и влево. */
export function ShelfBlock({ post, now, onOpen }: { post: BoardPost; now: number; onOpen: () => void }) {
  const Icon = KIND_ICON[post.kind];
  const image = previewImage(post);
  return (
    <button
      type='button'
      onClick={onOpen}
      className={cn(
        'live-card relative flex h-16 w-32 min-w-0 items-center gap-1.5 overflow-hidden rounded-xl border-2 p-1.5 text-left',
        `live-card-${post.kind}`,
      )}
    >
      {image ? (
        <img src={image} alt='' loading='lazy' className='size-10 shrink-0 rounded-md object-cover' />
      ) : (
        <Icon className='size-4 shrink-0' aria-hidden='true' />
      )}
      <span className='min-w-0 flex-1'>
        <span className='line-clamp-2 block text-[11px] font-semibold leading-tight text-foreground'>{titleOf(post)}</span>
        <span className='block truncate text-[9px] text-muted-foreground'>{agoLabel(post.createdAt, now)}</span>
      </span>
    </button>
  );
}
