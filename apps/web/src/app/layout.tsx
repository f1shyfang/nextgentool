import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web App Template",
  description: "A reproducible Next.js and PostgreSQL workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
