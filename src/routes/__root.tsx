import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/UpdateBanner";
import { SessionRestore } from "@/features/auth/session";
import { ensureServiceWorker } from "@/features/notifications/usePushSubscription";
import {
  handleChunkLoadFailure,
  installChunkRecovery,
  isChunkLoadError,
  isChunkRecoveryFatal,
  markAppLoaded,
  recoverStalledRoute,
  subscribeChunkRecovery,
} from "@/lib/chunk-recovery";
import { keepSplash } from "@/lib/splash";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

declare global {
  interface Window {
    ym?: (counter: number, action: string, value: string) => void;
  }
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  // Не загрузился код экрана (после деплоя чанк с прежним хэшем удалён) —
  // не показываем ошибку, а один раз тихо перезагружаемся под сплэшем.
  const isChunkFailure = isChunkLoadError(error);

  useEffect(() => {
    if (isChunkFailure) {
      handleChunkLoadFailure(error);
      return;
    }
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error, isChunkFailure]);

  if (isChunkFailure) {
    keepSplash();
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { title: "Я Онлайн" },
      // Тёмная тема: адресная строка телефона не должна оставаться светлой.
      { name: "theme-color", content: "#0B0F1A" },
      { name: "color-scheme", content: "dark" },
      { name: "description", content: "Платформа знакомств и социальных связей «Я Онлайн»." },
      { property: "og:site_name", content: "Я Онлайн" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Версия сборки документа: подставляется scripts/build-static.mjs.
      // По ней страница понимает, что открыта старая закешированная копия.
      { name: "app-version", content: "__APP_VERSION__" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-64.png", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function YandexMetrikaTracker() {
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    window.ym?.(112270169, "hit", location.href);
  }, [location.href]);

  return null;
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
        {/* Стили экрана загрузки — инлайном, чтобы он был виден сразу,
            не дожидаясь загрузки основной таблицы стилей и кода приложения. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              #app-splash{position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;
                align-items:center;justify-content:center;gap:1.5rem;background:#0B0F1A;
                transition:opacity .35s ease,visibility .35s ease}
              #app-splash.is-hidden{opacity:0;visibility:hidden;pointer-events:none}
              #app-splash .splash-mark{width:5.5rem;height:5.5rem;border-radius:1.375rem;
                display:flex;align-items:center;justify-content:center;color:#fff;
                font:800 2.5rem/1 Manrope,system-ui,-apple-system,sans-serif;
                background:linear-gradient(135deg,#FF4D8D,#FF9EC4);
                box-shadow:0 0 2.5rem rgba(255,77,141,.45);
                animation:splash-pulse 1.6s ease-in-out infinite}
              #app-splash .splash-dots{display:flex;gap:.4rem}
              #app-splash .splash-dots i{width:.5rem;height:.5rem;border-radius:999px;
                background:#FF4D8D;animation:splash-dot 1.2s ease-in-out infinite}
              #app-splash .splash-dots i:nth-child(2){animation-delay:.15s}
              #app-splash .splash-dots i:nth-child(3){animation-delay:.3s}
              @keyframes splash-pulse{0%,100%{transform:scale(1);box-shadow:0 0 2rem rgba(255,77,141,.35)}
                50%{transform:scale(1.06);box-shadow:0 0 3.25rem rgba(255,77,141,.6)}}
              @keyframes splash-dot{0%,100%{opacity:.25;transform:translateY(0)}
                50%{opacity:1;transform:translateY(-.25rem)}}
              @media (prefers-reduced-motion:reduce){
                #app-splash .splash-mark,#app-splash .splash-dots i{animation:none}}
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
              (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

              ym(112270169, "init", {
                clickmap:true,
                trackLinks:true,
                accurateTrackBounce:true,
                webvisor:true
              });
            `,
          }}
        />
      </head>
      <body>
        <noscript>
          <div>
            <img
              src="https://mc.yandex.ru/watch/112270169"
              style={{ position: "absolute", left: "-9999px" }}
              alt=""
            />
          </div>
        </noscript>
        {/* Фирменный экран загрузки: виден мгновенно и плавно исчезает,
            когда приложение готово рисовать содержимое (см. src/lib/splash.ts). */}
        <div id="app-splash" aria-hidden="true">
          <span className="splash-mark">Я</span>
          <span className="splash-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Экран вместо белого, если код приложения не загрузился даже после перезагрузки. */
function ChunkErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Не удалось загрузить обновление
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Похоже, проблема со связью. Проверьте интернет и попробуйте снова.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const outletRef = useRef<HTMLDivElement | null>(null);
  // Единственная подписка на visualViewport для всего приложения:
  // держит --vvh / --vv-top / --vv-keyboard актуальными на любом экране.
  useViewportHeightVar();
  const chunkFatal = useSyncExternalStore(
    subscribeChunkRecovery,
    isChunkRecoveryFatal,
    () => false,
  );


  // Service worker нужен только для push-уведомлений: регистрируем после
  // гидратации, чтобы не мешать первой отрисовке.
  useEffect(() => {
    installChunkRecovery();
    void ensureServiceWorker();
  }, []);

  // Сторож экрана: приложение считается запущенным только когда содержимое
  // маршрута реально отрисовалось. Иначе (старый index.html после деплоя —
  // кода маршрута на сервере уже нет) восстанавливаемся перезагрузкой.
  useEffect(() => {
    const check = () => {
      if (outletRef.current?.firstElementChild) {
        markAppLoaded();
        return true;
      }
      return false;
    };
    if (check()) return;
    const poll = window.setInterval(() => {
      if (check()) window.clearInterval(poll);
    }, 500);
    const timer = window.setTimeout(() => {
      window.clearInterval(poll);
      if (!check()) recoverStalledRoute();
    }, 9000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
    };
  }, []);

  if (chunkFatal) return <ChunkErrorScreen />;

  return (
    <QueryClientProvider client={queryClient}>
      <YandexMetrikaTracker />
      {/* Восстанавливаем сессию по токену до отрисовки приватных экранов. */}
      <SessionRestore />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <div ref={outletRef} className="contents">
        <Outlet />
      </div>
      <Toaster position="top-center" />
      {/* Мягкое обновление: баннер вместо принудительного reload. */}
      <UpdateBanner />
    </QueryClientProvider>
  );
}
