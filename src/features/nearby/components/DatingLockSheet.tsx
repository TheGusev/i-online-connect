import { Lock } from "lucide-react";

import type { ProfileCompleteness } from "@/api";
import { BottomSheet, Button } from "@/components/ds";

/** «Заполните анкету, чтобы открыть знакомства» с прогрессом заполнения. */
export function DatingLockSheet({
  open,
  onClose,
  completeness,
  guest,
  onFill,
}: {
  open: boolean;
  onClose: () => void;
  completeness: ProfileCompleteness | undefined;
  guest: boolean;
  onFill: () => void;
}) {
  const filled = completeness?.filled ?? 0;
  const total = completeness?.total ?? 9;
  const percent = Math.round((filled / Math.max(1, total)) * 100);
  return (
    <BottomSheet open={open} onClose={onClose} title="Заполните анкету, чтобы открыть знакомства">
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {guest
            ? "Знакомства доступны после входа и заполнения анкеты: так рядом остаются только настоящие люди."
            : "Знакомства открываются, когда анкета заполнена полностью: имя, возраст, город, цель, о себе, 3 интереса, что ценишь, что радует и фото."}
        </p>
        {!guest ? (
          <div>
            <div className="mb-1.5 flex justify-between text-xs font-semibold">
              <span>Заполнено</span>
              <span className="tabular-nums text-primary">
                {filled} из {total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary shadow-glow" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
        <Button fullWidth onClick={onFill}>
          {guest ? "Войти" : "Заполнить анкету"}
        </Button>
      </div>
    </BottomSheet>
  );
}
