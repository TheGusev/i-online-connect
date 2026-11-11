import { useState } from "react";

import { Card } from "@/components/ds";
import { Toggle } from "@/components/ds/Toggle";
import { buzz, hapticsEnabled, setHapticsEnabled } from "@/lib/haptics";

/** Тактильный отклик: на iPhone системный тик от нажатия, на Android вибрация. */
export function HapticsRow() {
  const [on, setOn] = useState(hapticsEnabled);
  return (
    <Card className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Вибрация</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Лёгкий отклик при нажатиях: кнопки, меню, реакции, отправка.
        </p>
      </div>
      <Toggle
        label="Вибрация"
        checked={on}
        onChange={(next) => {
          setHapticsEnabled(next);
          setOn(next);
          if (next) buzz("light");
        }}
      />
    </Card>
  );
}
