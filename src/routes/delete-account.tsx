import { Link, createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { LEGAL } from "@/lib/legal-info";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Удаление аккаунта «Я Онлайн»" },
      {
        name: "description",
        content:
          "Как удалить аккаунт в «Я Онлайн» и связанные с ним данные: в приложении или через запрос на почту.",
      },
      { property: "og:title", content: "Удаление аккаунта «Я Онлайн»" },
      { property: "og:type", content: "article" },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <AppShell public>
      <PageHeader
        title="Удаление аккаунта «Я Онлайн»"
        description="Вы можете удалить аккаунт и связанные с ним данные в приложении или отправить запрос без входа."
      />

      <div className="space-y-4">
        <Reveal>
          <Card className="p-6">
            <h2 className="text-base font-bold">Способ 1. В приложении</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Откройте «{LEGAL.siteName}» и войдите в аккаунт.</li>
              <li>Перейдите в «Настройки» и выберите раздел «Удаление аккаунта».</li>
              <li>Ответьте на короткий необязательный опрос и подтвердите удаление.</li>
            </ol>
          </Card>
        </Reveal>

        <Reveal delay={60}>
          <Card className="p-6">
            <h2 className="text-base font-bold">Способ 2. Без входа в приложение</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Напишите на {LEGAL.contactEmail} с адреса, указанного при регистрации, с темой
              «Удаление аккаунта «{LEGAL.siteName}»». Либо отправьте обращение через{" "}
              <Link to="/support" className="font-semibold text-primary hover:underline">
                форму поддержки
              </Link>{" "}
              с темой «Аккаунт и вход». Для защиты от чужих запросов мы можем попросить
              подтвердить владение аккаунтом.
            </p>
          </Card>
        </Reveal>

        <Reveal delay={120}>
          <Card className="p-6">
            <h2 className="text-base font-bold">Что будет с данными</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>
                После запроса аккаунт скрывается из подборок и поиска. В течение ограниченного
                срока его можно восстановить, войдя в аккаунт.
              </li>
              <li>
                После окончания срока удаляются профиль, фото и видео, переписка и вложения,
                объявления и участие в сообществах.
              </li>
              <li>
                Записи о жалобах, блокировках и журналы безопасности могут храниться дольше,
                если это нужно для защиты других пользователей и по закону.
              </li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Подробнее — в{" "}
              <Link to="/privacy" className="font-semibold text-primary hover:underline">
                политике конфиденциальности
              </Link>
              .
            </p>
          </Card>
        </Reveal>
      </div>
    </AppShell>
  );
}
