import { Compass, MapPin, MessageCircle, Users, User } from "lucide-react";

import { SHOW_FEED } from "@/config/features";

export interface NavItem {
  to: "/feed" | "/nearby" | "/chat" | "/spaces" | "/profile/me";
  params?: Record<string, string>;
  labelKey: string;
  icon: typeof Compass;
}

const allNavItems: NavItem[] = [
  { to: "/chat", labelKey: "nav.chat", icon: MessageCircle },
  { to: "/nearby", labelKey: "nav.nearby", icon: MapPin },
  { to: "/spaces", labelKey: "nav.spaces", icon: Users },
  { to: "/profile/me", labelKey: "nav.profile", icon: User },
  { to: "/feed", labelKey: "nav.feed", icon: Compass },
];

export const navItems: NavItem[] = allNavItems.filter((item) => SHOW_FEED || item.to !== "/feed");
