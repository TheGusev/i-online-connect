import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ChatContactTools } from "@/features/chat/ChatContactTools";

export const Route = createFileRoute("/chat")({
  component: () => <><Outlet /><ChatContactTools /></>,
});
