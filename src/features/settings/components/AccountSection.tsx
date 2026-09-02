import { BadgeCheck, KeyRound, Languages, Mail, Phone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { AccountSettings } from "@/api";
import { Button, Card, Input, Modal } from "@/components/ds";
import { ContactConfirm } from "@/features/settings/components/ContactConfirm";
import { useChangePassword, useUpdateAccount } from "@/features/settings/hooks";

import { supportedLanguages } from "@/i18n";

const languageNames: Record<string, string> = { ru: "Русский", en: "English" };

/** Аккаунт: контакты, пароль и язык интерфейса. */
export function AccountSection({ account }: { account: AccountSettings }) {
  const { i18n } = useTranslation();
  const updateAccount = useUpdateAccount();
  const changePassword = useChangePassword();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);

  const closePassword = () => {
    setPasswordOpen(false);
    setCurrent("");
    setNext("");
    setRepeat("");
    setError(null);
  };

  const submitPassword = () => {
    if (next.length < 8) {
      setError("Минимум 8 символов — так надёжнее.");
      return;
    }
    if (next !== repeat) {
      setError("Новый пароль и повтор не совпадают.");
      return;
    }
    changePassword.mutate(
      { current, next },
      {
        onSuccess: () => {
          closePassword();
          toast.success("Пароль обновлён", {
            description: "На остальных устройствах нужно будет войти заново.",
          });
        },
        onError: (mutationError) =>
          setError(
            mutationError instanceof Error
              ? mutationError.message
              : "Не получилось сменить пароль. Попробуй ещё раз.",
          ),
      },
    );
  };

  const changeLanguage = (language: string) => {
    void i18n.changeLanguage(language);
    updateAccount.mutate({ language });
  };

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-border p-0">
        <ContactRow
          icon={<Mail className="size-4" aria-hidden="true" />}
          label="Email"
          value={account.email}
          verified={account.emailVerified}
          action={
            account.emailVerified ? null : <ContactConfirm channel="email" value={account.email} />
          }
        />
        <ContactRow
          icon={<Phone className="size-4" aria-hidden="true" />}
          label="Телефон"
          value={account.phone}
          verified={account.phoneVerified}
          action={
            account.phoneVerified ? null : (
              <ContactConfirm channel="phone" value={account.phone} disabled={!account.phone} />
            )
          }
        />
      </Card>


      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">Пароль</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Меняли последний раз давно — обновить можно в любой момент.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setPasswordOpen(true)}>
            Сменить пароль
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Languages className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Язык интерфейса</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Меняется сразу и запоминается для этого аккаунта.
            </p>
            <div
              role="radiogroup"
              aria-label="Язык интерфейса"
              className="mt-4 inline-flex rounded-full border border-border p-1"
            >
              {supportedLanguages.map((language) => {
                const isActive = i18n.language === language;
                return (
                  <button
                    key={language}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => changeLanguage(language)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {language.toUpperCase()} · {languageNames[language] ?? language}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Modal
        open={passwordOpen}
        onClose={closePassword}
        title="Смена пароля"
        description="Введи текущий пароль и новый — не короче 8 символов."
        footer={
          <>
            <Button variant="ghost" onClick={closePassword}>
              Отмена
            </Button>
            <Button onClick={submitPassword} disabled={changePassword.isPending || !current}>
              {changePassword.isPending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </>
        }
      >
        <Input
          label="Текущий пароль"
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <Input
          label="Новый пароль"
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <Input
          label="Повтори новый пароль"
          type="password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          error={error ?? undefined}
        />
      </Modal>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  verified,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  verified: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-6">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-medium">{value || "не указан"}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {verified ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-foreground">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Подтверждён
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Не подтверждён</span>
        )}
        {action}
      </div>
    </div>
  );
}

