import { Link, createFileRoute } from "@tanstack/react-router";
import { HeartHandshake, ScanFace, Sparkles, Users } from "lucide-react";

import { Button, Card } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import { AppShell, PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "О проекте «Я Онлайн» — знакомства без бесконечных свайпов" },
      {
        name: "description",
        content:
          "Зачем мы сделали «Я Онлайн»: живое общение, реальная видео-верификация, пять осознанных совпадений в день и переход к активностям офлайн.",
      },
      { property: "og:title", content: "О проекте «Я Онлайн»" },
      {
        property: "og:description",
        content:
          "Наши принципы: живые люди вместо анкет, проверка по фото и видео, спокойный темп общения.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const principles = [
  {
    icon: ScanFace,
    title: "Живые люди, а не анкеты",
    text: "Каждый профиль можно подтвердить видео: короткая запись со случайным заданием сверяется с главным фото. Уровень доверия виден собеседнику до первого сообщения.",
  },
  {
    icon: Sparkles,
    title: "Пять совпадений в день",
    text: "Мы намеренно ограничиваем подборку. Пять человек в день можно спокойно рассмотреть — в отличие от бесконечной ленты, где никто никого не запоминает.",
  },
  {
    icon: HeartHandshake,
    title: "AI-помощник, а не сценарист",
    text: "Помощник помогает собрать профиль в диалоге и подсказывает темы для начала разговора. Он не пишет за вас и не притворяется человеком.",
  },
  {
    icon: Users,
    title: "От чата к активностям",
    text: "Пространства по интересам и события помогают перейти от переписки к прогулке, настолкам или пробежке — там, где знакомство и становится настоящим.",
  },
];

const steps = [
  { title: "Разговор с помощником", text: "Профиль собирается в диалоге: имя, возраст 18+, намерения, интересы и ценности." },
  { title: "Фото и видео-интро", text: "Главное фото становится аватаром, видео — основой для проверки подлинности." },
  { title: "Подтверждение", text: "Почта и телефон подтверждаются кодом, лицо — сверкой кадров видео с фото." },
  { title: "Знакомства", text: "Ежедневная подборка, чаты с подсказками и пространства по интересам." },
];

function AboutPage() {
  return (
    <AppShell public wide>
      <PageHeader
        title="О проекте"
        description="«Я Онлайн» — платформа знакомств, где важнее не количество лайков, а то, дошло ли общение до живой встречи."
      />

      <Reveal>
        <Card className="p-7">
          <WaveHeading
            as="h2"
            text="Мы делаем знакомства спокойными и настоящими"
            className="text-2xl font-extrabold tracking-tight sm:text-3xl"
          />
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Идея проекта простая: убрать всё, что превращает знакомства в конвейер. Никаких
            бесконечных свайпов и анонимных профилей без подтверждения. Вместо этого — небольшая
            подборка людей, понятный уровень доверия у каждого и мягкие подсказки, которые помогают
            начать разговор и довести его до встречи офлайн.
          </p>
        </Card>
      </Reveal>

      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">Принципы</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {principles.map((item, index) => (
            <Reveal key={item.title} delay={index * 80}>
              <Card className="h-full p-6">
                <item.icon className="size-6 text-primary" aria-hidden="true" />
                <p className="mt-4 text-base font-bold">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Как всё устроено</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 70}>
              <li className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-3xl border border-border bg-secondary/40 p-7">
        <h2 className="text-xl font-bold tracking-tight">Что дальше</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Мы развиваем проект постепенно и по обратной связи. Если чего-то не хватает или что-то
          работает не так — напишите нам, это правда влияет на приоритеты.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/onboarding">Создать профиль</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/support">Написать в поддержку</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/rules">Правила сообщества</Link>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
