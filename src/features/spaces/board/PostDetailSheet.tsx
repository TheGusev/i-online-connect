import { Check, ExternalLink, Pin, PinOff, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { mediaUrl } from '@/api';
import { BottomSheet, Button } from '@/components/ds';

import {
  useAddComment,
  useDeleteComment,
  useEditComment,
  usePostDiscussion,
  useSetCommentsClosed,
  useSetPostReaction,
} from './hooks';
import { KIND_LABEL } from './kinds';
import { agoLabel } from './time';
import type { BoardComment, BoardCommentInput, BoardPost, BoardReaction } from './types';

/** Карточка, развёрнутая на экран. */
export function PostDetailSheet({
  spaceId,
  post,
  now,
  myId,
  isHost,
  onClose,
  onResolve,
  onPin,
  onDelete,
}: {
  spaceId: string;
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
          <PostDiscussion
            key={spaceId + ':' + post.id}
            spaceId={spaceId}
            postId={post.id}
            myId={myId}
            now={now}
          />
        </div>
      ) : null}
    </BottomSheet>
  );
}


const REACTION_LABELS: ReadonlyArray<{
  value: BoardReaction;
  label: string;
}> = [
  { value: 'like', label: 'Нравится' },
  { value: 'thanks', label: 'Спасибо' },
  { value: 'idea', label: 'Идея' },
  { value: 'question', label: 'Есть вопрос' },
];

function discussionError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить действие';
}

function PostDiscussion({
  spaceId,
  postId,
  myId,
  now,
}: {
  spaceId: string;
  postId: string;
  myId: string | null;
  now: number;
}) {
  const discussion = usePostDiscussion(spaceId, postId);
  const add = useAddComment(spaceId, postId);
  const edit = useEditComment(spaceId, postId);
  const remove = useDeleteComment(spaceId, postId);
  const commentBusy = add.isPending || edit.isPending || remove.isPending;
  const react = useSetPostReaction(spaceId, postId);
  const closeComments = useSetCommentsClosed(spaceId, postId);

  const [text, setText] = useState('');
  const [parent, setParent] = useState<BoardComment | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attempt = useRef<BoardCommentInput | null>(null);
  const sending = useRef(false);

  const current = discussion.data?.pages[0];

  const comments = useMemo(() => {
    const unique = new Map<string, BoardComment>();
    const pages = discussion.data?.pages ?? [];
    for (const page of [...pages].reverse()) {
      for (const comment of page.items) {
        unique.set(comment.id, comment);
      }
    }
    return [...unique.values()].sort((a, b) => {
      const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      return time || a.id.localeCompare(b.id);
    });
  }, [discussion.data]);

  const byId = useMemo(
    () => new Map(comments.map((item) => [item.id, item])),
    [comments],
  );

  async function submit() {
    const value = text.trim();
    if (!current?.canComment || !value || sending.current || commentBusy) return;

    sending.current = true;
    setError(null);

    const parentId = parent?.id;

    if (
      !attempt.current ||
      attempt.current.text !== value ||
      attempt.current.parentId !== parentId
    ) {
      attempt.current = {
        text: value,
        clientTempId: crypto.randomUUID(),
        ...(parentId ? { parentId } : {}),
      };
    }

    try {
      await add.mutateAsync(attempt.current);
      attempt.current = null;
      setText('');
      setParent(null);
    } catch (cause) {
      setError(discussionError(cause));
    } finally {
      sending.current = false;
    }
  }

  async function saveEdit() {
    if (!editing || commentBusy || !editing.text.trim()) return;
    setError(null);
    try {
      await edit.mutateAsync({
        commentId: editing.id,
        text: editing.text.trim(),
      });
      setEditing(null);
    } catch (cause) {
      setError(discussionError(cause));
    }
  }

  async function deleteComment(commentId: string) {
    if (commentBusy) return;
    setError(null);
    try {
      await remove.mutateAsync(commentId);
      setConfirmDelete(null);
      if (editing?.id === commentId) setEditing(null);
      if (parent?.id === commentId) setParent(null);
    } catch (cause) {
      setError(discussionError(cause));
    }
  }

  async function setReaction(value: BoardReaction | null) {
    setError(null);
    try {
      await react.mutateAsync(value);
    } catch (cause) {
      setError(discussionError(cause));
    }
  }

  async function toggleClosed() {
    if (!current) return;
    setError(null);
    try {
      await closeComments.mutateAsync(!current.commentsClosed);
    } catch (cause) {
      setError(discussionError(cause));
    }
  }

  return (
    <section
      aria-label='Обсуждение материала'
      className='space-y-3 border-t border-border pt-4'
    >
      <h3 className='text-sm font-semibold'>Обсуждение материала</h3>

      {discussion.isPending ? (
        <p role='status' className='text-sm text-muted-foreground'>
          Загружаем комментарии…
        </p>
      ) : null}

      {discussion.isError ? (
        <div role='alert' className='space-y-2 text-sm text-destructive'>
          <p>Не удалось обновить обсуждение.</p>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={discussion.isFetching}
            onClick={() => void discussion.refetch()}
          >
            Повторить загрузку
          </Button>
        </div>
      ) : null}

      {current ? (
        <>
          <div className='flex flex-wrap gap-2' aria-label='Реакции'>
            {REACTION_LABELS.map(({ value, label }) => {
              const count = current.reactions.find(
                (item) => item.reaction === value,
              );
              return (
                <button
                  key={value}
                  type='button'
                  aria-pressed={Boolean(count?.mine)}
                  disabled={react.isPending}
                  onClick={() => void setReaction(count?.mine ? null : value)}
                  className={
                    'rounded-full border px-3 py-2 text-xs disabled:opacity-50 ' +
                    (count?.mine
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-foreground')
                  }
                >
                  {label} · {count?.count ?? 0}
                </button>
              );
            })}
          </div>

          {current.canModerate ? (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={closeComments.isPending}
              onClick={() => void toggleClosed()}
            >
              {current.commentsClosed
                ? 'Открыть комментарии'
                : 'Закрыть комментарии'}
            </Button>
          ) : null}

          {discussion.hasNextPage ? (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={discussion.isFetching}
              onClick={() => {
                void discussion.fetchNextPage().catch(() => undefined);
              }}
            >
              {discussion.isFetchingNextPage
                ? 'Загружаем…'
                : 'Показать более ранние'}
            </Button>
          ) : null}

          {comments.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Комментариев пока нет.
            </p>
          ) : (
            <ol className='space-y-3'>
              {comments.map((comment) => {
                const repliedTo = comment.parentId
                  ? byId.get(comment.parentId)
                  : undefined;

                return (
                  <li
                    key={comment.id}
                    id={'board-comment-' + comment.id}
                    className='space-y-1 rounded-xl bg-muted/40 p-3'
                  >
                    <p className='text-xs text-muted-foreground'>
                      {comment.authorName} · {agoLabel(comment.createdAt, now)}
                    </p>

                    {comment.parentId ? (
                      <p className='text-xs text-muted-foreground'>
                        В ответ: {repliedTo?.authorName ?? 'ранний комментарий'}
                      </p>
                    ) : null}

                    {editing?.id === comment.id && !comment.deletedAt ? (
                      <form
                        className='space-y-2'
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveEdit();
                        }}
                      >
                        <label className='block space-y-1'>
                          <span className='text-xs text-muted-foreground'>
                            Редактирование комментария
                          </span>
                          <textarea
                            value={editing.text}
                            onChange={(event) => {
                              const value = event.target.value;
                              setEditing((previous) =>
                                previous ? { ...previous, text: value } : null,
                              );
                            }}
                            maxLength={2000}
                            rows={3}
                            required
                            disabled={commentBusy}
                            className='w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50'
                          />
                        </label>
                        <div className='flex flex-wrap gap-2'>
                          <Button
                            type='submit'
                            size='sm'
                            disabled={
                              commentBusy ||
                              !current.canComment ||
                              !editing.text.trim()
                            }
                          >
                            {edit.isPending ? 'Сохраняем…' : 'Сохранить'}
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            disabled={commentBusy}
                            onClick={() => setEditing(null)}
                          >
                            Отмена
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className='whitespace-pre-wrap break-words text-sm'>
                        {comment.deletedAt
                          ? 'Комментарий удалён'
                          : comment.text}
                      </p>
                    )}

                    {current.canComment && !comment.deletedAt ? (
                      <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        disabled={commentBusy}
                        onClick={() => setParent(comment)}
                      >
                        Ответить
                      </Button>
                    ) : null}

                    {!comment.deletedAt ? (
                      <div className='flex flex-wrap items-center gap-2'>
                        {myId &&
                         comment.authorId === myId &&
                         current.canComment &&
                         editing?.id !== comment.id ? (
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            disabled={commentBusy}
                            onClick={() => {
                              setError(null);
                              setConfirmDelete(null);
                              setEditing({
                                id: comment.id,
                                text: comment.text,
                              });
                            }}
                          >
                            Изменить
                          </Button>
                        ) : null}

                        {(Boolean(myId && comment.authorId === myId) ||
                          current.canModerate) ? (
                          confirmDelete === comment.id ? (
                            <>
                              <span className='text-xs text-muted-foreground'>
                                Удалить комментарий?
                              </span>
                              <Button
                                type='button'
                                size='sm'
                                variant='danger'
                                disabled={commentBusy}
                                onClick={() => void deleteComment(comment.id)}
                              >
                                {remove.isPending ? 'Удаляем…' : 'Да, удалить'}
                              </Button>
                              <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                disabled={commentBusy}
                                onClick={() => setConfirmDelete(null)}
                              >
                                Отмена
                              </Button>
                            </>
                          ) : (
                            <Button
                              type='button'
                              size='sm'
                              variant='ghost'
                              disabled={commentBusy}
                              onClick={() => {
                                setError(null);
                                setConfirmDelete(comment.id);
                              }}
                            >
                              Удалить
                            </Button>
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}

          {current.commentsClosed ? (
            <p className='text-sm text-muted-foreground'>
              Создатель закрыл комментарии. История остаётся доступной.
            </p>
          ) : !current.canComment ? (
            <p className='text-sm text-muted-foreground'>
              Комментарии доступны под материалами создателя сообщества.
            </p>
          ) : null}

          {current.canComment ? (
            <form
              className='space-y-2'
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {parent ? (
                <div className='rounded-lg border border-border p-2 text-xs'>
                  <p className='font-semibold'>
                    Ответ: {parent.authorName}
                  </p>
                  <p className='line-clamp-2 break-words text-muted-foreground'>
                    {parent.text}
                  </p>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={commentBusy}
                    onClick={() => setParent(null)}
                  >
                    Отменить ответ
                  </Button>
                </div>
              ) : null}

              <label className='block space-y-1'>
                <span className='text-xs text-muted-foreground'>
                  Ваш комментарий
                </span>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  required
                  disabled={commentBusy}
                  className='w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50'
                />
              </label>

              <div className='flex items-center justify-between gap-2'>
                <span className='text-xs text-muted-foreground'>
                  {text.length}/2000
                </span>
                <Button
                  type='submit'
                  size='sm'
                  disabled={commentBusy || !text.trim()}
                >
                  {add.isPending ? 'Отправляем…' : 'Отправить'}
                </Button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
    </section>
  );
}
