# Company Intelligence backend development

The implemented slice provides an authenticated company directory, profiles, sourced facts, manual signals and financing history with evidence/revision controls. Automated external-source ingestion is not available yet.

## Local setup

1. Use the repository's supported Node/pnpm runtime, install dependencies, and configure `apps/web/.env` as described in the root README.
2. Point DATABASE_URL at a local development PostgreSQL database, then run `pnpm db:migrate`. The new migration depends on existing Research firm tables; apply the full journal.
3. Reuse the configured Clerk application. Company API routes use the existing Clerk middleware and require CLERK_SECRET_KEY; no auth bypass exists.
4. Provision a verified Clerk user through the existing offline Research administrator command. `pnpm --filter @repo/web exec tsx scripts/research-admin.ts init <firm-uuid> <firm-name> <clerk-user-id>` creates an initial firm/admin; use `membership <firm-uuid> <clerk-user-id> <viewer|contributor|admin>` in place of the init arguments to grant access to an existing firm. Configure the command environment according to the existing Research setup. Do not provision production access using synthetic users.
5. Run `pnpm dev`. Sign in through the existing Clerk integration and open `/companies/` (also linked from the dashboard). Research members can browse profiles; contributor/admin members can add companies and sourced facts. The UI calls `/api/company-intelligence`.

Company Intelligence deliberately uses Research membership identity, not Pipeline membership. A Pipeline-only member is not automatically authorized; a shared email or Clerk account does not prove that their two firm records are equivalent. Deal Pipeline now supports an explicit administrator-configured firm mapping and checks both memberships for canonical search/selection. See [Pipeline setup](plans/deal-pipeline-setup.md#company-intelligence-integration).

## Available endpoints

All paths below are under `/api/company-intelligence` (the app currently uses trailing slashes). Responses are private/no-store and carry `X-Request-ID`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/companies/` | Search manual company name/domain; query `q`, `limit` (1–100), `after` (UUID cursor) |
| POST | `/companies/` | Create a canonical company |
| POST | `/company-candidates/` | Exact normalized name/domain duplicate preview; body `{ name, domain }` |
| GET | `/companies/:companyId/` | Company, resolved fields, source assertions, override history |
| POST | `/companies/:companyId/assertions/` | Add a sourced fact |
| POST | `/companies/:companyId/assertions/:assertionId/reviews/` | Record a verification/dispute/rejection decision |
| POST | `/companies/:companyId/overrides/` | Pin an eligible assertion for its field |
| POST | `/companies/:companyId/overrides/:overrideId/release/` | Release a pin and recompute the profile |
| GET | `/companies/:companyId/signals/` | Manual signal workspace with all statuses/revisions and current company version |
| POST | `/companies/:companyId/signals/` | Create a sourced manual signal |
| POST | `/companies/:companyId/signals/:signalId/corrections/` | Append an immutable correction/status/source revision |
| GET | `/companies/:companyId/financing/` | Current eligible financing projection; filters `currency`, `roundType`, `minAmount`, `maxAmount`, `from`, `to` |

Mutations require same-origin JSON, a UUID `requestId`, and contributor/admin membership. Child mutations require `expectedVersion` from the current company profile. Reuse the same request ID and identical payload to safely retry; new intent needs a new request ID. A reused ID with different intent or a stale company version returns `409`.

### Create a company

```json
{
  "requestId": "6d824ccb-b381-4167-a611-4fdb0c775431",
  "name": "Example Company",
  "domain": "example.com"
}
```

The API returns the new company including ID/version. Domain normalization removes `www`, scheme and trailing slash; non-root paths, credentials and invalid hosts are rejected. A case-insensitive name or normalized-domain match returns a conflict. To deliberately create a distinct company sharing a name/domain, supply a nonempty `duplicateReason` with a new request ID. The reason is audited.

### Add a fact

```json
{
  "requestId": "577199b1-b0fe-4164-84ab-693fd8b85adc",
  "expectedVersion": 1,
  "field": "description",
  "value": "Builds workflow software for logistics operators.",
  "sourceUrl": "https://example.com/about",
  "sourceTitle": "Company overview",
  "observedAt": "2026-10-24T00:00:00.000Z",
  "claimKind": "reported"
}
```

Supported fields: description, sector, businessModel, headquarters, foundingYear, operatingMarkets. Sector and operatingMarkets accept nonempty string arrays; foundingYear accepts a plausible integer; other values are bounded strings. Observation timestamps must not be in the future. Source URLs are public HTTP/HTTPS references without credentials, not upload/fetch instructions.

All manually entered evidence in this slice is shared with authorized firm members. This is not a licensed-provider storage or entitlement feature; do not ingest restricted provider datasets through it.

Review input adds `reviewStatus` (`unreviewed`, `verified`, `disputed`, `rejected`) and a reason alongside requestId/expectedVersion. Pin input adds field, assertionId and reason. Release input adds a reason. Each mutation returns the new profile/version.

The UI checks duplicates before creation and allows reusing an existing profile. In a profile, use **Add fact** to enter a source and observation date; open **Evidence** to inspect submitted claims or review/pin/release a value. A stale save preserves the draft and offers **Load latest profile** before an explicit resubmission. Network retries retain the same request ID for unchanged intent. Review decisions are audited; the UI shows current review state and pin history, not a separate full audit viewer.

### Manual signals and financing

Apply the current migration journal before using **Signals** in a company profile. Use **Add signal** to record the event, source links, source observation/publication dates, and event-date precision. Choose **Edit signal** to append a correction or change status with a reason; prior revisions remain available. Source-only changes are non-material revisions. Exact duplicates require a distinct-event reason, not a new request ID alone.

Signal writes use `expectedCompanyVersion`; corrections also use `expectedSignalVersion`. Both require a UUID requestId and a full payload snapshot. A successful write returns `{ companyVersion, companyUpdatedAt, signals }`. Loading newer signals refreshes the full fact profile too; pending fact decisions require explicit review if another analyst changed the evidence.

Example financing signal payload (inside `{ requestId, expectedCompanyVersion, payload }`):

```json
{
  "category": "financing",
  "title": "Example Company announces seed financing",
  "summary": "The company reported a seed round led by Example Capital.",
  "eventDate": { "precision": "month", "value": "2026-10" },
  "status": "unreviewed",
  "sources": [{
    "url": "https://example.com/announcements/seed",
    "title": "Company financing announcement",
    "publishedOn": "2026-10-20",
    "observedAt": "2026-10-24T00:00:00.000Z"
  }],
  "financing": {
    "roundType": "seed",
    "amount": "2500000.125",
    "currency": "AUD",
    "investors": ["Example Capital"],
    "valuation": null,
    "valuationKind": null
  }
}
```

Categories: financing, leadership, product, commercial, corporate, risk. Non-financing payloads must have `financing: null`. Event dates accept real `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or unknown/null values matching their precision; future event dates can describe announced plans. Observations cannot be in the future. Sources are required (1–10); URLs are references only and are never fetched.

Round types: pre_seed, seed, series_a, series_b, series_c, growth, debt, grant, other. Amounts and valuations are nonnegative decimal **strings**, with at most 20 integer and 4 fractional digits; never send JSON floating-point numbers. Currency must be a supported ISO three-letter code when an amount/valuation exists. Valuations require pre_money or post_money classification. Unknown amounts remain null. No sums or currency conversion are inferred.

**Financing history** includes current unreviewed/verified financing revisions only. Disputed/retracted rounds remain in signal history; correcting their status transactionally removes/restores the current financing projection. All amount/type/currency/date filters match the same round. Amount filters require a currency. Date ranges use interval intersection for month/year precision and exclude unknown dates. Signal-timeline category/date filters are local to the loaded manual workspace; financing filters run against the database projection.

Cross-company reassociation, ambiguity/report queues, automated coverage grouping and licensed-source entitlements are not implemented in this slice. For a wrongly associated event, preserve its history rather than silently rewriting company IDs; the reviewed reassociation workflow is planned next.

Verified eligible assertions take precedence, followed by observation date and a stable ID tie-breaker. Distinct eligible values show a conflict. A pin survives new evidence; disputing/rejecting its assertion suspends selection without deleting its history. Review decisions and changes are audited. Unknown fields have null values, not zero/false.

## Verification

Use a dedicated local test database. Set DATABASE_URL and TEST_DATABASE_URL in the command environment; never point tests at production. Tests reject remote TEST_DATABASE_URL hosts and create/drop only randomly named test schemas.

```sh
DATABASE_URL=postgres://localhost:5432/company_intelligence_test \
TEST_DATABASE_URL=postgres://localhost:5432/company_intelligence_test \
pnpm --filter @repo/web exec vitest run src/modules/company-intelligence
```

Without TEST_DATABASE_URL, PostgreSQL integration tests are skipped locally; this is not a complete validation run. CI now provisions PostgreSQL, supplies both URLs, applies migrations, and runs the integration tests as part of the normal test suite. Also run root typecheck, lint and build.

See the [build record](plans/company-intelligence-build.md) for completed checks and deferred implementation.

### Browser verification

```sh
DATABASE_URL=postgres://localhost:5432/company_intelligence_test \
TEST_DATABASE_URL=postgres://localhost:5432/company_intelligence_test \
pnpm --filter @repo/web test:company:e2e
```

The browser suite starts a standalone server bound only to `127.0.0.1:4327`, builds the real UI, and uses the real HTTP handler/application/repository against a randomly named PostgreSQL schema. It refuses a remote test database and drops its fixture schema on graceful shutdown. Its injected fixture sessions exist only in the test harness, which is never imported by production routes. Clerk login/membership provisioning must still be verified separately with a real test account.

The suite now includes profile and signal/financing journeys plus cross-view concurrency and uncertain-response replay. It prefers installed Google Chrome on this Mac; elsewhere install Playwright Chromium with `pnpm --filter @repo/web exec playwright install chromium` first. CI installs Chromium with its required operating-system dependencies.
