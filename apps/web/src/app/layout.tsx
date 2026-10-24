import { ClerkProvider } from "@clerk/nextjs";
import { clerkPublishableKey } from "@repo/env/client";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextGen Ventures - Backing Young Founders Before Anyone Else",
  description:
    "A first-cheque venture fund backing young Australian founders before anyone else to build global unicorns.",
  robots: { index: false, follow: false },
  icons: { icon: "/assets/nextgen-logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {clerkPublishableKey ? (
          <ClerkProvider
            publishableKey={clerkPublishableKey}
            signInUrl="/sign-in/"
            signUpUrl="/sign-up/"
            signInFallbackRedirectUrl="/dashboard/"
            signUpFallbackRedirectUrl="/dashboard/"
            afterSignOutUrl="/"
            appearance={{
              variables: {
                colorPrimary: "#2454ff",
                fontFamily: "Urbanist, Arial, sans-serif",
                borderRadius: "6px",
              },
            }}
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
