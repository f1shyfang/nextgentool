import type {
  CompanyReference,
  Deal,
  DealDetail,
  DealEvent,
  DealFilters,
  DealList,
  Member,
  PipelineContext,
} from "./pipeline";
export type MutationTransaction = {
  getDeal(id: string): Promise<Deal | null>;
  ownerExists(id: string): Promise<boolean>;
  insertDeal(deal: Deal): Promise<void>;
  saveDeal(deal: Deal, expectedVersion: number): Promise<void>;
  appendEvent(event: DealEvent): Promise<void>;
};
export type PipelineRepository = {
  memberForUser(
    clerkUserId: string,
  ): Promise<(PipelineContext & { name: string; firmName: string }) | null>;
  members(context: PipelineContext): Promise<Member[]>;
  list(context: PipelineContext, filters: DealFilters): Promise<DealList>;
  detail(context: PipelineContext, id: string): Promise<DealDetail | null>;
  mutate(
    context: PipelineContext,
    requestId: string,
    fingerprint: string,
    operation: (tx: MutationTransaction) => Promise<Deal>,
  ): Promise<Deal>;
};
export type CompanyLookup = {
  search(context: PipelineContext, query: string): Promise<CompanyReference[]>;
  resolve(
    context: PipelineContext,
    id: string,
  ): Promise<CompanyReference | null>;
};
