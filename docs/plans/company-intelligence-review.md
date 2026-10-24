# Company Intelligence implementation plan review

**Reviewed:** 24 October 2026\
**Plan:** [Implementation plan](company-intelligence.md)\
**Verdict:** Start with a bounded manual-research backend slice. Preserve the later stages and their acceptance criteria; do not claim the platform or manual-research milestones complete yet.

## Verified findings

| Priority | Finding | Execution adjustment |
|---|---|---|
| P1 | Membership foundations already exist in Research and Pipeline, with different firm identifiers and role models. Creating another access directory would fragment authorization further. | Reuse Clerk identity and Research's explicitly provisioned firm memberships for Company Intelligence. Map viewer/contributor/admin to read/research/admin behavior. Do not infer a cross-domain firm mapping from a shared user. |
| P1 | Migration count and schema-discovery assumptions are stale. Concurrent domain work has added migrations and already broadened schema discovery. | Preserve the current journal; append an intelligence-only generated migration after all current entries. Verify the complete migration chain in isolated schemas and a dedicated local database. |
| P1 | The first stage mixes shared-platform refactoring, authentication, browser infrastructure, and domain behavior. Shared files are actively changing for adjacent domains. | Avoid rewriting shared membership, layout, composition roots, or existing persistence. Introduce a separate, injected intelligence repository and authenticated API composition; revisit shared connection/platform extraction deliberately. |
| P2 | Stage 2 includes licensed evidence access, while its first useful manual workflow does not require a live provider. | Implement manually entered firm-visible evidence only. Keep provider ingestion, licensed-source grants, and access-aware provider derivatives disabled/unimplemented until their contracts are validated. This is not acceptance of provider entitlement requirements. |
| P2 | The plan assumes API and database primitives but lacks a concrete first executable handover. | Supply create/list/profile/fact/review/pin/release routes, structured errors, no-store responses, request replay, version checks, audit, PostgreSQL tests, and an API usage guide. UI remains a subsequent deliverable. |
| P2 | Existing opt-in database tests are skipped unless CI provides a test connection. | Add a PostgreSQL CI service, TEST_DATABASE_URL, and migration verification. Run the new PostgreSQL checks locally without skips. |

## Decisions for the first slice

- Target `apps/web`, consistent with its current product document and adjacent build records.
- Use Research firm identity and membership as the explicit access authority; public registration and the starter users endpoint grant no membership.
- Keep company identity and sourced assertions in normalized tables. Do not synchronize Research's existing JSON company registry or Pipeline's provisional companies implicitly.
- All company writes serialize on the existing Research firm lock, matching its administration lock order. This is a conservative small-team starting point; benchmark contention before scaling.
- Store immutable fact values and source references, with current review status and an append-only review/audit trail. Compute profiles on read for this bounded slice rather than maintaining an unused profile projection.
- Prefer verified eligible facts, then observation time, then stable assertion ID. Suspend an ineligible pinned value without deleting the pin. Provider precedence, effective-date policies, supersession mutation, and vocabulary management remain incomplete.
- Use UUID pagination within firm-scoped manual identity search for now. Filter-bound opaque cursors and richer discovery are not claimed complete.
- Preserve the shared dirty checkout. Do not merge remote changes, move branches, stage unrelated files, push, or open a PR as a side effect of starting implementation.

## Review and verification

Independent read-only review confirmed firm-scoped queries, composite foreign keys, membership rechecks, transactional audit/request persistence, and duplicate-check serialization for the declared slice. It found an uppercase UUID comparison bug affecting child review/override operations; IDs are now normalized before comparisons and request fingerprints, with a regression test.

Final independent review found no additional confirmed issue within the declared backend scope. Actual authenticated HTTP end-to-end verification remains incomplete because of the existing Clerk development proxy behavior; see the build record for the exact observation.

See the [build record](company-intelligence-build.md) for actual completed work, commands, evidence, limitations, and the next stage. This review does not replace the original stage gates or authorize provider rollout.
