"use client";
export default function PipelineError({ reset }: { reset: () => void }) {
  return (
    <main className="access-page">
      <h1>The pipeline is unavailable.</h1>
      <p>Saved deals are retained. Try loading the pipeline again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
