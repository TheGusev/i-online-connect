import { Check, ExternalLink, Pin, PinOff, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { mediaUrl } from '@/api';
import { BottomSheet, Button } from '@/components/ds';

import { KIND_LABEL } from './kinds';
import { agoLabel } from './time';
import type { BoardPost } from './types';

/** Карточка, развёрнутая на экран. */
export function PostDetailSheet({
  post,
  now,
  myId,
  isHost,
  onClose,
  onResolve,
  onPin,
  onDelete,
}: {
  post: BoardPost | null;
  now: number;
  myId: string | null;
  isHost: boolean;
  onClose: () => void;
  onResolve: (post: BoardPost, status: 'open' | 'resolved') => void;
  onPin: (post: BoardPost, pinned: boolean) => void;
  onDelete: (post: BoardPost) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const canManage = Boolean(post && myId && (post.authorId === myId || isHost));
  const close = () => {
    setConfirm(false);
    onClose();
  };
  const image = post && post.kind === 'photo' && post.mediaUrl ? mediaUrl(post.mediaUrl) : undefined;

  return (
    <BottomSheet open={Boolean(post)} onClose={close} title={post ? KIND_LABEL[post.kind] : ''}>
      {post ? (
        <div className='space-y-3 pb-4'>
          {image ? <img src={image} alt='Фото карточки' className='max-h-72 w-full rounded-2xl border-2 border-primary object-cover' /> : null}

          {post.kind === 'link' && post.url ? (
            <div className='space-y-2'>
              <p className='break-all font-semibold text-foreground'>{post.domain ?? post.url}</p>
              <p className='text-xs text-muted-foreground'>Ссылка ведёт на внешний сайт</p>
              <Button variant='secondary' onClick={() => window.open(post.url, '_blank', 'noopener,noreferrer')}>
                <ExternalLink aria-hidden='true' /> Открыть
              </Button>
            </div>
          ) : null}

          {post.text ? <p className='whitespace-pre-wrap break-words text-sm text-foreground'>{post.text}</p> : null}

          <p className='text-xs text-muted-foreground'>
            {post.authorName} · {agoLabel(post.createdAt, now)}
          </p>

          {post.kind === 'question' && post.status === 'resolved' ? (
            <p className='inline-flex items-center gap-1 text-xs font-semibold text-success'>
              <Check className='size-3.5' aria-hidden='true' /> Отвечен
            </p>
          ) : null}

          {canManage || isHost ? (
            <div className='flex flex-wrap gap-2'>
              {post.kind === 'question' && canManage ? (
                <Button size='sm' variant='secondary' onClick={() => onResolve(post, post.status === 'resolved' ? 'open' : 'resolved')}>
                  <Check aria-hidden='true' /> {post.status === 'resolved' ? 'Снова открыт' : 'Отвечен'}
                </Button>
              ) : null}
              {isHost ? (
                <Button size='sm' variant='secondary' onClick={() => onPin(post, !post.pinned)}>
                  {post.pinned ? <PinOff aria-hidden='true' /> : <Pin aria-hidden='true' />} {post.pinned ? 'Открепить' : 'Закрепить'}
                </Button>
              ) : null}
              {canManage ? (
                confirm ? (
                  <>
                    <Button
                      size='sm'
                      variant='danger'
                      onClick={() => {
                        onDelete(post);
                        close();
                      }}
                    >
                      Да, удалить
                    </Button>
                    <Button size='sm' variant='ghost' onClick={() => setConfirm(false)}>
                      Отмена
                    </Button>
                  </>
                ) : (
                  <Button size='sm' variant='ghost' className='text-destructive' onClick={() => setConfirm(true)}>
                    <Trash2 aria-hidden='true' /> Удалить
                  </Button>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}
