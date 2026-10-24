# Deal Pipeline end-to-end validation — 24 October 2026

## Scope and environment

Checkout: /Users/mf/dev/nextgentool. Current branch at start: MichaelF/research-diligence-mvp; shared checkout contains concurrent domain changes. Test only Deal Pipeline and necessary authentication integration. Base: origin/main plus uncommitted pipeline module/routes/UI.

Target: isolated owned Next.js production server on http://localhost:3100, with DATABASE_URL explicitly set to the pipeline database. Existing dev server3117 belongs to another task and uses knowledge_library_test; it was not mutated or restarted. Fault injection proxy3101 forwards to3100 for response-loss tests. Database: local PostgreSQL `nextgentool_pipeline`; baseline has zero deals. Reserved Clerk development account already authorized and provisioned by the user. Never target production.

Email protection: owned server started with DISABLE_EMAILS=true; application additionally has no email/notification sending integration in the tested call paths. Clerk reserved +clerk_test email with documented fixed code sends no real verification email. No new Clerk users or credential changes. Only synthetic `E2E Pipeline` deals and explicitly created local fixtures may be mutated. Preserve user-owned memberships and other domain data.

## Cases

All cases use the local environment. Authenticated cases require a real Clerk login and enabled pipeline membership. Persistent writes use only synthetic fixture deals.

| ID | Area | Steps | Expected result | Status |
|---|---|---|---|---|
| P01 | Signed-out access | GET deals API without session; navigate protected board | 401 API; sign-in redirect | pass |
| P02 | Authentication | Use existing reserved development email/code; reach board | Real authenticated four-column board | pass |
| P03 | Empty board | Inspect initial columns and Add action | Four ordered zero-count columns and useful empty state | pass |
| P04 | Minimal creation | Add company without deal name, default owner/stage; save and reload | One Inbox deal named after company; creation history | pass |
| P05 | Detailed creation | Set name, company, owner, next step, due date, summary, initial Screening stage | All fields persist and card displays owner/action/date | pass |
| P06 | Edit | Open existing fixture; change name/action/date/summary; save and reopen | Values and material before/after audit persist | pass |
| P07 | Stage moves | Move forward to Decision, backward to Screening; reload | Correct column/counts and exactly one history event per move | pass |
| P08 | Pass | Choose Passed; verify confirmation required; add rationale and close | Leaves active board; appears closed with rationale | pass |
| P09 | Reopen | Reopen passed deal into Evaluation | Returns active; earlier outcome/rationale retained | pass |
| P10 | Invested | Close fixture as Invested, then reopen | Closed search works; history survives reopening | pass |
| P11 | Search and filters | Search company/name, combine owner/stage; board/list and scope switching | Correct results/counts and URL survives reload; incompatible stage clears on scope switch | pass |
| P12 | Empty/error filters | Query no match; use invalid stage URL; clear filters | Helpful empty/error state and recovery | pass |
| P13 | Unsaved edits | Edit detail then attempt Move; Escape/close and reopen | Movement cannot discard unsaved edits; modal focus recovery | pass |
| P14 | Provisional company | Search company registry during creation | Empty adapter explains provisional capture; creation still works | pass |
| P15 | Concurrency | Two tabs edit same fixture; save first then second | Second shows conflict and latest version; no silent overwrite | pass |
| P16 | Retry/idempotency | Repeat identical authenticated mutation with same request ID; different-payload reuse | Single change/event; reuse conflict | pass |
| P17 | Authorization | Cross-firm, disabled/nonmember, forged-owner access on isolated fixture context | Forbidden/not found, no leaked/mutated other-firm records | pass |
| P18 | Validation | Invalid dates, terminal initial stage, invalid owner, no-op moves, unconfirmed outcome | Rejected invalid inputs; no-op produces no extra event | pass |
| P19 | Save recovery | Cause known/ambiguous persistence failure then retry same payload | Recoverable error; inputs locked until original ambiguous save resolved; no duplicate | pass |
| P20 | Responsive/accessibility | Desktop/mobile board, keyboard labels/focus/Escape; check overflow and errors | Readable usable board/dialog at both sizes | pass |

At this initial test run, canonical selection/profile linking was skipped because the adapter was not connected. The subsequent integration and passing canonical checks are recorded in [canonical integration validation](deal-pipeline-canonical-e2e.md). Provisional fallback was tested here. No production-backup environment is configured or needed for these synthetic workflows.

## Execution notes

- Real existing-account Clerk email-code sign-in succeeded; authenticated board on3100 confirmed with correct firm. App auth not mocked.
- Created five synthetic browser fixtures: Atlas, Beacon, Lost Response, Recovery, and Mobile. The local owner reassignment fixture had no real Clerk account.
- Passed and Invested each require confirmation, remain searchable, and reopen with both rationales/history intact.
- Two browser tabs loaded version11; first save advanced12, second displayed conflict and reloaded the winning value.
- Cleared optional text/date/summary and restored owner; browser-native date controls require real keyboard segment interactions rather than synthetic fill. Native today date showed Due24Oct; yesterday showed Overdue23Oct.
- Integration suite passed13/13 including rollback, simultaneous retries, versions, ordering, no-op history, denied cross-firm access, disabled actor and invalid dates. P16–P18 exercise the real PostgreSQL repository/application service; browser authentication itself uses Clerk. HTTP input/origin validation is separately unit tested.
- Another concurrent task removed/switched the shared Clerk session during testing. Reauthenticated correct account and repeated affected Invested action successfully; no pipeline mutation happened on401.
- Confirmed bug: same-origin reverse-proxy writes rejected because readMutation compared Origin to the internal RequestURL. Fix uses public host/x-forwarded-host consistent with Next.js; regression tests and authenticated proxy browser rerun passed.

## Confirmed fix and regression checks

`presentation/http.ts` now compares a parsed HTTP/HTTPS Origin host with the public forwarded host (first trimmed proxy-chain value), then Host, then the URL host. It continues rejecting mismatched origins and cross-site fetches. This follows the installed Next.js host comparison convention and supports TLS termination instead of comparing to the internal runtime URL.

- HTTP validation regression suite: 19 passed.
- PostgreSQL integration suite: 13 passed, including ordering after edits/moves and unchanged-save history behavior.
- Final combined run: both test files passed, 32/32 tests (19 HTTP + 13 PostgreSQL).
- Targeted Biome and TypeScript checks passed; production build passed.

Commands:

```sh
PIPELINE_INTEGRATION_TEST=true DATABASE_URL=postgres://mf@localhost:5432/nextgentool_pipeline pnpm --filter @repo/web test src/modules/deal-pipeline/infrastructure/pipeline.integration.test.ts src/modules/deal-pipeline/presentation/http.test.ts
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web build
```

The PostgreSQL suite requires an explicit opt-in, validates the exact localhost database, creates randomized fixtures, and deletes only its own fixture rows afterward. Ordinary unit-test runs skip it.

## Recovery and responsive results

All 20 planned local scenarios passed. The Mac was unlocked and the remaining browser controls worked normally.

- Dropped successful create responses after database commit. The dialog displayed an ambiguous-save error, locked editable fields/closing, and offered Retry original save. Before retry: exactly one deal and one creation event. After restoring responses and retrying: still exactly one deal and one creation event; dialog resolved successfully.
- Dropped successful stage-transition responses. The database advanced to Screening/version2 while the dialog retained the unresolved request. Retrying the original request restored the current UI with exactly one move event and no duplicate transition.
- Rejected one PATCH before persistence. The error left fields editable; a corrected save succeeded at version3.
- Chromium can transparently retry a dropped response. The fault proxy therefore keeps drop-create/drop-transition enabled until explicitly reset with none, ensuring the application receives an ambiguous failure.
- At 390×844, board columns stack; document width remains390. The creation dialog has no horizontal overflow (client/scroll width389). Creation, search, list detail, and Decision→Screening movement succeeded. The wide list scrolls inside its350px container without widening the page.
- At 320×740, document width remains320 and dialog client/scroll width319. Escape closes the dialog and restores focus to its triggering deal. Desktop viewport restored afterward.

## Harness and cleanup

Fault injector: `apps/web/tests/pipeline-network-proxy.mjs`, run with an interactive terminal. Send drop-create or drop-transition to discard completed successful upstream responses until none resets the mode; reject-patch rejects one PATCH before persistence. Redirects and upstream rejections are forwarded normally. The harness has no application import or deployed route.

All five browser deal fixtures, their request/history records, and the synthetic reviewer membership were removed from the dedicated local database. The firm has zero remaining deals; the approved real account membership remains enabled. Integration tests separately removed their randomized fixtures.

The owned fault proxy on3101 was stopped. The authenticated clean board remains available on3100, using the isolated production snapshot `/tmp/nextgentool-pipeline-e2e.MnLr2w` to avoid concurrent shared build-output changes. Other tasks' servers were not changed.
