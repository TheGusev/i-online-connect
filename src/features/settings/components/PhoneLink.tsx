import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authApi } from "@/api";
import { Button, Input, Modal } from "@/components/ds";
import { normalizeRuPhone } from "@/features/auth/phone/phone";

export function PhoneLink() {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => { setOpen(false); setPhone(""); setCode(""); setSent(false); setError(""); };
  const requestCode = async () => {
    const normalized = normalizeRuPhone(phone);
    if (!normalized) { setError("Проверьте номер телефона"); return; }
    setBusy(true); setError("");
    try { await authApi.requestPhoneLink(normalized); setPhone(normalized); setSent(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отправить SMS"); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError("");
    try { await authApi.verifyPhoneLink(phone, code); await cache.invalidateQueries({ queryKey: ["settings"] }); close(); toast.success("Номер привязан"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось привязать номер"); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Привязать номер</Button>
    <Modal open={open} onClose={close} title="Привязать номер" footer={<>
      {sent && <Button variant="ghost" disabled={busy} onClick={requestCode}>Отправить снова</Button>}
      <Button disabled={busy || (sent && code.length !== 6)} onClick={sent ? verify : requestCode}>{busy ? "Подождите…" : sent ? "Подтвердить" : "Получить SMS"}</Button>
    </>}>
      <Input label="Номер телефона" type="tel" autoComplete="tel" value={phone} disabled={sent} onChange={e => setPhone(e.target.value)} />
      {sent && <Input label="Код из SMS" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </Modal>
  </>;
}