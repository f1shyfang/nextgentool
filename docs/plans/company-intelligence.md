# Company Intelligence implementation plan

**Date:** 24 October 2026\
**Status:** Implementation started; stages 1–2 are partial. See [build record](company-intelligence-build.md) and [plan review](company-intelligence-review.md).\
**PRD:** [Company Intelligence](../prds/company-intelligence.md)\
**Technical specification:** [Company Intelligence](../specs/company-intelligence.md)\
**Spec review:** [Findings R1–R6](../specs/company-intelligence-review.md)

## 1. Execution contract

Build the domain as vertical slices in the existing modular application. Each stage produces reviewable behavior, migrations where needed, and verification evidence. Do not start live ingestion, expose private research, or deploy monitoring merely because an earlier stage passed.

Use the spec for architecture and the review for proposed behavioral corrections. Before implementing an affected stage, record acceptance or an alternative in a decision record and update the spec accordingly. Do not silently treat proposals as approved requirements. Unknown provider details block the live adapter, not manual-domain work.

Implementation is separate work from this plan. All checkboxes start incomplete. Preserve unrelated working-tree edits, especially the website and account work consolidated into `apps/web`. If a new branch is created, use the required `MichaelF/` prefix.

## 2. Decision gates

| ID | Decision and required artifact | Blocks |
|---|---|---|
| D1 | Confirm `apps/web` as investment app, or explicitly design a different integration. Record chosen shell and navigation/auth ownership | Stage 1 UI/auth integration; architecture-specific follow-on work |
| D2 | Select verified identity adapter, invitation/initial-admin process, membership revocation behavior, role ownership | Private-data exposure and stage 1 acceptance |
| D3 | Approve evidence policy, R1 identity/derived-data visibility, R5 disputed/override behavior, initial field vocabulary | Stages 2–3 acceptance |
| D4 | Select provider and validate a written capability/licensing/retention/rate-limit/cost matrix | Stage 6 live adapter; no fabricated coverage |
| D5 | Select worker/scheduler host, secret deployment, database backup/restore ownership | Production automation in stages 5–6 |
| D6 | Confirm in-app-only monitoring, R2 ordering, R3 mixed schedules/history, default timezone/time/frequency | Stage 7 behavior contract |
| D7 | Agree pilot sample, support owners, measurements, coverage and launch criteria | Stage 8 pilot launch |

Resolve D1–D3 first with a concrete proposal based on the current spec. Contracts and isolated test fixtures may be prepared while decisions are pending; dependent production integration must wait. No external provider credential is needed for fixture-based stages.

## 3. Dependency graph and milestones

```text
0 Decisions and acceptance fixtures
  -> 1 Platform, database, access, test harness
  -> 2 Companies and sourced profiles
  -> 3 Manual signals, financing, review
  -> 4 Company merges
  -> 5 Durable work and transactional publication
  -> 6 Approved provider and operational refresh
  -> 7 Watchlists, feed, digest, extended merges
  -> 8 Pilot and release verification
```

Stage 7 can be developed against stage 5 fixture publication while provider selection is pending, but full pilot acceptance depends on stage 6. Do not run these stages concurrently against shared schema without an explicit coordination plan.

**Milestone A:** Manual research ready after stages 1–4.\
**Milestone B:** Automated supported intelligence ready after stages 5–6.\
**Milestone C:** Monitored pilot ready after stages 7–8 preflight; outcome measurement continues for four weeks.

## 4. Planned code locations

These are proposed paths, not existing modules. If D1 changes, revise this map before implementation.

| Location | Ownership |
|---|---|
| `apps/web/src/modules/company-intelligence/{domain,application,infrastructure,presentation}` | Company identity, evidence, resolver, signals, search, watchlists, monitoring; organize by responsibility inside the existing layering |
| `apps/web/src/modules/access/{domain,application,infrastructure,presentation}` | Local identity mapping, firm membership, actor context and authorization; reuse an established shared platform if introduced meanwhile |
| `apps/web/src/lib/server/{database,schema,audit,jobs}` | Shared database/schema registration and platform adapters; domain-specific policy remains in its module |
| `apps/web/src/lib/composition-root.ts` | Explicit dependency composition for HTTP and worker entry points |
| `apps/web/src/app/api/company-intelligence/**/route.ts` | Thin authenticated HTTP adapters |
| `apps/web/src/app/(investment)/companies/**` | Company list, creation, detail, evidence, timeline, annotations |
| `apps/web/src/app/(investment)/{watchlists,monitoring,admin}/**` | Watchlists, personal feed/digests, admin review/provider health |
| `apps/web/src/worker/**` | Bounded job runner, outbox consumers, scheduler entry point; no framework dependencies in domain logic |
| `apps/web/drizzle`, `apps/web/drizzle.config.ts` | Additive schema migrations and complete schema discovery |
| `apps/web/tests/{integration,e2e,fixtures,performance}` | Database, browser, provider fixtures, representative benchmarks |
| `packages/env/src/**`, `.github/workflows/ci.yml` | Validated configuration and expanded checks |

Do not extract an extra domain package, introduce a second ORM, or add a document/RAG store. Read applicable repository instructions and installed framework documentation before writing framework code.

## 5. Stage 0 — Finalize decisions and executable examples

**Depends on:** No implementation dependency.\
**Output:** Decision records, reviewed acceptance fixtures, and finalized contracts.

- [ ] Record D1–D3 and assign owners for D4–D7; reconcile R1–R6 into the spec as their decisions are accepted.
- [ ] Define initial field schemas, sector/market vocabulary, source precedence, freshness thresholds, and review transition rules.
- [ ] Write worked examples for conflicting names, shared domains, parent/subsidiary identity, superseded facts, disputed overrides, restricted financing terms, and imprecise dates.
- [ ] Define DTO examples and machine error codes for company create/profile, assertions, manual events, merge preview, and source rights.
- [ ] Define the identity/authorization integration contract without assuming email equality proves membership.
- [ ] Record acceptance decisions for role actions, company archive behavior, notification history, and source retention. Proposed archive default: retained readable research, no new scheduled monitoring/refresh; restore is explicit and audited.

**Exit:** Examples distinguish known behavior from remaining decisions. No required policy is hidden inside an adapter implementation.

## 6. Stage 1 — Establish secure platform and database verification

**Depends on:** D1/D2; stage 0 access contract.\
**Demo:** An invited member opens the protected investment shell; a signed-in non-member cannot.

- [ ] Move database connection ownership out of users infrastructure, register all schemas, and preserve the existing two migration files and journal.
- [ ] Add firm/membership and external-subject mapping, with uniqueness constraints and a controlled initial-admin procedure.
- [ ] Implement ActorContext and role/access policy; integrate the chosen verified identity adapter. Never grant firm access via public `/api/users` creation.
- [ ] Add audit persistence, request IDs, safe error mapping, same-origin/CSRF checks, and version/idempotency primitives.
- [ ] Protect the investment shell and all new handlers. Keep the public marketing surface independent.
- [ ] Add disposable PostgreSQL integration setup, migration-from-empty and migration-from-current checks, and a CI database service.
- [ ] Add browser test infrastructure with controlled authenticated fixtures; never use an authentication bypass in production paths.
- [ ] Provide operational scripts for migration and controlled membership administration; record commands in the README.

**Verification:** Missing/forged identity, inactive member, reader/researcher/admin actions, cross-firm references, migration compatibility, and rollback on rejected writes. Existing user tests must still pass.

**Exit:** Private data cannot be accessed without verified active membership; CI actually executes database tests rather than skipping them.

## 7. Stage 2 — Deliver company creation and sourced profiles

**Depends on:** Stages 0–1, D3.\
**Demo:** A researcher creates a company, adds conflicting sourced facts, pins one, and a reader inspects the evidence.

- [ ] Add companies, aliases, identifiers, source grants/documents, assertions/reviews, overrides, profile projection, and supporting constraints/indexes.
- [ ] Implement domain/URL normalization and candidate matching; recheck candidates inside a serialized creation boundary. Preserve distinct companies sharing a domain.
- [ ] Implement manual evidence entry and deterministic field resolution including supersession, dispute, override suspension/release, and policy versioning.
- [ ] Implement firm-authored registry baseline and evidence-aware field access. Track source-derived aliases/labels separately.
- [ ] Implement company create/search/detail/assertion/review/override HTTP adapters and list/create/profile/evidence UI.
- [ ] Add short fact-linked annotations with versioned edits; substantive notes/memos remain outside this domain.
- [ ] Apply filters, snippets, counts, and pagination only after evidence access checks; keep search projections rebuildable.

**Verification:** Concurrent duplicate candidates; authoritative-ID uniqueness; cross-firm child constraints; missing versus zero; deterministic resolution; inaccessible preferred evidence; superseded verified fact; disputed pinned fact; stale-version rejection. Reload the UI to prove persistence.

**Exit:** Every shown sourced field has permitted evidence and meaningful dates. A restricted alias/value cannot leak through search or matching previews.

## 8. Stage 3 — Add manual signals, financing, and review workflows

**Depends on:** Stage 2.\
**Demo:** A sourced financing event appears in history, is corrected, and retains its previous revision.

- [ ] Add signals, immutable revisions, evidence references, ambiguity/review items, and a typed financing projection.
- [ ] Add `CreateManualSignal` and `POST /api/company-intelligence/companies/:id/signals` for researchers; require source evidence and validated category/subject/date fields.
- [ ] Implement category-specific event keys/grouping, source-to-payload field attribution, material-change classification, retraction, and reassociation review.
- [ ] Implement financing amount/currency/round validation and partial-date interval filtering. All round filters must match the same accessible event.
- [ ] Add timeline, financing filters, signal details/reports/corrections, and review queue UI/handlers.
- [ ] Add typed external-evidence references at the port boundary; do not add uploads or fetch another domain's content without its authorization contract.

**Verification:** Same-day distinct rounds remain distinct; repeated coverage adds evidence without a material revision; original currency/precision preserved; restricted terms absent from payload/filter/count; disputed events visibly require review; correction invalidates all related projections.

**Exit:** Financing and external-event research work manually without any provider or worker. Review decisions and material revisions are auditable.

## 9. Stage 4 — Implement transactional company merges

**Depends on:** Stage 3.\
**Demo:** An admin previews and merges two companies; both old links resolve to the survivor and all evidence remains accessible under its rules.

- [ ] Add company redirects, merge manifest, preview digest/version checks, and explicit conflict decisions.
- [ ] Define stable lock ordering and make all company-child mutations resolve and lock canonical identity consistently.
- [ ] Implement atomic reassignment for current tables: facts, sources associations, overrides, signals/revisions, projections, annotations, identifiers, review items.
- [ ] Preserve incompatible assertions; collapse only equivalent event identities with revision/evidence mappings and a recoverable manifest.
- [ ] Add admin preview/confirm UI and API, idempotent retries, stale preview rejection, and redirect-cycle checks.
- [ ] Expose a canonical resolution port for adjacent domains. Do not edit their deal/research stores without an agreed integration contract.

**Verification:** Concurrent writes/merges, conflict rollback, merge chains, inaccessible source content, stale preview, retried commit, and all child counts/IDs before versus after. Test recovery using the manifest in a disposable database.

**Exit:** No lost evidence or writes to retired identities. Publish a merge checklist requiring every future child table to join reconciliation tests.

## 10. Stage 5 — Build durable jobs, outbox, and ordered publication

**Depends on:** Stage 4; D5 before production activation.\
**Demo:** A fixture job crashes and retries without duplicating facts or events; a stale worker cannot commit.

- [ ] Add durable jobs, lease/fencing tokens, checkpoints, unique ingestion outcomes, refresh runs/capabilities, outbox, and versioned event envelopes.
- [ ] Define transaction-scoped firm publication clock per R2. Published event envelopes carry firm, canonical company, signal/revision, policy version, sequence, and correlation IDs; no restricted content.
- [ ] Make stage 3 signal publication and stage 4 merges emit outbox events transactionally.
- [ ] Implement claim/renew/commit fencing, bounded attempts, transient retry with jitter, failure inspection, and audited replay.
- [ ] Implement bounded worker/scheduler entry points with validated environment settings, graceful shutdown, concurrency limits, and kill switches.
- [ ] Provide a deterministic fixture provider and admin refresh/job status UI/API; do not make live network calls yet.

**Verification:** Crash before/after page commit; outbox replay; expired lease followed by stale commit; cursor recovery; worker termination; serialized publication ordering; duplicate refresh requests; failed job replay. Test time via injected clocks.

**Exit:** Worker behavior is proven against PostgreSQL, migrations and a local runbook exist, and repeated fixture ingestion has no extra facts/signals.

## 11. Stage 6 — Integrate one approved provider

**Depends on:** Stage 5; D4 and D5 for live operation.\
**Demo:** An approved company refresh updates supported facts/events, shows capability freshness, and recovers from an outage.

- [ ] Complete provider capability/rights matrix, validate representative real records, and store sanitized contract fixtures.
- [ ] Implement the provider port adapter with bounded requests/pagination, identity mapping, rates/budgets, safe errors, and per-capability completion.
- [ ] Route ambiguous identity/event association into review; never auto-match on name alone.
- [ ] Enforce storage/derivation rights and retention rules; add revocation, purge, cache invalidation, and projection rebuild procedures.
- [ ] Add scheduling, coalesced manual refresh, provider health/budget controls, credentials rotation procedure, and unsupported/partial/failed UI states.
- [ ] Reconcile source precedence against the actual provider evidence model before enabling automatic resolution.

**Verification:** Fixture-based failures, unchanged records, updated versions, duplicate articles, partial capability success, pagination restart, credentials pause, and retention/revocation. Conduct a separately authorized limited live smoke test within the approved budget; ordinary CI remains offline.

**Exit:** Only validated capabilities are advertised. A provider outage preserves valid research and shows failure; its freshness check cannot mark unrelated capabilities current.

## 12. Stage 7 — Deliver watchlists and in-app monitoring

**Depends on:** Stage 5 and D6; stage 6 for end-to-end live pilot.\
**Demo:** A user watches companies, receives one eligible signal despite overlapping rules, and opens a scheduled digest.

- [ ] Add private/shared watchlists, subscriptions with effective intervals, publication watermarks, feed items, digest allocation, and feedback.
- [ ] Implement event-time rule eligibility from recorded intervals; recheck current access and active delivery rules before publication.
- [ ] Implement immediate precedence and earliest due UTC schedule selection for daily/weekly overlaps, persisted schedule versions, timezone/DST rules, pending-item recomputation, and delivery uniqueness.
- [ ] Distinguish delivered history from pending items. Apply the accepted R3 unsubscribe behavior and entitlement-aware historical reads.
- [ ] Handle corrections/retractions/reassociations idempotently; do not backfill older events on new membership, unmute, or category changes.
- [ ] Extend merge transactions and manifests for lists, subscriptions, feed/digests and publication intervals. Reconcile already-delivered equivalent events without resending.
- [ ] Build watchlist/preferences/feed/digest UI and endpoints, useful/not-useful feedback, and operational lag metrics.

**Verification:** Concurrent activation/publication with reversed transaction timing; delayed consumers; daily/weekly overlaps across timezones; DST gaps/repeats; mute/unsubscribe before delivery; delivered history after unsubscribe; membership/source revocation; merge after notification; duplicate outbox replay; correction to previously delivered event.

**Exit:** One visible delivery per recipient/signal/material revision, no restricted pending/historical content, and no historical backfill. Merges remain safe with every monitoring table enabled.

## 13. Stage 8 — Validate and run the pilot

**Depends on:** Stages 1–7 and D7.\
**Output:** Release evidence, operational readiness, and four-week outcome report.

- [ ] Seed representative synthetic volumes matching the proposed envelope; benchmark authorized search, profiles, timeline, digest building, merges, and queue recovery.
- [ ] Validate suggested p95 targets under a recorded workload/concurrency and dataset. Tune or revise targets explicitly; do not claim performance from schema inspection.
- [ ] Run complete browser journeys with reader/researcher/admin roles, source limitations, failures, keyboard navigation, empty states, and reload persistence.
- [ ] Exercise backup restore, provider pause, worker rollback, failed-job replay, membership revocation, and rights expiry against a staging environment.
- [ ] Configure dashboards, alert thresholds, support owners, budgets and refresh deadlines; document deployment/migration/rollback commands.
- [ ] Launch a bounded invited cohort only after access, correctness, coverage and recovery checks pass. Capture a research-time baseline before launch.
- [ ] After four weeks, report research time, alert usefulness plus response rate, duplicate correction rate, due-capability success, observed lag, cost and unsupported coverage. Choose expand/tune/stop based on evidence.

**Exit:** Launch verification and outcome evaluation are separate records. Collection of pilot metrics is not a substitute for pre-launch access/reliability acceptance.

## 14. Common stage gates and handover

For each implementation stage:

1. Review the exact diff for authorization, concurrency, data preservation and scope boundaries.
2. Apply migrations to an empty disposable database and a fixture representing the previous stage; preserve migration history.
3. Run existing root checks (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) and the stage-specific integration/browser suites.
4. Introduce documented commands such as `test:integration` and `test:e2e` during stage 1 before referring to them as available. Database/browser tests outside the current Vitest include path require explicit configuration and CI steps.
5. Record fixture/sample inputs, expected results, actual results, and blockers. Do not substitute skipped tests for a pass.
6. Demonstrate the stage journey with synthetic data; keep unfinished automation behind disabled flags.

No external messages, issue creation, implementation, commits, deployment, or provider purchases are authorized by this document alone. Preserve the user's actual session authorization when execution is requested; do not add unnecessary approval gates for ordinary reversible coding work.

## 15. Risks and boundaries

- **Provider delay:** Deliver milestone A independently; do not label fixture/manual events live coverage.
- **App-shell churn:** Resolve D1 before domain UI work; reuse an agreed identity adapter rather than transplanting the replica wholesale.
- **Permission query cost:** Measure the correct evidence-aware query first; optimize by access cohort only after proving equivalent visibility and invalidation.
- **Merge complexity:** Add reconciliation with each new child schema and keep features off until its tests pass.
- **Publication bottleneck:** Benchmark the firm clock; replace only with a design preserving explicit commit ordering and eligibility semantics.
- **Adjacent-domain overlap:** Keep document/note/memo ownership decisions outside this build; expose references, canonical identity and access-controlled reads/events only.

Do not add email/push, AI summaries, FX conversions, external search infrastructure, deal stages, document upload, or RAG as incidental implementation conveniences. This plan deliberately makes no calendar estimate until shell/auth, provider availability and deployment constraints are settled.
