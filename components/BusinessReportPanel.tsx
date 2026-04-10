"use client";

type Props = {
  projectName: string;
  totalCases: number;
  readinessScore: number;
  coverageScore: number;
  riskScore: number;
  openGapCount: number;
  impactedCaseCount: number;
  onPreviewBusiness: () => void;
  onPreviewQa: () => void;
  onExportBusinessPdf: () => void;
  onExportQaPdf: () => void;
};

export default function BusinessReportPanel({
  projectName,
  totalCases,
  readinessScore,
  coverageScore,
  riskScore,
  openGapCount,
  impactedCaseCount,
  onPreviewBusiness,
  onPreviewQa,
  onExportBusinessPdf,
  onExportQaPdf,
}: Props) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Reporting Center
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Export separate business and QA reports
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Create one report for stakeholders and another for QA operations, both downloadable directly as PDFs.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Business Report
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Built for product, leadership, and business review. Focuses on scorecards, change impact, coverage posture, and concise highlights.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={onPreviewBusiness}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Preview
              </button>
              <button
                onClick={onExportBusinessPdf}
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110"
              >
                Download Business PDF
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              QA Report
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Built for QA leads, testers, and release reviewers. Includes operational scorecards, quality findings, and the detailed case appendix.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={onPreviewQa}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Preview
              </button>
              <button
                onClick={onExportQaPdf}
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f172a_0%,_#334155_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(15,23,42,0.65)] transition hover:brightness-110"
              >
                Download QA PDF
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Included Metrics
            </p>
            <div className="mt-3 space-y-2">
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                Total cases: {totalCases}
              </div>
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                Readiness score: {readinessScore}
              </div>
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                Coverage score: {coverageScore}
              </div>
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                Risk score: {riskScore}
              </div>
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                Open gaps: {openGapCount}
              </div>
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                Impacted cases: {impactedCaseCount}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Current Project
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Project: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{projectName || "Untitled Workspace"}</span>
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Reports will be generated from the current workspace state and downloaded directly without pop-ups.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
