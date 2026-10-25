import { useState } from "react";
import { authApi } from "@/api";
import { Button, Input } from "@/components/ds";

export function PasswordResetFlow({ initialEmail, onDone }: { initialEmail: string; onDone: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const requestCode = async () => {
    setBusy(true); setError("");
    try { await authApi.requestPasswordReset(email.trim()); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось запросить код"); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (password !== repeat) { setError("Пароли не совпадают"); return; }
    if (password.length < 10 || !/[a-zа-я]/i.test(password) || !/\d/.test(password)) { setError("Минимум 10 символов, буквы и цифры"); return; }
    setBusy(true); setError("");
    try { await authApi.confirmPasswordReset(email.trim(), code, password); setDone(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить пароль"); }
    finally { setBusy(false); }
  };
  if (done) return <div className="space-y-4"><p>Пароль обновлён. Войдите с новым паролем.</p><Button fullWidth onClick={onDone}>Вернуться ко входу</Button></div>;
  return <div className="space-y-4">
    <Input label="Email" type="email" autoComplete="email" value={email} disabled={sent} onChange={e => setEmail(e.target.value)} />
    {sent && <>
      <p className="text-sm text-muted-foreground">Если адрес подтверждён в аккаунте, на него придёт код. Код действует 15 минут.</p>
      <Input label="Код из письма" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      <Input label="Новый пароль" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
      <Input label="Повторите пароль" type="password" autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} />
    </>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Button fullWidth disabled={busy || !email || (sent && code.length !== 6)} onClick={sent ? confirm : requestCode}>{busy ? "Подождите…" : sent ? "Сохранить пароль" : "Получить код"}</Button>
    {sent && <div className="flex justify-between gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={requestCode}>Отправить снова</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }}>Другой адрес</Button></div>}
  </div>;
}