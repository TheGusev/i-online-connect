import { Compass, MessageCircle, Users, User } from "lucide-react";

export interface NavItem {
  to: "/feed" | "/chat" | "/spaces" | "/profile/me";
  params?: Record<string, string>;
  labelKey: string;
  icon: typeof Compass;
}

export const navItems: NavItem[] = [
  { to: "/feed", labelKey: "nav.feed", icon: Compass },
  { to: "/spaces", labelKey: "nav.spaces", icon: Users },
  { to: "/chat", labelKey: "nav.chat", icon: MessageCircle },
  { to: "/profile/me", labelKey: "nav.profile", icon: User },
];
