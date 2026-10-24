import { companySession } from "@/lib/company-intelligence";
import { CompanyError } from "@/modules/company-intelligence/domain/types";
import { CompanyAccess } from "@/modules/company-intelligence/presentation/company-access";
import { CompanyDirectory } from "@/modules/company-intelligence/presentation/company-directory";

export const dynamic = "force-dynamic";
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const { actor, service } = await companySession();
    const params = await searchParams;
    if (Array.isArray(params.q))
      throw new CompanyError("invalid", "Use one search query.");
    const query = params.q ?? "";
    const initial = await service.listCompanies(actor, { q: query });
    return (
      <CompanyDirectory
        key={query}
        initial={initial}
        canEdit={actor.role !== "viewer"}
        query={query}
      />
    );
  } catch (error) {
    if (!(error instanceof CompanyError)) throw error;
    if (error.code === "invalid")
      return (
        <section className="ci-empty">
          <h1>This search could not be applied</h1>
          <p>Use a company name or website with fewer than 200 characters.</p>
          <a href="/companies/">Clear search</a>
        </section>
      );
    return <CompanyAccess code={error.code} />;
  }
}
