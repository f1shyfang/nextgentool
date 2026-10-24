# Deal Pipeline setup

The MVP is served at `/pipeline` in `apps/web`. The signed-in dashboard links to it. All pipeline reads and writes require a Clerk session and an enabled PostgreSQL firm membership. Creating a Clerk account alone does not grant access.

## Local setup

From the repository root:

```sh
pnpm install
cp apps/web/.env.example apps/web/.env
```

Set `DATABASE_URL` to your PostgreSQL database. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in the ignored `apps/web/.env.local`, using the existing Clerk application. Remote database URLs require `sslmode=verify-full`.

```sh
pnpm db:migrate
```

Migration `0003_deal_pipeline.sql` creates the pipeline tables and stage enum. It does not populate opportunities or grant access. Review and apply migrations through the normal deployment process for shared environments.

## Provision access

Use the Clerk user ID from your existing Clerk application's user record. The script writes only to your configured PostgreSQL database; it does not create Clerk users or send invitations.

Create a firm and its first member:

```sh
pnpm --filter @repo/web pipeline:member --user-id user_REPLACE --name "Michael" --firm-name "NextGen Ventures"
```

The command prints the firm ID. Use that same ID for every additional member:

```sh
pnpm --filter @repo/web pipeline:member --user-id user_REPLACE --name "Team member" --firm-id REPLACE_WITH_FIRM_UUID
```

Running the command again with an existing user's firm ID updates their name and re-enables access. A user can belong to one pipeline firm in this MVP; reassignment is rejected to preserve ownership and audit history.

Disable access without deleting historical ownership:

```sh
pnpm --filter @repo/web pipeline:member --user-id user_REPLACE --disable
```

Run the application and sign in:

```sh
pnpm dev
```

Open `/pipeline`. A signed-in account with no enabled membership sees an access-required screen. No development impersonation or authentication bypass is provided by the pipeline.

## Delivered workflow

- Four active stages: Inbox, Screening, Evaluation, Decision.
- Forward and backward moves through an accessible stage selector.
- Passed and Invested outcomes require explicit confirmation; optional rationale remains in history after reopening.
- Board/list views, URL search and owner/stage filters, and active/closed/all views.
- One owner, optional next step and calendar due date, editable internal summary, and chronological audit history.
- Atomic deal changes and audit events; optimistic versions protect concurrent edits.
- Mutation request IDs preserve the original result on retry by the same firm member. A different operation or payload cannot reuse an ID.
- Active cards sort by latest stage entry, then ID. Manual ordering and drag-and-drop are deferred.

## Company Intelligence integration

Canonical lookup now uses the Company Intelligence application service. Migration `0008_pipeline_company_connection.sql` adds an explicit nullable `pipeline_firms.research_firm_id` foreign key and aligns company/deal names with Company Intelligence's 200-character limit.

An administrator must connect the Pipeline firm to the intended Research/Company Intelligence firm. Firm names and shared users never infer equivalence:

```sh
pnpm --filter @repo/web pipeline:member --user-id user_REPLACE --name "Team member" --firm-id PIPELINE_FIRM_UUID --research-firm-id RESEARCH_FIRM_UUID
```

This configures the whole pipeline firm's canonical registry; it does not grant Research membership. Users need both an enabled Pipeline membership and an existing Research membership in the mapped firm. Research viewers can search and open profiles; their Pipeline permission still controls deal writes. Provision Research access separately using the established administrator process. Missing mapping or access makes search unavailable; provisional capture remains usable.

Search matches canonical company names/domains (up to25 results). Selection stores an authoritative ID/name and `/companies/:id/` profile path resolved on the server. Client company names cannot override a selected canonical identity. Existing active opportunities show an advisory and do not prevent a distinct opportunity. Editing the company text clears the selection; save to keep a provisional name or search/select another canonical company. The pipeline never creates or edits canonical company research.

Persisted company name and URL are display snapshots. Unrelated edits to an existing association retain its snapshot even if Company Intelligence access changes; opening its profile still requires current Research access. New canonical associations always recheck membership. Identity renames/merges do not automatically rewrite historical pipeline snapshots.

## Deployment notes

Supply Clerk keys, a persistent PostgreSQL database, and provisioned firm memberships before shared use. Keep the internal application behind its authentication checks. Pipeline membership is currently separate from research/knowledge domain membership. The application performs no portfolio creation, notifications, external company ingestion, or deletion of deals.

## Local implementation record

The development database `nextgentool_pipeline` was created locally and migrated. The approved existing Clerk development configuration was copied to the ignored app environment file. At the user's request, the existing development account was provisioned into a local NextGen Ventures firm; the account has the display name “Team member” because its Clerk profile has no name. Firm ID: `74a6f8f4-ec0f-46c9-a728-e4609f58bccd`. No production database or Clerk account settings were changed.

The local Pipeline firm is explicitly connected to existing Research firm `859834c3-4164-4ceb-90a3-81bffb05ca63`. The approved account already had Research admin membership; this task added no new Research membership.
