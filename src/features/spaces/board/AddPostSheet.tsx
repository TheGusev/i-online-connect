import { useState } from 'react';

import { BottomSheet, Button } from '@/components/ds';
import { compressListingPhoto } from '@/features/nearby/compress-image';
import { MAX_CARD_TEXT, safeLink } from '@/features/spaces/live/cards';
import { cn } from '@/lib/utils';

import { KIND_ICON, KIND_LABEL } from './kinds';
import type { BoardAddInput, BoardKind } from './types';

const KINDS: BoardKind[] = ['photo', 'link', 'note', 'question'];

/** «Положить на стол»: фото, ссылка, заметка или вопрос для сообщества. */
export function AddPostSheet({
  open,
  onClose,
  canPhoto,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  canPhoto: boolean;
  onSubmit: (input: BoardAddInput) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<BoardKind | null>(null);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setKind(null);
    setText('');
    setUrl('');
    setError(null);
    if (file) URL.revokeObjectURL(file.preview);
    setFile(null);
    onClose();
  };

  const submit = async () => {
    if (!kind || busy) return;
    setError(null);
    const value = text.trim();
    let input: BoardAddInput;
    if (kind === 'link') {
      const link = safeLink(url);
      if (!link) {
        setError('Нужна ссылка, начинающаяся с http:// или https://');
        return;
      }
      input = { kind, url: link.url, ...(value ? { text: value } : {}) };
    } else if (kind === 'photo') {
      if (!file) {
        setError('Выберите фото');
        return;
      }
      input = { kind, file: file.file, ...(value ? { text: value } : {}) };
    } else {
      if (!value) {
        setError('Напишите текст');
        return;
      }
      input = { kind, text: value };
    }
    setBusy(true);
    const ok = await onSubmit(input);
    setBusy(false);
    if (ok) close();
  };

  const field =
    'w-full rounded-2xl border border-input bg-background px-4 py-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <BottomSheet open={open} onClose={close} title='Положить на стол'>
      <div className='space-y-3 pb-4'>
        <div className='grid grid-cols-4 gap-2'>
          {KINDS.map((item) => {
            const Icon = KIND_ICON[item];
            return (
              <button
                key={item}
                type='button'
                onClick={() => {
                  setKind(item);
                  setError(null);
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl border p-2 text-xs font-semibold',
                  kind === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground',
                )}
              >
                <Icon className='size-5' aria-hidden='true' />
                {KIND_LABEL[item]}
              </button>
            );
          })}
        </div>

        {kind === 'photo' ? (
          canPhoto ? (
            <label className='block'>
              <span className='sr-only'>Фото</span>
              <input
                type='file'
                accept='image/*,.heic,.heif'
                className={field}
                onChange={async (event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = '';
                  if (!picked) return;
                  try {
                    const ready = await compressListingPhoto(picked);
                    if (file) URL.revokeObjectURL(file.preview);
                    setFile({ file: ready, preview: URL.createObjectURL(ready) });
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Не удалось подготовить фото');
                  }
                }}
              />
              {file ? <img src={file.preview} alt='Выбранное фото' className='mt-2 h-32 w-full rounded-2xl object-cover' /> : null}
            </label>
          ) : (
            <p className='rounded-2xl bg-secondary p-3 text-sm text-muted-foreground'>
              Фото могут класть участники с подтверждённым профилем. Пройдите верификацию в разделе «Безопасность».
            </p>
          )
        ) : null}

        {kind === 'link' ? (
          <input
            type='url'
            inputMode='url'
            maxLength={MAX_CARD_TEXT}
            placeholder='https://…'
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className={field}
          />
        ) : null}

        {kind ? (
          <textarea
            rows={3}
            maxLength={MAX_CARD_TEXT}
            placeholder={kind === 'question' ? 'Ваш вопрос' : kind === 'note' ? 'Текст заметки' : 'Подпись (необязательно)'}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className={cn(field, 'resize-none')}
          />
        ) : null}

        {error ? (
          <p className='text-xs text-destructive' role='alert'>
            {error}
          </p>
        ) : null}
        {kind ? (
          <Button className='w-full' loading={busy} disabled={kind === 'photo' && !canPhoto} onClick={() => void submit()}>
            Положить на стол
          </Button>
        ) : null}
      </div>
    </BottomSheet>
  );
}
