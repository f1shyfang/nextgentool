import { SignInButton } from "@clerk/nextjs";
import { clerkPublishableKey } from "@repo/env/client";
import type { CompanyError } from "../domain/types";

export function CompanyAccess({ code }: { code: CompanyError["code"] }) {
  return (
    <section className="ci-empty ci-access">
      <h1>
        {code === "unauthenticated"
          ? "Sign in to company research"
          : code === "forbidden"
            ? "Your account needs research access"
            : "Company research is unavailable"}
      </h1>
      <p>
        {code === "unauthenticated"
          ? "Company profiles and evidence are shared privately with your investment team."
          : code === "forbidden"
            ? "Ask your firm administrator to grant research membership to this account."
            : "Please try again shortly, or contact your administrator if this continues."}
      </p>
      {code === "unauthenticated" && clerkPublishableKey && (
        <SignInButton mode="redirect" forceRedirectUrl="/companies/">
          <button type="button" className="ci-primary">
            Sign in
          </button>
        </SignInButton>
      )}
      <a href="/dashboard/">Return to dashboard</a>
    </section>
  );
}
