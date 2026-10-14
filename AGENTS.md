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
