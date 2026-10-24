"use client";

import { type FormEvent, useState } from "react";
import {
  type FinancingRow,
  roundTypes,
  type SignalDetail,
  type SignalPayload,
  type SignalRevision,
  type SignalSource,
  type SignalWorkspace,
  signalCategories,
  signalStatuses,
} from "../domain/signal-types";
import { CompanyApiError, companyGet, useCompanyMutation } from "./client-api";

const label = (value: string) => value.replaceAll("_", " ");
const latest = (detail: SignalDetail) =>
  detail.revisions.reduce((a, b) => (a.revision > b.revision ? a : b));
const dateLabel = (date: SignalPayload["eventDate"]) =>
  date.precision === "unknown"
    ? "Date unknown"
    : `${date.value} (${date.precision})`;
// Monetary values remain strings throughout display and filtering.
const displayDecimal = (value: string) =>
  value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
type TimelineFilters = { category: string; from: string; to: string };
const emptyTimelineFilters: TimelineFilters = {
  category: "",
  from: "",
  to: "",
};
function eventInterval(
  date: SignalPayload["eventDate"],
): { start: string; end: string } | null {
  if (!date.value || date.precision === "unknown") return null;
  if (date.precision === "day") return { start: date.value, end: date.value };
  if (date.precision === "year")
    return { start: `${date.value}-01-01`, end: `${date.value}-12-31` };
  const [year, month] = date.value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  return { start: `${date.value}-01`, end: `${date.value}-${days}` };
}
const timestamp = (value: string) =>
  `${new Date(value).toLocaleString("en-AU", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`;
const emptySource = (): SignalSource => ({
  url: "",
  title: "",
  publishedOn: null,
  observedAt: "",
});
const newPayload = (): SignalPayload => ({
  category: "product",
  title: "",
  summary: "",
  status: "unreviewed",
  eventDate: { precision: "unknown", value: null },
  sources: [emptySource()],
  financing: null,
});
type Draft = {
  sourceKeys: string[];
  payload: SignalPayload;
  signalId?: string;
  expectedSignalVersion?: number;
  reason: string;
  duplicateReason: string;
};
const emptyFinancing = () => ({
  roundType: "seed" as const,
  amount: null,
  currency: null,
  investors: [],
  valuation: null,
  valuationKind: null,
});
type Filters = {
  currency: string;
  roundType: string;
  minAmount: string;
  maxAmount: string;
  from: string;
  to: string;
};
const emptyFilters: Filters = {
  currency: "",
  roundType: "",
  minAmount: "",
  maxAmount: "",
  from: "",
  to: "",
};

export function CompanySignals({
  initial,
  companyId,
  companyVersion,
  canEdit,
  onSaved,
}: {
  initial: SignalWorkspace;
  companyId: string;
  companyVersion: number;
  canEdit: boolean;
  onSaved: (workspace: SignalWorkspace) => Promise<void>;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");
  const [view, setView] = useState<"signals" | "financing">("signals");
  const [filters, setFilters] = useState(emptyFilters);
  const [timelineDraft, setTimelineDraft] = useState(emptyTimelineFilters);
  const [timelineFilters, setTimelineFilters] = useState(emptyTimelineFilters);
  const [timelineError, setTimelineError] = useState("");
  const [rounds, setRounds] = useState<FinancingRow[] | null>(null);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [roundError, setRoundError] = useState("");
  const mutation = useCompanyMutation();
  const disabled = mutation.pending || stale || refreshing;
  const base = `companies/${companyId}/`;

  const visibleSignals = workspace.signals.filter((detail) => {
    const payload = latest(detail).payload;
    if (
      timelineFilters.category &&
      payload.category !== timelineFilters.category
    )
      return false;
    if (!timelineFilters.from && !timelineFilters.to) return true;
    const interval = eventInterval(payload.eventDate);
    return (
      interval !== null &&
      (!timelineFilters.from || interval.end >= timelineFilters.from) &&
      (!timelineFilters.to || interval.start <= timelineFilters.to)
    );
  });
  function applyTimelineFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      timelineDraft.from &&
      timelineDraft.to &&
      timelineDraft.from > timelineDraft.to
    ) {
      setTimelineError("Signal from date must be on or before the to date.");
      return;
    }
    setTimelineError("");
    setTimelineFilters({ ...timelineDraft });
  }

  function update(payload: Partial<SignalPayload>) {
    if (draft)
      setDraft({ ...draft, payload: { ...draft.payload, ...payload } });
  }
  function start(detail?: SignalDetail) {
    mutation.clearError();
    setLocalError("");
    setMessage("");
    const payload = detail ? latest(detail).payload : newPayload();
    setDraft({
      sourceKeys: payload.sources.map(() => crypto.randomUUID()),
      payload: {
        ...payload,
        sources: payload.sources.map((source) => ({
          ...source,
          observedAt: source.observedAt
            ? new Date(source.observedAt).toISOString().slice(0, -1)
            : "",
        })),
      },
      signalId: detail?.signal.id,
      expectedSignalVersion: detail?.signal.version,
      reason: "",
      duplicateReason: "",
    });
  }
  async function refresh() {
    setRefreshing(true);
    setLocalError("");
    try {
      const value = await companyGet<SignalWorkspace>(`${base}signals/`);
      setWorkspace(value);
      await onSaved(value);
      setStale(false);
      mutation.clearError();
      setRounds(null);
      if (draft?.signalId) {
        const current = value.signals.find(
          (item) => item.signal.id === draft.signalId,
        );
        if (current)
          setDraft({ ...draft, expectedSignalVersion: current.signal.version });
      }
      setMessage(
        "Latest signals loaded. Your draft is preserved and has not been saved. Compare it with the latest revision below before submitting again.",
      );
    } catch {
      setLocalError(
        "The latest signals could not be loaded. Your draft is preserved. Try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || disabled) return;
    setLocalError("");
    setMessage("");
    let sources: SignalSource[];
    try {
      sources = draft.payload.sources.map((source) => ({
        ...source,
        observedAt: new Date(`${source.observedAt}Z`).toISOString(),
      }));
    } catch {
      setLocalError(
        "Enter a valid observation date and time in UTC for each source.",
      );
      return;
    }
    const body = {
      expectedCompanyVersion: companyVersion,
      ...(draft.signalId
        ? {
            expectedSignalVersion: draft.expectedSignalVersion,
            reason: draft.reason,
          }
        : {}),
      payload: {
        ...draft.payload,
        sources,
        financing: draft.payload.financing
          ? {
              ...draft.payload.financing,
              investors: draft.payload.financing.investors
                .map((investor) => investor.trim())
                .filter(Boolean),
            }
          : null,
      },
      ...(draft.duplicateReason.trim()
        ? { duplicateReason: draft.duplicateReason }
        : {}),
    };
    const result = await mutation.run<SignalWorkspace>(
      draft.signalId
        ? `${base}signals/${draft.signalId}/corrections/`
        : `${base}signals/`,
      body,
    );
    if (!result.ok) {
      if (
        result.error.status === 409 &&
        !result.error.message.toLowerCase().includes("matching signal")
      )
        setStale(true);
      return;
    }
    setWorkspace(result.value);
    setRefreshing(true);
    try {
      await onSaved(result.value);
    } finally {
      setRefreshing(false);
    }
    setDraft(null);
    setRounds(null);
    setMessage(
      "Signal saved. The company timeline and financing history are updated.",
    );
  }
  async function loadFinancing(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoadingRounds(true);
    setRoundError("");
    setView("financing");
    setRounds(null);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value.trim())
        query.set(
          key,
          key === "currency" ? value.trim().toUpperCase() : value.trim(),
        );
    try {
      setRounds(
        (
          await companyGet<{ rounds: FinancingRow[] }>(
            `${base}financing/?${query}`,
          )
        ).rounds,
      );
    } catch (cause) {
      setRoundError(
        cause instanceof CompanyApiError
          ? cause.message
          : "Financing history could not be loaded. Apply filters again to retry.",
      );
    } finally {
      setLoadingRounds(false);
    }
  }

  return (
    <section className="ci-signals" aria-labelledby="company-signals-title">
      <div className="ci-heading">
        <div>
          <h2 id="company-signals-title">Signals and financing</h2>
          <p className="ci-muted">
            Record external events with dated evidence. Corrections preserve
            every earlier revision.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="ci-primary"
            disabled={disabled || Boolean(draft)}
            onClick={() => start()}
          >
            Add signal
          </button>
        )}
      </div>
      <nav className="ci-view-nav" aria-label="Signal views">
        <button
          type="button"
          className="ci-secondary"
          aria-pressed={view === "signals"}
          onClick={() => setView("signals")}
        >
          Signal timeline
        </button>
        <button
          type="button"
          className="ci-secondary"
          aria-pressed={view === "financing"}
          disabled={loadingRounds}
          onClick={() => void loadFinancing()}
        >
          Financing history
        </button>
      </nav>
      {message && (
        <p className="ci-status" role="status">
          {message}
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
            The company or signal changed. Your draft has not been saved. Load
            the latest signals, review the current revision, then submit again.
          </p>
          <button
            type="button"
            className="ci-secondary"
            disabled={refreshing}
            onClick={refresh}
          >
            {refreshing ? "Loading latest signals…" : "Load latest signals"}
          </button>
        </div>
      )}
      {canEdit && draft && (
        <section className="ci-panel" aria-labelledby="signal-form-title">
          <h3 id="signal-form-title">
            {draft.signalId ? "Correct signal" : "Add a manual signal"}
          </h3>
          {draft.signalId && (
            <p className="ci-meta">
              Editing revision {draft.expectedSignalVersion}. A new revision
              will preserve the previous evidence.
            </p>
          )}
          <form className="ci-form" onSubmit={save}>
            <fieldset disabled={disabled}>
              <legend>Event details</legend>
              <label>
                Signal title
                <input
                  required
                  maxLength={300}
                  value={draft.payload.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <label>
                Summary
                <textarea
                  required
                  maxLength={10000}
                  value={draft.payload.summary}
                  onChange={(e) => update({ summary: e.target.value })}
                />
              </label>
              <div className="ci-pair">
                <label>
                  Category
                  <select
                    aria-label="Category"
                    value={draft.payload.category}
                    onChange={(e) => {
                      const category = e.target
                        .value as SignalPayload["category"];
                      update({
                        category,
                        financing:
                          category === "financing" ? emptyFinancing() : null,
                      });
                    }}
                  >
                    {signalCategories.map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Signal status
                  <select
                    aria-label="Signal status"
                    value={draft.payload.status}
                    onChange={(e) =>
                      update({
                        status: e.target.value as SignalPayload["status"],
                      })
                    }
                  >
                    {signalStatuses.map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="ci-pair">
                <label>
                  Event date precision
                  <select
                    aria-label="Event date precision"
                    value={draft.payload.eventDate.precision}
                    onChange={(e) =>
                      update({
                        eventDate: {
                          precision: e.target
                            .value as SignalPayload["eventDate"]["precision"],
                          value: null,
                        },
                      })
                    }
                  >
                    {["unknown", "day", "month", "year"].map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.payload.eventDate.precision !== "unknown" && (
                  <label>
                    Event date
                    <input
                      required
                      type={
                        draft.payload.eventDate.precision === "day"
                          ? "date"
                          : draft.payload.eventDate.precision === "month"
                            ? "month"
                            : "text"
                      }
                      inputMode={
                        draft.payload.eventDate.precision === "year"
                          ? "numeric"
                          : undefined
                      }
                      pattern={
                        draft.payload.eventDate.precision === "year"
                          ? "[0-9]{4}"
                          : undefined
                      }
                      placeholder={
                        draft.payload.eventDate.precision === "year"
                          ? "YYYY"
                          : undefined
                      }
                      value={draft.payload.eventDate.value ?? ""}
                      onChange={(e) =>
                        update({
                          eventDate: {
                            ...draft.payload.eventDate,
                            value: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            </fieldset>
            {draft.payload.financing && (
              <fieldset disabled={disabled}>
                <legend>Reported financing</legend>
                <p className="ci-muted">
                  Use the original reported currency and amount. Leave
                  undisclosed amounts blank. Values are never converted or
                  summed.
                </p>
                <label>
                  Round type
                  <select
                    aria-label="Round type"
                    value={draft.payload.financing.roundType}
                    onChange={(e) =>
                      update({
                        financing: {
                          ...(draft.payload.financing ?? emptyFinancing()),
                          roundType: e.target.value as NonNullable<
                            SignalPayload["financing"]
                          >["roundType"],
                        },
                      })
                    }
                  >
                    {roundTypes.map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ci-pair">
                  <label>
                    Amount
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.payload.financing.amount ?? ""}
                      onChange={(e) =>
                        update({
                          financing: {
                            ...(draft.payload.financing ?? emptyFinancing()),
                            amount: e.target.value || null,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Currency (ISO 3-letter code)
                    <input
                      maxLength={3}
                      pattern="[A-Za-z]{3}"
                      value={draft.payload.financing.currency ?? ""}
                      onChange={(e) =>
                        update({
                          financing: {
                            ...(draft.payload.financing ?? emptyFinancing()),
                            currency: e.target.value.toUpperCase() || null,
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Investors (comma separated)
                  <input
                    value={draft.payload.financing.investors.join(",")}
                    onChange={(e) =>
                      update({
                        financing: {
                          ...(draft.payload.financing ?? emptyFinancing()),
                          investors: e.target.value.split(","),
                        },
                      })
                    }
                  />
                </label>
                <div className="ci-pair">
                  <label>
                    Reported valuation
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.payload.financing.valuation ?? ""}
                      onChange={(e) =>
                        update({
                          financing: {
                            ...(draft.payload.financing ?? emptyFinancing()),
                            valuation: e.target.value || null,
                            valuationKind: e.target.value
                              ? (draft.payload.financing?.valuationKind ?? null)
                              : null,
                          },
                        })
                      }
                    />
                  </label>
                  {draft.payload.financing.valuation && (
                    <label>
                      Valuation type
                      <select
                        required
                        aria-label="Valuation type"
                        value={draft.payload.financing.valuationKind ?? ""}
                        onChange={(e) =>
                          update({
                            financing: {
                              ...(draft.payload.financing ?? emptyFinancing()),
                              valuationKind: (e.target.value || null) as
                                | "pre_money"
                                | "post_money"
                                | null,
                            },
                          })
                        }
                      >
                        <option value="">Select valuation type</option>
                        <option value="pre_money">Pre-money</option>
                        <option value="post_money">Post-money</option>
                      </select>
                    </label>
                  )}
                </div>
              </fieldset>
            )}
            <fieldset disabled={disabled}>
              <legend>Sources</legend>
              {draft.payload.sources.map((source, index) => {
                function change(value: Partial<SignalSource>) {
                  update({
                    sources: (draft?.payload.sources ?? []).map((item, i) =>
                      i === index ? { ...item, ...value } : item,
                    ),
                  });
                }
                return (
                  <fieldset key={draft.sourceKeys[index]}>
                    <legend>Source {index + 1}</legend>
                    <div className="ci-pair">
                      <label>
                        Source {index + 1} title
                        <input
                          required
                          maxLength={300}
                          value={source.title}
                          onChange={(e) => change({ title: e.target.value })}
                        />
                      </label>
                      <label>
                        Source {index + 1} URL
                        <input
                          required
                          type="url"
                          maxLength={2048}
                          value={source.url}
                          onChange={(e) => change({ url: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="ci-pair">
                      <label>
                        Source {index + 1} observed at (UTC)
                        <input
                          required
                          type="datetime-local"
                          step="0.001"
                          value={source.observedAt}
                          onChange={(e) =>
                            change({ observedAt: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Source {index + 1} published on (optional)
                        <input
                          type="date"
                          value={source.publishedOn ?? ""}
                          onChange={(e) =>
                            change({ publishedOn: e.target.value || null })
                          }
                        />
                      </label>
                    </div>
                    {draft.payload.sources.length > 1 && (
                      <button
                        type="button"
                        className="ci-secondary"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            sourceKeys: draft.sourceKeys.filter(
                              (_, i) => i !== index,
                            ),
                            payload: {
                              ...draft.payload,
                              sources: draft.payload.sources.filter(
                                (_, i) => i !== index,
                              ),
                            },
                          })
                        }
                      >
                        Remove source {index + 1}
                      </button>
                    )}
                  </fieldset>
                );
              })}
              {draft.payload.sources.length < 10 && (
                <button
                  type="button"
                  className="ci-secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      sourceKeys: [...draft.sourceKeys, crypto.randomUUID()],
                      payload: {
                        ...draft.payload,
                        sources: [...draft.payload.sources, emptySource()],
                      },
                    })
                  }
                >
                  Add source
                </button>
              )}
            </fieldset>
            <fieldset disabled={disabled}>
              <legend>Record decision</legend>
              {draft.signalId && (
                <label>
                  Correction reason
                  <textarea
                    required
                    maxLength={1000}
                    value={draft.reason}
                    onChange={(e) =>
                      setDraft({ ...draft, reason: e.target.value })
                    }
                  />
                </label>
              )}
              <label>
                Duplicate event reason (optional)
                <textarea
                  maxLength={1000}
                  value={draft.duplicateReason}
                  onChange={(e) =>
                    setDraft({ ...draft, duplicateReason: e.target.value })
                  }
                />
              </label>
              <p className="ci-muted">
                If a matching event already exists, explain why this is a
                separate event.
              </p>
              <div className="ci-actions">
                <button type="submit" className="ci-primary">
                  {mutation.pending
                    ? "Saving…"
                    : draft.signalId
                      ? "Save correction"
                      : "Save signal"}
                </button>
                <button
                  type="button"
                  className="ci-secondary"
                  onClick={() => {
                    setDraft(null);
                    mutation.clearError();
                  }}
                >
                  Cancel signal
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {view === "signals" ? (
        <div className="ci-signal-list">
          <h3>Signal timeline</h3>
          <form
            className="ci-form ci-signal-filters"
            onSubmit={applyTimelineFilters}
          >
            <fieldset>
              <legend>Filter signal timeline</legend>
              <label>
                Signal category filter
                <select
                  aria-label="Signal category filter"
                  value={timelineDraft.category}
                  onChange={(e) =>
                    setTimelineDraft({
                      ...timelineDraft,
                      category: e.target.value,
                    })
                  }
                >
                  <option value="">All categories</option>
                  {signalCategories.map((category) => (
                    <option key={category} value={category}>
                      {label(category)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ci-pair">
                <label>
                  Signal from date
                  <input
                    type="date"
                    value={timelineDraft.from}
                    onChange={(e) =>
                      setTimelineDraft({
                        ...timelineDraft,
                        from: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Signal to date
                  <input
                    type="date"
                    value={timelineDraft.to}
                    onChange={(e) =>
                      setTimelineDraft({ ...timelineDraft, to: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="ci-muted">
                Date filters include overlapping partial dates and exclude
                events with unknown dates.
              </p>
              <button type="submit" className="ci-secondary">
                Apply signal filters
              </button>
            </fieldset>
          </form>
          {timelineError && (
            <p className="ci-error" role="alert">
              {timelineError}
            </p>
          )}
          <p className="ci-meta" role="status">
            {visibleSignals.length} of {workspace.signals.length} signals match.
          </p>
          {workspace.signals.length > 0 && visibleSignals.length === 0 && (
            <p>No signals match these filters.</p>
          )}
          {workspace.signals.length === 0 && (
            <p>
              No signals recorded. Add an external event and its sources to
              begin a timeline.
            </p>
          )}
          {visibleSignals.map((detail) => {
            const current = latest(detail);
            return (
              <article className="ci-signal-item" key={detail.signal.id}>
                <h3>{current.payload.title}</h3>
                <SignalEvidence revision={current} />
                {canEdit && (
                  <button
                    type="button"
                    className="ci-secondary"
                    disabled={disabled || Boolean(draft)}
                    onClick={() => start(detail)}
                  >
                    Edit signal
                  </button>
                )}
                <details>
                  <summary>
                    Revision history ({detail.revisions.length})
                  </summary>
                  {[...detail.revisions]
                    .sort((a, b) => b.revision - a.revision)
                    .map((revision) => (
                      <section className="ci-signal-revision" key={revision.id}>
                        <h4>
                          Revision {revision.revision} ·{" "}
                          {revision.payload.title}
                        </h4>
                        <p className="ci-meta">
                          Recorded {timestamp(revision.createdAt)}
                        </p>
                        <p>Reason: {revision.reason}</p>
                        <SignalEvidence revision={revision} />
                      </section>
                    ))}
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <section
          className="ci-financing-list"
          aria-labelledby="financing-history-title"
        >
          <h3 id="financing-history-title">Financing history</h3>
          <p className="ci-muted">
            Current unreviewed and verified financing only. Disputed and
            retracted rounds are excluded. Amount filters apply to the selected
            currency without conversion; date filters include overlapping
            partial dates.
          </p>
          <form className="ci-form" onSubmit={loadFinancing}>
            <fieldset disabled={loadingRounds}>
              <legend>Filter financing rounds</legend>
              <div className="ci-pair">
                <label>
                  Filter round type
                  <select
                    aria-label="Filter round type"
                    value={filters.roundType}
                    onChange={(e) =>
                      setFilters({ ...filters, roundType: e.target.value })
                    }
                  >
                    <option value="">All rounds</option>
                    {roundTypes.map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Filter currency
                  <input
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    value={filters.currency}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        currency: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
              </div>
              <div className="ci-pair">
                <label>
                  Minimum amount
                  <input
                    type="text"
                    inputMode="decimal"
                    value={filters.minAmount}
                    onChange={(e) =>
                      setFilters({ ...filters, minAmount: e.target.value })
                    }
                  />
                </label>
                <label>
                  Maximum amount
                  <input
                    type="text"
                    inputMode="decimal"
                    value={filters.maxAmount}
                    onChange={(e) =>
                      setFilters({ ...filters, maxAmount: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="ci-pair">
                <label>
                  From date
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) =>
                      setFilters({ ...filters, from: e.target.value })
                    }
                  />
                </label>
                <label>
                  To date
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) =>
                      setFilters({ ...filters, to: e.target.value })
                    }
                  />
                </label>
              </div>
              <button type="submit" className="ci-secondary">
                {loadingRounds
                  ? "Loading financing…"
                  : "Apply financing filters"}
              </button>
            </fieldset>
          </form>
          {roundError && (
            <p className="ci-error" role="alert">
              {roundError}
            </p>
          )}
          {loadingRounds && <p role="status">Loading financing history…</p>}
          {rounds?.length === 0 && (
            <p>No financing rounds match these filters.</p>
          )}
          {rounds?.map((round) => {
            const detail = workspace.signals.find(
              (item) => item.signal.id === round.signalId,
            );
            const revision = detail && latest(detail);
            return (
              <article className="ci-round" key={round.signalId}>
                <h4>{round.title}</h4>
                <p>
                  {label(round.roundType)} ·{" "}
                  {round.amount === null
                    ? "Amount undisclosed"
                    : `${displayDecimal(round.amount)} ${round.currency ?? "Currency undisclosed"}`}{" "}
                  · {round.status}
                </p>
                <p className="ci-meta">{dateLabel(round.eventDate)}</p>
                <p>
                  Investors:{" "}
                  {round.investors.length
                    ? round.investors.join(", ")
                    : "Unknown"}
                </p>
                <p>
                  Reported valuation:{" "}
                  {round.valuation === null
                    ? "Undisclosed"
                    : `${displayDecimal(round.valuation)} ${round.currency ?? ""} (${label(round.valuationKind ?? "unknown")})`}
                </p>
                {revision?.id === round.revisionId ? (
                  <Sources sources={revision.payload.sources} />
                ) : (
                  <p className="ci-muted">
                    Reload the latest signals to inspect the source revision for
                    this round.
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}

function Sources({ sources }: { sources: SignalSource[] }) {
  return (
    <ul className="ci-signal-sources">
      {sources.map((source, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: A source snapshot is immutable within its revision; index distinguishes identical evidence entries.
        <li key={`${source.url}-${source.observedAt}-${source.title}-${index}`}>
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {source.title}
          </a>
          <p className="ci-meta">
            Observed {timestamp(source.observedAt)} · Published{" "}
            {source.publishedOn ?? "date unknown"}
          </p>
        </li>
      ))}
    </ul>
  );
}
function SignalEvidence({ revision }: { revision: SignalRevision }) {
  const payload = revision.payload;
  return (
    <>
      <p className="ci-meta">
        {label(payload.category)} · {payload.status} ·{" "}
        {dateLabel(payload.eventDate)} · Revision {revision.revision}
      </p>
      <p>{payload.summary}</p>
      {payload.financing && (
        <>
          <p>
            {label(payload.financing.roundType)} ·{" "}
            {payload.financing.amount === null
              ? "Amount undisclosed"
              : `${displayDecimal(payload.financing.amount)} ${payload.financing.currency ?? "Currency undisclosed"}`}
          </p>
          <p>
            Investors:{" "}
            {payload.financing.investors.length
              ? payload.financing.investors.join(", ")
              : "Unknown"}
          </p>
          <p>
            Reported valuation:{" "}
            {payload.financing.valuation === null
              ? "Undisclosed"
              : `${displayDecimal(payload.financing.valuation)} ${payload.financing.currency ?? ""} (${label(payload.financing.valuationKind ?? "unknown")})`}
          </p>
        </>
      )}
      <Sources sources={payload.sources} />
    </>
  );
}
