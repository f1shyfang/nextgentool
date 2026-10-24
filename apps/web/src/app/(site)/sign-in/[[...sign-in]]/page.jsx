import { SignIn } from "@clerk/nextjs";
import { clerkPublishableKey } from "@repo/env/client";
import { Suspense } from "react";
import AuthShell from "@/components/site/AuthShell";

export const metadata = { title: "Log in | NextGen Ventures" };

export default function Page() {
  return (
    <AuthShell mode="sign-in">
      <Suspense fallback={<p role="status">Loading secure log in…</p>}>
        {clerkPublishableKey ? (
          <SignIn
            appearance={{
              elements: {
                rootBox: { width: "100%", maxWidth: "400px" },
                cardBox: { width: "100%" },
              },
            }}
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up/"
            fallbackRedirectUrl="/dashboard/"
          />
        ) : (
          <p>Configure Clerk to enable sign in.</p>
        )}
      </Suspense>
    </AuthShell>
  );
}
