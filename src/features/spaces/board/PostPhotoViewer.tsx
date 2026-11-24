import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { PostContour } from "./PostContour";
import { useEffect, useRef, useState } from "react";

export function PostPhotoViewer({
  open, src, author, onClose, toolbarRef,
}: {
  open: boolean;
  src: string;
  author: string;
  onClose: () => void;
  toolbarRef: (node: HTMLDivElement | null) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <Dialog.Root open={open} onOpenChange={value => {
      if (!value) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/90" />
        <Dialog.Content ref={contentRef} data-no-swipe
          onEscapeKeyDown={event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            onClose();
          }}
          onInteractOutside={event => {
            const target = event.detail.originalEvent.target;
            if (target instanceof Node && contentRef.current?.contains(target)) {
              event.preventDefault();
            }
          }}
          className="viewport-overlay z-[80] mx-auto flex w-full max-w-2xl flex-col overflow-hidden bg-black text-white outline-none">
          <PostContour key={src} />
          <header className="flex shrink-0 items-center justify-between gap-3 px-3 pt-[max(.5rem,env(safe-area-inset-top))]">
            <Dialog.Title className="min-w-0 truncate text-sm">
              {author} — фото
            </Dialog.Title>
            <Dialog.Close aria-label="Вернуться к посту"
              className="grid size-11 shrink-0 place-items-center rounded-full text-white/80 hover:text-white">
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Фото целиком. Реакции и управление находятся внизу.
          </Dialog.Description>
          <main className="grid min-h-0 flex-1 place-items-center overflow-hidden p-2">
            {failed ? (
              <div role="alert" className="space-y-3 text-center text-sm">
                <p>Не удалось открыть фото.</p>
                <button type="button" onClick={() => setFailed(false)}
                  className="rounded-full border border-white/30 px-4 py-2">
                  Повторить
                </button>
              </div>
            ) : (
              <img src={src} alt={`Фото: ${author}`}
                className="size-full object-contain"
                onError={() => setFailed(true)} />
            )}
          </main>
          <footer className="shrink-0 border-t border-white/10 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))]">
            <div ref={toolbarRef} data-post-photo-toolbar=""
              className="flex min-h-11 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
