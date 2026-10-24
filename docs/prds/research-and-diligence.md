# Domain Plan: Research & Diligence
**Document upload, research notes, and investment memo drafts**

**Status:** MVP implemented and verified locally (25 October 2026)
**Primary users:** Analysts, associates, principals, and partners
**Product context:** Internal workspace for gathering evidence and developing an investment assessment.

## Purpose

Research & Diligence gives the investment team a shared place to collect documents, record what they learn, and turn that work into a memo draft. An investor should be able to follow an assessment back to its supporting material and understand which questions remain open.

The initial workflow is deliberately small: open a company's research workspace, upload evidence, write notes, and assemble a versioned memo. Research can begin before a deal exists and should remain available after a deal is passed or invested.

## Domain Boundary

Research & Diligence owns:

- Uploaded research documents, their metadata, versions, and availability state.
- Authored research notes, revisions, and references to evidence.
- Memo drafts, section content, saved revisions, and source references.
- The association of research with a company and, optionally, a specific deal.

Adjacent domains own:

- **Company Intelligence:** canonical company identity, company facts, external signals, and provenance for those facts. A research document can support a company fact through a reference; uploading it does not automatically publish or verify a fact.
- **Deal Pipeline:** deal stages, ownership, next steps, and outcomes. Writing or completing a memo does not move a deal or approve an investment.
- **Relationship Management:** people, introductions, and interaction history. Research notes can reference an interaction without becoming the authoritative interaction record.
- **Portfolio Management:** post-investment reporting and operating workflows.
- **Application platform:** user identity, firm membership, authorization primitives, and shared audit infrastructure.

Deal Pipeline's lightweight deal notes remain coordination context. Substantive research notes and memo drafts belong here; deal screens should link to this workspace rather than maintain a second research store. Company Intelligence annotations remain interpretations attached to particular facts or signals.

## Goals and Success Measures

| Goal | Proposed measure |
|---|---|
| Make research easy to retrieve | Pilot users can find a company's documents, notes, and current memo from one workspace |
| Preserve the reasoning behind an assessment | Material memo claims can link to supporting documents or notes; unsupported assessments are clearly identified |
| Reduce repeated preparation | Median time to assemble a memo draft improves against the team's existing process |
| Prevent lost work | Successful saves survive reload; concurrent edits never silently overwrite another author's changes |
| Keep confidential material private | Access tests pass across uploads, downloads, search, revisions, and source references |

Establish preparation-time and retrieval baselines with the pilot team before setting numerical targets.

## Domain Model

| Concept | Definition |
|---|---|
| **Research workspace** | A company-scoped view of research, optionally filtered to a deal; not a separate copy of the company |
| **Document** | A logical evidence item, such as a pitch deck, financial report, or market study |
| **Document version** | An immutable uploaded file with its own storage key, checksum, uploader, timestamp, and processing state |
| **Research note** | An authored observation, interpretation, or open question, linked to a company and optionally a deal |
| **Note revision** | A saved snapshot preserving a note's previous content and author |
| **Memo draft** | A structured assessment linked to a company and optionally a deal, with an accountable owner |
| **Memo revision** | A saved snapshot of the memo's sections and source references |
| **Evidence reference** | A link to a specific document version, note revision, or accessible Company Intelligence source, with an optional page or section locator |

Every record belongs to one firm. Company and optional deal references must resolve within that firm; a linked deal must concern the same company. Multiple memos can exist for different rounds or investment questions, and their names and deal context must distinguish them.

## User Stories

1. As an analyst, I want to upload a pitch deck to a company, so that the team can find the original evidence.
2. As an investor, I want to identify a document's uploader, date, and version, so that I know which material I am reviewing.
3. As an analyst, I want to add a replacement version without breaking existing citations, so that earlier assessments remain understandable.
4. As an investor, I want to write research notes and open questions, so that observations do not disappear into private documents.
5. As an analyst, I want to reference a document page or source from a note, so that colleagues can verify my interpretation.
6. As a deal owner, I want to filter research to the current deal while still seeing company-wide material, so that separate rounds retain their context.
7. As an analyst, I want a consistent memo template, so that I can develop an assessment without starting from a blank page.
8. As a partner, I want to read a memo and inspect its evidence and unresolved questions, so that I can challenge the reasoning.
9. As an author, I want clear save feedback and recoverable revision history, so that edits are not lost.
10. As an authorized colleague, I want to continue editing a memo while preserving earlier revisions, so that the team can collaborate over time.

## Functional Requirements

### Document upload and retrieval

- MVP accepts PDF and DOCX files, with a proposed limit of 25 MB per file. Confirm these limits with pilot users before implementation.
- Validate authorization, extension, detected file type, and size on the server. Reject unsupported or password-protected files with an actionable message.
- Upload into private quarantine storage and verify the completed object before making it available. Malware scanning is required before download or preview; unavailable or failed scanning must leave the file inaccessible with a retryable state.
- Show upload and processing progress, plus distinct pending, ready, rejected, and failed states. A completed byte transfer alone must not appear as a ready document.
- Store title, category, optional description, original filename, uploader, timestamps, and version information. Initial categories are Pitch deck, Financials, Market research, and Other.
- Allow metadata edits and explicit upload of a new version. Never replace the bytes behind an existing version identifier.
- Allow authorized downloads of ready versions. PDF preview may use a private, authorized viewer; DOCX download is sufficient for MVP. Text extraction and OCR are deferred.
- Authorize every file request and issue short-lived download access only after checking current permissions. Never expose permanent public object URLs.
- Archive documents from default lists while retaining cited versions. Hard deletion and retention policies must be agreed before production rollout; unavailable evidence must remain visibly identified in existing references.

### Research notes

- Create, edit, and archive a note with a title, body, author, company, and optional deal context.
- Support basic formatting, links, and evidence references. Sanitize rendered content and external links.
- Make observations, interpretations, and open questions distinguishable through simple labels. A note is an author's assessment, not a verified company fact.
- Show creation and last-edit details. Preserve prior saved content in note revisions.
- Provide explicit save with unsaved, saving, saved, and failed feedback. Navigation with unsaved changes must offer a chance to keep editing.
- Detect stale edits using a revision token. Preserve the user's unsaved text and allow comparison with the latest saved revision rather than silently overwriting it.

### Memo drafts

- Create a named memo from a fixed initial template: Investment thesis, Company and product, Market, Team, Traction and financials, Risks, Open questions, and Recommendation.
- Allow sections to remain empty and visibly incomplete. A recommendation is optional and represents an authored assessment.
- Support an owner and sequential editing by authorized team members, with the same save and conflict behavior as notes. Real-time co-editing is deferred.
- Save all sections and evidence references atomically as a new revision. Show revision author and timestamp; make previous revisions readable.
- Pin evidence references to document versions or note revisions. New evidence versions must not silently change what a saved memo cites.
- Allow references to be updated explicitly in a subsequent memo revision. Display archived, removed, or inaccessible sources accurately without revealing restricted content.
- Provide a read view of the latest saved draft and an index of earlier drafts and revisions. MVP has no approved or investment-ready status.

### Workspace navigation and permissions

- Offer Documents, Notes, and Memos within a company's research workspace, accessible from company and deal detail views when those domains exist.
- Provide title and metadata search, category/type filters, and sorting by last update. Full-text search inside uploaded files is deferred.
- Clearly label deal-specific material. A deal-filtered view includes company-wide material and material for that deal, excluding material scoped only to other deals.
- Proposed MVP access is shared within an authorized firm, with viewers, contributors, and administrators. Viewers read; contributors upload and edit research; administrators manage archive and retention actions. Confirm this model before implementation.
- Enforce access in application use cases and file delivery, including revision views, search results, and evidence links. Do not rely on hidden buttons or unguessable identifiers.
- Record material changes, upload outcomes, archives, and file-access issuance with actor and timestamp. Avoid logging file contents or signed download URLs.

## Core Workflows and Acceptance Criteria

| Workflow | Acceptance criteria |
|---|---|
| Upload evidence | A valid file progresses from pending to ready after validation and scanning; rejected or failed files cannot be downloaded and offer clear recovery |
| Replace a document | A new immutable version becomes current; an older memo still opens the exact version it cited |
| Capture research | A saved note appears in the correct company/deal context, exposes its author and evidence, and survives reload |
| Resolve an edit conflict | A stale save is rejected without losing the submitted text; the author can compare and submit against the latest revision |
| Draft a memo | An author fills template sections, cites evidence, saves, and opens the complete saved revision |
| Revisit an assessment | A reader can open an earlier memo revision and identify its original evidence and any unavailable sources |
| Close a deal | Research remains accessible under the company after the linked deal is passed or invested |
| Enforce access | A user from another firm cannot discover record metadata or obtain files through search, direct IDs, revisions, or citations |
| Archive evidence | The item leaves default lists, existing citations remain intelligible, and retained versions remain accessible to authorized readers |

## Implementation Shape

Use the existing modular monolith and hexagonal slice conventions. The current app provides a users example; company, deal, authentication, storage, and background processing integrations still need implementation.

```text
apps/web/src/modules/research-and-diligence/
  domain/            # Documents, notes, memos, revisions, invariants, repository ports
  application/       # Upload lifecycle, research editing, memo revision and query use cases
  infrastructure/    # Drizzle repositories, private storage and scanner adapters
  presentation/      # HTTP validation, response mapping, delivery adapters
```

Keep domain and application code independent of Next.js, Drizzle, storage SDKs, and environment access. Wire dependencies through the composition root. Introduce ports for private object storage, file inspection/scanning, authorization, and company/deal lookups; do not make adjacent domains write this domain's tables.

### Initial persistence concepts

- `research_documents` and `research_document_versions`: firm/company/deal scope, metadata, immutable object identifiers, checksums, processing states, current-ready-version pointer, archive details, and timestamps.
- `research_notes` and `research_note_revisions`: scope, title, labels, current revision token, authored content snapshots, author, and timestamps.
- `research_memos` and `research_memo_revisions`: scope, name, owner, template version, current revision token, complete section snapshots, author, and timestamps.
- Revision-scoped evidence references: typed target identifiers and optional locators. Use explicit foreign keys or validated target adapters rather than unchecked arbitrary record IDs.
- Audit events and durable upload-processing jobs, using shared platform facilities if available.

Database metadata and object storage cannot commit in one transaction. Reserve an upload/version identifier, transfer into quarantine, verify and scan, then atomically publish its ready state and current-version pointer. Retries must be idempotent; duplicate callbacks must not create duplicate versions or audit transitions. A failed replacement leaves the prior ready version current. Clean up abandoned uploads and orphan objects through retryable reconciliation.

Use a database transaction for each note or memo revision and its references, with an expected-current-revision check. Do not persist expiring file URLs as evidence identifiers.

## Delivery Sequence

1. **Foundation and access:** establish authenticated firm membership, company/deal reference adapters, access policy, private storage, scanning, and retention decisions. Deliver an authorized empty research workspace.
2. **Documents:** implement upload reservation, quarantine, validation/scanning, recovery, downloads, version replacement, metadata search, and archive behavior. Verify a complete upload-to-download flow and failed replacement recovery.
3. **Notes:** add authored notes, source references, revision history, explicit saves, and conflict handling. Verify concurrent editors and company/deal filtering.
4. **Memo drafts:** add the fixed template, atomic revision saves, pinned citations, and revision reading. Verify that changing source material preserves earlier memo evidence.
5. **Pilot and hardening:** exercise representative confidential documents, interrupted uploads, permission changes, storage failures, and the full evidence-to-memo journey. Confirm recovery procedures and success measures before rollout.

Each stage should deliver a working vertical slice. No company or deal domain is assumed to be implemented merely because a plan exists; integration must use real authorized records before rollout.

## Testing Decisions

Focus on observable behavior across application, persistence, and storage boundaries:

- Firm isolation and role enforcement across every record, revision, file, search result, and evidence reference.
- File size/type enforcement, malicious and encrypted inputs, scan rejection, outages, and interrupted transfers.
- Idempotent upload completion, processing retries, abandoned objects, and failed version replacement.
- Immutable source versions and citation integrity after source edits, archives, or removal.
- Atomic memo saves, revision history, concurrent-edit conflicts, and unsaved-text recovery.
- Valid company/deal associations and research retention after deal outcomes.
- Sanitized note/memo rendering and safe file delivery.
- An end-to-end journey covering upload, note creation, memo drafting, source inspection, and reopening an older revision.

Use in-memory ports for domain/application tests, PostgreSQL integration tests for atomic revisions and scoped queries, storage/scanner contract tests, and browser tests for the authoring journey and failure feedback.

## Delivery Scope

**MVP:** Company/deal-linked research workspace; private PDF/DOCX upload and download; validation and malware scanning; document versions and archives; authored notes and revisions; a fixed memo template with pinned evidence and saved revisions; metadata search; firm-level permissions; and audit history.

**Next:** Additional file formats, full-text extraction and OCR, richer memo templates, comments, export, granular restricted research groups, real-time editing, and structured diligence checklists with owners and due dates.

**Out of scope:** AI summaries or memo generation, automated investment recommendations, external data-room synchronization, investor/founder sharing, electronic signatures, investment committee voting or approvals, financial modeling, and automatic company-fact or pipeline-stage updates.

## Assumptions to Confirm Before Implementation

- The pilot is one firm with shared research; if deal-level confidentiality is required, implement that policy before ingesting real documents.
- Company identity is required for saved research; a deal link is optional. Confirm how provisional Deal Pipeline companies become canonical before attaching research.
- Confirm accepted file formats, size limits, storage volume, hosting region, and the chosen private storage and scanning services.
- Agree retention periods, legal-hold handling where applicable, hard-delete authority, backup retention, and behavior of citations after deletion.
- Confirm the memo template and whether Markdown-like basic formatting is sufficient for the initial editor.
- Authentication and firm authorization are rollout prerequisites; the existing users slice alone does not supply them.
