/*
 * Service worker «Я Онлайн» — только push-уведомления.
 *
 * Кеширования здесь нет намеренно: обновления версии приложения проверяет
 * version.json (см. useAppVersion), и офлайн-кеш ломал бы этот механизм.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_error) {
    data = { title: "Я Онлайн", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Я Онлайн";
  const options = {
    body: data.body || "",
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: data.tag || "ya-online",
    renotify: true,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const url = new URL(target, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url === url) return client.focus();
      }
      const existing = windows[0];
      if (existing && "navigate" in existing) {
        await existing.focus();
        return existing.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
