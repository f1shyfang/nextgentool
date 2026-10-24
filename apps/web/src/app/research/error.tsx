"use client";
export default function ResearchErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="research-setup">
      <h1>Research is temporarily unavailable</h1>
      <p>Your saved work is retained. Check the connection and try again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
      <p>
        <a href="/dashboard/">Return to dashboard</a>
      </p>
    </main>
  );
}
