# Company Intelligence PRD review

> Application ownership resolved: the public website and authenticated dashboard have been consolidated into `apps/web`. Build all new investment UI and backend modules there. Earlier references below to a separate replica describe the pre-consolidation state.

**Reviewed:** 24 October 2026\
**Source:** [Company Intelligence PRD](company-intelligence.md)\
**Verdict:** Suitable for technical design; not yet sufficient to commit to a production ingestion launch.

The PRD clearly defines the investor problem, evidence requirements, domain boundaries, and major workflows. Preserve its distinction between facts, external events, and investor interpretation. The gaps below affect observable behavior, data integrity, or launch feasibility. The technical specification proposes defaults without treating them as approved product requirements.

## Required clarifications

| Priority | Gap and consequence | Proposed resolution |
|---|---|---|
| P1 | The initial provider is unspecified. A company database may supply profiles without event coverage; all six signal categories cannot be promised from one unspecified source. | Validate a provider against the coverage matrix before launch. Represent unsupported categories as unavailable. Support manual evidence entry for evaluation; it does not satisfy automated coverage acceptance. |
| P1 | Profile resolution lacks field-level precedence, override release rules, and conflict semantics. Refreshes could silently select misleading facts. | Version field policies, preserve all assertions, pin manual overrides until explicitly released, and resolve only eligible assertions. Show unresolved conflicts. |
| P1 | Roles and entitlements are undefined, including private watchlists and shared research. Authentication alone would not protect firm data. | Introduce explicit firm membership, reader/researcher/admin permissions, private watchlist ownership, and source access checks on every read and background delivery. |
| P1 | Duplicate matching and merging lack transactional and concurrency requirements. A merge could lose evidence or create duplicate alerts. | Treat name/domain matches as candidates; require admin confirmation, a versioned preview, transactional reassignment, permanent redirects, and delivery reconciliation. |
| P1 | “Digest” does not identify a delivery channel or the behavior of historical events and corrections. This changes notification scope and reliability requirements. | MVP digests are in-app, daily or weekly in the user's timezone; immediate feed is available. No historical backfill on subscription. Deliver material revisions once. Email is deferred. |
| P1 | The repo has two separate application surfaces. Building the backend in one and UI in the other introduces an unplanned integration boundary. | Propose the existing `apps/web` modular application as the implementation target. Confirm portal ownership before UI implementation; do not copy domain code into the replica. |
| P2 | “Fresh” has no field/source definition. A successful partial fetch could make an incomplete profile appear current. | Track attempts and successful checks per company, provider, and capability. Display field observation dates independently. Partial success refreshes only covered capabilities. |
| P2 | Financial filters do not define round scope, date semantics, or cross-currency behavior. Results could be misleading. | Filter financing events by announced date and round type; amount filters require a currency. No implicit currency conversion or inferred totals. |
| P2 | Signal association, grouping, rejection, and material correction rules are unspecified. | Require strong identity evidence for automatic association; send ambiguity to review. Preserve separate articles as evidence and version substantive event changes. |
| P2 | Success measures lack denominators and measurement methods. | Instrument a timed research baseline, alert feedback, record corrections, and refresh deadlines. Report feedback response rate and monitoring coverage alongside headline rates. |

## Scope and acceptance recommendations

- Stage the MVP into manual research, evidence resolution, automated ingestion, and monitoring. Each slice must work independently before the next depends on it.
- Keep AI-generated summaries out of the initial implementation. Source-linked factual summaries and explicit rule explanations satisfy the core workflows without model evaluation or operating cost.
- Treat deal linking as conditional on an existing Deal domain. Do not create placeholder deals or implement pipeline state here.
- Add real PostgreSQL integration tests: the current unit-test examples do not validate uniqueness, transactional merge behavior, access scoping, or worker concurrency.
- Do not mark the domain ready for autonomous implementation until provider coverage, application ownership, and authentication/membership integration are resolved.

## Evidence and confidence

Verified against repository files: the workspace design specifies a modular Next.js/PostgreSQL application with hexagonal boundaries; `apps/web` has a Drizzle users slice and Vitest tests; migration discovery currently targets only the users schema. The separate `nextgen-replica` working tree has Clerk dependencies and a dashboard, but is not the database-backed workspace application. Those working-tree changes may evolve independently.

Confidence is high in the domain and persistence recommendations. Provider coverage, production hosting, data volume, source licensing, and the intended application shell remain unknown. No provider capability or production performance has been validated.

See the [technical specification](../specs/company-intelligence.md) for proposed implementation contracts and decision gates. The original PRD remains unchanged.
