import { SignUp } from "@clerk/nextjs";
import { clerkPublishableKey } from "@repo/env/client";
import { Suspense } from "react";
import AuthShell from "@/components/site/AuthShell";

export const metadata = { title: "Sign up | NextGen Ventures" };

export default function Page() {
  return (
    <AuthShell mode="sign-up">
      <Suspense fallback={<p role="status">Loading secure sign up…</p>}>
        {clerkPublishableKey ? (
          <SignUp
            appearance={{
              elements: {
                rootBox: { width: "100%", maxWidth: "400px" },
                cardBox: { width: "100%" },
              },
            }}
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in/"
            fallbackRedirectUrl="/dashboard/"
          />
        ) : (
          <p>Configure Clerk to enable sign up.</p>
        )}
      </Suspense>
    </AuthShell>
  );
}
