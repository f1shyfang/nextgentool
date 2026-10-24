# Research and Diligence local verification

Initial verification on 24 October 2026, with the signed-in navigation checks completed on 25 October 2026, against the real application at **http://localhost:3127/research/**. The existing development server on port 3117 remains untouched; it had cached connections to a different test database. Port 3000 belongs to another project.

## Local configuration

- PostgreSQL: `localhost:5432/nextgentool_pipeline`; pending local migrations applied.
- Clerk: existing NextGen **development** application. The existing reserved `+clerk_test` development account has administrator membership in the isolated local firm `NextGen Local Research Verification`.
- Firm ID: `859834c3-4164-4ceb-90a3-81bffb05ca63`.
- Company: `TEST Research Labs`; deal: `TEST Seed Evaluation`. All documents and investment claims in these fixtures are synthetic.
- Private disk: `/Users/mf/Library/Application Support/NextGen/research/storage`, outside the public tree. Directory permissions 0700; stored files 0600.
- ClamAV 1.5.4: real daemon on **127.0.0.1:3310**, with official main, daily and bytecode databases. Daily signature version at verification: 28163. Stream limit 30 MiB.
- Per-user LaunchAgents: `au.nextgen.research.clamd` and `au.nextgen.research.freshclam`. Both run at login; freshclam checks for signature updates twelve times daily. Their configuration and logs are under `/Users/mf/Library/Application Support/NextGen/research/`.
- Ignored `apps/web/.env.local` contains the private storage and scanner settings. Existing Clerk keys were preserved and were not copied into this report.

A temporary additional Clerk test account and organization created while investigating the organization-selection flow were removed. The pre-existing active browser account was retained. No authentication policy, organization requirement, or production resource was changed.

## Results

| Check | Result | Evidence |
|---|---|---|
| Signed-in workspace | Pass | Real Clerk development session resolves the provisioned firm and company in the shipped Next page and API |
| Actual PDF upload | Pass | Browser file picker transfers a valid ReportLab PDF; validation and real ClamAV scanning report Ready |
| Actual DOCX upload | Pass | Browser transfers a valid python-docx file; real scanning reports Ready |
| Authorized downloads | Pass | Browser downloads of both file formats match the original SHA-256 hashes exactly |
| Note and memo authoring | Pass | Browser saves a note with page-specific PDF evidence and a memo with original note and PDF references |
| Document replacement | Pass | Authenticated shipped API accepts a second scanned PDF version; original downloaded bytes remain unchanged |
| Concurrent revisions | Pass | A stale browser draft receives the comparison UI, retains its text, and saves successfully after explicit rebase; stale HTTP save returns 409 |
| Memo provenance | Pass | Browser opens the originally cited note revision after later note edits; original PDF reference remains pinned |
| Archive and restore | Pass | Authenticated archive/restore succeeds; original cited bytes remain available while archived |
| Invalid inputs | Pass | Malformed and password-protected PDFs are rejected and their download requests return 403 |
| Viewer access | Pass | Fresh real browser page displays Viewer and no upload/create controls; actual save/upload requests return 403 while evidence downloads succeed |
| Firm isolation | Pass | Temporary membership in a second isolated local firm reveals no first-firm records; direct download/edit/archive requests using the first firm's IDs return 404 |
| Real scanner outage | Pass | Stopping this task's real clamd service leaves a replacement failed and inaccessible, with the prior ready version still current |
| Scanner recovery | Pass | Restarting the service and retrying the existing version through the shipped API produces Ready without replacing old bytes |
| Persistence and audit | Pass | Reloaded browser and PostgreSQL inspection retain document versions, note/memo revisions, pinned evidence and download audit events |
| Signed-out access | Pass | An anonymous request to `/api/research/` returns 403 |
| Unsaved-navigation cancellation | Pass in the real signed-in app | Native Chrome and Safari controls exercise actual confirmations against the shipped Next application. All eight live scenarios below pass; API and direct PostgreSQL comparisons prove that only one explicit note save persisted. |

The upload/authoring, conflict, pinned-source and viewer checks used the real browser. Additional HTTP checks used a fresh, real Clerk session JWT for the same signed-in test account; requests went through the shipped Next routes, authorization, PostgreSQL repositories, private filesystem and real ClamAV. No production adapter or authentication bypass was injected.

### Navigation-cancel follow-up

The Research browser integration suite now contains **11 passing tests**, including six new navigation regressions. These use the actual `ResearchWorkspace` component and native Chromium `confirm` / `beforeunload` dialogs, with the standalone harness's TEST actor, in-memory repository and fake scanner. They do not claim another signed-in Clerk/PostgreSQL run.

- Cancel preserves an edited note across tab changes, record selection, New note, company/deal changes and Archive. The stored record remains unchanged, and the draft can subsequently save against its original revision token.
- Discard clears unsaved note edits; reopening restores the saved text without another prompt or an extra revision.
- New memo sections and upload form metadata/file selection survive Cancel. Explicit Discard clears them without creating records or reserving an upload.
- Document metadata edits survive Cancel and revert to saved values after Discard.
- Cancelling a full-page reload leaves the draft editable and saveable.

No application navigation defect was reproduced. Test failures were corrected by scoping the duplicate Deal context selector and using the Description textbox's accessible name after text entry. The Research Playwright configuration now writes to `tmp/research-browser-results/`, preventing concurrently running domain suites from deleting its traces and screenshots.

Validation: `pnpm --filter @repo/web test:research:e2e` — **11 passed**; Biome check of the changed test/configuration files — **passed**. The earlier native-dialog interruption was avoided through deterministic test-suite dialog handling; `window.confirm` was not stubbed or replaced.

### Signed-in repeat: completed 25 October 2026

The requested repeat in the shipped application started with a real Chrome sign-in using the existing development test account. The normal Clerk email-code flow reached the Research workspace with Admin access. It used Clerk's reserved `+clerk_test` address, for which code verification does not send real email ([Clerk test email documentation](https://clerk.com/docs/guides/development/testing/test-emails-and-phones)). Research itself has no email sender; `DISABLE_EMAILS` is not configured.

An environment defect was reproduced before testing: port 3127's long-running Next server served a required JavaScript bundle with HTTP 500 after another build replaced the shared `.next` output. Its Sign in button consequently did nothing. The server was rebuilt successfully and restarted on the same port using a dedicated `.next-research-verification` directory. `NEXT_DIST_DIR` now optionally selects that directory; the default remains `.next`. Other running app servers were left alone.

The authenticated shipped API still resolves the original local firm, unchanged records and document versions. Real ClamAV accepts the valid PDF and DOCX and rejects the malformed/encrypted PDFs. An empty `TEST Navigation Second Company` reference was added to the isolated local firm for the company-switch check. No additional Clerk user or organization was created.

**All eight planned live scenarios passed, with 17 recorded native-browser checks.** The note, scope, history, reload and memo checks ran in Chrome. The real selected PDF survived both tab cancellation and cancellation of the form's own discard prompt in Chrome. Document metadata cancellation/discard, explicit selected-file upload discard and final authenticated reload ran in a separate Safari session after Chrome became active with other browsing. Both browsers completed the normal sign-in flow as the same test user. No native confirmation was mocked or bypassed.

| ID | Real-app steps | Verified result | Status |
|---|---|---|---|
| NAV-L1 | Edit note title/body; cancel tab, record, New note, company, deal and Archive navigation | Same editor, company/deal, title, text and pinned PDF evidence; pre-save API snapshot identical to baseline; subsequent explicit Save succeeds | Pass |
| NAV-L2 | Inspect original revision with dirty note, then return to editor | Unsaved title/body preserved; no implicit revision created | Pass |
| NAV-L3 | Edit saved note again; accept navigation, then reopen it | Discarded text absent, original saved draft restored, Save disabled; clean navigation has no prompt | Pass |
| NAV-L4 | Create a memo with title, thesis and risks; cancel navigation, then explicitly discard | All fields survive Cancel; discarded draft creates no record | Pass |
| NAV-L5 | Select real PDF and edit upload metadata; cancel tab and form Cancel, then explicitly discard | Filename, title, description, category and deal remain after Cancel; reopening after Discard has empty fields, no file, and disabled Upload; no reserved document/version | Pass |
| NAV-L6 | Edit existing document title/description; cancel navigation, then discard/reopen | Edits retained by Cancel; saved title/description restored after Discard; document aggregate unchanged | Pass |
| NAV-L7 | Reload dirty editor; choose Cancel in Chrome's real reload alert | Same unsaved title/body and pinned evidence; explicit subsequent Save succeeds | Pass |
| NAV-L8 | Reload signed-in page; open saved note; compare shipped API and direct PostgreSQL state | Same Admin account and local firm; exactly one explicit new note revision, all four prior revisions retained; memo/documents unchanged; discarded content absent | Pass |

The explicit save retained the note title `TEST Retention assessment` and stored the body `LIVE NAVIGATION CHECK: this unsaved analysis must survive Cancel.` as revision 5. Its existing version-1 PDF citation remains unchanged. No metadata edits, new memo, upload reservation or archive change persisted.

Evidence in `tmp/research-live-e2e/`:

- `navigation-native-confirm.png`, `navigation-reload-prompt.png`: actual native confirmations.
- `navigation-note-retained.png`, `navigation-memo-retained.png`, `navigation-metadata-retained.png`: preserved drafts. Selected-file retention was verified directly in Chrome’s native accessibility state (`File: pitch-deck-v1.pdf`) after each Cancel.
- `navigation-final-signed-in.png`, `navigation-final-saved-note.png`: reloaded signed-in workspace and saved note.
- `navigation-before.json`, `navigation-after-cancels.json`: equal note/memo/document state before any explicit save.
- `navigation-after-save.json`, `navigation-final-db.json`, `navigation-final-results.json`: shipped API/direct PostgreSQL persistence assertions.
- `navigation-native-results.json`: 17 passing native-browser checks.
- `navigation-preflight.json`: all 12 required local JavaScript assets return 200; original PDF/DOCX downloads retain their exact checksums.

The live checks use real Clerk sessions, shipped routes, local PostgreSQL and private storage. The separate eleven-test integration suite remains additional regression coverage. No application navigation defect was found; the shared-build server failure described above was the environment issue fixed during the repeat. The isolated production build and formatting checks pass.

## Isolated PR validation

The PR is prepared from current `main` on `MichaelF/research-diligence-mvp-completion`. Research runtime files were compared with the production build used for the signed-in checks; later unfinished storage/scanner deployment edits were excluded.

- Frozen-lockfile dependency installation: pass.
- Full workspace lint and typecheck: pass.
- Application suite with an isolated local PostgreSQL database: 113 tests pass; 18 unrelated opt-in Deal Pipeline integration cases are skipped.
- Environment configuration suite: 10 tests pass.
- Focused Research suite, including PostgreSQL repository integration: 31 tests pass.
- Research browser integration: 11 tests pass.
- Isolated production build: pass.
- Dedicated CI Research job: PostgreSQL repository/application tests and browser integration suite configured to run on the PR.

Runtime keys, local environment files, fixture databases, raw screenshots and generated test/build output are excluded from the commit. Screenshot files referenced above remain in the original local verification workspace; their external upload was unavailable. The report and automated tests are included in the PR.

## Download integrity

| File | SHA-256 |
|---|---|
| `pitch-deck-v1.pdf` | `6eacfd91d9bb1b87093ef527c8329e541b5b0bf66edee04b849d18ff6310e270` |
| `diligence-notes.docx` | `dccd967f8d2af8239b7ec5ea630c92a0e7a1aa9f39b1269df6735ae4d6c74393` |

## Retained evidence and data

Screenshots and generated upload fixtures are in `tmp/research-live-e2e/`:

- `research-live-verified.png`: signed-in document library and three ready PDF versions.
- `research-conflict.png`: preserved stale draft and latest saved comparison.
- `research-pinned-source.png`: memo's original note revision and PDF reference.
- `research-viewer.png`: viewer workspace and absent authoring controls.
- `live-http-results.json`, `live-access-results.json`, and `final-state.json`: non-secret verification results and synthetic fixture state.

The isolated local firm retains two active documents, one research note and one memo. Deliberately rejected validation documents are archived and recoverable. Original PDF and DOCX evidence, all document versions and revision history remain retained. The browser test account is restored to administrator access. The original note now has five revisions, including the single explicit save from the navigation repeat. The empty second company reference remains available for future navigation tests. The second isolation firm is empty.

The production build passed for the live verification. The focused PR is validated separately from current main; adjacent unfinished domains are excluded from its source changes.

## Reopen and operate

Open **http://localhost:3127/research/** while the local server is running. Use `localhost` for Clerk sessions. To restart this instance from the repository root:

```sh
NEXT_DIST_DIR=.next-research-verification pnpm --filter @repo/web build
NEXT_DIST_DIR=.next-research-verification pnpm --filter @repo/web exec next start --hostname localhost --port 3127
```

The app server is running in this session; unlike the antivirus daemons, it has not been registered as a login service.

Check the antivirus services with:

```sh
launchctl print gui/$(id -u)/au.nextgen.research.clamd
launchctl print gui/$(id -u)/au.nextgen.research.freshclam
```

Personal accounts do not automatically inherit the test firm's membership. Provision another authorized Clerk user explicitly with `research:admin membership`; do not grant access to all application users.
