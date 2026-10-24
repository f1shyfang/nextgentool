# Domain Plan: Deal Pipeline
**Simple Kanban workflow for investment opportunities**
> Application ownership resolved: the public website and authenticated dashboard have been consolidated into `apps/web`. Build all new investment UI and backend modules there. Earlier references below to a separate replica describe the pre-consolidation state.


**Status:** Draft for review\
**Primary users:** Analysts, associates, principals, and partners\
**Product context:** Internal workflow for tracking potential investments from initial sourcing through a decision.

## Purpose

Deal Pipeline gives the investment team one shared place to see which opportunities are being considered, who is responsible for them, and what should happen next. The first version is a simple Kanban board: each deal appears as a card in one stage, and moving the card records a stage change.

The workflow should be quick to maintain during sourcing and useful in pipeline reviews. It is not a full CRM, research system, or investment committee platform.

## Domain Boundary

Deal Pipeline owns:

- Deal records and their investment workflow state.
- Configurable or agreed pipeline stages and the ordered movement of deals through them.
- Deal ownership, next steps, and stage-change history.
- Links from a deal to the canonical company record.

Adjacent domains own:

- **Company Intelligence:** canonical company identity, profile, and external signals.
- **Relationship Management:** people, relationships, introductions, and interaction history.
- **Portfolio Management:** records and workflows after an investment is made.

A company can exist without a deal. A deal represents the firm’s consideration of a possible investment in that company. The deal should reference the canonical company identity rather than copy and maintain a separate company profile.

## Goals and Success Measures

| Goal | Proposed measure |
|---|---|
| Make current opportunities visible | Team members can find a deal and its current stage from the shared board |
| Keep the board current | A deal’s owner and next step are available for active opportunities |
| Make pipeline reviews easier | Reviewers can identify stage changes and stale next steps without assembling a separate spreadsheet |
| Keep workflow lightweight | Adding or moving a deal requires only a small number of fields and actions |

Establish baselines with the pilot team and confirm targets before rollout.

## Domain Model

| Concept | Definition |
|---|---|
| **Deal** | The firm’s evaluation of a potential investment in a company |
| **Company reference** | Link to the canonical company record; a deal may begin with a provisional company reference if no canonical record exists yet |
| **Pipeline stage** | An ordered workflow state, such as Inbox, Screening, Evaluation, or Passed |
| **Deal owner** | The team member accountable for progressing or closing the deal |
| **Next step** | A short action describing the next intended movement or investigation |
| **Stage transition** | A recorded movement from one stage to another, including actor and time |
| **Deal note** | Internal context attached to the deal; notes are distinct from sourced company facts |

For the initial workflow, each active deal occupies exactly one stage. Passed and invested deals are terminal outcomes and do not appear among active Kanban columns by default.

## Initial Workflow

Use a small, ordered stage set that teams can understand without process training:

1. **Inbox** — Captured, not yet screened.
2. **Screening** — Initial fit and opportunity review.
3. **Evaluation** — Active diligence or partner evaluation.
4. **Decision** — A near-term invest or pass decision is being prepared.
5. **Passed** — The firm has decided not to proceed.
6. **Invested** — The firm has made an investment; subsequent ownership belongs to Portfolio Management.

The four active stages form the default Kanban board. Passed and Invested are searchable terminal outcomes, accessible through filters or a history view. Stage names and transitions should be configurable later if teams need a different process; MVP should avoid a general workflow designer.

## User Stories

1. As an investor, I want to see active deals grouped by stage, so that I can understand the pipeline at a glance.
2. As an investor, I want to add a deal with a company, stage, and owner, so that a new opportunity is visible quickly.
3. As an investor, I want to move a deal between stages, so that the board reflects its current state.
4. As an investor, I want to see who moved a deal and when, so that stage changes have context.
5. As a deal owner, I want to record a concise next step and due date, so that I know what action to take and when.
6. As a team member, I want to open a deal and read its notes, so that context is not lost in a card title or private spreadsheet.
7. As an investor, I want to find deals by company, owner, or stage, so that I can prepare for a review.
8. As an authorized team member, I want to mark a deal Passed or Invested with an optional reason, so that outcomes are clear.
9. As an investor, I want to link a deal to a canonical company profile, so that pipeline work can use shared company information without duplicating it.

## Functional Requirements

### Kanban board

- Show one column per active stage, in configured order.
- Show deal name, company, owner, next-step due date, and last stage movement on each card.
- Allow a user to move a deal to another stage using a simple board interaction and an accessible equivalent action.
- Persist a successful move and update the card and stage counts. If saving fails, restore the previous position and show a recoverable error.
- Provide a list or search result view for users who prefer not to navigate a board.
- Support basic filtering by owner, stage, and text query.

### Deal creation and detail

- Create a deal with a company reference or provisional company name, a stage, and an owner.
- Allow editing of the deal name, owner, next step, due date, and internal notes.
- Show the deal’s current stage and a chronological stage-transition history.
- Preserve the distinction between internal deal notes and sourced company facts.
- When a canonical company is available, provide a link to its profile and show its name consistently.

### Outcomes

- Moving to Passed or Invested requires confirmation and may include a short rationale.
- Terminal deals are removed from the default active board but remain searchable and reviewable.
- Reopening a terminal deal returns it to an active stage and records a new transition; prior history remains intact.
- Marking a deal Invested may link or hand off to a future Portfolio Management record. It does not itself implement portfolio reporting.

### Permissions and accountability

- All authorized team members can view shared pipeline records.
- Authorized users can create and edit deals and move them between stages.
- Record the actor and timestamp for stage transitions and material edits.
- Apply firm-level access rules consistently to board, search, and deal detail.

## Core Workflows and Acceptance Criteria

| Workflow | Acceptance criteria |
|---|---|
| Review the pipeline | Active deals appear in the correct ordered columns with owner and next-step context |
| Add an opportunity | A user can create a deal linked to an existing company or with a provisional name, and it appears in the selected stage |
| Move a deal | A successful move updates its stage and creates a transition record; a failed move leaves the persisted state unchanged and gives clear feedback |
| Prepare a review | A user can filter by owner or stage, search by company or deal name, and inspect next steps and stage history |
| Close an opportunity | A user can pass or mark invested with optional rationale; the deal leaves the active board and remains searchable |
| Reopen a deal | A user can return a terminal deal to an active stage without erasing its earlier outcome or transition history |
| Link company research | Opening the company reference takes the user to the canonical profile without creating a duplicate company |

## Implementation Shape

Follow the repository’s modular monolith and hexagonal slice conventions. Keep the domain and application layers independent of Next.js and Drizzle.

```text
apps/web/src/modules/deal-pipeline/
  domain/            # Deal, PipelineStage, StageTransition, repository ports, invariants
  application/       # CreateDeal, UpdateDeal, MoveDeal, CloseDeal, ReopenDeal use cases
  infrastructure/    # Drizzle schema and repository adapters
  presentation/      # API routes and request/response mapping
```

The UI can live in the web app’s presentation layer or adjacent feature components, but board interactions should call application use cases rather than write directly to the database. The composition root wires repositories and use cases.

### Initial persistence concepts

- `deals`: id, display name, company reference (nullable for provisional records), current stage, owner, next-step text, next-step due date, outcome rationale, created/updated timestamps.
- `deal_stage_transitions`: id, deal id, from stage, to stage, actor, timestamp, optional rationale.
- `deal_notes`: id, deal id, author, body, timestamp; consider omitting a separate notes table in the first cut if a single editable summary note meets the pilot need.

Stages may be represented as a constrained code enum for the initial fixed workflow. Introduce a firm-scoped `pipeline_stages` table only when customization is confirmed. Store terminal outcome changes through the same transition history as regular movement.

### MVP decisions and invariants

- Use the six fixed stages above. Permit forward and backward moves between any active stages; no approvals or mandatory intermediate stages.
- Require one owner and either a canonical company reference or a non-empty provisional company name. Default new deals to Inbox and the creating user as owner; allow both to be changed during creation.
- Keep the next step and due date optional so capture stays quick. Highlight missing next steps and overdue dates during reviews. Store due dates as calendar dates and audit timestamps in UTC.
- Use one editable internal summary note for MVP. Record material edits with actor, time, and changed fields; defer a separate discussion or notes feed.
- Include `firm_id`, `created_by`, `version`, and a provisional company name in persistence. Derive firm and actor from the authenticated session, and validate that owners and company references are accessible to that firm.
- Create a deal and its initial transition from no stage in one transaction. Every subsequent stage change updates the deal and appends exactly one transition in one transaction.
- Require an expected version for edits and moves. Reject stale updates with a conflict response and reload the latest deal before retrying. Moving to the current stage is a no-op.
- Give mutations a request identifier scoped to firm and operation. Retrying the same request returns its original result; reusing the identifier with a different payload is rejected.
- Store closure rationale on the transition that records the outcome. If a current rationale is also stored on the deal, clear it when reopening; retain all historical rationales.
- Show active cards by most recent stage entry, then deal ID for stable ordering. Moving within a column does not change ordering in MVP.
- Allow multiple opportunities for one company, since later financing rounds can be distinct deals. Show existing active deals when adding another opportunity for the same canonical company.
- Exclude permanent deletion from MVP. Closing and reopening preserve the record and its history.

### Application and presentation contract

Keep board reads separate from mutations: `ListDeals` returns authorized cards and counts under the same filters; `GetDeal` returns detail and history. `CreateDeal`, `UpdateDeal`, `MoveDeal`, `CloseDeal`, and `ReopenDeal` enforce the rules above through repository ports.

Use a dedicated company lookup port to resolve accessible canonical company IDs. Provisional capture must work before Company Intelligence is implemented; later linking updates the deal reference without creating or editing a company profile.

The board needs loading, empty, filtered-empty, saving, failure, and conflict states. Provide a Move action with a stage selector for keyboard, touch, and assistive technology; drag-and-drop can use the same application command. Closing uses a confirmation dialog, and reopening requires selecting an active stage. Search and filters should be reflected in the URL so a pipeline review can be shared.

## Delivery Plan

| Step | Work | Completion criteria |
|---|---|---|
| 1. Establish platform contracts | Define authenticated actor, firm membership, eligible owners, and company lookup interfaces; confirm the app hosting the feature | Reads and writes have an explicit access boundary; provisional company capture has no dependency on company ingestion |
| 2. Persist the workflow | Add domain types, repository ports, Drizzle tables and migrations, audit records, version checks, and request deduplication | Creation, movement, closure, and reopening have atomic persistence and preserve history |
| 3. Deliver the first usable slice | Add create deal, board query, four active columns, detail view, and accessible stage movement | A team member can capture an opportunity, see it on the board, move it, and inspect its history |
| 4. Complete daily review | Add owner and summary editing, next steps and dates, text search, owner/stage filters, and a list view | Reviewers can find opportunities, identify overdue work, and handle empty, failed-save, and conflict states |
| 5. Complete outcomes and company linking | Add Passed/Invested confirmation, outcome search, reopening, and canonical company linking when available | Closed deals leave the active board, remain discoverable, and can return without losing history |
| 6. Pilot and refine | Walk through the acceptance criteria with a small investment team and measure capture/review friction | The team agrees the stage names and card information support a pipeline review before wider rollout |

Build in `apps/web` using the existing module conventions by default. The repository also contains a separate `nextgen-replica` frontend; confirm the intended product surface before UI implementation so the feature is delivered in the app the team will use. Authentication and firm membership are prerequisites for shared rollout, since the current starter's user slice does not supply them.

## Testing Decisions

Focus tests on observable behavior and domain invariants:

- A deal has one current stage and valid stage transitions.
- Stage moves update current state and append one transition atomically.
- Repeated requests do not create duplicate transitions when the application retries an operation.
- Closing and reopening preserve prior stage and outcome history.
- Company references cannot accidentally create or mutate canonical company records.
- Board queries return only the authorized firm’s records, ordered by stage and card ordering.
- Failed persistence does not report a successful move.
- Search and filters combine correctly for owner, stage, and company/deal text.

## Delivery Scope

**MVP:** Shared board with four active columns, fixed terminal outcomes, create/edit deal, owner and next step, move between stages, stage history, basic search and filters, and company linking where the Company Intelligence identity is available.

**Next:** Firm-configurable stages, card ordering within columns, richer notes and attachments, reminders, team notifications, activity feed, and deeper handoff to relationship and portfolio workflows.

## Out of Scope

- Company profiles, external data gathering, or signal monitoring.
- Contact management, relationship graphs, email/calendar sync, or introduction workflows.
- Investment committee scheduling, voting, approvals, or document-room diligence.
- Valuation models, portfolio monitoring, or fund accounting.
- Complex automation rules, multiple simultaneous pipeline boards, or workflow scripting.
- AI-generated investment scores or autonomous stage changes.

## Assumptions to Confirm Before Implementation

- The initial team is one firm with a shared pipeline and a small fixed stage set.
- The board is primarily a visibility and lightweight coordination tool; existing diligence processes remain in place.
- A deal may be captured before a canonical company profile is available.
- User identity and firm-level authorization will be supplied by the application platform.
- Confirm whether deals need multiple owners, card drag-and-drop, and configurable stages before implementation; the MVP assumes one owner, simple movement, and fixed stages.
