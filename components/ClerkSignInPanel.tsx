"use client";

import { useAuth, useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

function authErrorMessage(error: unknown) {
  const clerkError = error as {
    errors?: Array<{ longMessage?: string; message?: string }>;
    longMessage?: string;
    message?: string;
  };
  return (
    clerkError.errors?.[0]?.longMessage ||
    clerkError.errors?.[0]?.message ||
    clerkError.longMessage ||
    clerkError.message ||
    (error instanceof Error ? error.message : "Sign in failed. Check your details and try again.")
  );
}

function isAlreadySignedInError(error: unknown) {
  return authErrorMessage(error).toLowerCase().includes("already signed in");
}

export default function ClerkSignInPanel() {
  const router = useRouter();
  const auth = useAuth();
  const { fetchStatus, signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || fetchStatus === "fetching";

  const handleOAuth = async (strategy: "oauth_google" | "oauth_linkedin_oidc") => {
    if (!signIn || busy) return;

    setError("");
    setSubmitting(true);

    try {
      if (auth.isLoaded && auth.isSignedIn) {
        router.replace("/projects");
        router.refresh();
        return;
      }

      await signIn.reset();
      const result = await signIn.sso({
        strategy,
        redirectUrl: `${window.location.origin}/sign-in/sso-callback`,
        redirectCallbackUrl: `${window.location.origin}/projects`,
      });
      if (result.error) {
        throw result.error;
      }
    } catch (caughtError) {
      if (isAlreadySignedInError(caughtError)) {
        router.replace("/projects");
        router.refresh();
        return;
      }
      setError(authErrorMessage(caughtError));
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn) return;

    setError("");
    setSubmitting(true);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });
      if (result.error) {
        throw result.error;
      }

      if (signIn.status === "complete") {
        const finalizeResult = await signIn.finalize();
        if (finalizeResult.error) {
          throw finalizeResult.error;
        }
        router.push("/projects");
        router.refresh();
        return;
      }

      setError("Additional verification is required for this account. Complete it in Clerk, then try again.");
    } catch (caughtError) {
      setError(authErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="w-full max-w-md rounded-[24px] border border-white/10 bg-white/[0.055] p-6 text-slate-50 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)] backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
        Secure Login
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Sign in to CaseForge
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Use your workspace email and password to continue.
      </p>

      <div className="mt-6 grid gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => handleOAuth("oauth_google")}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-200/30 hover:bg-cyan-200/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="grid size-5 place-items-center rounded-full bg-white text-base font-black text-rose-600">
            G
          </span>
          Continue with Google
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => handleOAuth("oauth_linkedin_oidc")}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-4 text-sm font-bold text-slate-100 transition hover:border-cyan-200/30 hover:bg-cyan-200/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="grid size-5 place-items-center rounded bg-[#0A66C2] text-xs font-black text-white">
            in
          </span>
          Continue with LinkedIn
        </button>
      </div>

      <div className="mt-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        <span className="h-px flex-1 bg-white/10" />
        <span>Email</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-200">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm font-medium text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-200">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm font-medium text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
            placeholder="Enter password"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,_#06b6d4_0%,_#2563eb_52%,_#7c3aed_100%)] px-4 text-sm font-extrabold text-white shadow-[0_18px_45px_-25px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-300">
        No account?{" "}
        <Link href="/sign-up" className="font-bold text-cyan-100 hover:text-white">
          Create one
        </Link>
      </p>
    </section>
  );
}
