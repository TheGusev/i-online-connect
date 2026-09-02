import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LifeBuoy, Mail, MessageCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supportApi, type SupportTopic } from "@/api";
import { Button, Card, Input } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell, PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Поддержка «Я Онлайн» — напишите нам" },
      {
        name: "description",
        content:
          "Форма обращения в поддержку «Я Онлайн»: вопросы по аккаунту, верификации, безопасности и оплате. Отвечаем на указанную почту.",
      },
      { property: "og:title", content: "Поддержка «Я Онлайн»" },
      {
        property: "og:description",
        content: "Опишите проблему — мы разберёмся и ответим на вашу почту.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportPage,
});

const topics: { id: SupportTopic; label: string }[] = [
  { id: "account", label: "Аккаунт и вход" },
  { id: "verification", label: "Верификация" },
  { id: "safety", label: "Безопасность и жалоба" },
  { id: "payment", label: "Подписка и оплата" },
  { id: "other", label: "Другое" },
];

function SupportPage() {
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<SupportTopic>("account");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Проверьте адрес почты — на него придёт ответ.");
      return;
    }
    if (message.trim().length < 20) {
      setError("Опишите ситуацию чуть подробнее — хотя бы 20 символов.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await supportApi.sendSupportRequest({
        email: email.trim(),
        topic,
        message: message.trim(),
      });
      setSent(true);
      setMessage("");
      toast.success("Обращение отправлено", {
        description: "Мы ответим на указанную почту — обычно в течение одного рабочего дня.",
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не получилось отправить. Попробуйте ещё раз.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell public>
      <PageHeader
        title="Поддержка"
        description="Расскажите, что случилось. Чем конкретнее описание, тем быстрее мы поможем."
      />

      <Reveal>
        <Card className="p-6">
          <div className="space-y-4">
            <Input
              label="Ваша почта для ответа"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />

            <div>
              <p className="text-sm font-medium">Тема обращения</p>
              <div
                role="radiogroup"
                aria-label="Тема обращения"
                className="mt-2 flex flex-wrap gap-2"
              >
                {topics.map((item) => {
                  const active = topic === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTopic(item.id)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="support-message" className="text-sm font-medium">
                Что произошло
              </label>
              <textarea
                id="support-message"
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Опишите ситуацию: что вы делали, что ожидали и что получилось."
                className="mt-2 w-full rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed outline-none transition-colors focus-visible:border-primary"
              />
              {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
              {sent && !error ? (
                <p className="mt-2 text-sm text-success">
                  Обращение получено. Ответ придёт на {email}.
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button onClick={submit} disabled={sending}>
                {sending ? "Отправляем…" : "Отправить обращение"}
              </Button>
            </div>
          </div>
        </Card>
      </Reveal>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <InfoCard
          icon={<ShieldAlert className="size-5 text-primary" aria-hidden="true" />}
          title="Опасная ситуация"
          text="Если вам угрожают, сначала отправьте жалобу из чата или профиля — она попадёт к модерации сразу."
          to="/safety-center"
          linkLabel="Центр безопасности"
        />
        <InfoCard
          icon={<MessageCircle className="size-5 text-primary" aria-hidden="true" />}
          title="Вопрос по правилам"
          text="Многие ответы уже есть в правилах сообщества: что запрещено и как работают блокировки."
          to="/rules"
          linkLabel="Правила"
        />
        <InfoCard
          icon={<LifeBuoy className="size-5 text-primary" aria-hidden="true" />}
          title="О проекте"
          text="Как устроены подборка, верификация и пространства по интересам."
          to="/about"
          linkLabel="О проекте"
        />
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="size-4" aria-hidden="true" />
        Обращения обрабатываются людьми, а не автоответчиком.
      </p>
    </AppShell>
  );
}

function InfoCard({
  icon,
  title,
  text,
  to,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  to: "/safety-center" | "/rules" | "/about";
  linkLabel: string;
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      {icon}
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      <Link to={to} className="mt-3 text-sm font-semibold text-primary hover:underline">
        {linkLabel}
      </Link>
    </Card>
  );
}
