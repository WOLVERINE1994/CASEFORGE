"use client";

import { SignUp } from "@clerk/nextjs";

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
      <SignUp
        appearance={clerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/projects"
        forceRedirectUrl="/projects"
      />
    </section>
  );
}
