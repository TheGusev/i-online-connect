/**
 * Catch-all маршрут.
 *
 * Две задачи:
 *  1) служебная панель на скрытом пути из VITE_ADMIN_PATH — своего файла
 *     маршрута у неё нет, поэтому путь не виден ни в сборке роутов, ни в
 *     ссылках. Скрытый путь — это не защита (её обеспечивают пароль, TOTP
 *     и проверка роли на сервере), а способ не показывать вход ботам;
 *  2) обычная страница «не найдено» для всех остальных адресов.
 *
 * ssr: false — панель не рендерится на сервере: её содержимое не должно
 * попадать в HTML, а токен сессии живёт только в браузере.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { getAdminToken } from "@/api/admin";
import { Button } from "@/components/ds";
import { AdminLogin } from "@/features/admin/AdminLogin";
import { AdminPanel } from "@/features/admin/AdminPanel";

const ADMIN_PATH = ((import.meta.env["VITE_ADMIN_PATH"] as string | undefined) ?? "").replace(
  /^\/+|\/+$/g,
  "",
);

export const Route = createFileRoute("/$")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Страница не найдена — «Я Онлайн»" },
      { name: "description", content: "Такой страницы нет. Вернитесь на главную «Я Онлайн»." },
      // Служебные и несуществующие адреса не должны попадать в поиск.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CatchAllPage,
});

function CatchAllPage() {
  const { _splat } = Route.useParams();
  const path = (_splat ?? "").replace(/^\/+|\/+$/g, "");

  if (ADMIN_PATH && path === ADMIN_PATH) return <AdminGate />;
  return <NotFoundPage />;
}

function AdminGate() {
  // Токен лежит в sessionStorage: обновление страницы вход не теряет,
  // закрытие вкладки — завершает сессию.
  const [signedIn, setSignedIn] = useState(() => Boolean(getAdminToken()));

  return signedIn ? (
    <AdminPanel onSignedOut={() => setSignedIn(false)} />
  ) : (
    <AdminLogin onDone={() => setSignedIn(true)} />
  );
}

function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-bold text-foreground">Такой страницы нет</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Возможно, ссылка устарела или в адресе опечатка. Начните с главной — там всё на месте.
      </p>
      <Button asChild>
        <Link to="/">На главную</Link>
      </Button>
    </main>
  );
}
