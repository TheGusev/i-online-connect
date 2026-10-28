export interface ActionsViewport { top: number; height: number; width: number }
export interface ActionsRect { top: number; bottom: number; left: number; right: number }

/** DOM rectangles are layout-relative; the panel is local to the visible viewport. */
export function computeActionsPosition({ rect, viewport, panelHeight, mine }: {
  rect: ActionsRect; viewport: ActionsViewport; panelHeight: number; mine: boolean;
}) {
  const gap = 8;
  const width = Math.max(0, Math.min(320, viewport.width - gap * 2));
  const height = Math.max(0, Math.min(panelHeight, viewport.height - gap * 2));
  const bottom = rect.bottom - viewport.top;
  const top = rect.top - viewport.top;
  const preferred = bottom + gap + height <= viewport.height ? bottom + gap : top - height - gap;
  return {
    top: Math.max(gap, Math.min(viewport.height - height - gap, preferred)),
    left: Math.max(gap, Math.min(viewport.width - width - gap, mine ? rect.right - width : rect.left)),
    maxHeight: Math.max(0, viewport.height - gap * 2),
  };
}