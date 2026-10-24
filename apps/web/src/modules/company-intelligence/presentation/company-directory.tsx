"use client";

import { type FormEvent, useState } from "react";
import type { Company } from "../domain/types";
import { companyGet, companyQuery, useCompanyMutation } from "./client-api";

export type CompanyPage = { companies: Company[]; nextCursor: string | null };
export function CompanyDirectory({
  initial,
  canEdit,
  query,
}: {
  initial: CompanyPage;
  canEdit: boolean;
  query: string;
}) {
  const [page, setPage] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const [matches, setMatches] = useState<Company[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState("");
  const mutation = useCompanyMutation();
  const pending = checking || mutation.pending;
  function edited() {
    setMatches(null);
    setReason("");
    setNotice("");
    mutation.clearError();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setNotice("");
    mutation.clearError();
    if (matches === null) {
      setChecking(true);
      try {
        const result = await companyQuery<{ companies: Company[] }>(
          "company-candidates/",
          { name, domain: domain.trim() || null },
        );
        setMatches(result.companies);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Matches could not be checked. Try again.",
        );
      } finally {
        setChecking(false);
      }
      return;
    }
    const result = await mutation.run<Company>("companies/", {
      name,
      domain: domain.trim() || null,
      ...(matches.length ? { duplicateReason: reason } : {}),
    });
    if (result.ok) window.location.assign(`/companies/${result.value.id}/`);
    else if (result.error.code === "conflict") {
      setMatches(null);
      setNotice(
        "A matching company was added or changed. Check for matches again before creating a separate record.",
      );
    }
  }
  async function loadMore() {
    if (!page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ q: query, after: page.nextCursor });
      const next = await companyGet<CompanyPage>(`companies/?${params}`);
      setPage((current) => ({
        companies: [...current.companies, ...next.companies],
        nextCursor: next.nextCursor,
      }));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "More companies could not be loaded. Try again.",
      );
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <>
      <section className="ci-heading">
        <div>
          <h1>Companies</h1>
          <p className="ci-muted">
            A shared view of the companies you’re researching, with the evidence
            behind every fact.
          </p>
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            className="ci-primary"
            onClick={() => setAdding(true)}
          >
            Add company
          </button>
        )}
      </section>
      {!canEdit && (
        <p className="ci-status">
          Read-only access. You can browse company profiles and their sources.
        </p>
      )}
      {adding && (
        <section
          className="ci-panel ci-create"
          aria-labelledby="create-company-heading"
        >
          <div className="ci-section-heading">
            <h2 id="create-company-heading">Add a company</h2>
            <button
              type="button"
              className="ci-secondary"
              disabled={pending}
              onClick={() => {
                setAdding(false);
                setNotice("");
              }}
            >
              Cancel
            </button>
          </div>
          <p className="ci-muted">
            Check the directory first. Different companies can share a name or
            website.
          </p>
          <form className="ci-form" onSubmit={submit}>
            <fieldset disabled={pending}>
              <div className="ci-pair">
                <label>
                  Company name
                  <input
                    autoComplete="organization"
                    required
                    maxLength={200}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      edited();
                    }}
                  />
                </label>
                <label>
                  Website (optional)
                  <input
                    autoComplete="url"
                    placeholder="example.com"
                    maxLength={253}
                    value={domain}
                    onChange={(event) => {
                      setDomain(event.target.value);
                      edited();
                    }}
                  />
                </label>
              </div>
              {matches !== null && (
                <div
                  className={matches.length ? "ci-matches" : "ci-status"}
                  role="status"
                >
                  {matches.length ? (
                    <>
                      <h3>Review existing companies</h3>
                      <p>
                        Open a matching profile, or explain why this needs a
                        separate record.
                      </p>
                      <ul>
                        {matches.map((company) => (
                          <li key={company.id}>
                            <a href={`/companies/${company.id}/`}>
                              {company.name}
                            </a>
                            <span className="ci-muted">
                              {company.domain ?? "Website not recorded"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <label>
                        Reason for a separate company
                        <textarea
                          required
                          maxLength={1000}
                          rows={2}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <p>
                      No matching company found. You can create this profile.
                    </p>
                  )}
                </div>
              )}
              <div className="ci-actions">
                <button className="ci-primary" type="submit">
                  {checking
                    ? "Checking matches…"
                    : mutation.pending
                      ? "Creating company…"
                      : matches === null
                        ? "Check for matches"
                        : "Create company"}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {(notice || mutation.error) && (
        <div className="ci-error" role="alert">
          {notice || mutation.error?.message}
        </div>
      )}
      <search>
        <form className="ci-search" action="/companies/" method="get">
          <label htmlFor="company-search">Find a company</label>
          <div className="ci-search-controls">
            <input
              id="company-search"
              name="q"
              type="search"
              defaultValue={query}
              maxLength={200}
              placeholder="Search company name or website"
            />
            <button type="submit" className="ci-secondary">
              Search
            </button>
            {query && <a href="/companies/">Clear search</a>}
          </div>
        </form>
      </search>
      <section className="ci-directory" aria-label="Company directory">
        <div className="ci-list-heading">
          <h2>{query ? `Results for “${query}”` : "Company directory"}</h2>
          <span className="ci-muted">
            {page.companies.length} shown
            {page.nextCursor ? " · more available" : ""}
          </span>
        </div>
        {page.companies.length ? (
          <ul className="ci-company-list">
            {page.companies.map((company) => (
              <li key={company.id}>
                <a
                  className="ci-company-row"
                  href={`/companies/${company.id}/`}
                >
                  <span>
                    <strong>{company.name}</strong>
                    <span className="ci-muted">
                      {company.domain ?? "Website not recorded"}
                    </span>
                  </span>
                  <span className="ci-row-action">
                    View profile{" "}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ci-empty">
            <h3>
              {query
                ? "No companies match this search"
                : "Your company research starts here"}
            </h3>
            <p>
              {query
                ? "Try a different name or website, or clear the search to see the directory."
                : "Add a company to build its profile, compare evidence, and keep your team’s research in one place."}
            </p>
            {query ? (
              <a href="/companies/">Clear search</a>
            ) : canEdit && !adding ? (
              <button
                type="button"
                className="ci-primary"
                onClick={() => setAdding(true)}
              >
                Add your first company
              </button>
            ) : null}
          </div>
        )}
        {page.nextCursor && (
          <button
            type="button"
            className="ci-secondary ci-more"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? "Loading…" : "Load more companies"}
          </button>
        )}
      </section>
      <p className="ci-footer-note">
        Profiles contain your team’s manually sourced research. Automated
        signals are not available yet.
      </p>
    </>
  );
}
