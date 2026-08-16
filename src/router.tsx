import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
// i18n инициализируется здесь (в entry-графе роутера), чтобы перевод был
// доступен с первого рендера любого маршрута, а не только там, где чанк
// с локализацией подгружается лениво.
import "./i18n";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
