import { createFileRoute } from "@tanstack/react-router";
import { Heart, MessageCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeaderRow,
  CardSubtitle,
  CardTitle,
  Chip,
  Input,
  ListItemSkeleton,
  Modal,
  ProfileCardSkeleton,
  Select,
  Skeleton,
  SpaceCardSkeleton,
  TextArea,
  TrustBadge,
} from "@/components/ds";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Дизайн-система — Я Онлайн" },
      {
        name: "description",
        content:
          "Демо всех компонентов дизайн-системы «Я Онлайн»: кнопки, карточки, аватары, бейджи доверия, поля и скелетоны.",
      },
      { property: "og:title", content: "Дизайн-система — Я Онлайн" },
      {
        property: "og:description",
        content: "Тёплая и безопасная визуальная система подтверждённых знакомств.",
      },
    ],
  }),
  component: DesignSystemPage,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-border pt-8 first:border-0 first:pt-0">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const swatches = [
  { name: "Коралл (акцент)", className: "bg-primary text-primary-foreground" },
  { name: "Коралл мягкий", className: "bg-primary-soft text-accent-foreground" },
  { name: "Графит (текст)", className: "bg-foreground text-background" },
  { name: "Фон", className: "bg-background text-foreground border border-border" },
  { name: "Доверие", className: "bg-success text-success-foreground" },
  { name: "Внимание", className: "bg-warning text-warning-foreground" },
  { name: "Риск", className: "bg-destructive text-destructive-foreground" },
  { name: "Верификация", className: "bg-gradient-verified text-primary-foreground" },
];

function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [interests, setInterests] = useState(["Походы", "Кино", "Джаз", "Настолки"]);
  const [selected, setSelected] = useState("Серьёзные отношения");

  return (
    <AppShell wide public>
      <div className="space-y-10 pb-16">
        <header className="rounded-3xl bg-gradient-warm p-6 shadow-soft">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" /> Дизайн-система
          </span>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            Я Онлайн — тепло, технологичность, безопасность
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Живые профили и подтверждённые люди. Все компоненты ниже собраны из семантических
            токенов, поэтому экраны собираются без хардкода цветов.
          </p>
        </header>

        <Section
          title="Цвета"
          description="Тёплая база, коралловый акцент, зелёный маркер доверия."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {swatches.map((swatch) => (
              <div
                key={swatch.name}
                className={`flex h-24 items-end rounded-2xl p-3 text-xs font-semibold ${swatch.className}`}
              >
                {swatch.name}
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Типографика"
          description="Manrope, крупные заголовки, свободный line-height."
        >
          <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
            <p className="text-4xl font-extrabold">Найди настоящих людей</p>
            <p className="text-2xl font-bold">Заголовок раздела</p>
            <p className="text-lg font-semibold">Подзаголовок карточки</p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Основной текст профиля: люблю длинные прогулки по набережной, готовлю неприлично много
              пасты и ищу человека, с которым можно молчать без неловкости. AI подсказывает
              совпадения, но общение — всегда живое.
            </p>
          </div>
        </Section>

        <Section
          title="Кнопки"
          description="primary, secondary, ghost, danger + размеры и состояния."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Познакомиться</Button>
            <Button variant="secondary">Позже</Button>
            <Button variant="ghost">Скрыть</Button>
            <Button variant="danger">Пожаловаться</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Маленькая</Button>
            <Button size="md">Средняя</Button>
            <Button size="lg">Большая</Button>
            <Button size="icon" aria-label="Нравится">
              <Heart />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading>Отправляем</Button>
            <Button disabled>Недоступно</Button>
            <Button variant="secondary">
              <MessageCircle /> Написать
            </Button>
          </div>
        </Section>

        <Section title="Аватары и верификация" description="Значок с градиентом коралл→зелёный.">
          <div className="flex flex-wrap items-end gap-5 rounded-3xl border border-border bg-card p-5">
            <Avatar name="Анна Ким" size="sm" />
            <Avatar name="Мария Соколова" size="md" verified />
            <Avatar name="Игорь Петров" size="lg" online />
            <Avatar name="Лена Ветрова" size="xl" verified />
          </div>
        </Section>

        <Section
          title="Бейджи доверия"
          description="Три уровня: Новый, Подтверждён, Проверенный участник."
        >
          <div className="flex flex-wrap items-center gap-3">
            <TrustBadge level="new" />
            <TrustBadge level="confirmed" />
            <TrustBadge level="trusted" />
            <TrustBadge level="new" size="sm" />
            <TrustBadge level="confirmed" size="sm" />
            <TrustBadge level="trusted" size="sm" />
            <TrustBadge level="confirmed" withTooltip />
          </div>
        </Section>

        <Section title="Теги и чипы" description="Интересы, намерения, выбор и удаление.">
          <div className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <Chip
                key={interest}
                variant="interest"
                onRemove={() => setInterests((prev) => prev.filter((item) => item !== interest))}
              >
                {interest}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {["Серьёзные отношения", "Дружба", "Совместные проекты"].map((intent) => (
              <Chip
                key={intent}
                variant="intent"
                selected={selected === intent}
                onClick={() => setSelected(intent)}
              >
                {intent}
              </Chip>
            ))}
            <Chip variant="outline" size="sm">
              + добавить
            </Chip>
          </div>
        </Section>

        <Section title="Карточки" description="Профиль, намерение, сообщество.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card variant="profile" interactive>
              <CardHeaderRow>
                <div className="flex items-center gap-3">
                  <Avatar name="Мария Соколова" verified size="lg" />
                  <div>
                    <CardTitle>Мария, 29</CardTitle>
                    <CardSubtitle>Новосибирск · 4 км</CardSubtitle>
                  </div>
                </div>
                <TrustBadge level="trusted" size="sm" />
              </CardHeaderRow>
              <CardBody>
                <p className="text-muted-foreground">
                  Архитектор, влюблена в утренний свет и хорошие разговоры. Ищу человека, с которым
                  интересно молчать.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Chip size="sm">Архитектура</Chip>
                  <Chip size="sm">Бег</Chip>
                  <Chip size="sm">Кофе</Chip>
                </div>
              </CardBody>
              <CardFooter>
                <Button size="sm">
                  <Heart /> Интересно
                </Button>
                <Button size="sm" variant="ghost">
                  Профиль
                </Button>
              </CardFooter>
            </Card>

            <Card variant="intent">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
                <Sparkles className="size-3.5" aria-hidden="true" /> Намерение
              </span>
              <CardTitle className="mt-2">Серьёзные отношения</CardTitle>
              <CardBody>
                <p className="text-muted-foreground">
                  Мы покажем ваш профиль людям с тем же намерением и подтверждённым статусом.
                </p>
              </CardBody>
              <CardFooter>
                <Button size="sm" variant="secondary">
                  Изменить
                </Button>
              </CardFooter>
            </Card>

            <Card variant="space" interactive>
              <CardHeaderRow>
                <div>
                  <CardTitle>Утренние забеги</CardTitle>
                  <CardSubtitle>Сообщество · 1 248 участников</CardSubtitle>
                </div>
                <span className="grid size-10 place-items-center rounded-2xl bg-primary-soft text-accent-foreground">
                  <Users className="size-5" aria-hidden="true" />
                </span>
              </CardHeaderRow>
              <CardBody>
                <p className="text-muted-foreground">
                  Живые встречи по субботам, только подтверждённые участники.
                </p>
                <div className="flex items-center gap-2">
                  <Avatar name="Иван Кот" size="sm" />
                  <Avatar name="Ольга Лис" size="sm" verified />
                  <Avatar name="Пётр Зуев" size="sm" />
                  <span className="text-xs text-muted-foreground">и ещё 1 245</span>
                </div>
              </CardBody>
              <CardFooter>
                <Button size="sm">Присоединиться</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section title="Поля ввода" description="Плавающие лейблы, подсказки и состояния ошибок.">
          <div className="grid gap-4 rounded-3xl border border-border bg-card p-5 md:grid-cols-2">
            <Input label="Имя" defaultValue="Максим" />
            <Input label="Город" hint="Мы покажем людей рядом" />
            <Input label="Email" error="Введите корректный адрес" defaultValue="max@" />
            <Select
              label="Намерение"
              options={[
                { value: "relationship", label: "Серьёзные отношения" },
                { value: "friends", label: "Дружба" },
                { value: "projects", label: "Совместные проекты" },
              ]}
            />
            <TextArea
              label="О себе"
              hint="До 500 символов"
              className="md:col-span-2"
              defaultValue="Люблю утренние забеги и долгие разговоры на кухне."
            />
          </div>
        </Section>

        <Section
          title="Модальные окна"
          description="Modal для desktop, Bottom Sheet для мобильных."
        >
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setModalOpen(true)}>Открыть Modal</Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Открыть Bottom Sheet
            </Button>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Подтвердите личность"
            description="Это займёт минуту и повысит уровень доверия к профилю."
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Позже
                </Button>
                <Button onClick={() => setModalOpen(false)}>
                  <ShieldCheck /> Подтвердить
                </Button>
              </>
            }
          >
            <p className="text-muted-foreground">
              Мы сверим селфи с фото профиля. Изображение не публикуется и не передаётся третьим
              лицам.
            </p>
          </Modal>
          <BottomSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Действия с профилем"
            description="Мария, 29 · Проверенный участник"
            footer={
              <>
                <Button fullWidth>Написать сообщение</Button>
                <Button variant="secondary" fullWidth>
                  Сохранить в избранное
                </Button>
                <Button variant="danger" fullWidth onClick={() => setSheetOpen(false)}>
                  Пожаловаться
                </Button>
              </>
            }
          />
        </Section>

        <Section title="Skeleton" description="Заглушки загрузки для карточек и списков.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ProfileCardSkeleton />
            <SpaceCardSkeleton />
            <div className="rounded-3xl border border-border bg-card p-2">
              <ListItemSkeleton />
              <ListItemSkeleton />
              <ListItemSkeleton />
              <Skeleton className="m-3 h-9 rounded-full" />
            </div>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
