"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  categories,
  type Evidence,
  memoSections,
  type ResearchDocument,
  type Revision,
  type SaveInput,
  type UploadInput,
  type Workspace,
  type WrittenRecord,
} from "../domain/types";

type Tab = "document" | "note" | "memo";
const latest = (record: WrittenRecord) =>
  record.revisions[record.revisions.length - 1];
const stamp = (value: string) => new Date(value).toLocaleString();
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(body.error || "Request failed. Please try again."),
      { code: body.code },
    );
  return body as T;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function FormattedText({ text }: { text: string }) {
  return (
    <div className="research-markdown">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function ResearchWorkspace({ initial }: { initial: Workspace }) {
  const [data, setData] = useState(initial);
  const [companyId, setCompany] = useState(initial.companies[0]?.id ?? "");
  const [dealFilter, setDealFilter] = useState("all");
  const [tab, setTab] = useState<Tab>("document");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const [showArchive, setShowArchive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<SaveInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<WrittenRecord | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<{
    title: string;
    revision: Revision;
    archived: boolean;
  } | null>(null);
  const [evidenceChoice, setEvidenceChoice] = useState("");
  const [locator, setLocator] = useState("");
  const [upload, setUpload] = useState<UploadInput | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<{
    title: string;
    category: ResearchDocument["category"];
    description: string;
  } | null>(null);
  useEffect(() => {
    const dialog = sourceDialog.current;
    if (source && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [source]);
  const canEdit = data.actor.role !== "viewer";
  const admin = data.actor.role === "admin";
  const deals = data.deals.filter((d) => d.companyId === companyId);
  const document = data.documents.find((item) => item.id === selected);
  const record = data.records.find((item) => item.id === selected);
  const historical = record?.revisions.find((rev) => rev.id === history);
  const revision = historical ?? (record ? latest(record) : null);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const leave = (event: MouseEvent) => {
      const target =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        dirtyRef.current &&
        target &&
        !target.hasAttribute("download") &&
        target.target !== "_blank" &&
        !window.confirm("You have unsaved changes. Leave and discard them?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.document.removeEventListener("click", leave, true);
    };
  }, []);

  function canLeave() {
    return !dirty || window.confirm("Discard your unsaved changes?");
  }
  function clearEditor() {
    setSelected(null);
    setDraft(null);
    setDirty(false);
    setHistory(null);
    setConflict(null);
    setMetadata(null);
    setUpload(null);
    setFile(null);
    setError("");
    setNotice("");
  }
  function navigate(action: () => void) {
    if (!busy && canLeave()) {
      clearEditor();
      action();
    }
  }
  async function refresh() {
    const fresh = await request<Workspace>("/api/research");
    setData(fresh);
    return fresh;
  }
  function edit(change: Partial<SaveInput>) {
    setDraft((previous) => (previous ? { ...previous, ...change } : previous));
    setDirty(true);
    setNotice("");
  }
  function openRecord(item: WrittenRecord) {
    navigate(() => {
      const rev = latest(item);
      setSelected(item.id);
      setDraft({
        id: item.id,
        kind: item.kind,
        companyId: item.companyId,
        dealId: item.dealId,
        expectedRevisionId: rev.id,
        title: rev.title,
        body: rev.body,
        sections: { ...rev.sections },
        label: rev.label,
        evidence: [...rev.evidence],
        owner: item.owner,
      });
    });
  }
  function newRecord(kind: "note" | "memo") {
    navigate(() => {
      setDraft({
        kind,
        companyId,
        dealId:
          dealFilter === "all" || dealFilter === "company" ? null : dealFilter,
        expectedRevisionId: null,
        title: "",
        body: "",
        sections: Object.fromEntries(
          memoSections.map((section) => [section, ""]),
        ),
        label: "Observation",
        evidence: [],
        owner: data.actor.userId,
      });
      setDirty(true);
    });
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    setNotice("Saving…");
    try {
      const saved = await request<WrittenRecord>(
        "/api/research/records",
        json(draft),
      );
      setDraft({
        ...draft,
        id: saved.id,
        expectedRevisionId: latest(saved).id,
      });
      setSelected(saved.id);
      setDirty(false);
      setConflict(null);
      setNotice("Saved");
      await refresh();
    } catch (failure) {
      setNotice("");
      setError(failure instanceof Error ? failure.message : "Save failed.");
      if ((failure as { code?: string }).code === "conflict") {
        try {
          const fresh = await refresh();
          setConflict(
            fresh.records.find((item) => item.id === draft.id) ?? null,
          );
        } catch {
          setError(
            "Your draft is preserved. Refresh failed; try saving again to compare with the latest revision.",
          );
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function mutate(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  function beginUpload(item?: ResearchDocument) {
    navigate(() => {
      if (item) setSelected(item.id);
      setUpload({
        companyId,
        dealId: item
          ? item.dealId
          : dealFilter === "all" || dealFilter === "company"
            ? null
            : dealFilter,
        ...(item ? { documentId: item.id } : {}),
        title: item?.title ?? "",
        category: item?.category ?? "Other",
        description: item?.description ?? "",
        filename: "",
        size: 0,
      });
    });
  }
  async function submitUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!upload || !file || busy) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("Choose a PDF or DOCX file no larger than 25 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("Reserving upload…");
    try {
      const reserved = await request<{ documentId: string; versionId: string }>(
        "/api/research/uploads",
        json({ ...upload, filename: file.name, size: file.size }),
      );
      setSelected(reserved.documentId);
      setUpload({ ...upload, documentId: reserved.documentId });
      setNotice("Uploading and checking file…");
      const result = await request<ResearchDocument>(
        `/api/research/uploads/${reserved.versionId}`,
        { method: "PUT", body: file },
      );
      setUpload(null);
      setFile(null);
      setDirty(false);
      await refresh();
      const version = result.versions.find((v) => v.id === reserved.versionId);
      setNotice(
        version?.state === "ready"
          ? "Document ready"
          : "Upload received. See the version status below.",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Upload failed.");
      try {
        await refresh();
      } catch {
        /* Preserve the upload form for retry. */
      }
    } finally {
      setBusy(false);
    }
  }
  const scoped = (item: {
    companyId: string;
    dealId: string | null;
    archived: boolean;
  }) =>
    item.companyId === companyId &&
    (showArchive || !item.archived) &&
    (dealFilter === "all" ||
      item.dealId === null ||
      item.dealId === dealFilter);
  const items = (
    tab === "document"
      ? data.documents
          .filter(scoped)
          .filter(
            (item) =>
              (category === "all" || item.category === category) &&
              `${item.title} ${item.description} ${item.category}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
      : data.records
          .filter(scoped)
          .filter(
            (item) =>
              item.kind === tab &&
              `${latest(item).title} ${latest(item).label} ${item.owner}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
  ).sort((a, b) =>
    sort === "newest"
      ? b.updatedAt.localeCompare(a.updatedAt)
      : a.updatedAt.localeCompare(b.updatedAt),
  );
  const contextName = (dealId: string | null) =>
    dealId
      ? (data.deals.find((deal) => deal.id === dealId)?.name ??
        "Unavailable deal")
      : "Company-wide";
  const evidenceOptions: { key: string; label: string; value: Evidence }[] = [
    ...data.documents
      .filter(
        (item) =>
          item.companyId === (draft?.companyId ?? companyId) &&
          (item.dealId === null || item.dealId === draft?.dealId),
      )
      .flatMap((item) =>
        item.versions
          .map((version, index) => ({
            key: `document:${item.id}:${version.id}`,
            label: `${item.title} · version ${index + 1}${item.archived ? " · archived" : ""} · ${version.filename}`,
            ready: version.state === "ready",
            value: {
              kind: "document" as const,
              targetId: item.id,
              revisionId: version.id,
              locator: "",
            },
          }))
          .filter((option) => option.ready),
      ),
    ...data.records
      .filter(
        (item) =>
          item.kind === "note" &&
          item.id !== draft?.id &&
          item.companyId === (draft?.companyId ?? companyId) &&
          (item.dealId === null || item.dealId === draft?.dealId),
      )
      .flatMap((item) =>
        item.revisions.map((rev, index) => ({
          key: `note:${item.id}:${rev.id}`,
          label: `${rev.title} · revision ${index + 1}${item.archived ? " · archived" : ""}`,
          value: {
            kind: "note" as const,
            targetId: item.id,
            revisionId: rev.id,
            locator: "",
          },
        })),
      ),
  ];
  function evidenceLabel(item: Evidence) {
    if (item.kind === "document") {
      const doc = data.documents.find((d) => d.id === item.targetId);
      const version = doc?.versions.find((v) => v.id === item.revisionId);
      return doc && version
        ? `${doc.title} · ${version.filename} · ${stamp(version.createdAt)}${doc.archived ? " · archived" : ""}${version.state !== "ready" ? ` · ${version.state}` : ""}`
        : "Unavailable document version";
    }
    const note = data.records.find((n) => n.id === item.targetId);
    const rev = note?.revisions.find((r) => r.id === item.revisionId);
    return rev
      ? `${rev.title} · ${stamp(rev.createdAt)}${note?.archived ? " · archived" : ""}`
      : "Unavailable note revision";
  }
  function evidenceView(evidence: Evidence[], editable = false) {
    return (
      <ul className="research-evidence">
        {evidence.map((item, index) => {
          const docVersion = data.documents
            .find((d) => d.id === item.targetId)
            ?.versions.find((v) => v.id === item.revisionId);
          const note = data.records.find((n) => n.id === item.targetId);
          const rev = note?.revisions.find((r) => r.id === item.revisionId);
          return (
            <li
              key={`${item.kind}:${item.targetId}:${item.revisionId}:${item.locator}`}
            >
              <span>
                {item.kind === "document" && docVersion?.state === "ready" ? (
                  <a
                    href={`/api/research/files/${item.revisionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {evidenceLabel(item)}
                  </a>
                ) : item.kind === "note" && rev ? (
                  <button
                    className="research-link"
                    type="button"
                    onClick={() =>
                      setSource({
                        title: rev.title,
                        revision: rev,
                        archived: note?.archived ?? false,
                      })
                    }
                  >
                    {evidenceLabel(item)}
                  </button>
                ) : (
                  evidenceLabel(item)
                )}
                {item.locator && <small>Locator: {item.locator}</small>}
              </span>
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove evidence ${index + 1}`}
                  disabled={busy}
                  onClick={() =>
                    edit({ evidence: evidence.filter((_, i) => i !== index) })
                  }
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
        {evidence.length === 0 && (
          <li className="research-muted">No supporting evidence linked yet.</li>
        )}
      </ul>
    );
  }

  return (
    <main className="research-app">
      <header className="research-heading">
        <div>
          <h1>Research &amp; Diligence</h1>
          <p>
            Gather evidence. Record your thinking. Develop the investment case.
          </p>
        </div>
        <span className="research-role">{data.actor.role}</span>
      </header>
      <div className="research-scope">
        <label>
          Company
          <select
            value={companyId}
            disabled={busy}
            onChange={(event) =>
              navigate(() => {
                setCompany(event.target.value);
                setDealFilter("all");
              })
            }
          >
            {!companyId && <option value="">Select company</option>}
            {data.companies.map((company) => (
              <option value={company.id} key={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deal context
          <select
            value={dealFilter}
            disabled={!companyId || busy}
            onChange={(event) =>
              navigate(() => setDealFilter(event.target.value))
            }
          >
            <option value="all">All research</option>
            <option value="company">Company-wide only</option>
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Research stays with the company throughout the investment lifecycle.
        </p>
      </div>
      {!companyId ? (
        <section className="research-empty">
          <h2>No companies available</h2>
          <p>
            Ask your administrator to add a canonical company reference to begin
            collecting research.
          </p>
        </section>
      ) : (
        <>
          <div
            className="research-tabs"
            role="tablist"
            aria-label="Research types"
          >
            {(["document", "note", "memo"] as Tab[]).map((value) => (
              <button
                key={value}
                id={`tab-${value}`}
                type="button"
                role="tab"
                aria-controls="research-content"
                aria-selected={tab === value}
                onClick={() => navigate(() => setTab(value))}
              >
                {value === "document"
                  ? "Documents"
                  : value === "note"
                    ? "Notes"
                    : "Memo drafts"}
                <span>
                  {
                    (value === "document"
                      ? data.documents
                      : data.records.filter((r) => r.kind === value)
                    ).filter(scoped).length
                  }
                </span>
              </button>
            ))}
          </div>
          <div className="research-toolbar">
            <label className="research-search">
              Search
              <input
                aria-label="Search research title and metadata"
                placeholder="Search title and metadata"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {tab === "document" && (
              <label>
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="all">All categories</option>
                  {categories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">Recently updated</option>
                <option value="oldest">Oldest updated</option>
              </select>
            </label>
            <label className="research-check">
              <input
                type="checkbox"
                checked={showArchive}
                onChange={(event) => setShowArchive(event.target.checked)}
              />
              Show archived
            </label>
            {canEdit && (
              <button
                type="button"
                className="research-primary"
                disabled={busy}
                onClick={() =>
                  tab === "document" ? beginUpload() : newRecord(tab)
                }
              >
                {tab === "document"
                  ? "Upload document"
                  : tab === "note"
                    ? "New note"
                    : "New memo"}
              </button>
            )}
          </div>
          <div aria-live="polite" role="status" className="research-status">
            {busy ? notice || "Working…" : notice}
            {dirty && !busy && <span>Unsaved changes</span>}
          </div>
          {error && (
            <p role="alert" className="research-error">
              {error}
            </p>
          )}
          <div
            id="research-content"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            className="research-columns"
          >
            <section className="research-list" aria-label="Research items">
              <p className="research-count">
                {items.length} {items.length === 1 ? "item" : "items"}
              </p>
              {items.length === 0 ? (
                <div className="research-empty">
                  <h2>
                    {query || category !== "all"
                      ? "No matching research"
                      : `No ${tab === "document" ? "documents" : tab === "note" ? "notes" : "memo drafts"} yet`}
                  </h2>
                  <p>
                    {query || category !== "all"
                      ? "Try another search or filter."
                      : "Collect evidence and capture the questions that matter."}
                  </p>
                </div>
              ) : (
                items.map((item) => {
                  const isDocument = "versions" in item;
                  const rev = !isDocument ? latest(item) : null;
                  const pending = isDocument
                    ? item.versions[item.versions.length - 1]
                    : null;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`research-item ${selected === item.id ? "is-selected" : ""}`}
                      onClick={() =>
                        isDocument
                          ? navigate(() => setSelected(item.id))
                          : openRecord(item)
                      }
                    >
                      <strong>{isDocument ? item.title : rev?.title}</strong>
                      <span>
                        {isDocument
                          ? item.category
                          : item.kind === "note"
                            ? rev?.label
                            : `${memoSections.filter((section) => !rev?.sections[section]?.trim()).length} sections incomplete`}
                        {item.archived ? " · Archived" : ""}
                      </span>
                      <span>{contextName(item.dealId)}</span>
                      {pending && (
                        <span
                          className={`research-state state-${pending.state}`}
                        >
                          {pending.state}
                        </span>
                      )}
                      <small>
                        {isDocument ? pending?.uploader : item.owner} ·{" "}
                        {stamp(item.updatedAt)}
                      </small>
                    </button>
                  );
                })
              )}
            </section>
            <section className="research-detail" aria-label="Research detail">
              {upload ? (
                <form onSubmit={submitUpload} className="research-form">
                  <h2>
                    {upload.documentId
                      ? "Upload new version"
                      : "Upload document"}
                  </h2>
                  <p>
                    PDF or DOCX, up to 25 MB. Files are available only after
                    validation and malware scanning.
                  </p>
                  <label>
                    Title
                    <input
                      required
                      maxLength={200}
                      disabled={busy}
                      value={upload.title}
                      onChange={(e) => {
                        setUpload({ ...upload, title: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </label>
                  <label>
                    Category
                    <select
                      disabled={busy}
                      value={upload.category}
                      onChange={(e) => {
                        setUpload({
                          ...upload,
                          category: e.target
                            .value as ResearchDocument["category"],
                        });
                        setDirty(true);
                      }}
                    >
                      {categories.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Description
                    <textarea
                      disabled={busy}
                      value={upload.description}
                      onChange={(e) => {
                        setUpload({ ...upload, description: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </label>
                  {!upload.documentId && (
                    <label>
                      Deal context
                      <select
                        disabled={busy}
                        value={upload.dealId ?? ""}
                        onChange={(e) => {
                          setUpload({
                            ...upload,
                            dealId: e.target.value || null,
                          });
                          setDirty(true);
                        }}
                      >
                        <option value="">Company-wide</option>
                        {deals.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    File
                    <input
                      required
                      disabled={busy}
                      type="file"
                      accept=".pdf,.docx"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setDirty(true);
                      }}
                    />
                  </label>
                  <div className="research-actions">
                    <button
                      type="submit"
                      className="research-primary"
                      disabled={busy || !file}
                    >
                      Upload and check
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => navigate(() => {})}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : document && tab === "document" ? (
                <>
                  <div className="research-detail-heading">
                    <h2>{document.title}</h2>
                    {document.archived && <span>Archived</span>}
                  </div>
                  <p className="research-muted">
                    {document.category} · {contextName(document.dealId)}
                  </p>
                  <p className="research-prose">
                    {document.description || "No description added."}
                  </p>
                  {canEdit && !document.archived && (
                    <div className="research-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => beginUpload(document)}
                      >
                        Upload new version
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (canLeave()) {
                            setMetadata({
                              title: document.title,
                              category: document.category,
                              description: document.description,
                            });
                            setDirty(false);
                          }
                        }}
                      >
                        Edit metadata
                      </button>
                    </div>
                  )}
                  {metadata && (
                    <form
                      className="research-form research-inset"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (busy) return;
                        await mutate(async () => {
                          await request(`/api/research/items/${document.id}`, {
                            ...json({ kind: "document", ...metadata }),
                            method: "PATCH",
                          });
                          setMetadata(null);
                          setDirty(false);
                        }, "Metadata saved");
                      }}
                    >
                      <label>
                        Title
                        <input
                          required
                          disabled={busy}
                          value={metadata.title}
                          onChange={(e) => {
                            setMetadata({ ...metadata, title: e.target.value });
                            setDirty(true);
                          }}
                        />
                      </label>
                      <label>
                        Category
                        <select
                          disabled={busy}
                          value={metadata.category}
                          onChange={(e) => {
                            setMetadata({
                              ...metadata,
                              category: e.target
                                .value as ResearchDocument["category"],
                            });
                            setDirty(true);
                          }}
                        >
                          {categories.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Description
                        <textarea
                          disabled={busy}
                          value={metadata.description}
                          onChange={(e) => {
                            setMetadata({
                              ...metadata,
                              description: e.target.value,
                            });
                            setDirty(true);
                          }}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={busy}
                        className="research-primary"
                      >
                        Save metadata
                      </button>
                    </form>
                  )}
                  <h3>Versions</h3>
                  <p className="research-muted">
                    Earlier versions remain available for existing citations.
                  </p>
                  <ol className="research-versions">
                    {[...document.versions].reverse().map((version, index) => (
                      <li key={version.id}>
                        <div>
                          <strong>
                            Version {document.versions.length - index} ·{" "}
                            {version.filename}
                          </strong>
                          <span
                            className={`research-state state-${version.state}`}
                          >
                            {version.state}
                            {version.id === document.currentVersionId
                              ? " · current"
                              : ""}
                          </span>
                        </div>
                        <small>
                          {(version.size / 1024).toFixed(0)} KB ·{" "}
                          {version.uploader} · {stamp(version.createdAt)}
                        </small>
                        <p>
                          {version.message ||
                            (version.state === "pending"
                              ? "Waiting for upload or verification."
                              : version.state === "ready"
                                ? "Validated and scanned."
                                : "See the processing status before retrying.")}
                        </p>
                        {version.state === "ready" && (
                          <a
                            href={`/api/research/files/${version.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Download version {document.versions.length - index}
                          </a>
                        )}
                        {canEdit && version.state === "failed" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              mutate(
                                () =>
                                  request(
                                    `/api/research/uploads/${version.id}/retry`,
                                    json({}),
                                  ),
                                "Processing retried",
                              )
                            }
                          >
                            Retry processing
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              ) : draft ? (
                <>
                  <div className="research-detail-heading">
                    <h2>
                      {draft.kind === "note" ? "Research note" : "Memo draft"}
                    </h2>
                    <span>
                      {record?.archived
                        ? "Archived"
                        : dirty
                          ? "Unsaved"
                          : record
                            ? "Saved"
                            : "New draft"}
                    </span>
                  </div>
                  {record && (
                    <label className="research-history-label">
                      Revision history
                      <select
                        value={history ?? "latest"}
                        onChange={(e) =>
                          setHistory(
                            e.target.value === "latest" ? null : e.target.value,
                          )
                        }
                      >
                        <option value="latest">Latest draft / editor</option>
                        {[...record.revisions].reverse().map((rev, i) => (
                          <option key={rev.id} value={rev.id}>
                            Revision {record.revisions.length - i} ·{" "}
                            {rev.author} · {stamp(rev.createdAt)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {(history || !canEdit || record?.archived) && revision ? (
                    <article className="research-history">
                      <p className="research-muted">
                        Saved revision · {revision.author} ·{" "}
                        {stamp(revision.createdAt)}
                        {history && canEdit
                          ? ". Your current draft is preserved."
                          : ""}
                        {record && <> · Owner: {record.owner}</>}
                      </p>
                      <h2>{revision.title}</h2>
                      {draft.kind === "note" ? (
                        <>
                          <p>{revision.label}</p>
                          <div className="research-prose">
                            <FormattedText text={revision.body} />
                          </div>
                        </>
                      ) : (
                        memoSections.map((section) => (
                          <section key={section}>
                            <h3>{section}</h3>
                            <div className="research-prose">
                              <FormattedText
                                text={
                                  revision.sections[section] || "Incomplete"
                                }
                              />
                            </div>
                          </section>
                        ))
                      )}
                      <h3>Evidence at this revision</h3>
                      {evidenceView(revision.evidence)}
                      {history && canEdit && !record?.archived && (
                        <button type="button" onClick={() => setHistory(null)}>
                          Return to current draft
                        </button>
                      )}
                    </article>
                  ) : (
                    <form
                      className="research-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                      }}
                    >
                      <fieldset
                        disabled={!canEdit || busy || !!record?.archived}
                      >
                        <label>
                          Title
                          <input
                            required
                            maxLength={200}
                            value={draft.title}
                            onChange={(e) => edit({ title: e.target.value })}
                          />
                        </label>
                        <div className="research-field-row">
                          <label>
                            Deal context
                            <select
                              value={draft.dealId ?? ""}
                              disabled={!!draft.id}
                              onChange={(e) =>
                                edit({ dealId: e.target.value || null })
                              }
                            >
                              <option value="">Company-wide</option>
                              {deals.map((deal) => (
                                <option key={deal.id} value={deal.id}>
                                  {deal.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {draft.kind === "memo" ? (
                            <label>
                              Owner
                              <input
                                required
                                value={draft.owner ?? ""}
                                readOnly
                              />
                            </label>
                          ) : (
                            <label>
                              Note type
                              <select
                                value={draft.label}
                                onChange={(e) =>
                                  edit({
                                    label: e.target.value as Revision["label"],
                                  })
                                }
                              >
                                {[
                                  "Observation",
                                  "Interpretation",
                                  "Open question",
                                ].map((value) => (
                                  <option key={value}>{value}</option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                        <p className="research-muted">
                          Use paragraphs, **bold text**, and https:// links.
                          Source material stays distinct from your assessment.
                        </p>
                        {draft.kind === "note" ? (
                          <label>
                            Note
                            <textarea
                              className="research-body"
                              value={draft.body}
                              onChange={(e) => edit({ body: e.target.value })}
                            />
                          </label>
                        ) : (
                          <>
                            <p className="research-completeness">
                              {
                                memoSections.filter((section) =>
                                  draft.sections[section]?.trim(),
                                ).length
                              }{" "}
                              of {memoSections.length} sections drafted ·
                              Recommendation optional
                            </p>
                            {memoSections.map((section) => (
                              <label key={section}>
                                {section}
                                <span className="research-incomplete">
                                  {!draft.sections[section]?.trim()
                                    ? "Incomplete"
                                    : ""}
                                </span>
                                <textarea
                                  rows={4}
                                  value={draft.sections[section] ?? ""}
                                  onChange={(e) =>
                                    edit({
                                      sections: {
                                        ...draft.sections,
                                        [section]: e.target.value,
                                      },
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </>
                        )}
                      </fieldset>
                      <details className="research-preview">
                        <summary>Preview current draft</summary>
                        <h2>{draft.title || "Untitled draft"}</h2>
                        {draft.kind === "note" ? (
                          <FormattedText text={draft.body} />
                        ) : (
                          memoSections.map((section) => (
                            <section key={section}>
                              <h3>{section}</h3>
                              <FormattedText
                                text={draft.sections[section] || "Incomplete"}
                              />
                            </section>
                          ))
                        )}
                      </details>
                      <h3>Supporting evidence</h3>
                      {evidenceView(
                        draft.evidence,
                        canEdit && !record?.archived,
                      )}
                      <fieldset
                        disabled={!canEdit || busy || !!record?.archived}
                      >
                        <label>
                          Source version
                          <select
                            value={evidenceChoice}
                            onChange={(e) => setEvidenceChoice(e.target.value)}
                          >
                            <option value="">
                              Choose a document version or note revision
                            </option>
                            {evidenceOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Page or section locator (optional)
                          <input
                            value={locator}
                            onChange={(e) => setLocator(e.target.value)}
                            placeholder="e.g. page 12, Revenue assumptions"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={!evidenceChoice}
                          onClick={() => {
                            const option = evidenceOptions.find(
                              (o) => o.key === evidenceChoice,
                            );
                            if (
                              option &&
                              !draft.evidence.some(
                                (item) =>
                                  item.kind === option.value.kind &&
                                  item.targetId === option.value.targetId &&
                                  item.revisionId === option.value.revisionId &&
                                  item.locator === locator,
                              )
                            ) {
                              edit({
                                evidence: [
                                  ...draft.evidence,
                                  { ...option.value, locator },
                                ],
                              });
                              setEvidenceChoice("");
                              setLocator("");
                            }
                          }}
                        >
                          Link evidence
                        </button>
                      </fieldset>
                      {record && (
                        <p className="research-muted">
                          Owner: {record.owner}
                          <br />
                          Created by {record.revisions[0]?.author} ·{" "}
                          {stamp(
                            record.revisions[0]?.createdAt ?? record.updatedAt,
                          )}
                          <br />
                          Last saved by {latest(record).author} ·{" "}
                          {stamp(latest(record).createdAt)}
                        </p>
                      )}
                      {canEdit && !record?.archived && (
                        <div className="research-actions research-save">
                          <button
                            type="submit"
                            className="research-primary"
                            disabled={
                              busy ||
                              !dirty ||
                              !draft.title.trim() ||
                              !!conflict
                            }
                          >
                            Save {draft.kind === "memo" ? "memo draft" : "note"}
                          </button>
                          <span>
                            {dirty
                              ? "Your changes have not been saved."
                              : "All changes saved."}
                          </span>
                        </div>
                      )}
                    </form>
                  )}
                  {conflict && (
                    <section className="research-conflict" role="alert">
                      <h3>A newer revision was saved</h3>
                      <p>
                        Your text is preserved above. Compare it with the latest
                        saved content before choosing how to continue.
                      </p>
                      <details open>
                        <summary>
                          Latest saved by {latest(conflict).author} ·{" "}
                          {stamp(latest(conflict).createdAt)}
                        </summary>
                        <h4>{latest(conflict).title}</h4>
                        {conflict.kind === "note" ? (
                          <div className="research-prose">
                            <FormattedText text={latest(conflict).body} />
                          </div>
                        ) : (
                          memoSections.map((section) => (
                            <div key={section}>
                              <h4>{section}</h4>
                              <div className="research-prose">
                                <FormattedText
                                  text={
                                    latest(conflict).sections[section] ||
                                    "Incomplete"
                                  }
                                />
                              </div>
                            </div>
                          ))
                        )}
                        <h4>Latest evidence</h4>
                        {evidenceView(latest(conflict).evidence)}
                      </details>
                      <div className="research-actions">
                        <button
                          type="button"
                          onClick={() => {
                            edit({ expectedRevisionId: latest(conflict).id });
                            setConflict(null);
                            setError("");
                            setNotice(
                              "Your draft now uses the latest revision token. Review your changes, then save explicitly.",
                            );
                          }}
                        >
                          Keep my draft and rebase
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Discard your unsaved draft and load the latest saved revision?",
                              )
                            ) {
                              const rev = latest(conflict);
                              setDraft({
                                ...draft,
                                id: conflict.id,
                                kind: conflict.kind,
                                companyId: conflict.companyId,
                                dealId: conflict.dealId,
                                expectedRevisionId: rev.id,
                                title: rev.title,
                                body: rev.body,
                                sections: { ...rev.sections },
                                label: rev.label,
                                evidence: [...rev.evidence],
                                owner: conflict.owner,
                              });
                              setDirty(false);
                              setConflict(null);
                              setError("");
                            }
                          }}
                        >
                          Load latest saved revision
                        </button>
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <div className="research-empty research-detail-empty">
                  <h2>
                    Select{" "}
                    {tab === "document"
                      ? "a document"
                      : tab === "note"
                        ? "a note"
                        : "a memo draft"}
                  </h2>
                  <p>
                    Read the latest research, inspect its sources, or start
                    something new.
                  </p>
                  {!canEdit && (
                    <p>You have read-only access to this workspace.</p>
                  )}
                </div>
              )}
              {admin && (document || record) && !upload && (
                <div className="research-archive">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (canLeave())
                        void mutate(
                          async () => {
                            await request(`/api/research/items/${selected}`, {
                              ...json({
                                kind: document ? "document" : record?.kind,
                                archived: !(document ?? record)?.archived,
                              }),
                              method: "PATCH",
                            });
                            clearEditor();
                          },
                          (document ?? record)?.archived
                            ? "Restored"
                            : "Archived; existing citations remain available",
                        );
                    }}
                  >
                    {(document ?? record)?.archived
                      ? "Restore from archive"
                      : "Archive item"}
                  </button>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {source && (
        <dialog
          ref={sourceDialog}
          onCancel={() => setSource(null)}
          aria-labelledby="research-source-title"
          className="research-modal"
        >
          <button type="button" onClick={() => setSource(null)}>
            Close source
          </button>
          <h2 id="research-source-title">{source.title}</h2>
          <p>
            {source.revision.label}
            {source.archived ? " · Archived" : ""}
          </p>
          <p className="research-muted">
            Pinned revision · {source.revision.author} ·{" "}
            {stamp(source.revision.createdAt)}
          </p>
          <div className="research-prose">
            <FormattedText text={source.revision.body} />
          </div>
          <h3>Evidence</h3>
          {evidenceView(source.revision.evidence)}
        </dialog>
      )}
    </main>
  );
}
