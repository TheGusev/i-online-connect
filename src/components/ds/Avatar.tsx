import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { mediaUrl } from "@/api";

const sizeMap = {
  xs: "size-7 text-[10px]",
  sm: "size-9 text-xs",
  md: "size-12 text-sm",
  lg: "size-16 text-base",
  xl: "size-24 text-xl",
} as const;

const badgeMap = {
  xs: "size-3.5 [&_svg]:size-2",
  sm: "size-4 [&_svg]:size-2.5",
  md: "size-5 [&_svg]:size-3",
  lg: "size-6 [&_svg]:size-3.5",
  xl: "size-8 [&_svg]:size-5",
} as const;

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: keyof typeof sizeMap;
  verified?: boolean;
  online?: boolean;
  className?: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  src,
  size = "md",
  verified = false,
  online = false,
  className,
}: AvatarProps) {
  // Если файл не отдался, показываем инициалы, а не «битую» картинку.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const resolved = failed ? undefined : mediaUrl(src);

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full bg-primary-soft font-bold text-accent-foreground ring-2 ring-card",
          sizeMap[size],
        )}
      >
        {resolved ? (
          <img
            src={resolved}
            alt={name}
            className="size-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <span aria-hidden="true">{initials(name)}</span>
        )}
      </div>
      {verified && (
        <span
          title="Профиль подтверждён"
          className={cn(
            "absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-gradient-verified text-primary-foreground ring-2 ring-card",
            badgeMap[size],
          )}
        >
          <Check strokeWidth={3.5} aria-hidden="true" />
          <span className="sr-only">Подтверждён</span>
        </span>
      )}
      {online && !verified && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-success ring-2 ring-card" />
      )}
    </div>
  );
}
