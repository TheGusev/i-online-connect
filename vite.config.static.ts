// Конфиг ТОЛЬКО для статической сборки под собственный сервер (Nginx).
// Используется командой `npm run build:static` (см. DEPLOY.md).
//
// Отличия от основного vite.config.ts:
//   - spa.enabled: TanStack Start пререндерит статический SPA-шелл
//     (dist/client/_shell.html), который Nginx отдаёт по любому маршруту
//     через try_files ... /index.html.
//   - nitro: false — серверный рантайм не собирается и не деплоится,
//     на прод уезжает только статика из dist/static.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: { enabled: true },
  },
  vite: {
    build: {
      manifest: true,
    },
  },
});
