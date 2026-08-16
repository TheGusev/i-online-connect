import { ChevronDown } from "lucide-react";
import {
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

const fieldShell =
  "peer w-full rounded-2xl border bg-card px-4 pb-2 pt-6 text-sm text-foreground outline-none transition-colors placeholder-transparent focus:border-primary focus:ring-4 focus:ring-primary/12 disabled:opacity-60";

const labelShell =
  "pointer-events-none absolute left-4 top-4 origin-left text-sm text-muted-foreground transition-all duration-150 peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11px]";

function Wrapper({
  hint,
  error,
  children,
  className,
}: {
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">{children}</div>
      {(error || hint) && (
        <p className={cn("mt-1.5 px-1 text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Wrapper hint={hint} error={error}>
      <input
        id={inputId}
        placeholder={label}
        className={cn(fieldShell, error ? "border-destructive" : "border-input", className)}
        {...props}
      />
      <label htmlFor={inputId} className={labelShell}>
        {label}
      </label>
    </Wrapper>
  );
}

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder"> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextArea({ label, hint, error, className, id, rows = 4, ...props }: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Wrapper hint={hint} error={error}>
      <textarea
        id={inputId}
        rows={rows}
        placeholder={label}
        className={cn(
          fieldShell,
          "resize-y leading-relaxed",
          error ? "border-destructive" : "border-input",
          className,
        )}
        {...props}
      />
      <label htmlFor={inputId} className={labelShell}>
        {label}
      </label>
    </Wrapper>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, hint, error, options, className, id, ...props }: SelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Wrapper hint={hint} error={error}>
      <select
        id={inputId}
        className={cn(
          fieldShell,
          "appearance-none pr-10",
          error ? "border-destructive" : "border-input",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label
        htmlFor={inputId}
        className="pointer-events-none absolute left-4 top-2 text-[11px] text-muted-foreground peer-focus:text-primary"
      >
        {label}
      </label>
      <ChevronDown
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </Wrapper>
  );
}
