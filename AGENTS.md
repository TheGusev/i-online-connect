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
- Tab swipes and iOS-style edge-back live in src/features/navigation (pure rules in swipe-rules.ts, tested) and attach in AppShell; zones marked data-no-swipe, inputs and dialogs never start a screen swipe, so horizontal galleries keep their own gestures.
- Listing photo limits live in server/src/listings/photos.ts (pure, tested); attachMedia rejects foreign files and deletes files dropped from a listing.
- Message reactions live in message_reactions / space_message_reactions; rules (allowed emoji, REACTIONS_PER_USER) sit in server/src/chat/reactions.ts with a client copy in src/features/chat/reactions.ts kept identical by a test; direct chats push a WebSocket "reaction" event, communities rely on the existing message polling.
