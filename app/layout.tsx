import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Link from "next/link";
import CaseForgeBrand from "../components/CaseForgeBrand";
import "./globals.css";

export const metadata: Metadata = {
  title: "caseForge",
  description: "AI-first QA operations for automation, execution, and reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shell = (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/72 px-4 py-3 shadow-[0_18px_50px_-35px_rgba(2,6,23,0.9)] backdrop-blur-2xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-4">
          <Link href="/" className="min-w-0">
            <CaseForgeBrand size="sm" priority />
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3.5 py-2 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/45 hover:bg-cyan-200/15 sm:px-4"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-xl bg-cyan-200 px-3.5 py-2 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-100 sm:px-4"
            >
              Sign Up
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </>
  );

  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        {clerkPublishableKey ? (
          <ClerkProvider publishableKey={clerkPublishableKey}>
            {shell}
          </ClerkProvider>
        ) : (
          shell
        )}
      </body>
    </html>
  );
}
