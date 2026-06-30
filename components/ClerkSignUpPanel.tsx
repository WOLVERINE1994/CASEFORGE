"use client";

import { useSignUp } from "@clerk/nextjs";
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
    (error instanceof Error ? error.message : "Sign up failed. Check your details and try again.")
  );
}

export default function ClerkSignUpPanel() {
  const router = useRouter();
  const { fetchStatus, signUp } = useSignUp();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || fetchStatus === "fetching";

  const finishSignup = async () => {
    if (!signUp.createdSessionId) {
      setError("Account was created, but no session was returned. Try signing in.");
      return;
    }

    const finalizeResult = await signUp.finalize();
    if (finalizeResult.error) {
      throw finalizeResult.error;
    }
    router.push("/projects");
    router.refresh();
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signUp) return;

    setError("");
    setSubmitting(true);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        password,
      });
      if (result.error) {
        throw result.error;
      }

      if (signUp.status === "complete") {
        await finishSignup();
        return;
      }

      if (signUp.unverifiedFields.includes("email_address")) {
        const verificationResult = await signUp.verifications.sendEmailCode();
        if (verificationResult.error) {
          throw verificationResult.error;
        }
      }
      setPendingVerification(true);
    } catch (caughtError) {
      setError(authErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signUp) return;

    setError("");
    setSubmitting(true);

    try {
      const result = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      });
      if (result.error) {
        throw result.error;
      }

      if (signUp.status === "complete") {
        await finishSignup();
        return;
      }

      setError("Verification is not complete yet. Check the code and try again.");
    } catch (caughtError) {
      setError(authErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="w-full max-w-md rounded-[24px] border border-cyan-200/20 bg-white p-6 text-slate-950 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
        Secure Signup
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Create your CaseForge account
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Set up your workspace login with email and password.
      </p>

      {pendingVerification ? (
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Verification code</span>
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              required
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              placeholder="Enter email code"
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
            {busy ? "Verifying..." : "Verify and Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreate} className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="First"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="Last"
              />
            </label>
          </div>

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
              autoComplete="new-password"
              minLength={8}
              required
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              placeholder="Create password"
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
            {busy ? "Creating account..." : "Create Account"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-bold text-emerald-700 hover:text-emerald-800">
          Sign in
        </Link>
      </p>
    </section>
  );
}
