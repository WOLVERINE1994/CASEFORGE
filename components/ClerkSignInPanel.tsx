"use client";

import { useSignIn } from "@clerk/nextjs";
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

export default function ClerkSignInPanel() {
  const router = useRouter();
  const { fetchStatus, signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || fetchStatus === "fetching";

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
    <section className="w-full max-w-md rounded-[24px] border border-cyan-200/20 bg-white p-6 text-slate-950 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
        Secure Login
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Sign in to CaseForge
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Use your workspace email and password to continue.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="Enter password"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        No account?{" "}
        <Link href="/sign-up" className="font-bold text-emerald-700 hover:text-emerald-800">
          Create one
        </Link>
      </p>
    </section>
  );
}
