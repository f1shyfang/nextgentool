# Research and Diligence build

Branch: MichaelF/research-diligence-mvp-completion
Specification: docs/prds/research-and-diligence.md

## Stages

- [x] Foundation and private persistence
- [x] Documents, notes, and memo application workflows
- [x] Research workspace UI and authenticated HTTP adapters
- [x] Integration, browser verification, and independent review

## Decisions

- Implement in apps/web, the application named in the approved domain plan. Preserve the public website and account work now consolidated into apps/web.
- Reuse Clerk's existing identity provider integration pattern; do not provision a new Clerk application or change account settings. Local firm memberships provide viewer/contributor/admin access without requiring Clerk Organizations.
- Use PostgreSQL with a firm-scoped, locked research aggregate in JSONB for this first small-team MVP. Immutable document/note/memo revision IDs are validated in application transactions. This replaces the proposed normalized table layout, retains atomic revision/history/citation behavior, and should be normalized if volume or contention requires it.
- Local private object storage requires a persistent disk and a single shared filesystem. A storage port allows replacement with hosted object storage. Files are never public; authorized downloads stream through the application.
- ClamAV scanning fails closed. No development clean-scan bypass in shipped routes.
- Provision company/deal references administratively until adjacent domains provide their canonical registries. These are real configured references, never synthetic production fixtures.
- Prepare a focused PR for the Research implementation and verification results; deployment remains a separate operation.

## Verification

Application invariant tests; PostgreSQL transaction and tenant isolation tests; real file validation and ClamAV protocol tests; HTTP route tests; browser authoring/edit/conflict workflow; typecheck, lint, build.

## Verification results

- Eleven Research browser integration tests pass, including real native Cancel/Discard dialogs, reload cancellation, upload and metadata retention, notes/memos, pinned historical evidence, conflicts/rebase, scanner retry, viewer/mobile layout and archive/restore.
- The shipped local app was also verified with real Clerk development sessions, local PostgreSQL, private filesystem storage and real ClamAV. All eight live navigation scenarios (17 individual checks) pass. Exactly one explicit new note revision persisted; discarded text, new memo drafts, upload reservations and metadata changes did not persist.
- Real PDF/DOCX uploads and byte-identical downloads pass, alongside document replacement, conflict recovery, source provenance, archive/restore, signed-out/viewer authorization, firm isolation and real scanner outage/recovery. See [the verification report](research-and-diligence-local-verification.md).
- Independent review found replacement-metadata loss, an enabled evidence-removal control during saves, archive draft resurrection, and inconsistent ZIP parsing. Confirmed issues were fixed; final review found no additional material functional issues.
- Isolated PR checks pass from current main: 113 application tests (18 unrelated opt-in pipeline cases skipped), 10 environment tests, all 31 focused Research tests including PostgreSQL, and 11 browser tests. Frozen install, full lint/typecheck and production build pass. CI adds a dedicated Research job with a disposable PostgreSQL service and the browser suite.

## Rollout prerequisites

Provision firm membership and canonical reference IDs; configure existing Clerk keys, private persistent storage, and ClamAV; agree retention/region policy. Follow research-and-diligence-operations.md. Live verification used only synthetic local fixtures and the existing Clerk development application. No deployment or production-data mutation was performed. The PR is prepared in an isolated worktree so other active work can continue in the shared checkout.

Storage reconciliation now includes a dry-run-by-default offline command; --apply removes only old objects missing from the complete firm inventory. Historical and quarantined versions are retained. The inspected desktop memo and mobile viewer screenshots received a ship disposition with no material visual blockers.
