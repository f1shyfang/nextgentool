import type { ReactNode } from "react";
import { CompanyShell } from "@/modules/company-intelligence/presentation/company-shell";
import "./companies.css";

export const metadata = {
  title: "Company Intelligence | NextGen Ventures",
  robots: { index: false, follow: false },
};
export default function CompaniesLayout({ children }: { children: ReactNode }) {
  return <CompanyShell>{children}</CompanyShell>;
}
