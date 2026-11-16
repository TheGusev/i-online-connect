import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { BottomSheet, Button, Input } from '@/components/ds';
import { mediaUrl } from '@/api/client';
import { useSessionStore } from '@/store/useSessionStore';
import { useOpenConversation } from './hooks';
import { contactsApi, type PersonalInvite } from './contacts-api';

export function ChatContactTools() {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useSessionStore(s => s.status);
  const userId = useSessionStore(s => s.user?.id);
  const [sheet, setSheet] = useState<'people' | 'invite' | null>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [invite, setInvite] = useState<PersonalInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openChat = useOpenConversation();
  useEffect(() => { const id = window.setTimeout(() => setDebounced(q.trim()), 500); return () => window.clearTimeout(id); }, [q]);
  useEffect(() => { setInvite(null); setSheet(null); setError(''); }, [userId]);
  const people = useQuery({
    queryKey: ['contacts', 'search', userId, debounced],
    queryFn: ({ signal }) => contactsApi.search(debounced, signal),
    enabled: status === 'authed' && sheet === 'people' && debounced.length >= 2,
    staleTime: 15000,
    retry: false,
  });
  if (status !== 'authed' || location.pathname.replace(/\/+$/, '') !== '/chat') return null;
  const link = invite && typeof window !== 'undefined' ? `${window.location.origin}/#chatInvite=${invite.token}` : '';
  const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось выполнить действие';
  const create = async () => {
    setBusy(true); setError(''); setNotice('');
    try { setInvite(await contactsApi.create()); } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  const share = async () => {
    setError(''); setNotice('');
    try {
      if (navigator.share) await navigator.share({ title: 'Приглашение в чат — Я Онлайн', text: 'Присоединяйся — после входа откроется наш чат.', url: link });
      else { await navigator.clipboard.writeText(link); setNotice('Ссылка скопирована'); }
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(message(cause)); }
  };
  return <>
    <style>{`body:has([data-contacts-tools]) main{padding-bottom:calc(9.5rem + env(safe-area-inset-bottom))}`}</style>
    <div data-contacts-tools data-no-swipe className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex gap-2 rounded-2xl border border-border bg-background p-2 shadow-lg lg:bottom-6 lg:right-6">
      <Button size="sm" onClick={() => { setError(''); setNotice(''); setSheet('people'); }}>Найти людей</Button>
      <Button size="sm" variant="secondary" onClick={() => { setError(''); setNotice(''); setSheet('invite'); }}>Пригласить в чат</Button>
    </div>
    <BottomSheet open={sheet === 'people'} onClose={() => setSheet(null)} title="Найти людей">
      <div className="space-y-4" data-no-swipe>
        <Input label="Имя пользователя" hint="Введите минимум 2 символа" value={q} maxLength={80} onChange={event => setQ(event.target.value)} />
        <p className="text-xs text-muted-foreground">Поиск по всем городам. Скрытые и заблокированные аккаунты не показываются.</p>
        {q.trim().length >= 2 && (q.trim() !== debounced || people.isFetching) ? <p role="status">Ищем…</p> : null}
        {people.isError ? <p role="alert" className="text-sm text-destructive">{message(people.error)}</p> : null}
        {error || openChat.error ? <p role="alert" className="text-sm text-destructive">{error || message(openChat.error)}</p> : null}
        {q.trim() === debounced && !people.isFetching && debounced.length >= 2 && people.data?.items.length === 0 ? <p>Никого не нашли. Проверьте имя.</p> : null}
        <ul className="space-y-3">
          {q.trim() === debounced ? people.data?.items.map(person => <li key={person.id} className="rounded-2xl border border-border p-3">
            <div className="flex items-center gap-3">
              {person.avatarUrl ? <img className="size-10 rounded-full object-cover" src={mediaUrl(person.avatarUrl)} alt="" /> : null}
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{person.name}</p><p className="text-xs text-muted-foreground">{person.city}</p></div>
              <Button size="sm" disabled={!person.canMessage || openChat.isPending} onClick={() => {
                setError('');
                void openChat.mutateAsync(person.id).then(result => {
                  setSheet(null);
                  return navigate({ to: '/chat/$id', params: { id: result.conversationId } });
                }).catch(cause => setError(message(cause)));
              }}>Написать</Button>
            </div>
            {!person.canMessage ? <p className="mt-2 text-xs text-muted-foreground">Начало переписки ограничено настройками собеседника. Можно обменяться личным приглашением.</p> : null}
          </li>) : null}
        </ul>
      </div>
    </BottomSheet>
    <BottomSheet open={sheet === 'invite'} onClose={() => { if (!busy) setSheet(null); }} title="Личное приглашение">
      <div className="space-y-4" data-no-swipe>
        <p className="text-sm text-muted-foreground">Любой, кому вы передадите ссылку, сможет после входа начать с вами личный чат. Приглашение действует 7 дней; блокировки сохраняются.</p>
        {!invite ? <Button fullWidth disabled={busy} onClick={() => void create()}>{busy ? 'Создаём…' : 'Создать приглашение'}</Button> : <>
          <div className="mx-auto w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={link} size={208} level="M" /></div>
          <Input label="Ссылка для приглашения" value={link} readOnly />
          <Button fullWidth onClick={() => void share()}>Поделиться</Button>
          <Button fullWidth variant="secondary" onClick={() => {
            setError('');
            void navigator.clipboard.writeText(link).then(() => setNotice('Ссылка скопирована')).catch(cause => setError(message(cause)));
          }}>Скопировать ссылку</Button>
          <Button fullWidth variant="ghost" disabled={busy} onClick={() => {
            setBusy(true); setError('');
            void contactsApi.revoke(invite.id).then(() => { setInvite(null); setNotice('Приглашение отозвано'); }).catch(cause => setError(message(cause))).finally(() => setBusy(false));
          }}>Отозвать это приглашение</Button>
        </>}
        {notice ? <p role="status" className="text-sm">{notice}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </BottomSheet>
  </>;
}
