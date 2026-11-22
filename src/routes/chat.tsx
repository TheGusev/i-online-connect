import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getToken } from "@/api/client";

export const Route = createFileRoute("/chat")({
  beforeLoad: () => {
    // During static rendering there is no browser session.
    // In the browser, no access token means the private route must not render.
    if (typeof window !== "undefined" && !getToken()) {
      throw redirect({ to: "/auth", replace: true });
    }
  },
  component: () => <Outlet />,
});
