import AccessPendingActions from "../../components/AccessPendingActions";

type AccessPendingPageProps = {
  searchParams?: Promise<{
    email?: string;
  }>;
};

export default async function AccessPendingPage({
  searchParams,
}: AccessPendingPageProps) {
  const params = await searchParams;
  const email = params?.email;

  return (
    <main className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#08101d_0%,_#0b1220_54%,_#111827_100%)] px-4 py-12 text-white">
      <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_30px_90px_-45px_rgba(8,47,73,0.95)] backdrop-blur-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">
          Access review
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight">
          CaseForge access is private
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-200">
          You are signed in, but this account has not been approved for
          CaseForge yet. The workspace will open only after the owner adds this
          email to the approved list.
        </p>
        {email ? (
          <p className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-sm font-semibold text-cyan-50">
            Account waiting for approval: {email}
          </p>
        ) : null}
        <AccessPendingActions />
      </section>
    </main>
  );
}
