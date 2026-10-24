# PRD: Company Intelligence
**Company profiles and external signals for a VC investment team**

**Status:** Draft for review\
**Primary users:** Analysts, associates, principals, and partners\
**Product context:** Internal software supporting investment research, sourcing, and ongoing company monitoring.

## Problem Statement

Investment teams assemble their understanding of companies across websites, data providers, news, spreadsheets, and internal research. Information becomes stale, sources conflict, and the same research is repeated across the team.

External events—such as a financing announcement, executive hire, or product launch—often arrive without enough context to determine whether they deserve attention.

The team needs a shared, trustworthy understanding of each company and a practical way to identify meaningful changes.

## Solution

Create a Company Intelligence domain that maintains a canonical profile for each company and connects it to a chronological record of external signals.

The domain should help an investor answer:

- What does this company do, and does it fit our investment focus?
- What do we know, where did that information come from, and how current is it?
- What has changed since we last looked?
- Why might that change matter?
- What should we investigate next?

Company Intelligence supplies company information and evidence to adjacent workflows. Deal Pipeline owns investment stages and deal execution; Relationship Management owns interactions and introductions; Portfolio Management owns post-investment reporting.

## Goals and Success Measures

| Goal | Proposed measure |
|---|---|
| Reduce repeated company research | Median time to prepare a company overview falls against a pre-launch baseline |
| Improve trust in company information | Every externally sourced fact and signal exposes provenance and observation dates |
| Surface useful changes | Investors rate at least 70% of delivered alerts as useful during the pilot |
| Maintain company identity quality | Fewer than 2% of pilot records require duplicate correction |
| Support ongoing monitoring | At least 80% of pilot companies meet their configured refresh schedule |

Targets are initial proposals. Establish baselines and confirm them during a four-week pilot.

## Domain Model

| Concept | Definition |
|---|---|
| **Company** | The canonical organization being researched or monitored |
| **Company profile** | The current consolidated view of a company |
| **Fact** | A claim about a company, with its source, effective date where known, and observation date |
| **Source** | The publication, provider, website, or document supporting a fact or signal |
| **Signal** | A dated external event or observed change associated with a company |
| **Watchlist** | A saved collection of companies monitored by a user or team |
| **Research annotation** | An investor’s interpretation or comment, distinguishable from external evidence |
| **Monitoring rule** | A configuration defining which signals merit an alert |

A company can exist without an active deal. A signal can be relevant without implying that the company is an attractive investment.

## User Stories

### Company profiles

1. As an analyst, I want to add a company using its name or website, so that I can start research quickly.
2. As an analyst, I want likely matches shown before creating a record, so that I avoid duplicates.
3. As an investor, I want a concise company overview, so that I can understand the business quickly.
4. As an investor, I want to see sector, business model, headquarters, operating markets, and founding year, so that I can assess mandate fit.
5. As an investor, I want to see founders and key executives, so that I can understand the leadership team.
6. As an investor, I want financing history with announced dates, amounts, currencies, and named investors, so that I can understand the company’s funding context.
7. As an investor, I want unavailable information marked as unknown, so that missing data does not look like a negative finding.
8. As an analyst, I want to correct information while preserving its history, so that the team can trust the record.

### Evidence and freshness

9. As an investor, I want to open the source behind a fact, so that I can verify it.
10. As an investor, I want to distinguish company claims, third-party reports, and analyst assessments, so that I can judge the evidence.
11. As an analyst, I want conflicting values surfaced, so that I can investigate discrepancies.
12. As an investor, I want to see when information was last checked, so that I know when further research is needed.
13. As an analyst, I want to request a refresh and see its outcome, so that I can update stale profiles.

### External signals

14. As an investor, I want a company’s signal timeline, so that I can understand its development over time.
15. As an investor, I want related coverage grouped into one event, so that repeated articles do not overwhelm me.
16. As an investor, I want to filter signals by category and date, so that I can focus my research.
17. As an investor, I want a short explanation of a signal’s potential relevance, so that I can decide whether to investigate.
18. As an analyst, I want to flag an incorrect company association or unreliable signal, so that errors can be corrected.
19. As an investor, I want adverse developments included, so that monitoring does not create an overly positive view.

### Discovery and monitoring

20. As an investor, I want to search by name, domain, and aliases, so that I can find the right company.
21. As an investor, I want to filter companies by sector, geography, and financing attributes, so that I can explore relevant opportunities.
22. As an investor, I want personal and shared watchlists, so that I can organize companies around investment themes.
23. As an investor, I want to configure signal categories and alert frequency, so that monitoring matches my priorities.
24. As an investor, I want a digest of new signals, so that I can stay informed without checking each profile.
25. As an investor, I want to mute or dismiss alerts, so that the system reflects my attention needs.

### Team workflows

26. As an analyst, I want to annotate a signal with my assessment, so that colleagues understand its context.
27. As a partner, I want to see the team’s existing research, so that we avoid duplicating work.
28. As an investor, I want to link a company to an existing deal, so that research is available during investment evaluation.
29. As an administrator, I want to manage source access and monitoring coverage, so that the system operates within agreed permissions and costs.
30. As an administrator, I want an audit trail of edits and merges, so that changes remain accountable.

## Functional Requirements

### 1. Canonical company profiles

MVP profiles include:

- Company name, aliases, primary website, and external identifiers.
- Short description, sectors, business model, and location.
- Founding year and key leadership.
- Publicly reported financing events.
- Sources, freshness indicators, and research annotations.
- Links to relevant records in adjacent domains when those domains exist.

Company creation checks for duplicates. Authorized users can merge duplicates after reviewing a preview of affected information. Merges preserve identifiers, evidence, annotations, and links.

### 2. Facts and provenance

Every externally sourced fact must retain:

- Source reference and publisher or provider.
- Retrieval timestamp.
- Effective date, where available.
- Whether the value is reported, estimated, or inferred.
- Verification status.

Conflicting evidence must remain accessible. Selecting a preferred value must not erase alternatives.

Manual corrections should survive automated refreshes until explicitly released or superseded through a documented resolution.

### 3. External signals

Initial signal categories:

| Category | Examples |
|---|---|
| Financing | Announced funding, disclosed investors, grants |
| Leadership | Founder departure, executive appointment |
| Product | Product launch, material product announcement |
| Commercial | Announced customer, partnership, market expansion |
| Corporate | Acquisition, merger, closure |
| Risk | Reported litigation, regulatory action, security incident |

Signals distinguish the event date from the publication and discovery dates. Financial amounts retain their original currency and deal context.

A source disappearing or an ingestion failure must never be interpreted as a company event.

### 4. Signal relevance and delivery

Users can monitor a company or watchlist and select categories and delivery frequency. MVP supports an in-app feed and configurable digest.

Relevance considers explicit user preferences and company context. Explanations must show why a signal matched a rule.

Repeated coverage of the same event should not produce repeated alerts. Material corrections should update the event and visibly identify what changed.

### 5. Search and discovery

MVP supports name, alias, and domain search, plus filters for sector, geography, and publicly reported financing.

Results show enough identity context to distinguish similarly named companies. Missing values remain distinct from zero, false, or “not applicable.”

## Core Workflows and Acceptance Criteria

| Workflow | Acceptance criteria |
|---|---|
| Add a company | User supplies a name or domain, reviews likely matches, and selects an existing company or creates a new one |
| Research a company | User can understand the overview, inspect sources, identify stale information, and review conflicting facts |
| Review a signal | User can see what happened, the relevant dates, supporting evidence, company association, and relevance explanation |
| Monitor companies | User creates a watchlist, configures monitoring, and receives only eligible new events |
| Correct information | Authorized user records a correction; its author, reason, and previous value remain available |
| Handle a provider outage | Existing information remains available with a visible freshness warning; no fabricated updates or success state appears |
| Connect to a deal | Linking uses the canonical company identity and does not create a duplicate company profile |

## Implementation Decisions

These are proposed boundaries for implementation, subject to architecture review.

- **Company Registry:** Owns canonical identity, aliases, identifiers, duplicate detection, and merges.
- **Evidence Store:** Owns source references, fact history, provenance, and correction records.
- **Profile Resolver:** Produces the current profile using explicit source precedence and manual overrides.
- **Signal Processor:** Associates observations with companies, normalizes events, and groups duplicate coverage.
- **Monitoring Service:** Owns watchlists, monitoring rules, delivery preferences, and notification history.
- **Search Service:** Provides permission-aware company search and filtering.
- **Provider Adapters:** Isolate provider-specific schemas, credentials, rate limits, and refresh behavior.

Ingestion must be retryable and idempotent. Refresh failures must not overwrite valid information.

If AI generates summaries or classifications, outputs must retain supporting evidence and be identifiable as generated. Unsupported claims must not become verified facts.

Firm-created research must be access-controlled. Source entitlements must govern what users can view, export, or receive in alerts.

## Testing Decisions

Test observable behavior across module boundaries, with particular emphasis on:

- Identity matching for aliases, renamed companies, subsidiaries, and similar names.
- Merge integrity and preservation of evidence and linked records.
- Conflicting facts, manual overrides, and subsequent refreshes.
- Repeated ingestion, duplicate coverage, and corrected events.
- Event dates, discovery dates, currencies, and missing values.
- Monitoring eligibility, digest grouping, and duplicate delivery prevention.
- Permissions across profiles, search, exports, and notifications.
- Provider outages, partial results, retries, and recovery.

Use representative provider fixtures and end-to-end investor workflows. Establish test conventions during implementation; no relevant domain test precedent was identified in the current project documentation.

## Delivery Scope

**MVP:** Canonical profiles, manual company creation, one approved external data source, provenance, basic search, signal timeline, watchlists, corrections, and in-app monitoring with digests.

**Next:** Additional providers, improved entity resolution, richer discovery filters, saved searches, and deeper integration with investment workflows.

A provider must be selected and its coverage, licensing, cost, and refresh capabilities validated before committing to ingestion scope.

## Out of Scope

- Deal stages, investment approvals, and investment committee workflows.
- Relationship graphs, email synchronization, and introduction management.
- Portfolio reporting and private financial statement ingestion.
- Valuation models and automated investment recommendations.
- Comprehensive market mapping or competitor intelligence.
- Claims of real-time or exhaustive coverage across all companies.
- Automatically contacting companies or founders.

## Further Notes

This draft assumes a single VC firm with shared company records and permission-controlled internal research.

Before implementation, confirm the firm’s investment stages, sectors, geographies, initial company volume, preferred data providers, and required monitoring cadence. These choices determine coverage and operating cost.
