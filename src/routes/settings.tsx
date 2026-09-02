import { createFileRoute } from "@tanstack/react-router";
import { Bell, CreditCard, Handshake, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ds";
import { AccountSection } from "@/features/settings/components/AccountSection";
import { DangerZoneSection } from "@/features/settings/components/DangerZoneSection";
import { NeedsSection } from "@/features/settings/components/NeedsSection";
import { NotificationsSection } from "@/features/settings/components/NotificationsSection";
import { PrivacyPanel } from "@/features/settings/components/PrivacyPanel";
import { SettingsNav, type SettingsSectionMeta } from "@/features/settings/components/SettingsNav";
import { SubscriptionSection } from "@/features/settings/components/SubscriptionSection";
import { useSettings } from "@/features/settings/hooks";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Настройки — Я Онлайн" },
      {
        name: "description",
        content:
          "Аккаунт и язык интерфейса, приватность и пауза профиля, уведомления, тариф и удаление аккаунта.",
      },
      { property: "og:title", content: "Настройки — Я Онлайн" },
      {
        property: "og:description",
        content: "Управляй контактами, приватностью, уведомлениями и тарифом в одном месте.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const sections: SettingsSectionMeta[] = [
  { id: "account", label: "Аккаунт", icon: UserRound },
  { id: "privacy", label: "Приватность", icon: ShieldCheck },
  { id: "needs", label: "Мои потребности", icon: Handshake },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "subscription", label: "Тариф", icon: CreditCard },
  { id: "danger", label: "Удаление аккаунта", icon: TriangleAlert },
];

const sectionHints: Record<string, string> = {
  account: "Контакты для входа, пароль и язык интерфейса.",
  privacy: "Кто видит профиль и геолокацию, кто может написать первым.",
  needs: "Что вы ищете или готовы предложить в разделе «Рядом».",
  notifications: "Выбери, о чём сообщать, а о чём — молчать.",
  subscription: "Сейчас всё главное бесплатно. Премиум в работе.",
  danger: "Необратимое действие — сначала предложим паузу.",
};

function SettingsPage() {
  const [active, setActive] = useState("account");
  const { data, isLoading } = useSettings();
  const activeMeta = sections.find((section) => section.id === active) ?? sections[0]!;

  return (
    <AppShell>
      <PageHeader title="Настройки" />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav sections={sections} active={active} onSelect={setActive} />

        <section aria-label={activeMeta.label} className="min-w-0 space-y-5">
          <header>
            <h2 className="text-xl font-semibold">{activeMeta.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{sectionHints[active]}</p>
          </header>

          {isLoading || !data ? (
            <Card className="p-6 text-sm text-muted-foreground">Загружаем настройки…</Card>
          ) : (
            <>
              {active === "account" ? <AccountSection account={data.account} /> : null}
              {active === "privacy" ? <PrivacyPanel /> : null}
              {active === "needs" ? <NeedsSection /> : null}
              {active === "notifications" ? (
                <NotificationsSection notifications={data.notifications} />
              ) : null}
              {active === "subscription" ? (
                <SubscriptionSection subscription={data.subscription} />
              ) : null}
              {active === "danger" ? (
                <DangerZoneSection onPause={() => setActive("privacy")} />
              ) : null}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
