"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  SignInButton,
} from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function ClerkSignInPanel() {
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlowLoad(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="w-full max-w-md rounded-[24px] border border-cyan-200/20 bg-white p-3 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)] dark:bg-slate-950">
      <ClerkLoading>
        <div className="rounded-[20px] border border-cyan-200/30 bg-slate-900 p-6 text-center text-slate-50">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Sign In
          </p>
          <h1 className="mt-3 text-xl font-semibold">Loading secure sign in...</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {slowLoad
              ? "Still waiting for Clerk to initialize. Refresh once if this stays here."
              : "Preparing the authentication form."}
          </p>
        </div>
      </ClerkLoading>
      <ClerkFailed>
        <div className="rounded-[20px] border border-rose-200/40 bg-rose-950/70 p-6 text-center text-rose-50">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-200">
            Sign In Unavailable
          </p>
          <h1 className="mt-3 text-xl font-semibold">Authentication could not load.</h1>
          <p className="mt-3 text-sm leading-6 text-rose-100/80">
            Check the Clerk publishable and secret keys in Vercel, then redeploy.
          </p>
        </div>
      </ClerkFailed>
      <ClerkLoaded>
        <SignIn
          appearance={{
            elements: {
              cardBox: "shadow-none",
              rootBox: "mx-auto w-full",
            },
          }}
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/projects"
        />
        <div className="border-t border-slate-200 px-5 py-4 text-center dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            If the embedded form does not appear, open the secure hosted sign in.
          </p>
          <SignInButton mode="redirect" fallbackRedirectUrl="/projects">
            <button
              type="button"
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-200 dark:text-slate-950 dark:hover:bg-cyan-100"
            >
              Open secure sign in
            </button>
          </SignInButton>
        </div>
      </ClerkLoaded>
    </section>
  );
}
