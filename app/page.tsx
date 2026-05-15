import { SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_30%),linear-gradient(180deg,_#08101d_0%,_#0b1220_54%,_#111827_100%)] px-6 py-10 text-slate-50">
      <section className="mx-auto grid min-h-[calc(100vh-10rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="inline-flex rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
            CaseForge Platform
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Manage your AI QA workspace.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Access your project library, generated test cases, review sessions,
            automation runs, reports, and team settings from one secured workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/projects"
              className="rounded-xl bg-[linear-gradient(135deg,_#06b6d4_0%,_#2563eb_52%,_#7c3aed_100%)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_18px_45px_-25px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              Open Workspace
            </Link>
            <SignInButton>
              <button className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-200/30 hover:bg-cyan-200/10">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/45 hover:bg-cyan-200/15">
                Sign Up
              </button>
            </SignUpButton>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Workspace Access
          </p>
          <div className="mt-4 space-y-3">
            {[
              "Project library and generated case history",
              "Reviewer sessions, team settings, and audit actions",
              "Automation, execution reporting, and release readiness",
              "Supabase Postgres data prepared for Vercel deployment",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm leading-6 text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
