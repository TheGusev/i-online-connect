<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Community detail uses the shared AppShell's focused mode to hide duplicate global bars while keeping its session gate and viewport handling; this keeps the mobile chat and owner controls visible without changing other screens.
- Listings preserve stored expiry timestamps and derive expired status on reads; this avoids scheduled jobs while keeping historic listings available to their authors.
- Ordinary listings derive expired status on reads; urgent sell outcomes and reservations additionally use a guarded PostgreSQL job, so their transactional completion and notifications survive restarts.
- Urgent sell jobs defer expiry while a reservation is ongoing; reservation notifications replace only same-kind same-lot notices transactionally and are delivered after commit, while service messages advance conversation activity without marking either participant read.
- Spaces expose their existing creation timestamp through the API for client-side age labels; no new database field is needed.
- Seller storefronts read existing listing fields through a dedicated authenticated endpoint; this keeps active and completed tabs accurate without duplicating listing data.
- Interest-based space ordering is derived on the client from the signed-in user's interests and existing space interests; this avoids changing the spaces API for presentation-only ranking.
- Chat attachment photos and media galleries share a portal viewer with Embla for page snapping and react-zoom-pan-pinch for image transforms; this isolates paging from image panning.
- Community message mutations are authorized in the existing Fastify API and use soft deletion plus scoped replies; active message queries refetch periodically so other members receive edits and removals.
- One-off trust assignments use an explicit server maintenance command with a registration cutoff and a private pre-update backup, never page-load or migration seeding; this keeps future registrations and identity verification unchanged.
- Phone sign-in issues SMS codes via a swappable SmsProvider and stores only HMAC hashes in auth_otps; resend/hourly/IP/daily limits are counted from that table so they work without Redis and survive restarts.
- Guests may only GET the listings list and detail; every other listings route still requires auth, and guest actions open the in-place phone sign-in sheet (useAuthGate) that resumes the action afterwards.
- Nearby category filters use an explicit grid variant of the shared selector and a tested selection helper; listing creation keeps the row variant and required-selection behavior to isolate screen presentation changes.
- ProfileHero isolates the owner's restored gallery through optional presentation props; public profiles keep their existing appearance, while profile editing uses a tested optional-age parser.
- Profile completeness ("анкета заполнена") is computed on the server in server/src/profile/completeness-rules.ts and gates the dating category in listings; the UI only mirrors it, so access cannot be bypassed.
- Demo seed data lives in server/scripts/seed-data.mjs with one unique image file per listing and per author, enforced by tests/seed-images.test.mjs.
- Listing durations per category live in server/src/listings/durations.ts with a client copy in src/features/nearby/durations.ts; server/tests/durations.test.mjs keeps them identical because the server builds only from its own folder.
- Urgent deal price rules live in server/src/listings/urgent.ts with a byte-identical browser copy; urgent-jobs.ts owns shared row-locked reservation primitives and a cross-process advisory-locked scheduler, so manual and automatic holds cannot race.
- Urgent client presentation uses urgent-ui.ts and shared UrgentDeal/UrgentPrice for cards and detail; only the seller form computes full price steps, keeping hidden floor prices out of buyer calculations. Type-specific ride/pickup fields are serialized into the existing description because the API has no dedicated fields.
- Nearby's urgent-only switch shares the existing urgent category query and urgent-ui.ts filtering, preserving server-side ordering before pagination without introducing another API filter.
- Tab swipes and iOS-style edge-back live in src/features/navigation (pure rules in swipe-rules.ts, tested) and attach in AppShell; zones marked data-no-swipe, inputs and dialogs never start a screen swipe, so horizontal galleries keep their own gestures.
- Listing photo limits live in server/src/listings/photos.ts (pure, tested); attachMedia rejects foreign files and deletes files dropped from a listing.
- Message reactions live in message_reactions / space_message_reactions; rules (allowed emoji, REACTIONS_PER_USER) sit in server/src/chat/reactions.ts with a client copy in src/features/chat/reactions.ts kept identical by a test; direct chats push a WebSocket "reaction" event, communities rely on the existing message polling.
- Live-room clips are stored only in live_clips tied to a live_sessions row and are deleted with their files when the session ends (plus startup/hourly sweeps in server/src/ws/live.ts); this keeps broadcast clips out of the community chat history.
- Live-room table cards are stored only in live_cards tied to a live_sessions row, mirrored in ws/live.ts memory, and deleted with their photo files when the session ends; links are stored and shown by domain but never fetched server-side, to avoid SSRF.
- All overlays (modals, sheets, menus, popovers, full-screen layers) use useOverlayPresence from src/lib/useOverlayPresence.ts plus the pop/menu/sheet/layer CSS classes and backdrop-enter/backdrop-leave from src/styles.css; scroll locking goes through lockBodyScroll, and parents receive onClose immediately while the window animates out.
