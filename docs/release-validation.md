# Integrated chat and geography release candidate

## Scope
- Conversation-name search and people search.
- Personal invitations, QR UI, acceptance and account-change protection.
- Geography directory, explicit city confirmation and regional communities.
- Regional discovery preserving memberships, invitations and private access.
- Stable Zustand selector on the communities page.
- Invitation processing deferred until router onRendered.
- Production build rejects localhost and inconsistent API/WebSocket addresses.
- Existing private-media guard, restricted trustProxy, log redaction and
  account-purge integration are retained.

## Locally completed
- Frontend and backend TypeScript checks.
- 133 frontend unit tests.
- 22 existing server test files on separate disposable databases.
- Combined migrations 001–043 on disposable PostgreSQL 16 with C.UTF-8.
- Invitations, importer, geography HTTP and regional access integration tests.
- Ten Chromium scenarios with intercepted business API.
- Chromium with real API handlers and PostgreSQL: login, invitation on /,
  acceptance, message persistence, reading and city confirmation.
- Clean npm ci installations.
- Production static build on clean frontend dependencies.

## Commands
- npm run typecheck
- npm run test:unit
- npm run typecheck --prefix server
- VITE_API_URL=https://HOST/api VITE_WS_URL=wss://HOST/ws npm run build:static
- node node_modules/playwright-core/cli.js install chromium
- npm run test:browser

The real-API browser script is server/scripts/browser-real-api.integration.mjs.
It requires NODE_ENV=test, disposable local browser_e2e_* PostgreSQL,
test JWT secrets and all migrations. It must not target production.

## Limitations
- GitHub Actions success must be checked after publishing the candidate.
- Physical iPhone/Safari and production Nginx/WebSocket have not been
  validated by the in-process browser test.
- Live GeoNames availability is distinct from deterministic importer tests.
- Regional listings are not declared complete by community-discovery tests.
- REGIONAL_DEMO_ENABLED defaults to false; automatic jobs are not enabled
  as part of candidate preparation.
- No production database migrations or deployment are implied by this document.
