import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Ban, Lock, ShieldCheck, UserCheck } from "lucide-react";

import { Button, Card } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell, PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "Правила сообщества «Я Онлайн»" },
      {
        name: "description",
        content:
          "Правила «Я Онлайн»: только 18+, настоящие фото и видео, уважение в переписке, запрет на попрошайничество и рекламу, как работают жалобы и блокировки.",
      },
      { property: "og:title", content: "Правила сообщества «Я Онлайн»" },
      {
        property: "og:description",
        content: "Что можно и что нельзя в «Я Онлайн», как модерация реагирует на жалобы.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RulesPage,
});

const sections = [
  {
    icon: UserCheck,
    title: "Только совершеннолетние и только вы сами",
    items: [
      "Регистрация доступна с 18 лет — возраст проверяется при создании профиля.",
      "Фото и видео должны быть вашими и актуальными. Чужие изображения — причина блокировки.",
      "Один человек — один аккаунт. Дубликаты удаляются вместе с историей.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Уважение в общении",
    items: [
      "Никаких оскорблений, угроз, травли и дискриминации.",
      "Интимный контент — только по обоюдному согласию и без несовершеннолетних, никогда в первом сообщении.",
      "«Нет» и молчание — это ответ. Настойчивые повторные сообщения после отказа считаются нарушением.",
    ],
  },
  {
    icon: Ban,
    title: "Что запрещено полностью",
    items: [
      "Просьбы о деньгах, переводах, подарках и «помощи с картой» — самый частый признак мошенничества.",
      "Реклама, продажа услуг, приглашения в сторонние каналы и инвестиционные схемы.",
      "Публикация чужих личных данных: адресов, переписок, документов.",
    ],
  },
  {
    icon: Lock,
    title: "Данные и приватность",
    items: [
      "Точное местоположение по умолчанию скрыто — показывается только город.",
      "Видео для верификации используется исключительно для сверки подлинности и не публикуется в профиле.",
      "Аккаунт можно поставить на паузу или удалить в настройках — вместе с медиа и перепиской.",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Жалобы и последствия",
    items: [
      "Жалобу можно отправить из профиля или чата — это анонимно для нарушителя.",
      "Мы смотрим на контекст: возможны предупреждение, снижение уровня доверия, ограничение подборки или полная блокировка.",
      "Угрозы жизни и здоровью, а также любой контент с несовершеннолетними — немедленная блокировка без предупреждения.",
    ],
  },
];

function RulesPage() {
  return (
    <AppShell public wide>
      <PageHeader
        title="Правила сообщества"
        description="Короткий и честный список: чтобы знакомиться было спокойно, важно, чтобы правила были одинаковыми для всех."
      />

      <div className="space-y-4">
        {sections.map((section, index) => (
          <Reveal key={section.title} delay={index * 70}>
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <section.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="text-base font-bold">{section.title}</h2>
                  <ul className="mt-3 space-y-2">
                    {section.items.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="secondary" asChild>
          <Link to="/safety-center">Центр безопасности</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/support">Сообщить о проблеме</Link>
        </Button>
      </div>
    </AppShell>
  );
}
