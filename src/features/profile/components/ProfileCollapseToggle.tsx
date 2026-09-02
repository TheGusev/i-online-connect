import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";

interface ProfileCollapseToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export function ProfileCollapseToggle({
  collapsed,
  onToggle,
  className,
}: ProfileCollapseToggleProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls="profile-collapsible-content"
      className={cn("ml-auto", className)}
    >
      {collapsed ? (
        <>
          <ChevronDown aria-hidden="true" />
          Развернуть
        </>
      ) : (
        <>
          <ChevronUp aria-hidden="true" />
          Свернуть
        </>
      )}
    </Button>
  );
}
