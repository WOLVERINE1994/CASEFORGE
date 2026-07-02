import Link from "next/link";

export default function HomeAuthActions() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href="/projects"
        className="cf-readable-on-dark rounded-xl bg-[linear-gradient(135deg,_#06b6d4_0%,_#2563eb_52%,_#7c3aed_100%)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_18px_45px_-25px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:brightness-110"
      >
        Open Workspace
      </Link>
      <Link
        href="/sign-in"
        className="cf-readable-on-dark rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-200/30 hover:bg-cyan-200/10"
      >
        Sign In
      </Link>
    </div>
  );
}
