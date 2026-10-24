export type Role = "viewer" | "contributor" | "admin";
export type Actor = { userId: string; firmId: string; role: Role };
export const fields = [
  "description",
  "sector",
  "businessModel",
  "headquarters",
  "foundingYear",
  "operatingMarkets",
] as const;
export type Field = (typeof fields)[number];
export type FactValue = string | number | string[];
export type Company = {
  id: string;
  firmId: string;
  name: string;
  domain: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type Assertion = {
  id: string;
  firmId: string;
  companyId: string;
  field: Field;
  value: FactValue;
  sourceUrl: string;
  sourceTitle: string;
  observedAt: string;
  claimKind: "reported" | "estimated" | "manual";
  reviewStatus: "unreviewed" | "verified" | "disputed" | "rejected";
  superseded: boolean;
  createdBy: string;
  createdAt: string;
};
export type Override = {
  id: string;
  firmId: string;
  companyId: string;
  field: Field;
  assertionId: string;
  active: boolean;
  reason: string;
  createdBy: string;
  createdAt: string;
};
export type ResolvedField = {
  value: FactValue | null;
  assertionId: string | null;
  conflict: boolean;
  overrideId: string | null;
  overrideSuspended: boolean;
};
export type Profile = {
  company: Company;
  assertions: Assertion[];
  overrides: Override[];
  fields: Record<Field, ResolvedField>;
};
export class CompanyError extends Error {
  constructor(
    public code:
      | "invalid"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "unauthenticated"
      | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "CompanyError";
  }
}
export type Audit = {
  id: string;
  firmId: string;
  companyId: string;
  actorId: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};
export type CompanyQuery = { q: string; limit: number; after: string | null };
export interface CompanyTransaction {
  listCompanies(query: CompanyQuery): Promise<Company[]>;
  candidates(name: string, domain: string | null): Promise<Company[]>;
  getCompany(id: string): Promise<Company | null>;
  insertCompany(company: Company): Promise<void>;
  bumpVersion(
    id: string,
    expectedVersion: number,
    updatedAt: string,
  ): Promise<void>;
  assertions(companyId: string): Promise<Assertion[]>;
  insertAssertion(assertion: Assertion): Promise<void>;
  reviewAssertion(
    id: string,
    companyId: string,
    status: Assertion["reviewStatus"],
  ): Promise<void>;
  overrides(companyId: string): Promise<Override[]>;
  releaseOverrides(companyId: string, field: Field): Promise<void>;
  insertOverride(override: Override): Promise<void>;
  appendAudit(audit: Audit): Promise<void>;
}
export interface CompanyRepository {
  actorFor(userId: string): Promise<Actor | null>;
  read<T>(
    actor: Actor,
    operation: (tx: CompanyTransaction) => Promise<T>,
  ): Promise<T>;
  write<T>(
    actor: Actor,
    requestId: string,
    fingerprint: string,
    operation: (tx: CompanyTransaction) => Promise<T>,
  ): Promise<T>;
}
export type Clock = { id(): string; now(): string };
