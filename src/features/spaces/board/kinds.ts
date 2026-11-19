import { HelpCircle, Image as ImageIcon, Link2, StickyNote } from 'lucide-react';

import type { BoardKind } from './types';

export const KIND_LABEL: Record<BoardKind, string> = {
  photo: 'Фото',
  link: 'Ссылка',
  note: 'Заметка',
  question: 'Вопрос',
};

export const KIND_ICON = {
  photo: ImageIcon,
  link: Link2,
  note: StickyNote,
  question: HelpCircle,
} as const;
