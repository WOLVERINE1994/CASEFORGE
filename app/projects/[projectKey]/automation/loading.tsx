export default function AutomationLoading() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[1520px] items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="cf-motion-loading-state cf-panel w-full max-w-md rounded-[28px] px-6 py-7 text-center shadow-[0_26px_80px_-38px_rgba(2,6,23,0.95)]">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-300" />
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
          Loading Automation
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-50">
          Preparing workspace
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Loading scenarios, runs, and automation editor data.
        </p>
      </section>
    </main>
  );
}
