# Company Intelligence technical specification

> Application ownership resolved: the public website and authenticated dashboard have been consolidated into `apps/web`. Build all new investment UI and backend modules there. Earlier references below to a separate replica describe the pre-consolidation state.

**Date:** 24 October 2026\
**Status:** Proposed; product and infrastructure decisions below remain open\
**PRD:** [Company Intelligence](../prds/company-intelligence.md)\
**Review:** [PRD review and proposed clarifications](../prds/company-intelligence-review.md)

## 1. Purpose and acceptance boundary

Implement canonical company profiles, traceable evidence, external event timelines, search, watchlists, and in-app monitoring for one VC firm. Preserve research history and keep provider data separate from analyst interpretation.

The system must answer what is known, why it is believed, when it was observed, and what changed. It must not interpret missing provider data as evidence of company failure or automate investment decisions.

This is a design document, not a claim that the functionality exists. No schema changes, services, integrations, or production benchmarks are delivered by this specification.

## 2. Repository context and target architecture

Verified implementation foundations:

- `apps/web` contains Next.js App Router, TypeScript, Drizzle/PostgreSQL, Zod, and Vitest.
- Its users slice separates domain, application, infrastructure, and presentation. Frameworks and database clients stay outside domain/application code.
- Composition happens in `apps/web/src/lib/composition-root.ts`; migrations live in `apps/web/drizzle`.
- Drizzle configuration currently discovers only the users schema. The database instance is currently inside users infrastructure.
- Environment access is centralized in `packages/env`.
- `nextgen-replica` is a separate app with public-site content and evolving authentication/dashboard work. It is not included in the root pnpm workspace app layout.

**Proposed target:** Implement the authenticated investment application in `apps/web`. Keep one modular backend and one PostgreSQL database. Run ingestion and digest work through a separate worker entry point sharing the same application use cases. Do not introduce microservices, an external search engine, or a second database for MVP.

Move database connection ownership into shared server infrastructure and use a schema aggregation entry point for migrations. Preserve the existing users slice and migration history. Extract a shared package only if a separate application actually needs these use cases.

### Dependency direction

```text
Next.js UI / HTTP handlers       Worker / scheduler
             \                   /
              Application use cases
                      |
          Domain models and policy functions
                      |
          Ports implemented by infrastructure
                      |
          PostgreSQL / approved provider API
```

The deployment must support a worker or recurring bounded worker invocations. Do not run durable ingestion as an unawaited task after an HTTP response. Production hosting and scheduler selection are prerequisites to automation launch.

## 3. Proposed scope decisions

| Area | MVP default |
|---|---|
| Tenancy | One firm initially; explicit `firm_id` ownership throughout to prevent accidental global access |
| Company identity | Canonical UUID; names and domains are matching hints, not universal identifiers |
| Research visibility | Firm-shared annotations; private watchlists. Private notes are deferred |
| Roles | Reader, researcher, admin; source entitlements apply independently |
| Signal coverage | Only categories supported and validated for the selected provider |
| Digests | In-app daily/weekly digest plus immediate in-app feed; no email/push |
| Existing events | No alert backfill when a watch begins; existing events remain browsable |
| AI | Deferred; deterministic resolution and rule explanations first |
| Finance | Original currencies and round-level values; no FX conversion or inferred valuation |
| Deal links | Integration only when an actual Deal domain exists |
| Scale envelope | Design target: 10,000 companies, 100 users, 1 million assertions, 250,000 signals per firm; validate before pilot |

These defaults resolve specification ambiguity, not firm policy. Changes to them require updating affected contracts and tests.

## 4. Domain boundaries and use cases

Keep these responsibilities within a Company Intelligence module, with internal components rather than independently deployed services:

| Component | Responsibility | Principal operations |
|---|---|---|
| Registry | Identity, aliases, identifiers, duplicate review, redirects | FindCandidates, CreateCompany, PreviewMerge, MergeCompanies |
| Evidence | Sources, assertions, overrides, disputes | RecordEvidence, SetOverride, ReleaseOverride, ReviewAssertion |
| Profiles | Deterministic current profile and conflict state | ResolveProfile, GetProfile |
| Signals | Entity association, event grouping, revisions | IngestObservation, ReviewAssociation, CorrectSignal |
| Monitoring | Watchlists, subscriptions, feed, digests | UpdateWatchlist, Subscribe, EvaluateSignal, BuildDigest |
| Search | Permission-filtered company queries | SearchCompanies |
| Ingestion | Provider coordination, refresh state, job handling | RequestRefresh, RefreshCompany, RetryJob |

Ports include repositories, transaction boundary, clock, authenticated actor context, authorization policy, provider adapter, job queue, and audit writer. Pass the actor and firm context to use cases; never trust client-supplied membership or role fields.

Company Intelligence owns company references, not deal stages, contact interactions, or portfolio reporting. Adjacent domains must resolve merged company IDs through the registry.

## 5. Persistence model

Use UUID keys, UTC timestamps, explicit foreign keys, and firm-scoped ownership. For tenant-owned relationships, composite references or equivalent database constraints must prevent linking rows from different firms. Persist validated structured values; JSON does not replace field schemas.

| Table / entity | Essential fields and constraints |
|---|---|
| firms, memberships | Firm; unique `(firm_id, user_id)` membership with active status and role. Reuse an established membership model if one is introduced elsewhere |
| companies | Firm, display name, primary domain hint, lifecycle status `active/merged/archived`, redirect target, optimistic version, timestamps. Redirect target must be same-firm and non-self |
| company_identifiers | Firm, company, namespace, external value; unique `(firm_id, namespace, value)` for authoritative identifiers |
| company_aliases | Firm, company, alias kind, normalized value; indexed by firm/value. Domains and names are not globally unique |
| providers, source_grants | Provider configuration reference, capability support, enabled status; firm/user access grants and content/export permissions. No credentials in these records |
| source_documents | Firm, provider, external ID/version, canonical URL, publisher, published date, retrieval time, content hash, rights metadata. Unique provider document revision key per firm |
| assertions | Firm, company, field key, subject key, typed value JSON, source document or manual author, observation/effective dates and precision, claim kind, review status, superseded/retracted marker, ingestion key |
| assertion_reviews | Assertion, decision, reason, actor, time. Append-only decision history; current review status is a projection |
| field_overrides | Firm, company, field/subject key, selected assertion, author/reason, active/released state; at most one active override per field/subject |
| profile_fields | Firm, company, field/subject key, selected assertion, resolver policy version, conflict flag, resolution time. Rebuildable projection |
| signals | Firm, company, category, stable identity key, current revision, event date and precision, discovered time, review/publication state |
| signal_revisions | Signal, revision number, normalized payload, material-change reason, author/process, time; unique `(signal_id, revision)` |
| signal_evidence | Signal revision and source/assertion references, with firm consistency enforced |
| research_annotations | Firm, company, optional signal ID, author, body, version, deleted marker. Restrict markup and retain edit audit |
| review_items | Firm, candidate companies/event, ambiguity or rejection reason, status, reviewer, resolution time |
| watchlists, watchlist_companies | Firm, owner, private/shared visibility; unique company membership per watchlist |
| monitoring_subscriptions | Firm, user, company or watchlist target, selected categories, immediate/daily/weekly frequency, IANA timezone, activation time, muted state; exactly one target |
| feed_items | Firm, recipient, signal, material revision, matching-rule explanations, read/dismissed state; unique recipient/signal/material revision |
| digests, digest_items | Recipient, scheduled UTC window, state, member feed items; unique recipient/window and unique feed-item allocation to a digest |
| refresh_runs, refresh_capabilities | Company/provider attempts and per-capability successful checks, outcomes, errors, next due time |
| jobs, outbox_events | Idempotency key, typed payload/reference, state, attempts, lease token/deadline, available time, safe error code |
| audit_events, company_merges | Firm, actor, operation, affected IDs, before/after references, reason, request/job ID, time. Merge manifests record all reassignment decisions |

### Values and dates

- Scalar profile fields: description, founding year, headquarters, business model. Sectors/markets are validated sets; preserve vocabulary identifiers.
- Leadership assertions use a stable person/role subject key so distinct executives do not overwrite each other. Person records here are company leadership references, not a CRM.
- Financing is represented by structured financing signals and their evidence: round type, announcement date, amount, currency, named investors, and optional explicitly reported valuation. A financing-history projection can be derived from published current revisions.
- Financial amounts use decimal strings at the API boundary and fixed-precision numeric storage. Require currency when amount exists. Grants, debt, equity, and acquisitions remain distinguishable; do not sum them implicitly.
- Unknown fields are absent/null with a reason; they are never coerced to zero or false.
- Preserve date precision (`day/month/year/unknown`) for source dates. Do not invent January 1 or midnight for imprecise events. Use full timestamps for system observations.

### Indexes

Index company aliases by firm and normalized name/domain, profile filter fields by firm, signals by `(firm_id, company_id, discovered_at, id)`, assertions by company/field/subject, feed items by recipient/time, and due jobs by state/available time. Use PostgreSQL full-text name/description search initially; substring matching may supplement names at pilot scale. Add fuzzy-search extensions only after measured need and hosting support are confirmed.

## 6. Identity and merging

Normalize domains by parsing URLs, lowercasing and handling international hostnames; remove scheme/path and only the configured `www` alias. Preserve subdomains and original inputs. A shared domain is possible and is not a uniqueness constraint.

Use authoritative provider identifiers for automatic identity links. Existing domain and normalized-name matches produce candidates requiring confirmation. Name-only articles must enter association review rather than silently attach to a company. Subsidiaries remain separate unless a researcher explicitly resolves identity.

CreateCompany accepts an optional chosen candidate or an explicit create-despite-candidates reason. Serialize identity creation within the firm for the relevant normalized identity hints and enforce authoritative identifier uniqueness. Concurrent requests must recheck candidates inside that boundary; independent companies sharing hints may still be created with explicit reasons.

Merge workflow:

1. Admin chooses source and survivor; preview reports identifiers, conflicting overrides, evidence, signals, watchlists, annotations, and adjacent references.
2. Preview returns both record versions and a digest of affected state. Child mutations must advance company versions or otherwise invalidate this digest.
3. Confirmation locks both records in stable order and revalidates the preview. Reject stale previews or unresolved override/identifier conflicts with `409`.
4. Reassign children transactionally, collapse duplicate watchlist memberships, reconcile equivalent signals/feed/digest entries, and retain a reassignment manifest. Do not discard assertions.
5. Mark the source merged with a permanent redirect, rebuild affected projections, and emit one merge event through the outbox.

Writes and jobs must lock/resolve the canonical company before mutation so concurrent ingestion cannot write new children to the retired record. Prevent redirect cycles and resolve historical IDs to the current survivor. Merge does not resend already-delivered events. MVP has no automatic unmerge; document recovery from the manifest and backups.

## 7. Evidence resolution and access

Assertion claim kind (`reported/estimated/inferred/manual`) is distinct from review status (`unreviewed/verified/disputed/rejected`). Human verification records actor and time; a provider import never labels itself human-verified.

Resolve each field/subject using a versioned policy:

1. Exclude retracted, rejected, unsupported, and structurally invalid assertions.
2. Use an active manual override if it remains eligible; a refresh never releases it. A researcher must replace/release an override or resolve its invalidation explicitly.
3. Otherwise prefer verified evidence, then configured field-specific source precedence, then applicable effective/observation date, then a stable ID tie-breaker.
4. Preserve incompatible eligible alternatives as a conflict even if a preferred value is selected. Newer observation alone does not prove newer underlying facts.
5. If no eligible evidence exists, return unknown with an explanation. Retain historical assertions.

An override is a selected assertion with an author/reason, not a destructive update to a column. Releasing it reruns resolution and audits the change. Resolver versions support deterministic rebuilds and review when precedence changes.

The stored projection identifies preferred evidence but is not an authorization bypass. Resolve/filter fields against the viewer's permitted evidence; do not expose a restricted preferred value, a generated derivative, or restricted conflict metadata. Search predicates, counts, and snippets must use the same permitted evidence set before pagination. For MVP, expensive permission-specific queries are preferable to leaking a global index. Include entitlement revision in any scoped cache key.

Freshness is independent of resolution. Track last attempt and last successful check per provider capability, and show field observation dates separately. A successful no-change check may advance a capability check timestamp; a failed or partial check may not refresh unrelated capabilities. Stale facts remain visible with warnings unless access expires.

## 8. Provider ingestion and background execution

Provider adapters return normalized evidence envelopes: provider record/revision ID, identity evidence, source metadata, assertions/events, capability outcomes, and pagination cursor. Validate envelopes before persistence; quarantine invalid records with safe diagnostic metadata.

Processing sequence:

1. A scheduled or manual refresh inserts/coalesces a company/provider job; HTTP returns `202` with job ID.
2. A worker leases a due job using a transaction and row locking; a lease token fences stale workers. External calls occur outside the database transaction.
3. Fetch with bounded timeouts, pagination limits, provider-specific concurrency, and a configured request budget.
4. For each validated page, atomically store deduplicated documents/assertions, resolve known identities, publish eligible event revisions, update projections, and append outbox events. Persist the cursor in the same transaction.
5. Record per-capability completion only after the corresponding fetch completes. Resume from committed pages on retry.
6. Outbox consumers evaluate monitoring idempotently and acknowledge only after effects commit.

Use at-least-once processing with database uniqueness, not an exactly-once delivery claim. Derive ingestion keys from provider record ID, revision/content hash, company, field/subject, and normalized value where needed. An unchanged record updates check state without fabricating a new event or assertion version.

Retry transient failures with jitter, honoring provider retry instructions: proposed maximum six attempts over 24 hours. Configuration/authentication failures pause the provider and require admin intervention. Exhausted work enters a failed queue with an audited replay action. Lease expiry makes abandoned jobs eligible again; stale workers cannot commit after a replacement lease is issued.

Production adapters must record unsupported capability separately from no results. Source storage follows approved rights: store metadata/excerpts by default, full text only if licensed. Retention periods and provider costs must be configured before enabling the provider.

## 9. Signals and corrections

Association and duplicate grouping are separate decisions. A correctly associated article is not automatically a distinct event.

- Prefer stable provider event IDs. Otherwise use category-specific matching rules: company, event type, date precision, and discriminators such as round/investor/amount or executive/role.
- Do not deduplicate solely by company/category/day. Ambiguous near-duplicates remain in review; combine confidently equivalent evidence only.
- Preserve the first discovery timestamp. Publication timestamps belong to source documents, and event dates describe the event itself.
- Adding supporting coverage to the same event is non-material. Category, association, round terms, key subject, event date, or substantive outcome changes produce a material revision with an explicit reason.
- Retractions and approved reassociations create visible corrections. Keep prior revisions for audit; suppress them from current projections. Correct affected financing/search views and reconcile notification references.
- Approved reassociation may issue a correction to existing recipients and a new eligible event to the correct company's subscribers; check access to both companies before showing any correction detail.

Rule explanations are factual: “You monitor Company A; financing is enabled.” Avoid unsourced claims about investment attractiveness.

## 10. Monitoring semantics

Watchlists may be personal or firm-shared. Only owner/admin can edit a private watchlist; researchers may edit shared lists. Watching a shared list subscribes the individual user, not every firm member.

Activation and membership changes establish a timestamp and processing sequence watermark. Only events first published after the applicable watermark are eligible, except material corrections to previously delivered events. Removing a company or muting a subscription stops future delivery from that rule. Unmuting or changing categories does not backfill missed events.

Evaluate all matching rules, then insert one feed item per recipient/signal/material revision with a combined explanation. Immediate frequency makes the feed item visible immediately; daily/weekly frequency holds it for its scheduled in-app digest. If any matching rule is immediate, immediate visibility takes precedence and the same revision is not repeated in a digest. Read, dismissed, muted, and delivery state are separate concepts.

For daily/weekly rules, persist the next scheduled UTC instant derived from an IANA timezone and local delivery time (default 09:00; weekly Monday). Use half-open delivery windows, stable window IDs, and unique item allocation. Define daylight-saving handling: shift nonexistent local times forward and use the first occurrence of repeated local times. Timezone/frequency changes apply to unsent items in future windows, never resend delivered items, and are audited.

At digest construction and every subsequent read, recheck membership, source access, watchlist access, and active subscriptions. Entitlement revocation suppresses restricted pending and historical content, including counts/snippets; audit references may remain without content. Do not pre-render unrestricted digest bodies into client-visible storage.

## 11. HTTP and UI contracts

Server rendering and HTTP handlers call the same use cases. Use runtime-validated DTOs, stable machine error codes, request IDs, and no raw database errors. Proposed prefix: `/api/company-intelligence`.

| Method and resource | Behavior |
|---|---|
| GET `/companies` | Name/domain/alias search; sector, geography, financing filters; cursor pagination |
| POST `/company-candidates` | Candidate preview for a name/domain; no arbitrary URL fetch |
| POST `/companies` | Create with idempotency key; `201`, or `409` with permitted candidate context |
| GET `/companies/:id` | Canonical ID, version, visible profile fields/evidence, conflicts, capability freshness |
| GET `/companies/:id/assertions` | Paginated permitted field history and review state |
| POST `/companies/:id/assertions` | Record manual fact/evidence; author derived from session |
| POST `/companies/:id/overrides` | Select eligible assertion with reason and expected version |
| POST `/companies/:id/overrides/:overrideId/release` | Release override; recompute profile |
| POST `/assertions/:id/reviews` | Verify/dispute/reject with reason; append review record |
| GET `/companies/:id/signals` | Category/date filters; explicit event-date or discovery-date basis |
| POST `/signals/:id/reports` | Report bad association, unreliable evidence, or duplicate coverage |
| POST `/signals/:id/corrections` | Researcher/admin-reviewed correction with expected revision |
| POST `/companies/:id/refreshes` | Coalesce refresh, enforce budget; `202` with status link |
| GET `/refreshes/:id` | Pending/running/partial/succeeded/failed and capability outcomes |
| POST `/company-merges/preview` | Admin-only preview with versions and digest |
| POST `/company-merges` | Admin confirmation; idempotent transactional merge |
| GET/POST `/companies/:id/annotations` | Read/create firm-visible research |
| PATCH/DELETE `/annotations/:id` | Author/admin edit or tombstone with expected version |
| GET/POST/PATCH/DELETE `/watchlists[/:id]` | Authorized list management; delete cancels affected subscriptions |
| PUT/DELETE `/watchlists/:id/companies/:companyId` | Idempotent membership mutation |
| GET/POST/PATCH/DELETE `/subscriptions[/:id]` | User-owned monitoring configuration |
| GET `/feed`, GET `/digests[/:id]` | Permission-filtered personal notifications |
| PATCH `/feed/:id` | Read/dismiss state only |
| POST `/feed/:id/feedback` | Useful/not-useful response, optional reason |
| GET/PATCH `/admin/providers[/:id]` | Capability/access/budget configuration, no secrets returned |
| GET `/admin/review-items` | Pending identity, signal, and evidence review |
| POST `/admin/review-items/:id/resolutions` | Audited resolution with expected version |
| GET `/admin/audit-events` | Permission-filtered audit history |

Lists default to 25 items, maximum 100. Use stable sort plus UUID tie-breaker and opaque cursors bound to the filter/access context. Default signal ordering uses discovery time; unknown event dates are explicitly represented. Financing amount filters require a currency and apply to individual qualifying rounds, not invented totals.

Mutations use expected versions; stale writes return `409`. Store idempotency outcomes scoped by firm, actor, operation, and key for a proposed seven days; reused keys with different payloads fail. Reject malformed input with `400`, unauthenticated requests with `401`, inaccessible objects with `404`, recognized forbidden actions on accessible resources with `403`, and throttled requests with `429`.

Profile field responses include value, assertion reference, claim/review status, source summary, observed/effective dates and precision, conflict state, and stale state. Raw restricted documents and internal confidence details are not returned by default.

UI surfaces: company search/list; create-and-match flow; profile overview/evidence/timeline/research tabs; merge preview; watchlists and preferences; feed/digests; admin provider health and review queue. Show unknown, stale, refreshing, partial, failed, and unsupported states separately. Export endpoints are deferred; introducing exports requires entitlement-aware field filtering and audit.

## 12. Authentication, authorization, and security

Authentication integration is an implementation gate. Introduce an `ActorContext` adapter resolving verified external identity to a local user and active firm membership. Existing email-based user creation does not establish membership or authorization. Public sign-up must not grant access to the VC firm's research.

| Action | Reader | Researcher | Admin |
|---|---|---|---|
| View permitted profiles/evidence and shared research | Yes | Yes | Yes |
| Manage own watchlists/subscriptions/feed | Yes | Yes | Yes |
| Create company, assertions, overrides, corrections, shared lists | No | Yes | Yes |
| Edit annotations | Own, only if creation is later permitted | Own | Any, audited |
| Merge companies, manage access/providers, replay failed jobs | No | No | Yes |

Source grants can further restrict any role. Workers execute with firm context and recipient-specific authorization. Do not infer grants from an email domain or a client's firm ID.

Require same-origin/CSRF protection for session-authenticated mutations. Validate identifiers, lengths, enum values, and external URLs. Render untrusted source text as text or sanitized markup. Provider networking uses approved API hosts; arbitrary analyst-entered URLs are stored as references, not fetched. Any future fetching must block private/link-local addresses, unsafe redirects, unsupported protocols, and oversized responses.

Keep provider credentials in deployment secrets exposed through the environment package. Logs must exclude tokens, full licensed documents, and private annotations. Audit privileged operations and retention/deletion actions. Provider rights expiry must remove prohibited stored content and derived projections while retaining permissible audit metadata.

## 13. Reliability, observability, and measurement

Proposed pilot targets, to benchmark against the scale envelope:

- p95 company search below 750 ms and profile API reads below 1 second, excluding browser rendering and provider refresh.
- p95 feed visibility within five minutes of committed event publication for immediate rules; provider discovery delay is measured separately.
- Digests available within 15 minutes of the scheduled window under healthy operation.
- At least 80% of monitored company/provider capabilities successfully checked by their due deadline. Unsupported capabilities are reported separately and excluded from that denominator.

Instrument provider latency/errors/rate limits, due refresh backlog, capability age, job lease expiry, retry exhaustion, outbox age, unmatched identities, merge conflicts, deduplication decisions, and notification lag. Correlate request, refresh, provider record, and job IDs without logging content.

Measure PRD outcomes explicitly: timed overview task before/after launch; useful responses divided by all alert feedback responses plus response rate; duplicate corrections divided by created pilot records; on-time completed capability checks divided by due supported checks. Report sample sizes and coverage limitations.

Configure alert thresholds and an owner before pilot: growing queue age, stopped successful ingestion, unusual provider spend, failed digests, or access-check failures. Backup/PITR capability and retention are hosting decisions; validate a restore rehearsal before production research depends on the database.

## 14. Verification strategy

Use current Vitest use-case and HTTP-handler patterns for isolated behavior. Extend verification with a disposable real PostgreSQL instance in CI; mocks cannot prove constraints, transactionality, or row-lock behavior.

| Layer | Required evidence |
|---|---|
| Domain | Override persistence/release; rejected evidence; conflicts; partial dates; currency rules; deterministic resolver rebuild |
| PostgreSQL | Firm-scoped foreign keys/uniqueness; idempotent replay; concurrent creates; stale merge preview; ingestion during merge; rollback without lost children |
| Provider contract | Recorded fixtures for pagination, unchanged data, revised documents, malformed records, partial success, unsupported capabilities, rate limiting |
| Worker | Crash before/after commit; cursor recovery; expired leases; stale worker fencing; duplicate outbox delivery; exhausted-job replay |
| Authorization | Cross-firm IDs; inactive membership; private watchlists; restricted search/counts; source revocation before digest and after delivery |
| Monitoring | Overlapping subscriptions; no backfill; corrections; merge reconciliation; mute/removal; timezone changes; daylight-saving transitions |
| End-to-end | Add/match company → evidence → correction → refresh → timeline → watchlist → digest; provider outage preserves valid data and exposes failure |
| Performance | Seed proposed scale envelope; benchmark scoped search, profile resolution, feed queries, merge transaction duration, and job backlog recovery |

Run root lint, typecheck, tests, and production build, plus integration and browser suites introduced by implementation. Fixture replay must verify no additional facts/signals/alerts on an unchanged second ingestion. Do not access live provider accounts from ordinary CI.

## 15. Delivery plan and migration approach

1. **Foundation:** Confirm target app/auth adapter; centralize database ownership, schema discovery, firm membership, authorization, audit, and migration setup. Prove cross-firm isolation with integration tests.
2. **Manual research slice:** Create/search companies, identity candidates, profile assertions, overrides, sources, leadership and financing history, annotations. Prove provenance and conflict behavior without a provider.
3. **Identity integrity:** Add reviewed merge preview/commit, redirects, concurrency safeguards, and reassignment audit. Prove no evidence loss under concurrent writes.
4. **Automated intelligence:** Implement leased jobs/outbox, one validated provider adapter, capability freshness, association review, signal grouping/revisions. Prove replay and outage recovery.
5. **Monitoring:** Add watchlists, recipient rules, in-app feed/digests, access rechecks, feedback, and operational metrics. Prove overlap and correction semantics.
6. **Pilot:** Seed representative companies, exercise supported categories, benchmark performance, rehearse recovery, and collect four weeks of investor feedback.

Use additive migrations, feature flags for ingestion and monitoring, and provider-specific kill switches. Do not seed private research from public replica content without an explicit import workflow. Disable workers before rolling back incompatible application versions; preserve evidence and audit history. Destructive schema cleanup is a later reviewed migration, not part of routine rollback.

## 16. Decisions required before implementation or launch

| Decision | Proposed owner | Gate |
|---|---|---|
| `apps/web` versus the evolving replica dashboard as product shell | Engineering/product | Before UI implementation |
| Verified identity, invitation, and firm-membership integration | Engineering/firm administrator | Before any private data is exposed |
| Initial provider, supported categories, rights, retention, request budget | Product/data owner | Before live ingestion |
| Source precedence, acceptable stale thresholds, correction responsibilities | Investment team lead | Before automated profile resolution pilot |
| In-app-only digest and daily/weekly defaults | Product | Before monitoring UI implementation |
| Hosting worker/scheduler, database backups, operational ownership | Engineering | Before automation launch |
| Pilot company count, baseline tasks, sectors/geographies | Investment team lead | Before pilot measurement |
| Existing Deal domain contract, if any | Product/engineering | Before deal-link implementation |

The first manual research slices can proceed once application ownership and access integration are resolved. Provider-dependent launch acceptance remains conditional on validated coverage and licensing.
