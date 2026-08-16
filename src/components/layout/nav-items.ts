import { Home, Compass, MessageCircle, Users, Settings } from "lucide-react";

export interface NavItem {
  to: "/" | "/feed" | "/chat" | "/spaces" | "/settings";
  labelKey: string;
  icon: typeof Home;
}

export const navItems: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/feed", labelKey: "nav.feed", icon: Compass },
  { to: "/chat", labelKey: "nav.chat", icon: MessageCircle },
  { to: "/spaces", labelKey: "nav.spaces", icon: Users },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];
