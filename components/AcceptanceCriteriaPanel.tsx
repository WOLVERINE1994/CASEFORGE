"use client";

import type { AcceptanceCriteriaAnalysis } from "../utils/acceptance-criteria";

type Props = {
  analysis: AcceptanceCriteriaAnalysis;
  hasRequirement: boolean;
  onAppendCriteria: () => void;
  onReplaceWithCriteria: () => void;
  onGenerateFromCriteria: () => void;
  loading: boolean;
};

const statusTone = {
  ready:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  "needs-review":
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  thin: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
} as const;

const priorityTone = {
  high: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  medium:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  low: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
} as const;

export default function AcceptanceCriteriaPanel({
  analysis,
  hasRequirement,
  onAppendCriteria,
  onReplaceWithCriteria,
  onGenerateFromCriteria,
  loading,
}: Props) {
  const appendLabel = analysis.hasAppliedCriteria
    ? "Refresh Criteria In Requirement"
    : "Append To Requirement";
  const replaceLabel = analysis.hasAppliedCriteria
    ? "Replace Applied Criteria"
    : "Replace With Criteria";
  const generateLabel = analysis.hasAppliedCriteria
    ? "Generate From Applied Criteria"
    : "Generate From Criteria";

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Acceptance Criteria Builder
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Turn vague requirements into testable acceptance criteria
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Give BA and QA a cleaner shared definition of done before the first test case is generated.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Readiness
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {analysis.score}
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusTone[analysis.status]}`}
            >
              {analysis.status === "needs-review" ? "Needs Review" : analysis.status}
            </span>
          </div>
        </div>
      </div>

      {!hasRequirement ? (
        <div className="px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          Add a requirement above to build acceptance criteria before generation.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.25fr)_320px]">
          <div>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {analysis.summary}
            </p>
            {analysis.hasAppliedCriteria && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <span className="font-semibold">Already in requirement:</span>{" "}
                {analysis.appliedCriteriaCount} criteria are currently included in the requirement text and can be refreshed from here.
              </div>
            )}

            <div className="mt-5 space-y-3">
              {analysis.criteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${priorityTone[criterion.priority]}`}
                    >
                      {criterion.priority}
                    </span>
                    <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {criterion.source === "explicit" ? "Explicit" : "Inferred"}
                    </span>
                    {criterion.label &&
                    criterion.label.toLowerCase() !== criterion.source.toLowerCase() ? (
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                        {criterion.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                    {criterion.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={onAppendCriteria}
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110"
              >
                {appendLabel}
              </button>
              <button
                onClick={onReplaceWithCriteria}
                className="rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
              >
                {replaceLabel}
              </button>
              <button
                onClick={onGenerateFromCriteria}
                disabled={loading}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {loading ? "Generating..." : generateLabel}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Missing Areas
              </p>
              {analysis.missingAreas.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  No obvious acceptance gaps detected. The requirement already covers the core QA follow-ups.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {analysis.missingAreas.map((area) => (
                    <span
                      key={area}
                      className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Collaboration Use
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Review these criteria with BA, QA, or product before generation so the suite starts from a clearer definition of done.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
