# Я Онлайн App

Создай фронтенд-проект на React + TypeScript + Vite + Tailwind CSS для платформы знакомств и социальных связей «Я Онлайн» (I Online).

ЖЁСТКИЕ ТЕХНИЧЕСКИЕ ОГРАНИЧЕНИЯ:

- НЕ используй Supabase, Lovable Cloud, Firebase или любой встроенный backend-as-a-service.

- НЕ создавай авторизацию через встроенные облачные сервисы Lovable.

- Все данные должны идти через единый API-клиент (папка src/api/), который обращается к внешнему REST API по адресу из переменной окружения VITE_API_URL. Пока backend не готов — используй мок-данные (mock adapter) в том же слое, чтобы позже заменить его на реальные fetch-запросы одной правкой.

- Структура проекта должна быть готова к сборке статических файлов (vite build) для раздачи через Nginx на собственном сервере.

- Используй React Router для навигации, Zustand или React Query для состояния и кэширования данных.

- Компоненты — функциональные, с хуками, разделены по фичам: src/features/auth, src/features/profile, src/features/matching, src/features/chat, src/features/spaces, src/features/trust.

- Все тексты интерфейса — на русском языке, с системой i18n (react-i18next), чтобы позже добавить английский без переписывания компонентов.

- Adaptive/responsive дизайн: mobile-first, но с полноценной desktop-версией (max-width контейнер, боковая навигация на широких экранах).

Создай базовую структуру папок, роутинг с заглушками страниц: /, /onboarding, /feed, /profile/:id, /chat, /spaces, /settings. Пока без дизайна — просто рабочий каркас с навигацией.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://i-online-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c2ec90aa-8cf9-4d4b-b508-95a5e9a4bae6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
