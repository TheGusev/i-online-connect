import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { confirmApi } from "@/api";
import { Button, Input, Modal } from "@/components/ds";

type Channel = "email" | "phone";

/**
 * Подтверждение почты и телефона кодом.
 * Код запрашивается сервером и живёт ограниченное время — поэтому окно
 * показывает, куда он ушёл, и позволяет запросить повторно.
 */
export function ContactConfirm({
  channel,
  value,
  disabled,
}: {
  channel: Channel;
  value: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);

  const label = channel === "email" ? "почту" : "телефон";

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const result =
        channel === "email"
          ? await confirmApi.requestEmailCode()
          : await confirmApi.requestPhoneCode();
      if (result.status === "verified") {
        toast.success(`Уже подтверждено`);
        await queryClient.invalidateQueries({ queryKey: ["settings"] });
        return;
      }
      setDestination(result.destination ?? value);
      setOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить код");
      toast.error(`Не получилось отправить код на ${label}`);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.trim().length < 4) {
      setError("Код состоит минимум из 4 цифр.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (channel === "email") await confirmApi.verifyEmailCode(code.trim());
      else await confirmApi.verifyPhoneCode(code.trim());
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setOpen(false);
      setCode("");
      toast.success(channel === "email" ? "Почта подтверждена" : "Телефон подтверждён");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Код не подошёл. Запросите новый.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={requestCode} disabled={disabled || busy}>
        {busy && !open ? "Отправляем…" : "Подтвердить"}
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setCode("");
          setError(null);
        }}
        title={`Подтверждение ${label}`}
        description={
          destination
            ? `Код отправлен на ${destination}. Он действует несколько минут.`
            : "Введите код из сообщения."
        }
        footer={
          <>
            <Button variant="ghost" onClick={requestCode} disabled={busy}>
              Отправить снова
            </Button>
            <Button onClick={verify} disabled={busy || code.length === 0}>
              {busy ? "Проверяем…" : "Подтвердить"}
            </Button>
          </>
        }
      >
        <Input
          label="Код из сообщения"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
          error={error ?? undefined}
        />
      </Modal>
    </>
  );
}
