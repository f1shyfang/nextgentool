import { SignInButton, UserButton } from "@clerk/nextjs";
import { clerkPublishableKey } from "@repo/env/client";
import { researchActor, researchResources } from "@/lib/research";
import { ResearchError } from "@/modules/research-and-diligence/domain/types";
import { ResearchWorkspace } from "@/modules/research-and-diligence/presentation/workspace";
import "./research.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Research & Diligence | NextGen" };
export default async function ResearchPage() {
  try {
    const actor = await researchActor();
    const initial = await researchResources().service.workspace(actor);
    return (
      <>
        <ResearchWorkspace initial={initial} />
        <div className="research-account">
          <UserButton />
        </div>
      </>
    );
  } catch (error) {
    if (!(error instanceof ResearchError)) throw error;
    return (
      <main className="research-setup">
        <a href="/">NextGen Ventures</a>
        <h1>Research &amp; Diligence</h1>
        <p>{error.message}</p>
        {clerkPublishableKey && (
          <SignInButton mode="redirect" forceRedirectUrl="/research">
            <button type="button">Sign in</button>
          </SignInButton>
        )}
        <p>
          Private documents, shared research notes, and evidence-backed memo
          drafts.
        </p>
        <p>
          Setup instructions:{" "}
          <code>docs/plans/research-and-diligence-operations.md</code>
        </p>
      </main>
    );
  }
}
