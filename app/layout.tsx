import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AuthTopbar from "../components/AuthTopbar";
import "./globals.css";

function ClerkConfigurationNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_30%),linear-gradient(180deg,_#08101d_0%,_#0b1220_54%,_#111827_100%)] px-6 text-slate-50">
      <section className="w-full max-w-2xl rounded-[24px] border border-white/10 bg-white/[0.055] p-6 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          Clerk Setup Required
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Add your Clerk keys to enable sign in.
        </h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in
          `.env.local` locally and in Vercel project environment variables for
          deployment.
        </p>
      </section>
    </main>
  );
}

export const metadata: Metadata = {
  title: "caseForge",
  description: "AI-first QA operations for automation, execution, and reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!clerkPublishableKey) {
    return (
      <html lang="en" className="dark" suppressHydrationWarning>
        <body suppressHydrationWarning className="antialiased">
          <ClerkConfigurationNotice />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <AuthTopbar />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
