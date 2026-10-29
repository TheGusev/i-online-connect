import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { mediaUrl } from "@/api";

import { avatarIndicators, trustRingLabel, type AvatarTrust } from "./trust-ring";

const sizeMap = {
  xs: "size-7 text-[10px]",
  sm: "size-9 text-xs",
  list: "size-8 text-[11px]",
  md: "size-12 text-sm",
  lg: "size-16 text-base",
  xl: "size-24 text-xl",
} as const;

const badgeMap = {
  xs: "size-3.5 [&_svg]:size-2",
  sm: "size-4 [&_svg]:size-2.5",
  list: "size-4 [&_svg]:size-2.5",
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
  /** Кольцо верификации; не передано — кольца нет (как раньше). */
  trust?: AvatarTrust;
  className?: string;
}

const smallSizes = new Set(["xs", "sm", "list"]);

/** Кольцо верификации. Анимация на паузе, пока аватар вне экрана. */
export function TrustRing({ trust, size, children }: { trust: AvatarTrust; size: keyof typeof sizeMap; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || trust === "none" || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    observer.observe(node);
    return () => observer.disconnect();
  }, [trust]);
  const label = trustRingLabel[trust];
  return (
    <span
      ref={ref}
      className="trust-ring"
      data-trust={trust}
      data-small={size === "xs" || size === "list" ? "true" : undefined}
      data-paused={visible ? undefined : "true"}
      style={{ ["--tr-w" as string]: smallSizes.has(size) ? "2px" : "3px" }}
      {...(label ? { role: "img", "aria-label": label, title: label } : {})}
    >
      {children}
    </span>
  );
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
  trust,
  className,
}: AvatarProps) {
  // Если файл не отдался, показываем инициалы, а не «битую» картинку.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const resolved = failed ? undefined : mediaUrl(src);
  const indicators = avatarIndicators(online, trust, verified);

  const photo = (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary-ink",
        !online && "ring-2 ring-card",
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
  );

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 rounded-full",
        // Онлайн показываем розовым пульсирующим ореолом вместо зелёной точки.
        online && (smallSizes.has(size) ? "avatar-ring avatar-ring-sm" : "avatar-ring"),
        className,
      )}
      {...(online ? { title: "Сейчас в сети" } : {})}
    >
      {indicators.trustRing && trust ? <TrustRing trust={trust} size={size}>{photo}</TrustRing> : photo}
      {indicators.badge && (
        <span
          title={trust ? (trustRingLabel[trust] ?? "Профиль подтверждён") : "Профиль подтверждён"}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-gradient-verified text-primary-foreground ring-2 ring-card",
            badgeMap[size],
          )}
        >
          <Check strokeWidth={3.5} aria-hidden="true" />
          <span className="sr-only">{trust ? trustRingLabel[trust] : "Подтверждён"}</span>
        </span>
      )}
      {online && <span className="sr-only">Сейчас в сети</span>}
    </div>
  );
}
