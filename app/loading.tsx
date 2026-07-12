export default function Loading() {
  return (
    <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-slate-950/95 px-6 text-slate-100">
      <div className="cf-motion-loading-state flex flex-col items-center gap-4 text-center">
        <div className="cf-loading-buffer" aria-hidden="true" />
        <p className="text-sm font-semibold tracking-wide text-slate-200">
          Loading CaseForge...
        </p>
      </div>
    </main>
  );
}
