"use client";
export default function CompanyErrorPage({ reset }: { reset(): void }) {
  return (
    <section className="ci-empty" role="alert">
      <h1>Company research could not be loaded</h1>
      <p>Your saved research is unchanged. Try loading the page again.</p>
      <button type="button" className="ci-primary" onClick={reset}>
        Try again
      </button>
      <a href="/companies/">Company directory</a>
    </section>
  );
}
