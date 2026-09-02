import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Coffee,
  Eye,
  Heart,
  LifeBuoy,
  Mail,
  MapPin,
  MessageCircle,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Sun,
  Wallet,
} from "lucide-react";

import { Button, Card, TrustBadge } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import { AppShell } from "@/components/layout/AppShell";
import safetyIllustration from "@/assets/safety-center.jpg";

export const Route = createFileRoute("/safety-center")({
  head: () => ({
    meta: [
      { title: "Центр безопасности — тёплый гайд «Я Онлайн»" },
      {
        name: "description",
        content:
          "Как спокойно встретиться впервые, как заметить подозрительное поведение, как работает верификация и куда написать за поддержкой.",
      },
      { property: "og:title", content: "Центр безопасности — тёплый гайд «Я Онлайн»" },
      {
        property: "og:description",
        content: "Спокойные советы о первых встречах, доверии и поддержке — без запугивания.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SafetyCenterPage,
});

const firstMeeting = [
  {
    icon: Coffee,
    title: "Публичное место и короткий формат",
    text: "Кофе на час — идеальное первое свидание. Легко продлить, если хорошо, и легко закончить, если не сложилось.",
  },
  {
    icon: MapPin,
    title: "Скажи близкому, где ты",
    text: "Одно сообщение другу с местом и временем. Не потому что страшно, а потому что так спокойнее обоим.",
  },
  {
    icon: Wallet,
    title: "Свой транспорт и свой счёт",
    text: "Приезжай и уезжай сам. Никто не обязан быть кому-то должен после первой встречи.",
  },
  {
    icon: Sun,
    title: "Можно уйти в любой момент",
    text: "Не понравилось — достаточно сказать «мне пора». Это нормально и не требует объяснений.",
  },
];

const redFlags = [
  {
    title: "Торопит и давит",
    text: "Настаивает на встрече дома, обижается на «не сегодня», требует быстрых ответов.",
  },
  {
    title: "Просит увести разговор в сторону",
    text: "С первых сообщений тянет в другой мессенджер, ссылки и «там удобнее».",
  },
  {
    title: "Деньги в любой форме",
    text: "Займы, «помоги с билетом», инвестиции, подарочные карты. Здесь ответ всегда — нет.",
  },
  {
    title: "История не сходится",
    text: "Профиль без верификации, отказ от видеозвонка, детали меняются между сообщениями.",
  },
];

const trustLevels = [
  {
    level: "new" as const,
    text: "Человек только пришёл. Верификация ещё не пройдена — стоит начать с разговора здесь, в приложении.",
  },
  {
    level: "confirmed" as const,
    text: "Живое селфи совпало с фото профиля. За анкетой настоящий человек.",
  },
  {
    level: "trusted" as const,
    text: "Давно на платформе, диалоги без жалоб, есть спокойные офлайн-встречи.",
  },
];

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Heart;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-5">
      <h2 className="inline-flex items-center gap-2.5 text-2xl font-bold tracking-tight">
        <span className="grid size-9 place-items-center rounded-2xl bg-primary/10">
          <Icon className="size-4.5 text-primary" aria-hidden="true" />
        </span>
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </header>
  );
}

function SafetyCenterPage() {
  return (
    <AppShell wide public>
      <Reveal
        as="header"
        className="overflow-hidden rounded-4xl border border-border bg-card shadow-soft"
      >
        <div className="grid gap-0 md:grid-cols-[1.05fr_1fr]">
          <div className="p-7 sm:p-10">
            <p className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Центр безопасности
            </p>
            <WaveHeading
              as="h1"
              className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
            >
              Спокойные знакомства — это навык, и он несложный
            </WaveHeading>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Здесь нет длинных правил и страшилок. Только то, что реально помогает: как устроить
              первую встречу, как заметить неладное, как работает верификация и куда написать, если
              нужна помощь.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/verification">
                  <ScanFace aria-hidden="true" />
                  Пройти верификацию
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/settings">Настройки приватности</Link>
              </Button>
            </div>
          </div>
          <img
            src={safetyIllustration}
            alt="Двое людей спокойно разговаривают за кофе у большого окна"
            width={1024}
            height={1024}
            className="h-56 w-full object-cover md:h-full"
          />
        </div>
      </Reveal>

      <Reveal as="section" className="mt-12">
        <SectionTitle
          icon={Coffee}
          title="Первая встреча без волнения"
          description="Четыре привычки, которые снимают почти всю тревогу — и оставляют место для интереса."
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {firstMeeting.map(({ icon: Icon, title, text }, index) => (
            <Reveal as="li" key={title} delay={index * 60}>
              <Card className="h-full p-6">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </Reveal>

      <Reveal as="section" className="mt-12">
        <SectionTitle
          icon={Eye}
          title="Что стоит заметить"
          description="Не для подозрительности, а для внутреннего спокойствия: если что-то из этого совпало — притормози и напиши нам."
        />
        <ul className="grid gap-3 md:grid-cols-2">
          {redFlags.map(({ title, text }, index) => (
            <Reveal as="li" key={title} delay={index * 50}>
              <div className="flex h-full items-start gap-3 rounded-3xl border border-warning/25 bg-warning-soft/60 p-5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Заметил такое — жалоба занимает полминуты, и её разбирает живой человек. Жалоба анонимна.
        </p>
      </Reveal>

      <Reveal as="section" className="mt-12">
        <SectionTitle
          icon={ScanFace}
          title="Как работает верификация"
          description="Мы просим короткое живое селфи и сверяем его с фото профиля. Запись видит только модерация и удаляет после проверки — она не появляется в ленте."
        />
        <ul className="space-y-3">
          {trustLevels.map(({ level, text }, index) => (
            <Reveal as="li" key={level} delay={index * 60}>
              <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                <TrustBadge level={level} withTooltip />
                <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </Reveal>

      <Reveal as="section" className="mt-12 mb-4">
        <SectionTitle
          icon={LifeBuoy}
          title="Мы рядом"
          description="Если стало неприятно, странно или просто хочется совета — напиши. Отвечает человек, а не робот."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary/10">
              <MessageCircle className="size-5 text-primary" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-bold">Поддержка в приложении</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Кнопка «Поддержка» в настройках. Обычно отвечаем в течение дня, по срочным вопросам —
              быстрее.
            </p>
            <Button variant="secondary" className="mt-4" asChild>
              <Link to="/settings">Открыть настройки</Link>
            </Button>
          </Card>
          <Card className="p-6">
            <span className="grid size-10 place-items-center rounded-2xl bg-success-soft">
              <Mail className="size-5 text-success" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-bold">Почта команды доверия</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              care@ya-online.app — сюда можно писать о людях, встречах и о том, что показалось
              небезопасным.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Heart className="size-3.5 text-primary" aria-hidden="true" />
              Если есть угроза жизни или здоровью — сначала службы экстренной помощи, потом мы.
            </p>
          </Card>
        </div>
      </Reveal>
    </AppShell>
  );
}
