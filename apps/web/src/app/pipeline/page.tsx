import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { createDealPipelineCompositionRoot } from "@/lib/composition-root";
import {
  type DealFilters,
  PipelineError,
} from "@/modules/deal-pipeline/domain/pipeline";
import { readFilters } from "@/modules/deal-pipeline/presentation/http";
import PipelineBoard from "@/modules/deal-pipeline/presentation/pipeline-board";
import "./pipeline.css";
export const metadata = { title: "Deal Pipeline | NextGen Ventures" };
export const runtime = "nodejs";
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth.protect();
  const { repository, service } = createDealPipelineCompositionRoot();
  const context = await repository.memberForUser(userId);
  if (!context)
    return (
      <main className="access-page">
        <h1>Your account needs pipeline access.</h1>
        <p>
          Ask your firm administrator to add your account to the investment
          team.
        </p>
        <UserButton />
      </main>
    );
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
  const filters = readFilters(query) as DealFilters;
  try {
    const [initial, members] = await Promise.all([
      service.list(context, filters),
      service.members(context),
    ]);
    return (
      <PipelineBoard
        key={query.toString()}
        initial={initial}
        members={members}
        context={context}
        filters={filters}
        view={query.get("view") === "list" ? "list" : "board"}
      />
    );
  } catch (error) {
    if (!(error instanceof PipelineError) || error.code !== "invalid")
      throw error;
    return (
      <main className="access-page">
        <h1>These filters could not be applied.</h1>
        <p>{error.message}</p>
        <Link href="/pipeline">Clear filters</Link>
      </main>
    );
  }
}
