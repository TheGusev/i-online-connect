import { Check, ChevronRight } from "lucide-react";

import type { MyProfile } from "@/api";
import { Card } from "@/components/ds";

export function completionSteps(profile: MyProfile) {
  return [
    { id: "photo", label: "Фото", done: profile.media.some((item) => item.kind === "photo") },
    { id: "bio", label: "Чем занимаюсь", done: profile.bio.trim().length > 0 },
    { id: "city", label: "Город", done: profile.city.trim().length > 0 },
    { id: "verify", label: "Подтверждение", done: profile.verification === "verified" },
    { id: "interests", label: "Анкета интересов", done: profile.interests.length >= 3 },
  ] as const;
}

export type CompletionStepId = ReturnType<typeof completionSteps>[number]["id"];

/** «Дополните визитку»: прогресс и быстрые переходы. Ничего не блокирует. */
export function CompleteCard({ profile, onStep }: { profile: MyProfile; onStep: (id: CompletionStepId) => void }) {
  const steps = completionSteps(profile);
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Дополните визитку</p>
        <span className="text-xs font-semibold tabular-nums text-primary">
          {done} / {steps.length}
        </span>
      </div>
      <div className="hud-bar mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              disabled={step.done}
              onClick={() => onStep(step.id)}
              className="flex min-h-9 w-full items-center gap-2 rounded-xl px-1 text-left text-sm disabled:text-muted-foreground"
            >
              <span className={step.done ? "grid size-5 place-items-center rounded-full bg-primary text-primary-foreground" : "size-5 rounded-full border border-border"}>
                {step.done ? <Check className="size-3" aria-hidden="true" /> : null}
              </span>
              <span className="flex-1">{step.label}</span>
              {!step.done ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
