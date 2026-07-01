"use client";

import { useAuth, useSignUp } from "@clerk/nextjs";
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

function isAlreadySignedInError(error: unknown) {
  return authErrorMessage(error).toLowerCase().includes("already signed in");
}

export default function ClerkSignUpPanel() {
  const router = useRouter();
  const auth = useAuth();
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

  const handleOAuth = async (strategy: "oauth_google" | "oauth_linkedin_oidc") => {
    if (!signUp || busy) return;

    setError("");
    setSubmitting(true);

    try {
      if (auth.isLoaded && auth.isSignedIn) {
        router.replace("/projects");
        router.refresh();
        return;
      }

      await signUp.reset();
      const result = await signUp.sso({
        strategy,
        redirectUrl: `${window.location.origin}/sign-up/sso-callback`,
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
    <section className="w-full max-w-md rounded-[24px] border border-white/10 bg-white/[0.055] p-6 text-slate-50 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)] backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
        Secure Signup
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Create your CaseForge account
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Set up your workspace login with email and password.
      </p>

      {!pendingVerification ? (
        <>
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
        </>
      ) : null}

      {pendingVerification ? (
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-200">Verification code</span>
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              required
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm font-medium text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
              placeholder="Enter email code"
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
            {busy ? "Verifying..." : "Verify and Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm font-medium text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
                placeholder="First"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm font-medium text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
                placeholder="Last"
              />
            </label>
          </div>

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
              autoComplete="new-password"
              minLength={8}
              required
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 text-sm font-medium text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10"
              placeholder="Create password"
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
            {busy ? "Creating account..." : "Create Account"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-slate-300">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-bold text-cyan-100 hover:text-white">
          Sign in
        </Link>
      </p>
    </section>
  );
}
