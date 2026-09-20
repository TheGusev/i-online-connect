import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/** Переключатель: единый вид для настроек приватности и уведомлений. */
export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-11 w-14 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 top-1.5 h-8 rounded-full border transition-[border-color,background-color,box-shadow] duration-200",
          checked ? "border-primary bg-primary shadow-glow" : "border-primary/70 bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-5 rounded-full bg-foreground shadow-soft transition-[left] duration-200",
            checked ? "left-7" : "left-1",
          )}
        />
      </span>
    </button>
  );
}

/** Строка настройки: заголовок, пояснение и переключатель справа. */
export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string | undefined;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}
