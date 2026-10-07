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
