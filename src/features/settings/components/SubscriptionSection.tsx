import { Check, Sparkles } from "lucide-react";

import type { SubscriptionInfo } from "@/api";
import { Button, Card } from "@/components/ds";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Тариф: текущий план и превью будущих премиум-возможностей (без оплаты). */
export function SubscriptionSection({ subscription }: { subscription: SubscriptionInfo }) {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Текущий тариф</p>
            <p className="mt-1 text-2xl font-bold">{subscription.planName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscription.priceLabel} · с {dateFormat.format(new Date(subscription.since))}
            </p>
          </div>
          <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-foreground">
            Активен
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Всё главное — верификация, дневная подборка, чаты и Spaces — входит в базовый тариф и
          останется бесплатным.
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Расширенные возможности</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Готовим премиум-тариф. Пока это план, а не предложение — оплату включим позже.
        </p>
        <ul className="mt-5 space-y-4">
          {subscription.premiumFeatures.map((feature) => (
            <li key={feature.title} className="flex items-start gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button disabled title="Оплата появится позже">
            Оформить — скоро
          </Button>
          <p className="text-xs text-muted-foreground">
            Кнопка неактивна: платежи ещё не подключены.
          </p>
        </div>
      </Card>
    </div>
  );
}
