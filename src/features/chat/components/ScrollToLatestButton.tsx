import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** Компактная стрелка «к последним сообщениям»: стоит над нижней панелью и едет вместе с ней. */
export function ScrollToLatestButton({
  visible,
  unseen,
  onClick,
}: {
  visible: boolean;
  unseen: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      aria-label={unseen > 0 ? `Новых сообщений: ${unseen}. К последним` : "К последним сообщениям"}
      style={{ bottom: "calc(var(--bot-vis, 0px) + 0.75rem)" }}
      className={cn(
        "absolute right-3 z-10 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow",
        "transition-[opacity,transform] duration-300 ease-out active:scale-95 motion-reduce:transition-none",
        "[-webkit-tap-highlight-color:transparent]",
        visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-75 opacity-0",
      )}
    >
      <ChevronDown className="size-5" aria-hidden="true" />
      {unseen > 0 ? (
        <span className="absolute -left-1.5 -top-1.5 min-w-5 rounded-full bg-background px-1 text-center text-[11px] font-bold leading-5 text-primary ring-1 ring-primary/50">
          {unseen > 99 ? "99+" : unseen}
        </span>
      ) : null}
    </button>
  );
}
