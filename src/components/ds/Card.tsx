import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-3xl transition-shadow duration-200", {
  variants: {
    variant: {
      profile: "border border-border bg-card p-5 shadow-soft hover:shadow-lift",
      intent: "border border-primary/20 bg-gradient-warm p-5 shadow-soft",
      space: "border border-border bg-card p-5 shadow-soft hover:shadow-lift",
      plain: "border border-border bg-card p-5",
    },
    interactive: { true: "cursor-pointer hover:-translate-y-0.5", false: "" },
  },
  defaultVariants: { variant: "plain", interactive: false },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, interactive }), className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-bold text-foreground", className)} {...props} />;
}

export function CardSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-3 space-y-3 text-sm leading-relaxed", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex flex-wrap items-center gap-2", className)} {...props} />;
}

export function CardHeaderRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex items-start justify-between gap-3", className)}>{children}</div>;
}
