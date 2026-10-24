import type { Actor, Clock, CompanyTransaction } from "./types";

export const signalCategories = [
  "financing",
  "leadership",
  "product",
  "commercial",
  "corporate",
  "risk",
] as const;
export type SignalCategory = (typeof signalCategories)[number];
export const roundTypes = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "growth",
  "debt",
  "grant",
  "other",
] as const;
export type RoundType = (typeof roundTypes)[number];
export const signalStatuses = [
  "unreviewed",
  "verified",
  "disputed",
  "retracted",
] as const;
export type SignalStatus = (typeof signalStatuses)[number];
export type PartialDate = {
  precision: "day" | "month" | "year" | "unknown";
  value: string | null;
};
export type SignalSource = {
  url: string;
  title: string;
  publishedOn: string | null;
  observedAt: string;
};
export type Financing = {
  roundType: RoundType;
  amount: string | null;
  currency: string | null;
  investors: string[];
  valuation: string | null;
  valuationKind: "pre_money" | "post_money" | null;
};
export type SignalPayload = {
  category: SignalCategory;
  title: string;
  summary: string;
  eventDate: PartialDate;
  sources: SignalSource[];
  financing: Financing | null;
  status: SignalStatus;
};
export type ManualSignal = {
  id: string;
  firmId: string;
  companyId: string;
  version: number;
  duplicateKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
export type SignalRevision = {
  id: string;
  firmId: string;
  companyId: string;
  signalId: string;
  revision: number;
  payload: SignalPayload;
  material: boolean;
  reason: string;
  createdBy: string;
  createdAt: string;
};
export type SignalDetail = {
  signal: ManualSignal;
  revisions: SignalRevision[];
};
export type SignalWorkspace = {
  companyVersion: number;
  companyUpdatedAt: string;
  signals: SignalDetail[];
};
export type FinancingRow = {
  firmId: string;
  companyId: string;
  signalId: string;
  revisionId: string;
  title: string;
  roundType: RoundType;
  amount: string | null;
  currency: string | null;
  investors: string[];
  valuation: string | null;
  valuationKind: Financing["valuationKind"];
  dateStart: string | null;
  dateEnd: string | null;
  eventDate: PartialDate;
  status: "unreviewed" | "verified";
  createdAt: string;
};
export type FinancingFilters = {
  currency?: string;
  roundType?: RoundType;
  minAmount?: string;
  maxAmount?: string;
  from?: string;
  to?: string;
};
export interface SignalTransaction
  extends Pick<
    CompanyTransaction,
    "getCompany" | "bumpVersion" | "appendAudit"
  > {
  listSignals(companyId: string): Promise<SignalDetail[]>;
  getSignal(companyId: string, signalId: string): Promise<SignalDetail | null>;
  findDuplicate(
    companyId: string,
    key: string,
    excludeId?: string,
  ): Promise<ManualSignal | null>;
  insertSignal(signal: ManualSignal): Promise<void>;
  saveSignal(signal: ManualSignal, expectedVersion: number): Promise<void>;
  appendRevision(revision: SignalRevision): Promise<void>;
  replaceFinancing(
    companyId: string,
    signalId: string,
    row: FinancingRow | null,
  ): Promise<void>;
  financingHistory(
    companyId: string,
    filters: FinancingFilters,
  ): Promise<FinancingRow[]>;
}
export interface SignalRepository {
  read<T>(
    actor: Actor,
    operation: (tx: SignalTransaction) => Promise<T>,
  ): Promise<T>;
  write<T>(
    actor: Actor,
    requestId: string,
    fingerprint: string,
    operation: (tx: SignalTransaction) => Promise<T>,
  ): Promise<T>;
}
export type SignalDependencies = { repository: SignalRepository; clock: Clock };
