import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { initI18n } from "./i18n";
import { handleChunkLoadFailure, installChunkRecovery } from "./lib/chunk-recovery";

// Ловим ошибки загрузки чанков как можно раньше: старый закешированный
// index.html после деплоя ссылается на удалённые файлы сборки.
installChunkRecovery();

// Локализация инициализируется в entry-графе роутера, чтобы перевод был
// доступен с первого рендера любого маршрута.
initI18n();

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Ошибки загрузки чанка маршрута роутер обрабатывает внутри себя и не
    // отдаёт в window — ловим их здесь той же одноразовой защитой.
    defaultOnCatch: (error) => {
      handleChunkLoadFailure(error);
    },
  });

  return router;
};
