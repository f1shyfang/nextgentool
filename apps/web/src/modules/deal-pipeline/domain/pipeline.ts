export const ACTIVE_STAGES = [
  "inbox",
  "screening",
  "evaluation",
  "decision",
] as const;
export const STAGES = [...ACTIVE_STAGES, "passed", "invested"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  inbox: "Inbox",
  screening: "Screening",
  evaluation: "Evaluation",
  decision: "Decision",
  passed: "Passed",
  invested: "Invested",
};
export function isActiveStage(stage: Stage) {
  return (ACTIVE_STAGES as readonly string[]).includes(stage);
}
export type PipelineContext = { firmId: string; memberId: string };
export type Member = { id: string; name: string };
export type CompanyReference = { id: string; name: string; href: string };
export type Deal = {
  id: string;
  firmId: string;
  name: string;
  companyId: string | null;
  companyName: string;
  companyHref: string | null;
  stage: Stage;
  ownerId: string;
  nextStep: string;
  dueDate: string | null;
  summary: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stageEnteredAt: string;
  version: number;
};
export type DealEvent = {
  id: string;
  dealId: string;
  actorId: string;
  occurredAt: string;
  kind: "created" | "updated" | "moved" | "closed" | "reopened";
  fromStage: Stage | null;
  toStage: Stage;
  rationale: string;
  changes: Record<string, { before: unknown; after: unknown }>;
};
export type DealDetail = { deal: Deal; events: DealEvent[] };
export type DealFilters = {
  q?: string;
  owner?: string;
  stage?: Stage;
  scope?: "active" | "closed" | "all";
};
export type DealList = { deals: Deal[]; counts: Record<Stage, number> };
export class PipelineError extends Error {
  constructor(
    public code: "invalid" | "not_found" | "conflict" | "forbidden",
    message: string,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
