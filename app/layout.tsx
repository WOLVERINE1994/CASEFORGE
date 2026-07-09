import type { Metadata } from "next";
import Link from "next/link";
import AuthNav from "../components/AuthNav";
import CaseForgeBrand from "../components/CaseForgeBrand";
import ClerkAuthProvider from "../components/ClerkAuthProvider";
import { isClerkAuthActive } from "../lib/auth-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "caseForge",
  description: "AI-first QA operations for automation, execution, and reporting.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const useClerkProvider = isClerkAuthActive();
  const shell = (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/72 px-4 py-3 shadow-[0_18px_50px_-35px_rgba(2,6,23,0.9)] backdrop-blur-2xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-4">
          <Link href="/" className="min-w-0">
            <CaseForgeBrand size="sm" tone="onDark" priority />
          </Link>
          {useClerkProvider ? (
            <AuthNav />
          ) : (
            <nav className="flex items-center gap-2">
              <Link
                href="/sign-in"
                className="cf-readable-on-dark rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3.5 py-2 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/45 hover:bg-cyan-200/15 sm:px-4"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="cf-readable-on-light rounded-xl bg-cyan-200 px-3.5 py-2 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-100 sm:px-4"
              >
                Sign Up
              </Link>
            </nav>
          )}
        </div>
      </header>
      {children}
    </>
  );

  if (useClerkProvider) {
    return (
      <html lang="en" className="dark" suppressHydrationWarning>
        <body
          suppressHydrationWarning
          className="cf-3d-app antialiased"
        >
          <ClerkAuthProvider publishableKey={clerkPublishableKey}>
            {shell}
          </ClerkAuthProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="cf-3d-app antialiased"
      >
        {shell}
      </body>
    </html>
  );
}
