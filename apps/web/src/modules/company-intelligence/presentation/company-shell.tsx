import type { ReactNode } from "react";

export function CompanyShell({ children }: { children: ReactNode }) {
  return (
    <div className="ci-shell">
      <a className="ci-skip" href="#company-content">
        Skip to company research
      </a>
      <header className="ci-topbar">
        <a className="ci-brand" href="/dashboard/">
          NextGen<span>Ventures</span>
        </a>
        <nav aria-label="Investment workspace">
          <a href="/companies/" aria-current="page">
            Companies
          </a>
          <a href="/pipeline/">Pipeline</a>
          <a href="/research/">Research</a>
          <a href="/knowledge/">Knowledge</a>
        </nav>
        <a className="ci-account" href="/dashboard/">
          Dashboard
        </a>
      </header>
      <main id="company-content" className="ci-content">
        {children}
      </main>
    </div>
  );
}
