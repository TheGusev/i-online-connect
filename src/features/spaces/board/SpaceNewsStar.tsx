import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

import { useSpacesNews } from './hooks';

/** Звезда новостей на карточке сообщества: серый контур — тихо, заливка фирменным цветом — есть новое. */
export function SpaceNewsStar({ spaceId }: { spaceId: string }) {
  const { data } = useSpacesNews();
  const hasNews = data?.includes(spaceId) ?? false;
  return (
    <span
      role='img'
      aria-label={hasNews ? 'В сообществе есть новости' : 'Новостей нет'}
      className='absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-background/70 backdrop-blur'
    >
      <Star
        className={cn('size-4 transition-colors', hasNews ? 'fill-primary text-primary' : 'text-muted-foreground')}
        aria-hidden='true'
      />
    </span>
  );
}
