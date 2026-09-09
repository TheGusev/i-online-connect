/** Розовый счётчик поверх иконки в нижнем меню. */
export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} непрочитанных`}
      className="absolute -right-2.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground shadow-glow"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
