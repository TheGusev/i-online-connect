import { Ban, Flag, ShieldCheck, Info } from "lucide-react";
import { useState } from "react";

import { Button, Modal } from "@/components/ds";

/** Иконка щита в шапке диалога: жалоба, блокировка и памятка по безопасности. */
export function SafetyMenu({ participantName }: { participantName: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [actionDone, setActionDone] = useState<"report" | "block" | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Безопасность диалога"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
        className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ShieldCheck className="size-5" aria-hidden="true" />
      </button>

      {menuOpen ? (
        <>
          <button
            aria-label="Закрыть меню"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lift animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => {
                setActionDone("report");
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <Flag className="size-4 text-muted-foreground" aria-hidden="true" />
              Пожаловаться
            </button>
            <button
              type="button"
              onClick={() => {
                setActionDone("block");
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <Ban className="size-4 text-muted-foreground" aria-hidden="true" />
              Заблокировать
            </button>
            <button
              type="button"
              onClick={() => {
                setInfoOpen(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <Info className="size-4 text-muted-foreground" aria-hidden="true" />
              Как обеспечивается безопасность
            </button>
          </div>
        </>
      ) : null}

      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Как обеспечивается безопасность"
        description="Коротко о модерации и о том, как сделать встречу спокойной."
        footer={<Button onClick={() => setInfoOpen(false)}>Понятно</Button>}
      >
        <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">Модерация.</span> Каждый профиль
            проходит видеоверификацию, а жалобы разбирает живая команда — обычно в течение суток.
          </li>
          <li>
            <span className="font-semibold text-foreground">Приватность.</span> Точное
            местоположение и контакты не передаются собеседнику: вы делитесь ими сами, когда готовы.
          </li>
          <li>
            <span className="font-semibold text-foreground">Первая встреча.</span> Выбирайте
            публичное место днём, предупредите близкого человека, добирайтесь своим транспортом.
          </li>
          <li>
            <span className="font-semibold text-foreground">Границы.</span> Отказаться или
            перенести встречу — нормально. Давление и настойчивость — повод пожаловаться.
          </li>
        </ul>
      </Modal>

      <Modal
        open={actionDone !== null}
        onClose={() => setActionDone(null)}
        title={actionDone === "block" ? "Собеседник заблокирован" : "Жалоба отправлена"}
        description={
          actionDone === "block"
            ? `${participantName} больше не сможет вам писать. Диалог скрыт из списка.`
            : "Команда модерации посмотрит переписку и вернётся с ответом. Спасибо, что сообщили."
        }
        footer={<Button onClick={() => setActionDone(null)}>Закрыть</Button>}
      />
    </div>
  );
}
