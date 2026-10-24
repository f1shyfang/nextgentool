"use client";

import { type FormEvent, useState } from "react";
import type { SignalWorkspace } from "../domain/signal-types";
import {
  type Assertion,
  type FactValue,
  type Field,
  fields,
  type Profile,
} from "../domain/types";
import { companyGet, useCompanyMutation } from "./client-api";
import { CompanySignals } from "./company-signals";

const labels: Record<Field, string> = {
  description: "Description",
  sector: "Sector",
  businessModel: "Business model",
  headquarters: "Headquarters",
  foundingYear: "Founding year",
  operatingMarkets: "Operating markets",
};
const displayValue = (value: FactValue | null) =>
  value === null
    ? "Unknown"
    : Array.isArray(value)
      ? value.join(", ")
      : String(value);
const displayDate = (value: string) =>
  `${new Date(value).toLocaleString("en-AU", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  })} UTC`;
type Action = {
  kind: "review" | "pin" | "release";
  assertionId: string;
  field: Field;
  overrideId?: string;
};
const emptyFact = {
  field: "description" as Field,
  value: "",
  sourceUrl: "",
  sourceTitle: "",
  observedAt: "",
  claimKind: "reported" as Assertion["claimKind"],
};

export function CompanyProfile({
  initial,
  initialSignals,
  canEdit,
}: {
  initial: Profile;
  initialSignals?: SignalWorkspace;
  canEdit: boolean;
}) {
  const [profile, setProfile] = useState(initial);
  const [view, setView] = useState<"overview" | "evidence" | "signals">(
    "overview",
  );
  const [signalWorkspace, setSignalWorkspace] = useState<SignalWorkspace>(
    initialSignals ?? {
      companyVersion: initial.company.version,
      companyUpdatedAt: initial.company.updatedAt,
      signals: [],
    },
  );
  const [showFact, setShowFact] = useState(false);
  const [draft, setDraft] = useState(emptyFact);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [reviewStatus, setReviewStatus] =
    useState<Assertion["reviewStatus"]>("verified");
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [success, setSuccess] = useState("");
  const [localError, setLocalError] = useState("");
  const mutation = useCompanyMutation();
  const disabled = mutation.pending || stale || refreshing;
  const base = `companies/${profile.company.id}/`;
  async function syncSignals(workspace: SignalWorkspace) {
    setSignalWorkspace(workspace);
    try {
      const current = await companyGet<Profile>(base);
      const evidenceChanged =
        JSON.stringify([profile.assertions, profile.overrides]) !==
        JSON.stringify([current.assertions, current.overrides]);
      setProfile(current);
      if (evidenceChanged && (showFact || action)) {
        setStale(true);
        setRefreshError(
          "Company evidence changed while you were working with signals. Your fact draft is preserved; load the latest profile before submitting it.",
        );
      }
    } catch {
      setStale(true);
      setRefreshError(
        "Signals were loaded, but the company profile could not be refreshed. Your draft is preserved. Load the latest profile before making further fact decisions.",
      );
    }
  }

  async function save(path: string, body: Record<string, unknown>) {
    setSuccess("");
    setLocalError("");
    const result = await mutation.run<Profile>(path, {
      ...body,
      expectedVersion: profile.company.version,
    });
    if (!result.ok) {
      if (result.error.status === 409) setStale(true);
      return false;
    }
    setProfile(result.value);
    setSuccess("Your changes were saved to the shared company profile.");
    return true;
  }
  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    try {
      setProfile(await companyGet<Profile>(base));
      setStale(false);
      mutation.clearError();
      setSuccess(
        "Latest profile loaded. Your draft was not saved. Review it and submit again when ready.",
      );
    } catch {
      setRefreshError(
        "The latest profile could not be loaded. Your draft is preserved. Try loading it again.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  async function addFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const observed = new Date(`${draft.observedAt}Z`);
    if (Number.isNaN(observed.getTime())) {
      setLocalError("Enter a valid observation date and time in UTC.");
      return;
    }
    const value =
      draft.field === "foundingYear"
        ? Number(draft.value)
        : draft.field === "sector" || draft.field === "operatingMarkets"
          ? draft.value.split(",").map((item) => item.trim())
          : draft.value;
    if (
      await save(`${base}assertions/`, {
        ...draft,
        value,
        observedAt: observed.toISOString(),
      })
    ) {
      setDraft(emptyFact);
      setShowFact(false);
    }
  }
  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !action) return;
    const path =
      action.kind === "review"
        ? `${base}assertions/${action.assertionId}/reviews/`
        : action.kind === "pin"
          ? `${base}overrides/`
          : `${base}overrides/${action.overrideId}/release/`;
    const body =
      action.kind === "review"
        ? { reviewStatus, reason }
        : action.kind === "pin"
          ? { assertionId: action.assertionId, field: action.field, reason }
          : { reason };
    if (await save(path, body)) {
      setAction(null);
      setReason("");
    }
  }
  function startAction(next: Action) {
    setAction(next);
    setReason("");
    setSuccess("");
  }

  const decisionForm =
    canEdit && action ? (
      <section className="ci-panel" aria-labelledby="fact-action-title">
        <h2 id="fact-action-title">
          {action.kind === "review"
            ? "Review fact"
            : action.kind === "pin"
              ? "Pin fact"
              : "Release pin"}
          : {labels[action.field]}
        </h2>
        <p>
          {displayValue(
            profile.assertions.find((item) => item.id === action.assertionId)
              ?.value ?? null,
          )}
        </p>
        <form className="ci-form" onSubmit={submitAction}>
          <fieldset disabled={disabled}>
            <legend>Decision</legend>
            {action.kind === "review" && (
              <label>
                Review status
                <select
                  aria-label="Review status"
                  value={reviewStatus}
                  onChange={(e) =>
                    setReviewStatus(e.target.value as Assertion["reviewStatus"])
                  }
                >
                  <option value="verified">Verified</option>
                  <option value="unreviewed">Unreviewed</option>
                  <option value="disputed">Disputed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
            )}
            <label>
              Reason
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="ci-actions">
              <button type="submit" className="ci-primary">
                {mutation.pending ? "Saving…" : "Save decision"}
              </button>
              <button
                type="button"
                className="ci-secondary"
                onClick={() => setAction(null)}
              >
                Cancel decision
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    ) : null;

  return (
    <div className="ci-profile">
      <a href="/companies/">All companies</a>
      <header className="ci-heading">
        <div>
          <h1>{profile.company.name}</h1>
          <p>{profile.company.domain ?? "Website unknown"}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="ci-primary"
            disabled={disabled}
            onClick={() => setShowFact(!showFact)}
            aria-expanded={showFact}
          >
            {showFact ? "Close add fact" : "Add fact"}
          </button>
        )}
      </header>
      <p className="ci-summary">
        A shared view of company facts and the evidence behind them. Review
        sources and observation dates before relying on a claim.
      </p>
      <p className="ci-muted">
        Profile updated {displayDate(profile.company.updatedAt)}
      </p>
      {!canEdit && (
        <p className="ci-status">
          Read-only access · A contributor can add and review facts.
        </p>
      )}
      {success && (
        <p className="ci-status" role="status">
          {success}
        </p>
      )}
      {mutation.error && (
        <p className="ci-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {localError && (
        <p className="ci-error" role="alert">
          {localError}
        </p>
      )}
      {stale && (
        <div className="ci-warning" role="alert">
          <p>
            Your submission was not saved. The profile or selected fact has
            changed. Load the latest profile, review your preserved draft, and
            submit again.
          </p>
          <button
            type="button"
            className="ci-secondary"
            disabled={refreshing}
            onClick={refresh}
          >
            {refreshing ? "Loading latest profile…" : "Load latest profile"}
          </button>
        </div>
      )}
      {refreshError && (
        <p className="ci-error" role="alert">
          {refreshError}
        </p>
      )}
      {canEdit && showFact && (
        <section className="ci-panel" aria-labelledby="add-fact-title">
          <h2 id="add-fact-title">Add a sourced fact</h2>
          <form className="ci-form" onSubmit={addFact}>
            <fieldset disabled={disabled}>
              <legend>Fact and evidence</legend>
              <label>
                Field
                <select
                  aria-label="Field"
                  value={draft.field}
                  onChange={(e) =>
                    setDraft({ ...draft, field: e.target.value as Field })
                  }
                >
                  {fields.map((field) => (
                    <option key={field} value={field}>
                      {labels[field]}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="company-fact-value">
                Value
                {draft.field === "description" ? (
                  <textarea
                    id="company-fact-value"
                    required
                    value={draft.value}
                    onChange={(e) =>
                      setDraft({ ...draft, value: e.target.value })
                    }
                  />
                ) : (
                  <input
                    id="company-fact-value"
                    required
                    type={draft.field === "foundingYear" ? "number" : "text"}
                    value={draft.value}
                    onChange={(e) =>
                      setDraft({ ...draft, value: e.target.value })
                    }
                  />
                )}
              </label>
              {(draft.field === "sector" ||
                draft.field === "operatingMarkets") && (
                <p className="ci-muted">
                  Separate multiple values with commas.
                </p>
              )}
              <div className="ci-pair">
                <label>
                  Source title
                  <input
                    required
                    maxLength={300}
                    value={draft.sourceTitle}
                    onChange={(e) =>
                      setDraft({ ...draft, sourceTitle: e.target.value })
                    }
                  />
                </label>
                <label>
                  Source URL
                  <input
                    required
                    type="url"
                    maxLength={2048}
                    value={draft.sourceUrl}
                    onChange={(e) =>
                      setDraft({ ...draft, sourceUrl: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="ci-pair">
                <label>
                  Observed at (UTC)
                  <input
                    required
                    type="datetime-local"
                    value={draft.observedAt}
                    onChange={(e) =>
                      setDraft({ ...draft, observedAt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Claim kind
                  <select
                    aria-label="Claim kind"
                    value={draft.claimKind}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        claimKind: e.target.value as Assertion["claimKind"],
                      })
                    }
                  >
                    <option value="reported">Reported</option>
                    <option value="estimated">Estimated</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>
              </div>
              <button className="ci-primary" type="submit">
                {mutation.pending ? "Saving…" : "Save fact"}
              </button>
            </fieldset>
          </form>
        </section>
      )}
      <nav className="ci-view-nav" aria-label="Company views">
        <button
          type="button"
          className="ci-secondary"
          aria-pressed={view === "signals"}
          onClick={() => setView("signals")}
        >
          Signals
        </button>
        <button
          type="button"
          className="ci-secondary"
          aria-pressed={view === "overview"}
          onClick={() => setView("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className="ci-secondary"
          aria-pressed={view === "evidence"}
          onClick={() => setView("evidence")}
        >
          Evidence ({profile.assertions.length})
        </button>
      </nav>
      {view === "overview" ? (
        <section className="ci-section" aria-labelledby="overview-title">
          <h2 id="overview-title">Company overview</h2>
          <div className="ci-facts">
            {fields.map((field) => {
              const resolved = profile.fields[field];
              const selected = profile.assertions.find(
                (item) => item.id === resolved.assertionId,
              );
              return (
                <article className="ci-fact" key={field}>
                  <h3>{labels[field]}</h3>
                  <p>{displayValue(resolved.value)}</p>
                  {selected && (
                    <>
                      <p className="ci-meta">
                        Selected source: <Source assertion={selected} />
                      </p>
                      <p className="ci-meta">
                        Observed {displayDate(selected.observedAt)} · Review:{" "}
                        {selected.reviewStatus}
                      </p>
                    </>
                  )}
                  {resolved.conflict && (
                    <p className="ci-warning">
                      Conflicting evidence requires review.
                    </p>
                  )}
                  {resolved.overrideId && (
                    <p
                      className={
                        resolved.overrideSuspended ? "ci-warning" : "ci-meta"
                      }
                    >
                      {resolved.overrideSuspended
                        ? "Pin suspended: the pinned fact is no longer eligible."
                        : "Pinned selection"}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : view === "evidence" ? (
        <section className="ci-section" aria-labelledby="evidence-title">
          <h2 id="evidence-title">Evidence history</h2>
          <p className="ci-muted">
            All submitted facts, including disputed, rejected, and superseded
            claims. Observation dates describe when evidence was checked.
          </p>
          {profile.assertions.length === 0 && <p>No sourced facts yet.</p>}
          <div className="ci-evidence">
            {fields.map((field) => {
              const assertions = profile.assertions.filter(
                (item) => item.field === field,
              );
              return (
                <details key={field}>
                  <summary>
                    {labels[field]} · {assertions.length}{" "}
                    {assertions.length === 1 ? "claim" : "claims"}
                  </summary>
                  {assertions.length === 0 && (
                    <p className="ci-muted">No evidence recorded.</p>
                  )}
                  {assertions.map((assertion) => (
                    <article className="ci-evidence-item" key={assertion.id}>
                      <h3>{displayValue(assertion.value)}</h3>
                      <p>
                        <Source assertion={assertion} />
                      </p>
                      <p className="ci-meta">
                        Claim: {assertion.claimKind} · Review:{" "}
                        {assertion.reviewStatus}
                        {assertion.superseded ? " · Superseded" : ""}
                        {profile.fields[field].assertionId === assertion.id
                          ? " · Selected"
                          : ""}
                      </p>
                      <p className="ci-meta">
                        Observed {displayDate(assertion.observedAt)}
                        <br />
                        Added {displayDate(assertion.createdAt)}
                      </p>
                      {canEdit && (
                        <div className="ci-actions">
                          <button
                            type="button"
                            disabled={disabled}
                            className="ci-secondary"
                            onClick={() =>
                              startAction({
                                kind: "review",
                                assertionId: assertion.id,
                                field,
                              })
                            }
                          >
                            Review fact
                          </button>
                          <button
                            type="button"
                            disabled={
                              disabled ||
                              assertion.superseded ||
                              assertion.reviewStatus === "disputed" ||
                              assertion.reviewStatus === "rejected"
                            }
                            className="ci-secondary"
                            onClick={() =>
                              startAction({
                                kind: "pin",
                                assertionId: assertion.id,
                                field,
                              })
                            }
                          >
                            Pin fact
                          </button>
                        </div>
                      )}
                      {profile.overrides
                        .filter((pin) => pin.assertionId === assertion.id)
                        .map((pin) => (
                          <div className="ci-meta" key={pin.id}>
                            <p>
                              {pin.active
                                ? profile.fields[field].overrideSuspended &&
                                  profile.fields[field].overrideId === pin.id
                                  ? "Active pin · Suspended"
                                  : "Active pin"
                                : "Released pin"}{" "}
                              · {displayDate(pin.createdAt)}
                              <br />
                              Reason: {pin.reason}
                            </p>
                            {canEdit && pin.active && (
                              <button
                                type="button"
                                className="ci-secondary"
                                disabled={disabled}
                                onClick={() =>
                                  startAction({
                                    kind: "release",
                                    assertionId: assertion.id,
                                    field,
                                    overrideId: pin.id,
                                  })
                                }
                              >
                                Release pin
                              </button>
                            )}
                          </div>
                        ))}
                      {action?.assertionId === assertion.id && decisionForm}
                    </article>
                  ))}
                </details>
              );
            })}
          </div>
        </section>
      ) : null}
      <div hidden={view !== "signals"}>
        <CompanySignals
          initial={signalWorkspace}
          companyId={profile.company.id}
          companyVersion={profile.company.version}
          canEdit={canEdit}
          onSaved={syncSignals}
        />
      </div>
    </div>
  );
}

function Source({ assertion }: { assertion: Assertion }) {
  return (
    <a href={assertion.sourceUrl} target="_blank" rel="noopener noreferrer">
      {assertion.sourceTitle}
    </a>
  );
}
