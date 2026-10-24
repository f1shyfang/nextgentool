import { notFound } from "next/navigation";
import { companySession } from "@/lib/company-intelligence";
import { CompanyError } from "@/modules/company-intelligence/domain/types";
import { CompanyAccess } from "@/modules/company-intelligence/presentation/company-access";
import { CompanyProfile } from "@/modules/company-intelligence/presentation/company-profile";

export const dynamic = "force-dynamic";
export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { actor, service, signalsService } = await companySession();
    const { id } = await params;
    const initial = await service.profile(actor, id);
    const initialSignals = await signalsService.workspace(actor, id);
    return (
      <CompanyProfile
        key={initial.company.id}
        initial={initial}
        initialSignals={initialSignals}
        canEdit={actor.role !== "viewer"}
      />
    );
  } catch (error) {
    if (!(error instanceof CompanyError)) throw error;
    if (error.code === "not_found" || error.code === "invalid") notFound();
    return <CompanyAccess code={error.code} />;
  }
}
