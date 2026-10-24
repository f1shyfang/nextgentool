# Deal Pipeline MVP — Build Plan

Started on branch: MichaelF/deal-pipeline-mvp
Status: Implementation, automated checks, and authenticated local end-to-end validation complete; investment-team pilot pending

Other active domain tasks share this checkout and have changed the current branch and common app files during implementation. Pipeline work is preserved in the shared checkout; no commit, push, or deployment was performed by this task.

## Stages
- [x] Stage 1: Domain/application contracts, transactional PostgreSQL repository, migrations
- [x] Stage 2: Clerk session and firm membership access; HTTP delivery
- [x] Stage 3: Kanban, list, create/edit/detail, filters, outcomes and history
- [x] Stage 4: Review, type/build checks, setup and rollout documentation

## Decisions
- User confirmed apps/web as the product surface.
- Reuse the consolidated Clerk integration in apps/web; no Clerk Organization configuration changes. Explicit PostgreSQL firm memberships protect this internal application.
- Company Intelligence is connected through its application service with an explicit Pipeline-to-Research firm mapping and existing membership checks. Provisional capture remains available. See the canonical integration test report.
- Preserve all pre-existing changes, especially the consolidated website/authentication work and domain drafts.
- No production migrations, deployment, pushes, or PR creation are included in this implementation request.
- Keep the existing single editable summary rather than introducing notes/discussions.

## Validation
Type checking, linting, production build, and independent code review. The user subsequently requested end-to-end testing and fixes, including the authenticated board. Database migrations and synthetic fixture writes are restricted to the dedicated local development database.

## Completed validation

- `pnpm --filter @repo/web typecheck` passed.
- `pnpm --filter @repo/web build` passed, including pipeline routes.
- Biome check of pipeline module, routes, UI, and provisioning script passed with no findings.
- Migration applied to dedicated local `nextgentool_pipeline`; one approved existing development account provisioned locally.
- Independent backend and UI reviews completed. Fixed ambiguous save recovery to keep the original payload/request ID until retry resolves; reviewed the fix.
- All 20 local end-to-end scenarios passed, including real Clerk authentication, create/edit/move, outcomes/reopening, filters, conflicts, response-loss retries, and mobile interaction at390px and320px.
- Fixed public-host Origin validation behind a reverse proxy; authenticated proxy writes and regression checks passed.
- Added 19 HTTP regression tests and 13 PostgreSQL integration tests; final combined run passed32/32.
- Removed all synthetic browser/integration fixtures; preserved the approved real membership. Canonical company lookup was subsequently connected and tested; see `docs/testing/deal-pipeline-canonical-e2e.md`.
- Detailed evidence and limitations: `docs/testing/deal-pipeline-e2e.md`. The investment-team pilot remains pending.

## UX and scope decisions

Operate surface: four stage columns lead the workspace, with list and outcome views alongside; fields and history open in a native dialog. Pipeline-specific CSS inherits NextGen navy, blue, Urbanist and Space Grotesk without changing the adjacent domain surfaces. Mechanical design detector advisories about inherited fonts and palette extensions were reviewed against the incumbent brand.

Setup instructions: `docs/plans/deal-pipeline-setup.md`. Fixed stages and a Move selector are the MVP; manual card ordering, drag-and-drop, and reminders remain deferred as planned.
