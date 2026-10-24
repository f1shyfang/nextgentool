# Research and Diligence operations

The MVP runs in `apps/web` at `/research/`. It uses PostgreSQL for firm membership, research records, immutable revisions and audit events; a private persistent directory stores immutable files. It has no public-file or anonymous development mode.

## Local setup

1. Run `pnpm install` at the repository root. Copy `apps/web/.env.example` to `apps/web/.env` and configure a local PostgreSQL database.
2. Configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` for the existing Clerk application used by this product. No new Clerk application or Organizations configuration is required. A signed-in account still needs an explicitly provisioned research membership.
3. Run `pnpm db:migrate` against the configured local database. Review and apply migrations separately for shared environments.
4. Start a private ClamAV daemon supporting TCP INSTREAM on `CLAMAV_HOST:CLAMAV_PORT` (defaults `127.0.0.1:3310`). Configure its stream limit above 25 MiB, keep signatures current, and keep the service off the public network. Scanning unavailable or failed means the version remains inaccessible and can be retried.
5. Set `RESEARCH_STORAGE_PATH` to a private persistent directory outside the public tree. The server creates directories with mode 0700 and files with mode 0600. Run the application as a dedicated OS user.
6. Provision a firm and membership using the offline administration commands below, then run `pnpm dev` and open `/research/`.

The existing user-registration example API does not grant research membership. Research does not accept client-supplied firm IDs or roles. The administration CLI requires database access and must be limited to trusted operators.

## Provision firm and canonical references

Commands run from the repository root. Replace all angle-bracket placeholders; use UUIDs for firm, company and deal IDs, and the real Clerk `user_...` identifier for users.

```sh
pnpm --filter @repo/web research:admin init <firm-id> "Firm name" <clerk-user-id>
pnpm --filter @repo/web research:admin membership <firm-id> <clerk-user-id> contributor
pnpm --filter @repo/web research:admin membership <firm-id> <clerk-user-id> viewer
pnpm --filter @repo/web research:admin company <firm-id> <company-id> "Company name"
pnpm --filter @repo/web research:admin deal <firm-id> <deal-id> <company-id> "Seed round"
pnpm --filter @repo/web research:admin revoke <firm-id> <clerk-user-id>
```

`init` creates the first administrator. Membership assigns one research firm per user and refuses to move users between firms implicitly. Membership changes and reference provisioning lock the firm and record an audit event. Changes take effect on the next application operation; in-flight transactions complete under their existing lock.

Use canonical IDs from the company registry and deal pipeline when available. The MVP keeps a minimal configured reference registry because those domain integrations are not yet supplied. Provisioning a reference does not create a company profile or pipeline deal. Company and deal references must belong to the same firm, and the deal must reference that company. Do not attach confidential research to provisional, unmatched company identities.

## Daily workflows

Select a company and optionally a deal. A deal view includes company-wide research plus that deal's material. Upload PDF or DOCX files up to 25 MiB. Validation checks the actual file format, rejects supported encryption markers, bounds DOCX decompression, and requires a clean ClamAV response. PDF validation is a structural signature check, not a full PDF conformance parser. Downloads are attachments; embedded document execution and inline preview are not enabled.

Use **Upload new version** for replacements. Previously cited version identifiers keep their original bytes. If validation or scanning fails, the prior ready version stays current. Failed versions offer processing retry; if the transfer never reached storage, select the file and upload again. Byte-identical storage writes are idempotent; a different file requires a new version reservation.

Notes and memos support Markdown formatting with raw HTML disabled. Evidence links point to specific document versions or note revisions. Owners default to the creator. Save explicitly. If another author has saved first, compare the latest saved revision with the preserved draft, then explicitly rebase or reload. Research can be archived and restored by administrators; cited sources and earlier revisions remain available.

## Recovery and maintenance

- After an interrupted upload, retry processing from its document. An administrator can POST `{}` to `/api/research/reconcile/` with their authenticated same-origin browser session to mark pending reservations older than 24 hours failed. This operation does not remove retained sources.
- Run `pnpm --filter @repo/web research:reconcile-storage` for a dry run of orphan cleanup; add `--apply` to remove objects older than 24 hours absent from every firm's reserved document-version IDs. This is retryable and retains all historical, archived, pending, and quarantined versions. Run against the database paired with that exact storage directory; never use a partial restored database to reconcile complete storage.
- Storage writes may survive a database rollback. A retry with identical bytes safely reuses the object; no existing object is overwritten. Review storage inventory against every firm's document-version IDs before removing orphan files. Never remove an object merely because it is not the current version.
- Temporary `.upload-*` files may remain if a process is killed during disk writes. Stop writers before cleaning old temporary files. Successful writes remove their temporary links automatically.
- Keep rejected files quarantined until an administrator applies the firm's retention policy. The application does not expose hard deletion or automatic destructive expiry.
- Back up PostgreSQL and private storage together and test restoration. Database revisions without their matching objects cannot reconstruct evidence. A missing object returns an unavailable error without exposing filesystem details.
- Audit events are retained in the firm aggregate. Metadata search covers titles/categories/descriptions, not text inside uploaded files.

## Deployment constraints and pending rollout decisions

Use a Next.js Node server, PostgreSQL, a private ClamAV service, and persistent disk shared by all application processes. An ephemeral/serverless filesystem is unsuitable for this storage adapter. Never point the storage path inside `public/`, a static hosting directory, or a directory served by another web server. A hosted object-store adapter can replace the disk port later.

The first implementation serializes firm writes and stores a firm's research metadata and revision history in one PostgreSQL JSONB aggregate. This gives atomic revision and citation updates for a small team; large libraries, large revision histories, and high write concurrency require normalized storage and paginated queries. File bytes stay outside PostgreSQL. File inspection holds the firm transaction for up to the scanner timeout, so schedule capacity accordingly.

Confirm storage region, access/retention policy, legal-hold requirements, backup retention, supported file limits, and firm confidentiality before real-document rollout. No hard-delete or investment approval workflow is shipped. Authentication uses the existing Clerk application; configuring production keys and live-account testing remains an operator step.

## Verification

```sh
pnpm --filter @repo/web test
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web lint
pnpm --filter @repo/web build
pnpm --filter @repo/web test:research:e2e
```

Set `TEST_DATABASE_URL` to a **local** disposable PostgreSQL database to enable repository integration tests. They create and drop uniquely named schemas. The research browser suite runs a standalone test-only harness outside shipped routes, using the real workspace component and application service with fixture identity, persistence, and inspection ports. It verifies authoring, edits, revisions, and recovery; it does not claim live Clerk or real ClamAV coverage. Separate file-adapter tests exercise the actual ClamAV wire protocol against a local protocol fixture and enforce failure behavior.

## Verified local instance

The local configuration and real signed-in verification were completed on 24 October 2026. See [the local verification report](research-and-diligence-local-verification.md) for the app URL, private storage, antivirus services, retained synthetic fixtures, checks, and one browser-dialog limitation. No production resources were modified.
