#!/usr/bin/env python3
'''Подключает доску сообщества к существующим файлам точечными правками по якорям.
Запуск из корня репозитория: python3 scripts/apply-space-board.py
Повторный запуск безопасен: уже применённые правки пропускаются.'''
import sys
from pathlib import Path

NL = chr(10)


def patch(path, edits):
    file = Path(path)
    if not file.exists():
        sys.exit('STOP: нет файла ' + path)
    text = file.read_text(encoding='utf-8')
    changed = False
    for old, new, marker in edits:
        if marker in text:
            continue
        if text.count(old) != 1:
            sys.exit('STOP: якорь не найден ровно один раз в ' + path + ': ' + old[:70])
        text = text.replace(old, new, 1)
        changed = True
    if changed:
        file.write_text(text, encoding='utf-8')
    print(('PATCHED ' if changed else 'ALREADY ') + path)


patch('server/src/index.ts', [
    ('import { liveCardRoutes } from "./routes/live-cards.ts";',
     'import { liveCardRoutes } from "./routes/live-cards.ts";' + NL + 'import { spaceBoardRoutes } from "./routes/space-board.ts";',
     'import { spaceBoardRoutes }'),
    ('await app.register(liveCardRoutes, { prefix: "/api/spaces" });',
     'await app.register(liveCardRoutes, { prefix: "/api/spaces" });' + NL + 'await app.register(spaceBoardRoutes, { prefix: "/api/spaces" });',
     'app.register(spaceBoardRoutes'),
])

GUARD_NEW = """OR EXISTS (
        SELECT 1 FROM space_posts sp
        JOIN space_members sm ON sm.space_id = sp.space_id
        WHERE sp.media_url = ANY($2::text[])
          AND sm.user_id = $1 AND sm.status IN ('member', 'host')
      )
    ) AS allowed`, [userId, urls]);"""

patch('server/src/media/private-guard.ts', [
    (') AS allowed`, [userId, urls]);', GUARD_NEW, 'FROM space_posts sp'),
])

BOARD_JSX = """{!discussionOpen ? (
          <SpaceBoard
            spaceId={id}
            isMember={space.isMember}
            isHost={space.isHost ?? false}
            canPhoto={canSendMedia}
            events={sortedEvents}
            liveActive={room.active}
            onOpenLive={() => setLiveOpen(true)}
            onOpenDiscussion={() => setDiscussionOpen(true)}
          />
        ) : (
          <div className='flex shrink-0 items-center gap-2 px-4 pt-1 lg:px-6'>
            <Button size='sm' variant='ghost' onClick={() => setDiscussionOpen(false)}>
              <ArrowLeft aria-hidden='true' /> К доске
            </Button>
            <span className='text-sm font-semibold text-foreground'>Обсуждение</span>
          </div>
        )}

        <section className={discussionOpen ? 'mt-1 flex min-h-0 flex-1 flex-col' : 'hidden'}>"""

patch('src/routes/spaces.$id.tsx', [
    ('import { useVerificationStatus } from "@/features/trust/hooks";',
     'import { useVerificationStatus } from "@/features/trust/hooks";' + NL + 'import { SpaceBoard } from "@/features/spaces/board/SpaceBoard";',
     'import { SpaceBoard }'),
    ('  const invite = useInviteToSpace(id);',
     '  const invite = useInviteToSpace(id);' + NL + '  const [discussionOpen, setDiscussionOpen] = useState(false);',
     'discussionOpen, setDiscussionOpen'),
    ('<section className="mt-1 flex min-h-0 flex-1 flex-col">', BOARD_JSX, '<SpaceBoard'),
])

patch('src/features/spaces/components/SpaceCard.tsx', [
    ('import { SpaceSubscribe } from "./SpaceSubscribe";',
     'import { SpaceSubscribe } from "./SpaceSubscribe";' + NL + 'import { SpaceNewsStar } from "@/features/spaces/board/SpaceNewsStar";',
     'import { SpaceNewsStar }'),
    ('<div className="relative aspect-[4/3] overflow-hidden bg-muted">',
     '<div className="relative aspect-[4/3] overflow-hidden bg-muted">' + NL + '        {space.isMember ? <SpaceNewsStar spaceId={space.id} /> : null}',
     '<SpaceNewsStar'),
])

print('APPLY_SPACE_BOARD_COMPLETE')
