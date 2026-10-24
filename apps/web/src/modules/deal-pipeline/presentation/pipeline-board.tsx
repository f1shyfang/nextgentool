"use client";

import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ACTIVE_STAGES,
  type CompanyReference,
  type Deal,
  type DealDetail,
  type DealFilters,
  type DealList,
  isActiveStage,
  type Member,
  type PipelineContext,
  STAGE_LABELS,
  STAGES,
  type Stage,
} from "../domain/pipeline";

type Props = {
  initial: DealList;
  members: Member[];
  context: PipelineContext & { name: string; firmName: string };
  filters: DealFilters;
  view: "board" | "list";
};
type Fields = {
  name: string;
  companyId: string | null;
  companyName: string;
  companyHref: string | null;
  ownerId: string;
  nextStep: string;
  dueDate: string;
  summary: string;
  stage: Stage;
};
const stageDescriptions = {
  inbox: "New opportunities",
  screening: "Assessing the fit",
  evaluation: "Building conviction",
  decision: "Ready for a decision",
};
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateLabel(value: string, withTime = false) {
  return new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
function fieldsFor(deal: Deal): Fields {
  return {
    name: deal.name,
    companyId: deal.companyId,
    companyName: deal.companyName,
    companyHref: deal.companyHref,
    ownerId: deal.ownerId,
    nextStep: deal.nextStep,
    dueDate: deal.dueDate ?? "",
    summary: deal.summary,
    stage: deal.stage,
  };
}
async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(
      body.error ?? "We couldn't save this change. Please try again.",
    ) as Error & { code?: string };
    error.code = body.code;
    throw error;
  }
  return body as T;
}

export default function PipelineBoard({
  initial,
  members,
  context,
  filters,
  view,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertainOperation, setUncertainOperation] = useState<
    "save" | "move" | null
  >(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");
  const [destination, setDestination] = useState<Stage>("inbox");
  const [rationale, setRationale] = useState("");
  const [confirmOutcome, setConfirmOutcome] = useState(false);
  const [companies, setCompanies] = useState<CompanyReference[]>([]);
  const [companyMessage, setCompanyMessage] = useState("");
  const [companySearching, setCompanySearching] = useState(false);
  const [duplicates, setDuplicates] = useState<Deal[]>([]);
  const companySearchVersion = useRef(0);
  const requests = useRef<Record<string, string>>({});
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const memberName = (id: string) =>
    members.find((member) => member.id === id)?.name ??
    (id === context.memberId ? context.name : "Former team member");
  const resetRequests = () => {
    requests.current = {};
    setError("");
    setNotice("");
  };
  const update = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    resetRequests();
    setFields((current) => (current ? { ...current, [key]: value } : current));
    if (key === "companyName") {
      companySearchVersion.current += 1;
      setCompanySearching(false);
      setFields((current) =>
        current ? { ...current, companyId: null, companyHref: null } : current,
      );
      setCompanies([]);
      setDuplicates([]);
      setCompanyMessage("");
    }
  };
  const close = () => {
    if (!saving && !uncertainOperation) {
      companySearchVersion.current += 1;
      dialogRef.current?.close();
      setSelected(null);
      setDetail(null);
      setFields(null);
      opener.current?.focus();
    }
  };
  const attachDialog = useCallback((node: HTMLDialogElement | null) => {
    dialogRef.current = node;
    if (node && !node.open) node.showModal();
  }, []);
  const open = (id: string) => {
    companySearchVersion.current += 1;
    setCompanySearching(false);
    opener.current = document.activeElement as HTMLElement;
    setSelected(id);
    setDetail(null);
    setFields(null);
    setError("");
    setNotice("");
    setConfirmOutcome(false);
    setRationale("");
    setCompanies([]);
    setCompanyMessage("");
    setDuplicates([]);
    setUncertainOperation(null);
    requests.current = {};
  };
  useEffect(() => {
    if (!selected) return;
    if (selected === "new") {
      setLoading(false);
      setFields({
        name: "",
        companyId: null,
        companyName: "",
        companyHref: null,
        ownerId: context.memberId,
        nextStep: "",
        dueDate: "",
        summary: "",
        stage: "inbox",
      });
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/pipeline/deals/${encodeURIComponent(selected)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(readResponse<DealDetail>)
      .then((result) => {
        setDetail(result);
        setFields(fieldsFor(result.deal));
        setDestination(result.deal.stage);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Couldn't load this deal. Close and open it to try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected, context.memberId]);
  async function reloadDetail(id: string) {
    const latest = await readResponse<DealDetail>(
      await fetch(`/api/pipeline/deals/${encodeURIComponent(id)}`, {
        cache: "no-store",
      }),
    );
    setDetail(latest);
    setFields(fieldsFor(latest.deal));
    setDestination(latest.deal.stage);
    setConfirmOutcome(false);
    setRationale("");
    requests.current = {};
    router.refresh();
  }
  async function mutate(operation: "save" | "move") {
    if (
      !fields ||
      saving ||
      (uncertainOperation !== null && uncertainOperation !== operation) ||
      (operation === "move" &&
        detail &&
        JSON.stringify(fields) !== JSON.stringify(fieldsFor(detail.deal)))
    )
      return;
    setSaving(true);
    setError("");
    setNotice("");
    const requestId = requests.current[operation] ?? crypto.randomUUID();
    requests.current[operation] = requestId;
    const existing = detail?.deal;
    const payload =
      operation === "move"
        ? {
            requestId,
            expectedVersion: existing?.version,
            stage: destination,
            rationale,
            confirmed: confirmOutcome,
          }
        : {
            requestId,
            ...(existing || fields.name.trim() ? { name: fields.name } : {}),
            companyId: fields.companyId,
            companyName: fields.companyName,
            ownerId: fields.ownerId,
            nextStep: fields.nextStep,
            dueDate: fields.dueDate || null,
            summary: fields.summary,
            ...(existing
              ? { expectedVersion: existing.version }
              : { stage: fields.stage }),
          };
    const url = existing
      ? `/api/pipeline/deals/${encodeURIComponent(existing.id)}${operation === "move" ? "/transition" : ""}`
      : "/api/pipeline/deals";
    try {
      const result = await readResponse<{ deal: Deal }>(
        await fetch(url, {
          method: operation === "move" || !existing ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      requests.current = {};
      setUncertainOperation(null);
      router.refresh();
      if (!existing) {
        setToast("Deal added to the pipeline.");
        companySearchVersion.current += 1;
        dialogRef.current?.close();
        setSelected(null);
        setFields(null);
        opener.current?.focus();
      } else {
        setDetail((current) =>
          current ? { ...current, deal: result.deal } : current,
        );
        setFields(fieldsFor(result.deal));
        setDestination(result.deal.stage);
        setConfirmOutcome(false);
        setRationale("");
        setNotice(
          operation === "move"
            ? `Moved to ${STAGE_LABELS[result.deal.stage]}.`
            : "Changes saved.",
        );
        try {
          await reloadDetail(result.deal.id);
        } catch {
          setNotice(
            "Your change was saved. Close and reopen this deal to refresh its history.",
          );
        }
      }
    } catch (cause) {
      const code =
        cause instanceof Error && "code" in cause ? cause.code : undefined;
      setUncertainOperation(
        typeof code === "string" &&
          [
            "invalid",
            "forbidden",
            "not_found",
            "conflict",
            "unauthenticated",
          ].includes(code)
          ? null
          : operation,
      );
      if (
        cause instanceof Error &&
        "code" in cause &&
        cause.code === "conflict" &&
        existing
      ) {
        try {
          await reloadDetail(existing.id);
          setError(
            "Someone changed this deal. The latest version is now loaded. Review it and enter your changes again before saving.",
          );
        } catch {
          setError(
            "This deal changed and couldn't be reloaded. Close and open it again before saving.",
          );
          setFields(null);
        }
      } else
        setError(
          cause instanceof Error
            ? cause.message
            : "The change couldn't be saved. Please try again.",
        );
    } finally {
      setSaving(false);
    }
  }
  async function searchCompanies() {
    if (!fields?.companyName.trim()) {
      setCompanyMessage("Enter a company name to search.");
      return;
    }
    const searchVersion = ++companySearchVersion.current;
    setCompanies([]);
    setCompanySearching(true);
    setCompanyMessage("");
    try {
      const result = await readResponse<{ companies: CompanyReference[] }>(
        await fetch(
          `/api/pipeline/companies?q=${encodeURIComponent(fields.companyName)}`,
        ),
      );
      if (searchVersion !== companySearchVersion.current) return;
      setCompanies(result.companies);
      if (!result.companies.length)
        setCompanyMessage(
          "No company profiles found. You can capture this deal with a provisional company name.",
        );
    } catch {
      if (searchVersion !== companySearchVersion.current) return;
      setCompanyMessage(
        "Company search is unavailable. You can still use a provisional company name.",
      );
    } finally {
      if (searchVersion === companySearchVersion.current)
        setCompanySearching(false);
    }
  }
  async function chooseCompany(company: CompanyReference) {
    const searchVersion = ++companySearchVersion.current;
    setCompanySearching(false);
    resetRequests();
    setFields((current) =>
      current
        ? {
            ...current,
            companyId: company.id,
            companyName: company.name,
            companyHref: company.href,
          }
        : current,
    );
    setCompanies([]);
    setCompanyMessage("Company profile linked.");
    try {
      const result = await readResponse<DealList>(
        await fetch(
          `/api/pipeline/deals?scope=active&q=${encodeURIComponent(company.name)}`,
        ),
      );
      if (searchVersion !== companySearchVersion.current) return;
      setDuplicates(
        result.deals.filter(
          (deal) =>
            deal.companyId === company.id && deal.id !== detail?.deal.id,
        ),
      );
    } catch {
      if (searchVersion !== companySearchVersion.current) return;
      setCompanyMessage(
        "Company linked. Existing opportunities couldn't be checked.",
      );
    }
  }
  const hrefFor = (
    nextView: "board" | "list",
    scope = filters.scope ?? "active",
  ) => {
    const params = new URLSearchParams({ view: nextView, scope });
    if (filters.q) params.set("q", filters.q);
    if (filters.owner) params.set("owner", filters.owner);
    if (
      filters.stage &&
      (scope === "all" ||
        (scope === "active"
          ? isActiveStage(filters.stage)
          : !isActiveStage(filters.stage)))
    )
      params.set("stage", filters.stage);
    return `/pipeline?${params}`;
  };
  const visibleStages = filters.stage
    ? [filters.stage]
    : filters.scope === "closed"
      ? STAGES.filter((stage) => !isActiveStage(stage))
      : filters.scope === "all"
        ? STAGES
        : ACTIVE_STAGES;
  const availableStages =
    filters.scope === "all"
      ? STAGES
      : filters.scope === "closed"
        ? STAGES.filter((stage) => !isActiveStage(stage))
        : ACTIVE_STAGES;
  const hasUnsavedChanges = !!(
    detail &&
    fields &&
    JSON.stringify(fields) !== JSON.stringify(fieldsFor(detail.deal))
  );
  const isFiltered = !!(filters.q || filters.owner || filters.stage);
  const renderCard = (deal: Deal) => (
    <button
      type="button"
      className="pipeline-card"
      key={deal.id}
      onClick={() => open(deal.id)}
    >
      <span className="pipeline-company">{deal.companyName}</span>
      <strong>{deal.name}</strong>
      <span
        className={`pipeline-next ${!deal.nextStep && isActiveStage(deal.stage) ? "pipeline-attention" : ""}`}
      >
        {deal.nextStep ||
          (isActiveStage(deal.stage) ? "Add a next step" : "No next step")}
      </span>
      <span className="pipeline-card-meta">
        <span>{memberName(deal.ownerId)}</span>
        {deal.dueDate && (
          <time
            className={
              isActiveStage(deal.stage) && deal.dueDate < localToday()
                ? "pipeline-overdue"
                : ""
            }
            dateTime={deal.dueDate}
          >
            {isActiveStage(deal.stage) && deal.dueDate < localToday()
              ? "Overdue · "
              : "Due "}
            {dateLabel(deal.dueDate)}
          </time>
        )}
      </span>
      <span className="pipeline-movement">
        Entered {STAGE_LABELS[deal.stage]} {dateLabel(deal.stageEnteredAt)}
      </span>
    </button>
  );
  return (
    <>
      <a className="pipeline-skip" href="#pipeline-content">
        Skip to pipeline
      </a>
      <main className="pipeline-shell" id="pipeline-content">
        <header className="pipeline-topbar">
          <a className="pipeline-brand" href="/pipeline">
            NextGen<span>Ventures</span>
          </a>
          <span className="pipeline-firm">{context.firmName}</span>
          <span className="pipeline-user">{context.name}</span>
          <UserButton />
        </header>
        <section className="pipeline-content">
          <div className="pipeline-heading">
            <div>
              <h1>Deal Pipeline</h1>
              <p>From first look to investment decision.</p>
            </div>
            <button
              type="button"
              className="pipeline-primary"
              onClick={() => open("new")}
            >
              Add deal
            </button>
          </div>
          {toast && (
            <div className="pipeline-notice" role="status">
              {toast}
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToast("")}
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="pipeline-toolbar">
            <nav className="pipeline-scopes" aria-label="Deal status">
              {(["active", "closed", "all"] as const).map((scope) => (
                <a
                  key={scope}
                  aria-current={
                    (filters.scope ?? "active") === scope ? "page" : undefined
                  }
                  href={hrefFor(view, scope)}
                >
                  {scope === "all"
                    ? "All deals"
                    : scope === "active"
                      ? "Active pipeline"
                      : "Closed deals"}
                </a>
              ))}
            </nav>
            <nav className="pipeline-view" aria-label="Display">
              <a
                href={hrefFor("board")}
                aria-current={view === "board" ? "page" : undefined}
              >
                Board
              </a>
              <a
                href={hrefFor("list")}
                aria-current={view === "list" ? "page" : undefined}
              >
                List
              </a>
            </nav>
          </div>
          <form className="pipeline-filters" action="/pipeline" method="get">
            <input type="hidden" name="view" value={view} />
            <input
              type="hidden"
              name="scope"
              value={filters.scope ?? "active"}
            />
            <label className="pipeline-search">
              Search deals
              <input
                type="search"
                name="q"
                placeholder="Company or deal name"
                defaultValue={filters.q ?? ""}
              />
            </label>
            <label>
              Owner
              <select name="owner" defaultValue={filters.owner ?? ""}>
                <option value="">All owners</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stage
              <select name="stage" defaultValue={filters.stage ?? ""}>
                <option value="">All stages</option>
                {availableStages.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </label>
            <button className="pipeline-secondary" type="submit">
              Apply filters
            </button>
            {isFiltered && (
              <a
                className="pipeline-clear"
                href={`/pipeline?view=${view}&scope=${filters.scope ?? "active"}`}
              >
                Clear
              </a>
            )}
          </form>
          <div className="pipeline-results">
            <span>
              {initial.deals.length}{" "}
              {initial.deals.length === 1 ? "opportunity" : "opportunities"}
              {isFiltered ? " matching your filters" : " in view"}
            </span>
            <span>Select a deal to edit or move it</span>
          </div>
          {!initial.deals.length && (
            <div className="pipeline-empty">
              <h2>
                {isFiltered
                  ? "No deals match these filters"
                  : filters.scope === "closed"
                    ? "No closed deals yet"
                    : "Your next opportunity starts here"}
              </h2>
              <p>
                {isFiltered
                  ? "Try another company name, owner, or stage."
                  : filters.scope === "closed"
                    ? "Passed and invested opportunities will stay here with their history."
                    : "Capture a company, choose an owner, and give the team a shared place to follow the deal."}
              </p>
              {!isFiltered && filters.scope !== "closed" && (
                <button
                  type="button"
                  className="pipeline-primary"
                  onClick={() => open("new")}
                >
                  Add your first deal
                </button>
              )}
            </div>
          )}
          {view === "board" && (
            <div
              className={`pipeline-board ${visibleStages.length > 4 ? "pipeline-board-wide" : ""}`}
            >
              {visibleStages.map((stage) => (
                <section
                  className="pipeline-column"
                  key={stage}
                  aria-label={STAGE_LABELS[stage]}
                >
                  <h2>
                    <span>{STAGE_LABELS[stage]}</span>
                    <span className="pipeline-count">
                      {initial.counts[stage]}
                    </span>
                  </h2>
                  <p className="pipeline-column-description">
                    {isActiveStage(stage)
                      ? stageDescriptions[
                          stage as keyof typeof stageDescriptions
                        ]
                      : stage === "passed"
                        ? "Decided not to proceed"
                        : "Investment completed"}
                  </p>
                  <div className="pipeline-cards">
                    {initial.deals
                      .filter((deal) => deal.stage === stage)
                      .map(renderCard)}
                    {initial.deals.length > 0 &&
                      !initial.deals.some((deal) => deal.stage === stage) && (
                        <p className="pipeline-column-empty">
                          No deals in {STAGE_LABELS[stage].toLowerCase()}
                        </p>
                      )}
                  </div>
                </section>
              ))}
            </div>
          )}
          {view === "list" && initial.deals.length > 0 && (
            <div className="pipeline-table-wrap">
              <table className="pipeline-table">
                <thead>
                  <tr>
                    <th>Deal / company</th>
                    <th>Stage</th>
                    <th>Owner</th>
                    <th>Next step</th>
                    <th>Due date</th>
                    <th>Last movement</th>
                  </tr>
                </thead>
                <tbody>
                  {initial.deals.map((deal) => (
                    <tr key={deal.id}>
                      <td>
                        <button
                          type="button"
                          className="pipeline-deal-link"
                          onClick={() => open(deal.id)}
                        >
                          {deal.name}
                        </button>
                        <span className="pipeline-table-company">
                          {deal.companyName}
                        </span>
                      </td>
                      <td>{STAGE_LABELS[deal.stage]}</td>
                      <td>{memberName(deal.ownerId)}</td>
                      <td
                        className={
                          !deal.nextStep && isActiveStage(deal.stage)
                            ? "pipeline-attention"
                            : ""
                        }
                      >
                        {deal.nextStep ||
                          (isActiveStage(deal.stage)
                            ? "Add a next step"
                            : "None")}
                      </td>
                      <td
                        className={
                          deal.dueDate &&
                          isActiveStage(deal.stage) &&
                          deal.dueDate < localToday()
                            ? "pipeline-overdue"
                            : ""
                        }
                      >
                        {deal.dueDate
                          ? `${isActiveStage(deal.stage) && deal.dueDate < localToday() ? "Overdue · " : ""}${dateLabel(deal.dueDate)}`
                          : "Not set"}
                      </td>
                      <td>{dateLabel(deal.stageEnteredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {selected && (
          <dialog
            className="pipeline-dialog"
            ref={attachDialog}
            aria-labelledby="deal-dialog-title"
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <div className="pipeline-dialog-inner">
              <header className="pipeline-dialog-header">
                <div>
                  <h2 id="deal-dialog-title">
                    {selected === "new"
                      ? "Add a deal"
                      : (detail?.deal.name ?? "Deal details")}
                  </h2>
                  <p>
                    {selected === "new"
                      ? "Start with a company and an owner."
                      : detail
                        ? `${STAGE_LABELS[detail.deal.stage]} · Version ${detail.deal.version}`
                        : "Loading opportunity"}
                  </p>
                </div>
                <button
                  type="button"
                  className="pipeline-secondary"
                  disabled={saving || uncertainOperation !== null}
                  onClick={close}
                >
                  Close
                </button>
              </header>
              {error && (
                <div className="pipeline-error" role="alert">
                  {error}
                </div>
              )}
              {uncertainOperation && (
                <div className="pipeline-recovery" role="status">
                  <p>
                    This save has not been confirmed. Retry the original change
                    before editing, or reload the pipeline to check whether it
                    was saved before starting again.
                  </p>
                  <button
                    type="button"
                    className="pipeline-primary"
                    disabled={saving}
                    onClick={() => void mutate(uncertainOperation)}
                  >
                    {saving ? "Checking save…" : "Retry original save"}
                  </button>
                  <a href="/pipeline">Reload and check pipeline</a>
                </div>
              )}
              {notice && (
                <div className="pipeline-notice" role="status">
                  {notice}
                </div>
              )}
              {loading && (
                <p className="pipeline-loading" role="status">
                  Loading deal and activity…
                </p>
              )}
              {fields && (
                <>
                  <form
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      void mutate("save");
                    }}
                  >
                    <fieldset
                      className="pipeline-edit-fields"
                      disabled={saving || uncertainOperation !== null}
                    >
                      <label>
                        Deal name{" "}
                        {selected === "new" && <span>(optional)</span>}
                        <input
                          required={selected !== "new"}
                          maxLength={200}
                          value={fields.name}
                          onChange={(event) =>
                            update("name", event.target.value)
                          }
                          placeholder="e.g. Company · Seed round"
                          autoFocus={selected === "new"}
                        />
                      </label>
                      <label>
                        Company name
                        <input
                          required
                          maxLength={200}
                          value={fields.companyName}
                          onChange={(event) =>
                            update("companyName", event.target.value)
                          }
                        />
                      </label>
                      <div className="pipeline-company-search">
                        <button
                          className="pipeline-secondary"
                          type="button"
                          disabled={companySearching}
                          onClick={() => void searchCompanies()}
                        >
                          {companySearching
                            ? "Searching…"
                            : "Find company profile"}
                        </button>
                        {fields.companyId && fields.companyHref && (
                          <a href={fields.companyHref}>Open company profile</a>
                        )}
                      </div>
                      {companyMessage && (
                        <p className="pipeline-help" role="status">
                          {companyMessage}
                        </p>
                      )}
                      {companies.length > 0 && (
                        <ul className="pipeline-company-options">
                          {companies.map((company) => (
                            <li key={company.id}>
                              <button
                                type="button"
                                onClick={() => void chooseCompany(company)}
                              >
                                {company.name}
                                <span>Link profile</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {duplicates.length > 0 && (
                        <div className="pipeline-duplicate">
                          <strong>Already in the active pipeline</strong>
                          <ul>
                            {duplicates.map((deal) => (
                              <li key={deal.id}>
                                {deal.name} · {STAGE_LABELS[deal.stage]}
                              </li>
                            ))}
                          </ul>
                          <p>
                            You can add another opportunity for this company.
                          </p>
                        </div>
                      )}
                      <div className="pipeline-form-pair">
                        <label>
                          Owner
                          <select
                            required
                            value={fields.ownerId}
                            onChange={(event) =>
                              update("ownerId", event.target.value)
                            }
                          >
                            {!members.some(
                              (member) => member.id === fields.ownerId,
                            ) && (
                              <option value={fields.ownerId}>
                                {memberName(fields.ownerId)}
                              </option>
                            )}
                            {members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selected === "new" ? (
                          <label>
                            Initial stage
                            <select
                              value={fields.stage}
                              onChange={(event) =>
                                update("stage", event.target.value as Stage)
                              }
                            >
                              {ACTIVE_STAGES.map((stage) => (
                                <option key={stage} value={stage}>
                                  {STAGE_LABELS[stage]}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <label>
                            Next-step due date <span>(optional)</span>
                            <input
                              type="date"
                              value={fields.dueDate}
                              onChange={(event) =>
                                update("dueDate", event.target.value)
                              }
                            />
                          </label>
                        )}
                      </div>
                      <label>
                        Next step <span>(optional)</span>
                        <input
                          maxLength={500}
                          value={fields.nextStep}
                          onChange={(event) =>
                            update("nextStep", event.target.value)
                          }
                          placeholder="e.g. Schedule a founder introduction"
                        />
                      </label>
                      {selected === "new" && (
                        <label>
                          Next-step due date <span>(optional)</span>
                          <input
                            type="date"
                            value={fields.dueDate}
                            onChange={(event) =>
                              update("dueDate", event.target.value)
                            }
                          />
                        </label>
                      )}
                      <label>
                        Internal summary <span>(optional)</span>
                        <textarea
                          rows={5}
                          maxLength={10000}
                          value={fields.summary}
                          onChange={(event) =>
                            update("summary", event.target.value)
                          }
                          placeholder="Investment context and notes for your team"
                        />
                      </label>
                      <p className="pipeline-help">
                        Internal deal notes are team context, separate from
                        sourced company research.
                      </p>
                      <button className="pipeline-primary" type="submit">
                        {saving
                          ? "Saving…"
                          : selected === "new"
                            ? "Create deal"
                            : "Save changes"}
                      </button>
                    </fieldset>
                  </form>
                  {detail && (
                    <>
                      <section className="pipeline-move">
                        {hasUnsavedChanges && (
                          <p className="pipeline-unsaved" role="status">
                            Unsaved changes. Save changes before moving this
                            deal.
                          </p>
                        )}
                        <h3>
                          {isActiveStage(detail.deal.stage)
                            ? "Move deal"
                            : "Reopen deal"}
                        </h3>
                        <p>
                          {isActiveStage(detail.deal.stage)
                            ? "Every stage change is recorded in the activity history."
                            : "Return this opportunity to an active stage. Its earlier outcome stays in the history."}
                        </p>
                        <fieldset
                          disabled={saving || uncertainOperation !== null}
                        >
                          <label>
                            {isActiveStage(detail.deal.stage)
                              ? "Destination stage"
                              : "Reopen in"}
                            <select
                              value={destination}
                              onChange={(event) => {
                                resetRequests();
                                setDestination(event.target.value as Stage);
                                setConfirmOutcome(false);
                                setRationale("");
                              }}
                            >
                              {!isActiveStage(detail.deal.stage) && (
                                <option value={detail.deal.stage}>
                                  Choose an active stage
                                </option>
                              )}
                              {(isActiveStage(detail.deal.stage)
                                ? STAGES
                                : ACTIVE_STAGES
                              ).map((stage) => (
                                <option key={stage} value={stage}>
                                  {STAGE_LABELS[stage]}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!isActiveStage(destination) &&
                            destination !== detail.deal.stage && (
                              <div className="pipeline-outcome">
                                <label>
                                  Outcome rationale <span>(optional)</span>
                                  <textarea
                                    rows={3}
                                    maxLength={2000}
                                    value={rationale}
                                    onChange={(event) => {
                                      resetRequests();
                                      setRationale(event.target.value);
                                    }}
                                  />
                                </label>
                                <label className="pipeline-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={confirmOutcome}
                                    onChange={(event) => {
                                      resetRequests();
                                      setConfirmOutcome(event.target.checked);
                                    }}
                                  />
                                  I confirm this deal should be marked{" "}
                                  {STAGE_LABELS[destination].toLowerCase()} and
                                  removed from the active pipeline.
                                </label>
                              </div>
                            )}
                          <button
                            type="button"
                            className="pipeline-secondary"
                            disabled={
                              hasUnsavedChanges ||
                              destination === detail.deal.stage ||
                              (!isActiveStage(destination) && !confirmOutcome)
                            }
                            onClick={() => void mutate("move")}
                          >
                            {saving
                              ? "Saving…"
                              : isActiveStage(detail.deal.stage)
                                ? "Move deal"
                                : "Reopen deal"}
                          </button>
                        </fieldset>
                      </section>
                      <section className="pipeline-history">
                        <h3>Activity history</h3>
                        <ol>
                          {detail.events.map((event) => (
                            <li key={event.id}>
                              <div>
                                <strong>
                                  {event.kind === "created"
                                    ? `Created in ${STAGE_LABELS[event.toStage]}`
                                    : event.kind === "updated"
                                      ? "Updated deal"
                                      : `${event.kind === "reopened" ? "Reopened" : event.kind === "closed" ? "Closed" : "Moved"} ${event.fromStage ? `from ${STAGE_LABELS[event.fromStage]} ` : ""}to ${STAGE_LABELS[event.toStage]}`}
                                </strong>
                                <span>
                                  {memberName(event.actorId)} ·{" "}
                                  <time dateTime={event.occurredAt}>
                                    {dateLabel(event.occurredAt, true)}
                                  </time>
                                </span>
                              </div>
                              {event.rationale && <p>{event.rationale}</p>}
                              {Object.entries(event.changes).length > 0 && (
                                <dl>
                                  {Object.entries(event.changes).map(
                                    ([key, values]) => (
                                      <div key={key}>
                                        <dt>
                                          {(
                                            {
                                              name: "Deal name",
                                              companyName: "Company",
                                              companyId: "Company profile",
                                              ownerId: "Owner",
                                              nextStep: "Next step",
                                              dueDate: "Due date",
                                              summary: "Internal summary",
                                            } as Record<string, string>
                                          )[key] ?? key}
                                        </dt>
                                        <dd>
                                          <span>
                                            Before:{" "}
                                            {key === "ownerId" && values.before
                                              ? memberName(
                                                  String(values.before),
                                                )
                                              : String(
                                                  values.before ?? "Not set",
                                                ) || "Not set"}
                                          </span>
                                          <span>
                                            After:{" "}
                                            {key === "ownerId" && values.after
                                              ? memberName(String(values.after))
                                              : String(
                                                  values.after ?? "Not set",
                                                ) || "Not set"}
                                          </span>
                                        </dd>
                                      </div>
                                    ),
                                  )}
                                </dl>
                              )}
                            </li>
                          ))}
                        </ol>
                        {!detail.events.length && <p>No activity recorded.</p>}
                      </section>
                    </>
                  )}
                </>
              )}
            </div>
          </dialog>
        )}
      </main>
    </>
  );
}
