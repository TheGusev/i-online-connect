import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BottomSheet, Button } from '@/components/ds';
import { useSessionStore } from '@/store/useSessionStore';
import { needsFirstEntry } from '@/features/auth/first-entry';
import { mediaUrl } from '@/api/client';
import { contactsApi } from './contacts-api';

const KEY = 'ya-online.personal-chat-invite.v1';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
type Pending = { token: string; savedAt: number; accountId: string | null };
function loadPending(): Pending | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Pending | null;
    if (value && TOKEN.test(value.token) && typeof value.savedAt === 'number' && value.savedAt <= Date.now() && Date.now() - value.savedAt < 7 * 86400000 && (value.accountId === null || typeof value.accountId === 'string')) return value;
    localStorage.removeItem(KEY);
  } catch { /* Storage unavailable or expired: do not guess an invitation. */ }
  return null;
}

export function PersonalInviteBridge() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useSessionStore(s => s.status);
  const user = useSessionStore(s => s.user);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const attempted = useRef('');
  useLayoutEffect(() => {
    const readHash = () => {
      const value = new URLSearchParams(window.location.hash.slice(1)).get('chatInvite');
      return value && TOKEN.test(value) ? value : null;
    };

    // Preserve the initial token even if the landing page redirects to /chat.
    // Do not mutate router-owned history during shell hydration.
    let queuedToken = readHash();
    let ready = false;

    const capture = () => {
      const token = readHash() ?? queuedToken;
      if (!token) return;
      if (!ready) {
        queuedToken = token;
        return;
      }

      queuedToken = null;
      setCandidate(token);
      setError('');

      if (readHash() === token) {
        window.history.replaceState(
          window.history.state, '',
          window.location.pathname + window.location.search,
        );
      }
    };

    const unsubscribe = router.subscribe('onRendered', () => {
      if (!ready) {
        ready = true;
        setPending(loadPending());
      }
      capture();
    });

    window.addEventListener('hashchange', capture);
    return () => {
      unsubscribe();
      window.removeEventListener('hashchange', capture);
    };
  }, [router]);
  const token = candidate ?? pending?.token ?? '';
  const preview = useQuery({
    queryKey: ['contacts', 'invite-preview', token],
    queryFn: () => contactsApi.preview(token),
    enabled: TOKEN.test(token),
    retry: false,
    staleTime: 30000,
  });
  const cancel = () => {
    if (busy) return;
    try { localStorage.removeItem(KEY); } catch { /* no storage */ }
    setPending(null); setCandidate(null); setError(''); attempted.current = '';
  };
  useEffect(() => {
    if (!pending || candidate || status !== 'authed' || !user || needsFirstEntry(user)) return;
    const key = `${pending.token}:${user.id}:${retry}`;
    if (attempted.current === key) return;
    attempted.current = key;
    if (pending.accountId && pending.accountId !== user.id) { setError('Аккаунт изменился. Отмените приглашение и откройте ссылку заново.'); return; }
    const accountId = user.id;
    const acceptedToken = pending.token;
    setBusy(true); setError('');
    void contactsApi.accept(acceptedToken).then(async result => {
      if (useSessionStore.getState().user?.id !== accountId) return;
      try { localStorage.removeItem(KEY); } catch { /* no storage */ }
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      toast.success('Личный чат по приглашению открыт');
      await navigate({ to: '/chat/$id', params: { id: result.conversationId } });
    }).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Не удалось принять приглашение');
    }).finally(() => setBusy(false));
  }, [pending, candidate, status, user, retry, navigate, queryClient]);
  const join = () => {
    if (!candidate || !preview.data) return;
    const value: Pending = { token: candidate, savedAt: Date.now(), accountId: status === 'authed' && user ? user.id : null };
    try { localStorage.setItem(KEY, JSON.stringify(value)); }
    catch { setError('Не удалось сохранить приглашение. Разрешите хранение данных сайта и повторите.'); return; }
    attempted.current = ''; setPending(value); setCandidate(null); setError('');
    if (status !== 'authed') void navigate({ to: '/auth' });
    else if (needsFirstEntry(user)) void navigate({ to: '/chat' });
  };
  return <BottomSheet open={Boolean(candidate || error || busy)} onClose={cancel} title="Приглашение в личный чат">
    <div className="space-y-4">
      {preview.data ? <>
        {preview.data.inviterAvatarUrl ? <img className="mx-auto size-16 rounded-full object-cover" src={mediaUrl(preview.data.inviterAvatarUrl)} alt="" /> : null}
        <p className="text-center font-semibold">{preview.data.inviterName} приглашает вас в «Я Онлайн»</p>
        <p className="text-sm text-muted-foreground">После входа откроется ваш личный чат с пригласившим. Сообщения от вашего имени автоматически не отправляются.</p>
      </> : preview.isFetching ? <p role="status">Проверяем приглашение…</p> : null}
      {preview.error ? <p role="alert" className="text-sm text-destructive">{preview.error.message}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {candidate ? <Button fullWidth disabled={busy || !preview.data || status === 'loading' || status === 'offline'} onClick={join}>Присоединиться</Button> : null}
      {busy ? <p role="status">Открываем чат…</p> : null}
      {error && pending ? <Button fullWidth disabled={busy} onClick={() => { setError(''); setRetry(x => x + 1); }}>Повторить</Button> : null}
      <Button fullWidth variant="ghost" disabled={busy} onClick={cancel}>Отменить приглашение</Button>
    </div>
  </BottomSheet>;
}
