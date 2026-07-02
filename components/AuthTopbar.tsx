import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import CaseForgeBrand from "./CaseForgeBrand";

export default function AuthTopbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/72 px-4 py-3 shadow-[0_18px_50px_-35px_rgba(2,6,23,0.9)] backdrop-blur-2xl sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-4">
        <Link
          href="/"
          className="min-w-0 rounded-2xl border border-white/75 bg-white/92 px-3 py-2 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.72)] backdrop-blur transition hover:bg-white"
        >
          <CaseForgeBrand size="sm" priority />
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Show when="signed-out">
            <SignInButton>
              <button className="cf-readable-on-dark rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:bg-cyan-200/10 sm:px-4">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="cf-readable-on-dark rounded-xl bg-[linear-gradient(135deg,_#06b6d4_0%,_#2563eb_52%,_#7c3aed_100%)] px-3.5 py-2 text-sm font-extrabold text-white shadow-[0_14px_35px_-22px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:brightness-110 sm:px-4">
                Sign Up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
