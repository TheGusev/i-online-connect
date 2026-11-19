import { useLayoutEffect } from "react";
import { useLocation } from "@tanstack/react-router";

// Публичные страницы: на них Вебвизор пишет всё как раньше.
// Остальное (чаты, объявления, сообщества, профили, вход) скрыто от записи.
const PUBLIC_PATHS = new Set(["/", "/about", "/rules", "/privacy", "/support", "/safety-center"]);

export function MetrikaPrivacy() {
  const raw = useLocation({ select: (location) => location.pathname });
  const pathname = raw.replace(/\/+$/, "") || "/";

  useLayoutEffect(() => {
    document.body.classList.toggle("ym-hide-content", !PUBLIC_PATHS.has(pathname));
    return () => document.body.classList.remove("ym-hide-content");
  }, [pathname]);

  return null;
}
