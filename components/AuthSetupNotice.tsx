import Link from "next/link";
import { getClerkAuthStatus } from "../lib/auth-mode";

type AuthSetupNoticeProps = {
  action: "sign in" | "sign up";
};

export default function AuthSetupNotice({ action }: AuthSetupNoticeProps) {
  const authStatus = getClerkAuthStatus();
  const title = authStatus.hasPublishableKey
    ? "Authentication is disabled here."
    : "Clerk setup needed";
  const message = authStatus.hasPublishableKey
    ? "This workspace is running in public/local mode, so you can continue directly to the project workspace without signing in."
    : "Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in Vercel, then redeploy the latest main branch.";

  return (
    <main className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_30%),linear-gradient(180deg,_#08101d_0%,_#0b1220_54%,_#111827_100%)] px-4 py-12 text-slate-50">
      <section className="w-full max-w-lg rounded-[24px] border border-amber-200/30 bg-amber-100/10 p-6 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
          {title}
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          Cannot {action} yet.
        </h1>
        <p className="mt-3 text-sm leading-6 text-amber-50/80">
          {message}
        </p>
        {authStatus.hasPublishableKey ? (
          <Link
            href="/projects"
            className="mt-5 inline-flex rounded-xl bg-cyan-200 px-4 py-2 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-100"
          >
            Open Workspace
          </Link>
        ) : null}
      </section>
    </main>
  );
}
