"use client";

import { SignIn } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorBackground: "#0f172a",
    colorDanger: "#fda4af",
    colorInputBackground: "#020617",
    colorInputText: "#f8fafc",
    colorPrimary: "#22d3ee",
    colorText: "#f8fafc",
    colorTextSecondary: "#cbd5e1",
    borderRadius: "0.75rem",
  },
  elements: {
    card: "bg-transparent shadow-none border-0",
    cardBox: "bg-transparent shadow-none border-0",
    footer: "hidden",
    formButtonPrimary:
      "h-12 rounded-xl bg-[linear-gradient(135deg,_#06b6d4_0%,_#2563eb_52%,_#7c3aed_100%)] text-sm font-extrabold text-white shadow-[0_18px_45px_-25px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:brightness-110",
    formFieldInput:
      "h-12 rounded-xl border border-white/10 bg-slate-950/55 text-slate-50 placeholder:text-slate-500 focus:border-cyan-200/50 focus:ring-4 focus:ring-cyan-200/10",
    formFieldLabel: "text-sm font-semibold text-slate-200",
    headerSubtitle: "text-sm leading-6 text-slate-300",
    headerTitle: "text-2xl font-semibold tracking-tight text-slate-50",
    identityPreview: "border border-white/10 bg-slate-950/45 text-slate-100",
    providerIcon__google: "bg-white rounded-full",
    socialButtonsBlockButton:
      "h-12 rounded-xl border border-white/10 bg-slate-950/45 text-sm font-bold text-slate-100 transition hover:border-cyan-200/30 hover:bg-cyan-200/10",
    socialButtonsBlockButtonText: "text-slate-100",
  },
} as const;

export default function ClerkSignInPanel() {
  return (
    <section className="w-full max-w-md rounded-[24px] border border-white/10 bg-white/[0.055] p-3 text-slate-50 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)] backdrop-blur">
      <SignIn
        appearance={clerkAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/projects"
        forceRedirectUrl="/projects"
      />
    </section>
  );
}
