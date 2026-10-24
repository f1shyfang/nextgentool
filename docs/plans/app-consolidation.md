# NextGen app consolidation

Status: migration complete; sign-in and logout verified end to end against the development Clerk instance. User approved the consolidation plan in chat.

## Commit boundary

This commit delivers the public website, account routes, migration tooling, lint cleanup and scoped Space Grotesk exception. Concurrent pipeline, research, knowledge and company-intelligence feature implementations remain uncommitted in the shared checkout. Their dashboard links and dependency additions remain with that work. Earlier full-worktree checks below include those features; this commit is also verified separately in an isolated checkout.

## Contract

`apps/web` becomes the only NextGen Next.js application. `/` serves the existing public website; `/dashboard/` remains the authenticated account landing page. Preserve all existing pipeline, research, knowledge, API, database and environment work. Existing business authorization stays in its modules. No production data changes, deployment, commits, pushes or PR creation are included.

## Stages

- [x] Inventory existing apps and create a private recovery snapshot outside the repository.
- [x] Migrate public content, assets, routes and account surfaces; unify Clerk and dependencies.
- [x] Verify production rendering, assets, session protection and desktop/mobile layouts.
- [x] Retire standalone replica and update documentation and tooling paths.

## Implementation decisions

- Use a `(site)` route group for the migrated website/account routes; preserve existing feature routes.
- Reuse existing JSX with `allowJs`; no unrelated TypeScript rewrite.
- Include HTML content explicitly in Next.js server output tracing.
- Preserve ignored local Clerk configuration securely without overwriting existing app configuration.
- Other feature work is present in this shared checkout; do not reset, commit or merge it.

## Verification

- Production build and workspace typecheck passed after migration, including all existing feature routes.
- Production smoke verification passed: 24 public routes, 119 referenced local assets and signed-out dashboard protection.
- All 22 marketing HTML files appear in Next.js production file traces.
- Compared the migrated desktop homepage with the original; checked the mobile homepage, navigation, sign-in and sign-up forms in the browser.
- Browser confirmed signed-out `/dashboard/` returns to sign-in with its original destination preserved.
- Root `pnpm dev` resolves to the consolidated app. A concurrent development server already owns the app lock on port 3117, so the extra attempted server was not kept running.
- Independent read-only migration review found no confirmed defects.
- Latest workspace tests: 112 passed, 18 skipped (database-dependent coverage requires dedicated test infrastructure).
- Scoped migration lint passes with no warnings. Captured content and public assets are excluded from source lint/format to preserve the reference.
- Workspace `pnpm lint` now passes after formatting migration metadata, global CSS and a concurrently added client API file. The subsequent warning cleanup also resolved all seven warnings and four informational notices. See ignored `tmp/auth-verification/lint.log`.
- A complete original app directory and initial working-tree snapshot are preserved privately outside the repository. Its local path is recorded in ignored `tmp/consolidation-backup-path.txt`.

## Remaining validation limits

Sign-in and logout were verified with an existing reserved development test account using Clerk email-code authentication. Account creation, password reset, Google OAuth and profile changes were not part of this follow-up. Database-dependent tests require a dedicated test database; no production data or authentication settings were changed.

## Authentication follow-up — 24 October 2026

All checks below passed in the actual browser against `apps/web` on the existing local development server:

1. Open `/sign-in/`, enter the existing development test account and choose email-code authentication.
2. Submit an incorrect code; the form shows “Incorrect code” and stays signed out.
3. Submit Clerk's reserved test code; sign-in completes at `/dashboard/` with the authenticated navigation and account menu.
4. Reload the dashboard; the server still recognizes the authenticated session.
5. Open the user menu and choose **Sign out**; the public homepage appears with **Log in** and **Sign up** controls.
6. Reopen `/dashboard/`; the app redirects to `/sign-in/` with the dashboard return destination preserved. The sign-in form is visible and no dashboard welcome content is present.
7. A read-only Clerk Backend API check confirms the test session status is `removed` after logout.

Reused an existing `+clerk_test` account. No users were created or deleted, no passwords were changed and no real verification emails were sent. The browser was left signed out. Clerk's official [test email documentation](https://clerk.com/docs/guides/development/testing/test-emails-and-phones) describes the reserved test-code flow.

Local evidence is stored in ignored `tmp/auth-verification/`: `signed-in-dashboard.jpg`, `signed-out-home.jpg`, `protected-after-logout.jpg` and the workspace lint log. Workspace typecheck, tests and the production build passed. No authentication code change was needed.

## Warning cleanup — 24 October 2026

- Replaced both authored logo `<img>` elements with `next/image`, retaining the SVG URL, eager loading and original sizing.
- Removed the unused reference-inspection callback parameter warning.
- Replaced header `!important` declarations with a selector scoped to the site root, which outranks the captured class selectors.
- Removed captured inline marquee width constraints in the renderer so the existing local CSS can size duplicated strips without `!important`.
- Converted four reference-import string expressions to template literals, clearing the informational notices too.
- Formatted newly added migration metadata. Corrected a concurrently added test's unsupported Testing Library `exact` option; string accessible-name matching remains exact by default. Its six focused tests pass.
- Workspace lint reports no errors, warnings or informational notices. No lint rules were disabled or suppressed for these changes.
- Homepage header position, stacking order, logo size and all three marquee widths match the measurements taken before cleanup. Checked mobile Team navigation and the sign-in logo. Route smoke checks passed for all 24 public routes, 129 local assets and signed-out dashboard protection.

## Isolated commit verification

The consolidation-only snapshot was checked separately from the concurrent feature work: frozen-lockfile installation, zero-diagnostic workspace lint, typecheck, all 14 existing tests and production build passed. Its production server passed the 24-route / 119-asset verifier and signed-out dashboard protection with no local credentials copied. Earlier authenticated browser checks used the development Clerk configuration in the main checkout.

The pre-commit hook also uncovered a nested Biome configuration that was implicitly treated as a second project root. Marking `apps/web/biome.json` with `root: false` lets root-level staged-file checks use the same settings as package lint.
