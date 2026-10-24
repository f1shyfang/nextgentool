export const memoSections = [
  "Investment thesis",
  "Company and product",
  "Market",
  "Team",
  "Traction and financials",
  "Risks",
  "Open questions",
  "Recommendation",
] as const;
export const categories = [
  "Pitch deck",
  "Financials",
  "Market research",
  "Other",
] as const;
export type Role = "viewer" | "contributor" | "admin";
export type Actor = { userId: string; firmId: string; role: Role };
export type Scope = { companyId: string; dealId: string | null };
export type Company = { id: string; name: string };
export type Deal = { id: string; companyId: string; name: string };
export type Evidence = {
  kind: "document" | "note";
  targetId: string;
  revisionId: string;
  locator: string;
};
export type Revision = {
  id: string;
  title: string;
  body: string;
  sections: Record<string, string>;
  label: "Observation" | "Interpretation" | "Open question";
  evidence: Evidence[];
  author: string;
  createdAt: string;
};
export type WrittenRecord = Scope & {
  id: string;
  kind: "note" | "memo";
  owner: string;
  archived: boolean;
  revisions: Revision[];
  updatedAt: string;
};
export type DocumentVersion = {
  id: string;
  filename: string;
  size: number;
  mediaType: string;
  checksum: string | null;
  state: "pending" | "ready" | "rejected" | "failed";
  message: string;
  uploader: string;
  createdAt: string;
};
export type ResearchDocument = Scope & {
  id: string;
  title: string;
  category: (typeof categories)[number];
  description: string;
  archived: boolean;
  versions: DocumentVersion[];
  currentVersionId: string | null;
  updatedAt: string;
};
export type Audit = {
  id: string;
  actor: string;
  action: string;
  targetId: string;
  createdAt: string;
};
export type ResearchState = {
  companies: Company[];
  deals: Deal[];
  documents: ResearchDocument[];
  records: WrittenRecord[];
  audit: Audit[];
};
export type Workspace = ResearchState & { actor: Actor };
export const emptyState = (): ResearchState => ({
  companies: [],
  deals: [],
  documents: [],
  records: [],
  audit: [],
});
export class ResearchError extends Error {
  constructor(
    public code:
      | "invalid"
      | "forbidden"
      | "missing"
      | "conflict"
      | "unavailable",
    message: string,
  ) {
    super(message);
  }
}
export interface ResearchRepository {
  // The transaction must recheck membership and serialize mutations within the firm.
  read(actor: Actor): Promise<ResearchState>;
  transact<T>(
    actor: Actor,
    fn: (state: ResearchState) => T | Promise<T>,
  ): Promise<T>;
  actorFor(userId: string): Promise<Actor | null>;
}
export interface PrivateStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
  keys(): Promise<{ key: string; modifiedAt: number }[]>;
}
export interface FileInspector {
  inspect(
    filename: string,
    bytes: Uint8Array,
  ): Promise<{ mediaType: string; checksum: string }>;
}
export type Clock = { now(): string; id(): string };
export type SaveInput = Scope & {
  id?: string;
  kind: "note" | "memo";
  expectedRevisionId: string | null;
  title: string;
  body: string;
  sections: Record<string, string>;
  label: Revision["label"];
  evidence: Evidence[];
  owner?: string;
};
export type UploadInput = Scope & {
  documentId?: string;
  title: string;
  category: ResearchDocument["category"];
  description: string;
  filename: string;
  size: number;
};
