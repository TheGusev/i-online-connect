import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BadgeCheck, MessageSquareHeart, Sparkles, EyeOff, ShieldCheck, Lock } from "lucide-react";

import { Button } from "@/components/ds";
import { SessionLoading } from "@/features/auth/session";
import { useSessionStore } from "@/store/useSessionStore";
import { Reveal } from "@/components/landing/Reveal";
import { WaveHeading } from "@/components/landing/WaveHeading";
import heroImage from "@/assets/landing-hero.jpg";
import meetImage from "@/assets/landing-meet.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Я Онлайн — настоящие люди вместо ленты анкет" },
      {
        name: "description",
        content:
          "Подтверждённые видеоверификацией профили, AI помогает сформулировать, кого ты ищешь, и приносит 3–5 осмысленных совпадений в день.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Я Онлайн — настоящие люди вместо ленты анкет" },
      {
        property: "og:description",
        content: "Верификация, осмысленные совпадения и путь от переписки к реальной встрече.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { t } = useTranslation();
  const status = useSessionStore((state) => state.status);

  const why = [
    { icon: BadgeCheck, key: "real", tone: "text-success" },
    { icon: Sparkles, key: "ai", tone: "text-primary" },
    { icon: MessageSquareHeart, key: "meet", tone: "text-warning" },
  ] as const;

  const steps = ["s1", "s2", "s3", "s4"] as const;

  const safety = [
    { icon: ShieldCheck, key: "moderation" },
    { icon: Lock, key: "privacy" },
    { icon: EyeOff, key: "visibility" },
  ] as const;

  // Авторизованный человек не должен снова видеть приветственный экран.
  if (status === "loading") return <SessionLoading />;
  if (status === "authed") return <Navigate to="/feed" replace />;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <Link to="/" className="text-lg font-extrabold tracking-tight">
            {t("app.name")}
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              {t("landing.nav.how")}
            </a>
            <a href="#trust" className="transition-colors hover:text-foreground">
              {t("landing.nav.trust")}
            </a>
          </nav>
          <Button asChild size="sm">
            <Link to="/onboarding">{t("landing.hero.cta")}</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: "var(--gradient-warm)" }}
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-28">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
                <span
                  className="size-2 rounded-full"
                  style={{ background: "var(--gradient-verified)" }}
                />
                {t("landing.hero.eyebrow")}
              </span>
              <WaveHeading
                as="h1"
                className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
                delay={120}
              >
                {t("landing.hero.title")}
              </WaveHeading>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                {t("landing.hero.subtitle")}
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/onboarding">{t("landing.hero.cta")}</Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <a href="#how">{t("landing.hero.secondary")}</a>
                </Button>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">{t("landing.hero.note")}</p>
            </Reveal>

            <Reveal delay={120}>
              <div className="relative">
                <img
                  src={heroImage}
                  alt={t("landing.hero.imageAlt")}
                  width={1280}
                  height={1280}
                  className="aspect-square w-full rounded-4xl object-cover"
                  style={{ boxShadow: "var(--shadow-lift)" }}
                />
                <div
                  className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl bg-card px-4 py-3"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <span
                    className="flex size-9 items-center justify-center rounded-full text-primary-foreground"
                    style={{ background: "var(--gradient-verified)" }}
                  >
                    <BadgeCheck className="size-5" />
                  </span>
                  <span className="text-sm font-semibold">{t("landing.why.real.title")}</span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Why */}
        <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
          <Reveal className="max-w-2xl">
            <WaveHeading className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t("landing.why.title")}
            </WaveHeading>
            <p className="mt-4 text-lg text-muted-foreground">{t("landing.why.subtitle")}</p>
          </Reveal>

          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {why.map(({ icon: Icon, key, tone }, i) => (
              <Reveal as="li" key={key} delay={i * 100}>
                <div
                  className="h-full rounded-3xl border border-border bg-card p-7"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
                    <Icon className={`size-6 ${tone}`} />
                  </span>
                  <h3 className="mt-6 text-xl font-bold">{t(`landing.why.${key}.title`)}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">
                    {t(`landing.why.${key}.text`)}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* How */}
        <section id="how" className="border-y border-border bg-secondary/40 py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-5 lg:px-8">
            <Reveal className="max-w-2xl">
              <WaveHeading className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t("landing.how.title")}
              </WaveHeading>
              <p className="mt-4 text-lg text-muted-foreground">{t("landing.how.subtitle")}</p>
            </Reveal>

            <ol className="relative mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
              <span
                aria-hidden
                className="absolute left-0 right-0 top-6 hidden h-px bg-border md:block"
              />
              {steps.map((key, i) => (
                <Reveal as="li" key={key} delay={i * 110} className="relative">
                  <span
                    className="relative z-10 flex size-12 items-center justify-center rounded-full bg-card text-base font-extrabold text-primary ring-1 ring-border"
                    style={{ boxShadow: "var(--shadow-soft)" }}
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-6 text-lg font-bold">{t(`landing.how.${key}.title`)}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {t(`landing.how.${key}.text`)}
                  </p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Nearby — второй столп: бытовые задачи рядом. Компактно, чтобы не
            размывать основной посыл про живые знакомства. */}
        <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-20">
          <Reveal>
            <div
              className="rounded-4xl border border-border bg-card p-8 lg:p-12"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-14">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {t("landing.nearby.title")}
                  </h2>
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    {t("landing.nearby.subtitle")}
                  </p>
                  <p className="mt-4 text-sm text-muted-foreground">{t("landing.nearby.note")}</p>
                </div>
                <ul className="flex flex-wrap gap-3">
                  {(
                    t("landing.nearby.items", { returnObjects: true }) as unknown as string[]
                  ).map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-border bg-secondary/50 px-4 py-2 text-sm font-semibold"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>



        {/* Trust */}
        <section id="trust" className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <img
                src={meetImage}
                alt={t("landing.trust.imageAlt")}
                width={1280}
                height={900}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-4xl object-cover"
                style={{ boxShadow: "var(--shadow-lift)" }}
              />
            </Reveal>

            <div>
              <Reveal>
                <WaveHeading className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {t("landing.trust.title")}
                </WaveHeading>
                <p className="mt-4 text-lg text-muted-foreground">{t("landing.trust.subtitle")}</p>
              </Reveal>

              <ul className="mt-10 space-y-7">
                {safety.map(({ icon: Icon, key }, i) => (
                  <Reveal as="li" key={key} delay={i * 100} className="flex gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-success-soft">
                      <Icon className="size-5 text-success" />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold">{t(`landing.trust.${key}.title`)}</h3>
                      <p className="mt-1 leading-relaxed text-muted-foreground">
                        {t(`landing.trust.${key}.text`)}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </ul>

              <Reveal delay={120} className="mt-10">
                <Button asChild size="lg">
                  <Link to="/onboarding">{t("landing.hero.cta")}</Link>
                </Button>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <p className="text-base font-extrabold tracking-tight">{t("app.name")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <Link to="/about" className="transition-colors hover:text-foreground">
              {t("landing.footer.about")}
            </Link>
            <Link to="/rules" className="transition-colors hover:text-foreground">
              {t("landing.footer.rules")}
            </Link>
            <Link to="/support" className="transition-colors hover:text-foreground">
              {t("landing.footer.support")}
            </Link>
          </nav>

        </div>
        <div className="mx-auto max-w-6xl px-5 pb-8 text-xs text-muted-foreground lg:px-8">
          © {new Date().getFullYear()} {t("app.name")}. {t("landing.footer.rights")}
        </div>
      </footer>
    </div>
  );
}
