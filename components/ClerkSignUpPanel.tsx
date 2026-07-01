"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading, SignUp } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorPrimary: "#22d3ee",
    borderRadius: "0.75rem",
  },
  elements: {
    cardBox: "shadow-none",
    footer: "hidden",
    rootBox: "mx-auto w-full",
  },
} as const;

export default function ClerkSignUpPanel() {
  return (
    <section className="w-full max-w-md rounded-[24px] border border-white/10 bg-white/[0.055] p-3 text-slate-50 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)] backdrop-blur">
      <ClerkLoading>
        <div className="rounded-[20px] border border-white/10 bg-slate-950/45 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
            Secure Signup
          </p>
          <h1 className="mt-3 text-xl font-semibold">Loading sign up...</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Preparing CaseForge authentication.
          </p>
        </div>
      </ClerkLoading>
      <ClerkFailed>
        <div className="rounded-[20px] border border-rose-300/30 bg-rose-500/10 p-6 text-center text-rose-50">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-100">
            Signup Unavailable
          </p>
          <h1 className="mt-3 text-xl font-semibold">Authentication could not load.</h1>
          <p className="mt-3 text-sm leading-6 text-rose-100/80">
            Refresh the page once. If this stays here, Clerk is not initializing in this browser session.
          </p>
        </div>
      </ClerkFailed>
      <ClerkLoaded>
        <SignUp
          appearance={clerkAppearance}
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/projects"
          forceRedirectUrl="/projects"
        />
      </ClerkLoaded>
    </section>
  );
}
