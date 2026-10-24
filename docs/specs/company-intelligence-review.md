# Company Intelligence technical specification review

**Date:** 24 October 2026\
**Reviewed document:** [Technical specification](company-intelligence.md)\
**Verdict:** The modular architecture is appropriate. Resolve the behavioral gaps below before implementing the affected stages; the spec is not yet an unconditional build contract.

This review uses the principal-eng review approach. It examines the spec against the PRD, adjacent domain plans, current repository structure, and existing CI/test configuration. No implementation or live provider behavior was tested.

## Findings and implementation resolutions

### R1 — Signal access must be evidence-aware (P1)

Sections 7 and 12 require evidence-aware profile reads, but sections 9–11 do not define how signal payloads assembled from multiple sources are filtered. A permitted supporting article must not unlock financial terms present only in a restricted article. Company display names, aliases, counts, and search hints also need an explicit visibility policy rather than bypassing source rights as registry metadata.

**Plan resolution:** Firm-authored identity fields form a firm-visible registry baseline. Provider-derived identity additions, profile fields, and signal payload fields retain evidence references and source policy. Produce recipient-visible signal revisions only from permitted evidence, including summaries, correction text, filters, counts, and rule explanations. A signal without sufficient permitted evidence is hidden. Rights for derived data require explicit provider validation; do not assume that paraphrasing removes restrictions.

**Acceptance:** A reader with access to a public article but not a licensed financing source sees neither its amount nor its existence through filters/counts. Revocation removes restricted content from existing feeds/digests and subsequent search responses.

### R2 — A sequence watermark alone does not establish publication order (P1)

Section 10 introduces a processing sequence without defining allocation/commit order. Concurrent transactions can allocate numbers in one order and commit in another. Eligibility can then depend on an event that was not published at subscription activation.

**Plan resolution:** Introduce a firm publication clock row. Subscription activation/configuration changes, watchlist membership intervals, and event publication lock and advance that clock in their transaction. Assign sequence values while holding the lock until commit. Persist effective subscription/membership intervals; do not infer historical eligibility from current configuration. Recheck current access and mute/removal state before pending delivery. Benchmark this serialization point at pilot scale.

**Acceptance:** Barrier-controlled concurrent subscription/event transactions produce deterministic eligibility in their serialized order, even when outbox evaluation is delayed or replayed.

### R3 — Mixed digest schedules and history retention are ambiguous (P1)

Section 10 defines immediate precedence but not daily versus weekly precedence. A per-recipient window key does not identify which schedule owns an item when matching rules have different timezones. Requiring active subscriptions on every historical read can also erase delivered history after unsubscribe, contrary to the separate concepts of access and future delivery.

**Plan resolution:** Select immediate if eligible; otherwise choose the earliest next scheduled UTC delivery among matching active rules, tie-breaking by subscription ID. Persist the selected due time, schedule version, eligible rule IDs, and original explanation. Deliver each recipient/signal/material revision once. Recompute pending items on preference, mute, or membership changes. Unsubscribe cancels pending delivery but retains already-delivered history while firm/source access remains valid. This retention behavior is a proposed amendment requiring product confirmation before stage 7.

**Acceptance:** Overlapping daily/weekly schedules across timezones allocate one item once; preference changes never resend delivered items; entitlement loss still hides historical restricted content.

### R4 — Stage ordering omits foundational signal operations (P1)

Section 15 includes financing history before signals are introduced, although section 5 models financing as signals. Merge is also scheduled before tables and rules for signal/notification reconciliation exist. Section 11 offers signal corrections but no manual signal creation contract for the manual research slice.

**Plan resolution:** Build core signal/revision/evidence records, manual event creation, and financing history before initial merges. Initial merge handles the tables that exist then. Extend merge reconciliation in the same stage that adds watchlists and notifications, before enabling those features. Add a researcher-only manual signal creation use case/endpoint with source and event-date validation.

**Acceptance:** A company has sourced financing history without a provider; later monitoring migrations cannot enable features until merges preserve their records and delivery uniqueness.

### R5 — Disputed and superseded evidence eligibility is unspecified (P2)

Section 7 excludes rejected/retracted evidence but does not explain superseded or disputed assertions, or an active override whose assertion becomes ineligible. Superseded verified facts could outrank their replacements; a disputed override could remain presented as trustworthy.

**Plan resolution:** Exclude superseded assertions from current selection, retaining history. Disputed assertions remain inspectable but are not automatically preferred. Disputing an overridden assertion suspends its effective selection, records a review item, and resolves from other eligible evidence; retain the override record for explicit release/replacement. Never label an unavailable fallback as verified. Define ordering of effective versus observation dates per field policy.

**Acceptance:** Replacing a verified assertion cannot leave its superseded value selected; disputing a pinned assertion visibly changes its status and raises review without destroying history.

### R6 — Queryable finance and cross-domain references need concrete boundaries (P2)

Section 5 allows typed JSON values, while section 11 requires financing filtering and sorting. Without a defined projection, implementations may filter imprecise dates or amounts inconsistently. Adjacent plans also now exist: Deal Pipeline permits provisional references, and Research & Diligence distinguishes substantive notes from Company Intelligence annotations. Research and Knowledge plans overlap on document ownership, which this domain must not resolve by creating another document store.

**Plan resolution:** Add a rebuildable financing projection with decimal amount, currency, round type, partial-date bounds/precision, and evidence references. Apply date filters by interval intersection, label imprecise dates, and require all round filters to match the same event. Use stable canonical-company resolution and versioned integration events; do not implement provisional deals, document uploads, memos, or RAG here. Limit annotations to fact/signal interpretation. External research citations are typed immutable references whose content access is checked by their owning domain; enable only once its contract exists.

**Acceptance:** Financing filters match eligible individual rounds, respect source access and date precision, and never combine terms from different rounds to fabricate a match.

## Verified repository constraints

- Root workspace targets `apps/*` and `packages/*`; the separately evolving replica app is outside that scope.
- Drizzle currently discovers only the users schema, and its connection is owned by users infrastructure.
- CI runs lint/typecheck/unit tests/build but has no PostgreSQL service or browser suite. Those checks must be added, not assumed present.
- The existing `/api/users` endpoint creates an email record without establishing authenticated firm membership. Do not use it as a provisioning or privilege-grant path.
- No provider, firm membership implementation, worker deployment, or production backup capability was validated.

## Remaining decisions and confidence

High confidence: existing hexagonal boundaries are suitable; real database tests and transactional job handling are necessary. Application shell, identity integration, provider licensing/capabilities, policy precedence, and hosting remain conditional decisions. Proposed timing, throughput, and volume targets require measurement.

The [implementation plan](../plans/company-intelligence.md) incorporates R1–R6 as proposed amendments and places explicit gates before dependent work. The original specification remains unchanged so the review trail is visible.
