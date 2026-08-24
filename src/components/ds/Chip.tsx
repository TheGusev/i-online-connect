import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors",
  {
    variants: {
      variant: {
        interest: "border-border bg-secondary text-secondary-foreground",
        intent: "border-primary/25 bg-primary-soft text-accent-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
      },
      size: {
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3.5 py-1.5 text-sm",
      },
      selected: { true: "border-primary bg-primary text-primary-foreground", false: "" },
    },
    defaultVariants: { variant: "interest", size: "md", selected: false },
  },
);

export interface ChipProps extends VariantProps<typeof chipVariants> {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}

export function Chip({
  children,
  className,
  variant,
  size,
  selected,
  onClick,
  onRemove,
  disabled = false,
}: ChipProps) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      {...(Comp === "button" ? { disabled } : {})}
      className={cn(
        chipVariants({ variant, size, selected }),
        onClick && "cursor-pointer hover:border-primary/50",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Удалить"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="-mr-1 grid size-4 place-items-center rounded-full hover:bg-foreground/10"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </Comp>
  );
}
