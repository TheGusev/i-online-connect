import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

import { useSpacesNews } from './hooks';

/** Звезда новостей на карточке сообщества: серый контур — тихо, заливка фирменным цветом — есть новое. */
export function SpaceNewsStar({
  spaceId,
  variant = 'overlay',
}: {
  spaceId: string;
  /** overlay — поверх обложки; inline — в строке заголовка справа от названия. */
  variant?: 'overlay' | 'inline';
}) {
  const { data } = useSpacesNews();
  const hasNews = data?.includes(spaceId) ?? false;
  return (
    <span
      role='img'
      aria-label={hasNews ? 'В сообществе есть новости' : 'Новостей нет'}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full',
        variant === 'overlay' ? 'absolute right-2 top-2 z-10 bg-background/70 backdrop-blur' : 'bg-primary/10',
      )}
    >
      <Star
        className={cn('size-4 transition-colors', hasNews ? 'fill-primary text-primary' : 'text-muted-foreground')}
        aria-hidden='true'
      />
    </span>
  );
}
