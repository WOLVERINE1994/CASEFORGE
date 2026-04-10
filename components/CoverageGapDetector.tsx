"use client";

import type { CoverageGapAnalysis } from "../utils/coverage-gap-analysis";

type Props = {
  analysis: CoverageGapAnalysis;
  hasRows: boolean;
  fillingGapId: string | null;
  isFillingAllCriticalGaps: boolean;
  duplicateGapIds: string[];
  resolvedGaps: string[];
  onAutoFillGap: (gapId: string) => void;
  onAutoFillCriticalGaps: () => void;
  onAddManualGapDraft: (gapId: string) => void;
};

const statusMeta = {
  strong: {
    label: "Strong",
    tone:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  watch: {
    label: "Watch",
    tone:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  weak: {
    label: "Weak",
    tone:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
} as const;

const severityTone = {
  high: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  medium:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  low: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
} as const;

export default function CoverageGapDetector({
  analysis,
  hasRows,
  fillingGapId,
  isFillingAllCriticalGaps,
  duplicateGapIds,
  resolvedGaps,
  onAutoFillGap,
  onAutoFillCriticalGaps,
  onAddManualGapDraft,
}: Props) {
  const status = statusMeta[analysis.status];
  const criticalGaps = analysis.gaps.filter(
    (gap) => gap.severity === "high" || gap.severity === "medium"
  );

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Coverage Gap Detector
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Review what the current suite still misses
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              The workspace scans generated cases for missing negative paths, boundaries, permissions, failure handling, and mode-specific depth.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {criticalGaps.length > 0 && (
              <button
                onClick={onAutoFillCriticalGaps}
                disabled={Boolean(fillingGapId) || isFillingAllCriticalGaps}
                className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {isFillingAllCriticalGaps
                  ? "Filling Critical Gaps..."
                  : "Fill All Critical Gaps"}
              </button>
            )}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Coverage Score
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {analysis.score}
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${status.tone}`}
            >
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {!hasRows ? (
        <div className="px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          Generate or add test cases to see which QA areas are still uncovered.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            {analysis.gaps.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  No major coverage gaps detected.
                </p>
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                  This suite already covers the most important QA angles for the current mode.
                </p>
              </div>
            ) : (
              analysis.gaps.map((gap) => (
                <div
                  key={gap.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  {duplicateGapIds.includes(gap.id) && (
                    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                      Coverage rows already exist for this gap in the workspace.
                    </div>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {gap.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {gap.summary}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${severityTone[gap.severity]}`}
                    >
                      {gap.severity}
                    </span>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                    <span className="font-semibold">Recommended coverage:</span> {gap.recommendation}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => onAutoFillGap(gap.id)}
                      disabled={
                        Boolean(fillingGapId) ||
                        isFillingAllCriticalGaps ||
                        duplicateGapIds.includes(gap.id)
                      }
                      className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      {fillingGapId === gap.id
                        ? "Generating..."
                        : "Generate Missing Cases"}
                    </button>
                    <button
                      onClick={() => onAddManualGapDraft(gap.id)}
                      disabled={
                        Boolean(fillingGapId) ||
                        isFillingAllCriticalGaps ||
                        duplicateGapIds.includes(gap.id)
                      }
                      className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Add Manual Draft
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Strength Signals
              </p>
              {analysis.strengths.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Expand the suite to surface stronger coverage signals.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {analysis.strengths.map((strength) => (
                    <div
                      key={strength}
                      className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                    >
                      {strength}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Resolved Gaps
              </p>
              {resolvedGaps.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Filled gaps will appear here once the workspace no longer flags them.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {resolvedGaps.map((gap) => (
                    <div
                      key={gap}
                      className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                    >
                      {gap}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Recommended Next Step
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {analysis.gaps.length > 0
                  ? "Add the missing coverage areas first, then review whether the suite now reflects both the chosen mode and the riskier business paths."
                  : "The current suite looks balanced enough to move into review, export, or execution planning."}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
