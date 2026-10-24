# Company Intelligence — build record

**Branch:** `MichaelF/research-diligence-mvp` (existing shared checkout)\
**Updated:** 24 October 2026\
**Status:** Manual signals and financing history implemented with source-linked revisions; overall plan remains in progress\
**Plan:** [Implementation plan](company-intelligence.md)\
**Plan review:** [Execution adjustments](company-intelligence-review.md)

## Progress

- [x] Review plan against current application, membership, schema, and migration state.
- [x] Choose existing `apps/web` surface and explicit Research membership authority for the bounded slice.
- [x] Implement canonical manual company create/search/profile persistence.
- [x] Implement sourced assertions, review states, deterministic conflicts, pin/release, optimistic versions, and audit.
- [x] Add authenticated HTTP routes with bounded bodies, same-origin mutations, uncached responses, safe errors, and correlation IDs.
- [x] Add generated additive migration and PostgreSQL CI service/test configuration.
- [x] Verify unit, HTTP and real PostgreSQL behavior; fix independent-review UUID finding.
- [x] Finish scoped verification, independent review, and backend handover documentation.
- [x] Add `/companies` directory and profile/evidence UI, exact duplicate preview, dashboard entry, and responsive layouts.
- [x] Verify sourced fact/review/pin/release workflows, stale draft recovery, read-only access, reload persistence and lost-response retries in the browser against PostgreSQL.
- [ ] Finish remaining stage 1–2 platform/profile requirements (shared access consolidation, annotations, provider entitlement policies, vocabulary/freshness management, and real Clerk end-to-end verification).
- [x] Add manual signals, immutable correction/source revisions, status changes, timeline category/date filters, and financing history with exact original-currency filters.
- [x] Verify shared fact/signal concurrency, projection updates, source-only revisions, retained retries, and cross-view stale draft recovery.
- [ ] **NEXT: Finish stage 3 review/report and reassociation workflows before reviewed company merges (stage 4).**
- [ ] Add durable ingestion, approved provider integration, and monitoring (stages 5–7).
- [ ] Run pilot preparation and four-week measurement (stage 8).

## Contracts and code

- Domain/application: `apps/web/src/modules/company-intelligence/{domain,application}`.
- Persistence: `apps/web/src/modules/company-intelligence/infrastructure/{schema,repository}.ts`.
- Composition and identity: `apps/web/src/lib/company-intelligence.ts`; verified Clerk subject maps to `research_memberships`.
- HTTP: `apps/web/src/modules/company-intelligence/presentation/http.ts` and `/api/company-intelligence/[[...path]]` route.
- Tables: `intelligence_companies`, `intelligence_assertions`, `intelligence_overrides`, `intelligence_audit`, `intelligence_requests`.
- Migration: `0005_glamorous_black_queen.sql` and generated snapshot/journal entry; earlier migrations are preserved.
- API/setup: [Development guide](../company-intelligence-development.md).

## Verification evidence

Dedicated local database: `company_intelligence_test`, created for this work. Integration tests create random isolated schemas, apply the full migration chain, and drop those schemas on completion. No production database was accessed.

- `pnpm --filter @repo/web db:migrate` against the dedicated local database: passed.
- `pnpm test` with local DATABASE_URL and TEST_DATABASE_URL: passed, 103 app tests plus 6 environment tests at this checkpoint; includes 28 Company Intelligence tests (8 PostgreSQL tests), no skips.
- `pnpm typecheck` with the same local database configuration: passed.
- Scoped Biome check for all 12 added source/test files: passed without warnings after formatting.
- `pnpm build`: passed, including the new dynamic Company Intelligence API route.
- Independent final review: no confirmed issues in the declared backend slice after the UUID fix.
- `git diff --check`: passed.
- Repository-wide `pnpm lint`: failed on unrelated marketing import scripts, site components/CSS, and global CSS formatting; these files were not modified for this task. See `/tmp/company-intelligence-lint.log` for the local run.
- Actual production-server smoke attempt: built server started successfully on dedicated port 3124, but GET/POST requests timed out in the existing Clerk development proxy; its log reported a localhost proxy socket hang-up. Authenticated end-to-end API access is therefore not verified. The HTTP boundary's success/error/CSRF behavior is covered by handler tests with injected sessions; real database behavior is covered separately. No authentication bypass was introduced. The temporary server was stopped.

## Known boundaries

No provider adapter, licensed-source grants, company merge, automatic signal ingestion, fact supersession command, monitoring, ambiguity/report queue, or cross-company signal reassociation is delivered yet. The whole plan remains open. Existing Research/Pipeline work and public site edits are preserved.

The firm lock serializes all Company Intelligence writes with Research administration/writes; this deliberately favors correctness at small-team scale. Existing request outcomes are retained without a cleanup job in this first slice; the proposed seven-day retention is not yet implemented. Manual source URLs are references only and are never fetched.

## Next concrete work

Complete stage 3's signal reports/ambiguity resolution and explicit company reassociation, then implement stage 4's company merge preview and transactional reconciliation. Typed external Research evidence references remain a separate integration contract; manual source URLs are currently the supported evidence. Finish shared platform/access consolidation only with explicit cross-domain ownership, not by duplicating memberships. Provider coverage remains unavailable.

## Company UI checkpoint

Delivered authenticated server pages at `/companies/` and `/companies/:id/`, plus loading, unavailable/access-denied, invalid-search and not-found states. A dashboard destination makes company research discoverable. The client uses the existing API and receives role capabilities from the server; the backend rechecks membership for every operation.

The create flow checks exact normalized names/domains through `POST /api/company-intelligence/company-candidates/`, lets users open an existing match, and requires a reason before intentionally creating a separate matching company. Directory search and pagination use the firm-scoped API.

The profile exposes six supported fields, sources, observation dates, current review status, conflicts, selected/pinned/suspended values, all submitted evidence and retained pin history. Contributor/admin members can add evidence and review/pin/release facts. Viewers have no edit controls. Optimistic conflicts preserve drafts; loading the latest profile does not silently save them. Identical retries after an uncertain response retain their request ID.

Verification at this checkpoint:

- 30 Company Intelligence domain/application/HTTP/PostgreSQL tests: passed, no skips.
- 7 browser tests: passed with real HTTP validation, service and PostgreSQL in a random isolated schema; graceful teardown verified no browser-fixture schemas remained. Test-only fixture sessions do not alter or certify production Clerk authentication.
- Browser coverage includes create/search/reload, duplicate reuse and separate-company reasons, fact provenance/review/pin/conflict/release, stale draft recovery, viewer API rejection, lost-response replay without duplicate facts, and a 390px viewport without horizontal overflow.
- Desktop/mobile populated-profile screenshots inspected: `apps/web/.impeccable/review/company-desktop.png` and `company-mobile.png`.
- Independent screenshot/code finish review: **ship**, no material findings in the reviewed scope. An available general reviewer substituted for the unavailable dedicated finish-review role; a documentation worker likewise recorded the local surface instead of the unavailable dedicated documenter. Overview screenshots were visually reviewed; other UI states were exercised by browser tests and code review.
- Scoped TypeScript check including new server pages, API code, UI, test harness and browser tests: passed using `/tmp/company-intelligence-ui-tsconfig.json`.
- Scoped Biome check covering 28 changed source/config/test/documentation files: passed; `git diff --check`: passed.
- Latest full workspace tests after applying the concurrent Knowledge migration to the dedicated test database: 181 app tests passed, 11 unrelated tests skipped, plus 6 environment tests passed. Company checks did not skip.
- Full workspace typecheck/build currently fail in concurrently changing Knowledge ingestion code, including `knowledge-search/infrastructure/ingestion-store.ts` typing. The production compiler successfully compiled the new company routes before the unrelated type gate failed. Full lint also fails in unrelated existing/concurrent files. Logs: `/tmp/company-ui-build.log`, `/tmp/company-ui-lint.log`, `/tmp/company-ui-tests.log`. No unrelated implementation was rewritten to force these checks green.

Browser command: `pnpm --filter @repo/web test:company:e2e` with local DATABASE_URL and TEST_DATABASE_URL. CI installs Chromium and runs this suite. Local design decisions are recorded in `apps/web/src/app/companies/DESIGN.md`; the public-site design system is unchanged.

## Manual signals and financing checkpoint

Delivered **Signals** in company profiles: manual financing, leadership, product, commercial, corporate and risk events. Each event carries one or more source references with observation and optional publication dates, an event date with day/month/year/unknown precision, summary, status and a complete immutable revision history. Contributor/admin corrections require a reason; viewers inspect history without write controls. Existing shared membership locks, request replay, company versions, audit persistence and safe HTTP errors protect the new operations.

Financing keeps reported round type, original currency, decimal-string amount, investors and explicitly classified pre/post-money valuation. No FX conversion or funding totals are inferred. A normalized PostgreSQL projection supports same-round currency/type/amount filters and overlapping event-date intervals. Unknown dates do not match date-constrained queries. Disputed/retracted revisions remain visible in the timeline but have no current financing projection. Restoring an eligible revision rebuilds it transactionally.

Exact normalized duplicate candidates require an explicit distinct-event reason. Adding/changing only supporting sources appends a non-material revision. This is a conservative manual matcher, not a claim of automated news clustering or complete provider coverage.

Schema additions: `intelligence_signals`, `intelligence_signal_revisions`, `intelligence_financing`. Generated migrations `0007_manual_signals` and `0009_manual_signals` add and tighten the model. Concurrent `0008_pipeline_company_connection` was preserved. Snapshot/journal formatting was normalized without changing its schema semantics. All migrations were applied only to the dedicated local test database for this work.

Independent review found a cross-view optimistic-version bug: refreshing signals advanced the company version without refreshing fact decisions. The fix fetches the complete profile before adopting a new version, preserves pending fact drafts, and requires explicit profile reload if those facts changed. Signal controls stay disabled during synchronization. A browser regression verifies another analyst's disputed decision is shown before the pending review can be submitted.

Verification:

- 55 Company Intelligence tests passed with no skips, including 15 policy/application tests and 10 new real PostgreSQL signal tests.
- 13 company browser workflows passed, including financing corrections/retraction and revision evidence, original-currency and partial-date filtering, read-only API rejection, lost-response replay, stale signal drafts, the cross-view review regression, reload persistence, and 390px layout.
- Full workspace checks at this checkpoint: lint passed; typecheck passed; production build passed; tests reported 233 app tests passed and 18 unrelated tests skipped, plus 6 environment tests passed. Company tests did not skip.
- Production-server signed-out smoke on `localhost:3128`: `/companies/` displayed sign-in guidance without private data; company API returned `401 unauthenticated`. No authenticated Clerk workflow is certified by this smoke or the fixture-session browser suite.
- Fresh general finish reviewer (substituting for the unavailable dedicated role): **ship**, no material findings after the concurrency fix. Desktop/mobile financing captures were inspected at `apps/web/.impeccable/review/signals-desktop.png` and `signals-mobile.png`.
- Logs: `/tmp/company-signals-build.log`, `/tmp/company-signals-typecheck.log`, `/tmp/company-signals-tests.log`, `/tmp/company-signals-lint.log`.

Remaining stage 3 work is recorded above; manual selection currently supplies the canonical company association. Timeline/history reads load the company's complete manual workspace; pagination and large-volume benchmarking must precede provider-scale ingestion. No remote database migration, deployment, push, or PR was performed.
