import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getToken } from "@/api/client";
import { ChatDesktopShell } from "@/features/chat/components/ChatDesktopShell";
import { useMinWidth } from "@/hooks/useMinWidth";

export const Route = createFileRoute("/chat")({
  beforeLoad: () => {
    // During static rendering there is no browser session.
    // In the browser, no access token means the private route must not render.
    if (typeof window !== "undefined" && !getToken()) {
      throw redirect({ to: "/auth", replace: true });
    }
  },
  component: ChatLayout,
});

/** На ПК список диалогов и меню постоянны, меняется только правая часть. */
function ChatLayout() {
  const desktop = useMinWidth(1024);
  return (
    <>
      {desktop ? <ChatDesktopShell /> : null}
      <Outlet />
    </>
  );
}
