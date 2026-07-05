"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

const signInClassName =
  "cf-readable-on-dark rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-3.5 py-2 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/45 hover:bg-cyan-200/15 sm:px-4";

const signUpClassName =
  "cf-readable-on-light rounded-xl bg-cyan-200 px-3.5 py-2 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-100 sm:px-4";

export default function AuthNav() {
  const pathname = usePathname();
  const isAccessPendingPage = pathname === "/access-pending";

  return (
    <nav className="flex items-center gap-2">
      <Show when="signed-out">
        <SignInButton mode="redirect" fallbackRedirectUrl="/projects">
          <button type="button" className={signInClassName}>
            Sign In
          </button>
        </SignInButton>
        <SignUpButton mode="redirect" fallbackRedirectUrl="/projects">
          <button type="button" className={signUpClassName}>
            Sign Up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        {isAccessPendingPage ? (
          <span className={signInClassName} aria-current="page">
            Access pending
          </span>
        ) : (
          <Link href="/projects?open=workspace" className={signInClassName}>
            Workspace
          </Link>
        )}
        <UserButton />
      </Show>
    </nav>
  );
}
