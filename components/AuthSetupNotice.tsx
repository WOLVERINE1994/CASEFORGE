type AuthSetupNoticeProps = {
  action: "sign in" | "sign up";
};

export default function AuthSetupNotice({ action }: AuthSetupNoticeProps) {
  return (
    <main className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_30%),linear-gradient(180deg,_#08101d_0%,_#0b1220_54%,_#111827_100%)] px-4 py-12 text-slate-50">
      <section className="w-full max-w-lg rounded-[24px] border border-amber-200/30 bg-amber-100/10 p-6 shadow-[0_28px_70px_-45px_rgba(2,6,23,0.95)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
          Clerk setup needed
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          Cannot {action} yet.
        </h1>
        <p className="mt-3 text-sm leading-6 text-amber-50/80">
          Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in Vercel
          for Production, then redeploy the latest main branch.
        </p>
      </section>
    </main>
  );
}
