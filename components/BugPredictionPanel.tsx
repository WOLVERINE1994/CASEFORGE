"use client";

import type { BugPredictionAnalysis } from "../utils/bug-prediction";

type Props = {
  analysis: BugPredictionAnalysis;
  hasRequirement: boolean;
  rowTitles: Record<string, string>;
  predictionLinkedRows: Record<string, string[]>;
  onFocusRow: (rowId: string) => void;
  fillingPredictionId: string | null;
  ignoredPredictionIds: string[];
  onAutoCoverPrediction: (predictionId: string) => void;
  onAddManualPredictionDraft: (predictionId: string) => void;
  onIgnorePrediction: (predictionId: string) => void;
};

const statusMeta = {
  contained: {
    label: "Contained",
    tone:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  watch: {
    label: "Watch",
    tone:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  hot: {
    label: "Hot",
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

export default function BugPredictionPanel({
  analysis,
  hasRequirement,
  rowTitles,
  predictionLinkedRows,
  onFocusRow,
  fillingPredictionId,
  ignoredPredictionIds,
  onAutoCoverPrediction,
  onAddManualPredictionDraft,
  onIgnorePrediction,
}: Props) {
  const status = statusMeta[analysis.status];
  const coverageTone = {
    covered:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    partial:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    uncovered:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  } as const;

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Likely Defect Zones
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Predict where implementation is most likely to break
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              The workspace scans the requirement for premium bug-risk signals such as validation mismatch, role leakage, timeout handling, and stale state behavior.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Risk Containment
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

      {!hasRequirement ? (
        <div className="px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          Add a requirement above to predict likely defect zones before generation.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            {analysis.predictions.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  No major defect hotspots predicted.
                </p>
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                  The requirement looks specific enough that the most obvious failure zones are already somewhat contained.
                </p>
              </div>
            ) : (
              analysis.predictions
                .filter((prediction) => !ignoredPredictionIds.includes(prediction.id))
                .map((prediction) => (
                  (() => {
                    const linkedRowIds = predictionLinkedRows[prediction.id] ?? [];
                    const hasLinkedRows = linkedRowIds.length > 0;

                    return (
                      <div
                        key={prediction.id}
                        className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {prediction.title}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                              {prediction.reason}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${severityTone[prediction.severity]}`}
                          >
                            {prediction.severity}
                          </span>
                        </div>
                        <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                          <span className="font-semibold">Requirement signal:</span>{" "}
                          {prediction.requirementSignal}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${coverageTone[prediction.coverageStatus]}`}
                          >
                            {prediction.coverageStatus}
                          </span>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {prediction.coverageStatus === "covered"
                              ? "Multiple current cases appear related to this defect zone."
                              : prediction.coverageStatus === "partial"
                              ? "Only limited current case coverage appears related to this defect zone."
                              : "No current cases strongly appear related to this defect zone."}
                          </p>
                        </div>
                        {hasLinkedRows && (
                          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full border border-amber-300 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:border-amber-500/30 dark:bg-zinc-900/60 dark:text-amber-200">
                                Already added
                              </span>
                              <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                                This defect zone already added coverage to the workspace.
                              </p>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {linkedRowIds.map((rowId) => (
                                <button
                                  key={`${prediction.id}-linked-${rowId}`}
                                  onClick={() => onFocusRow(rowId)}
                                  className="rounded-2xl border border-amber-300 bg-white px-3 py-2 text-left text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-200 dark:hover:bg-amber-500/10"
                                >
                                  {rowId}: {rowTitles[rowId] || "Untitled test case"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {prediction.relatedRowIds.length > 0 && (
                          <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                            <span className="font-semibold">Related cases:</span>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {prediction.relatedRowIds.map((rowId) => (
                                <button
                                  key={`${prediction.id}-${rowId}`}
                                  onClick={() => onFocusRow(rowId)}
                                  className="rounded-2xl border border-sky-200 bg-white px-3 py-2 text-left text-xs font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-300 dark:hover:bg-sky-500/10"
                                >
                                  {rowId}: {rowTitles[rowId] || "Untitled test case"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                          <span className="font-semibold">Suggested test focus:</span>{" "}
                          {prediction.suggestedTestFocus}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={() =>
                              hasLinkedRows
                                ? onFocusRow(linkedRowIds[0])
                                : onAutoCoverPrediction(prediction.id)
                            }
                            disabled={Boolean(fillingPredictionId)}
                            className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {fillingPredictionId === prediction.id
                              ? "Auto-covering..."
                              : hasLinkedRows
                              ? "Show Added Cases"
                              : "Auto-cover"}
                          </button>
                          <button
                            onClick={() =>
                              hasLinkedRows
                                ? onFocusRow(linkedRowIds[0])
                                : onAddManualPredictionDraft(prediction.id)
                            }
                            disabled={Boolean(fillingPredictionId)}
                            className="rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            {hasLinkedRows
                              ? "Show In Workspace"
                              : "Add Manual Draft"}
                          </button>
                          <button
                            onClick={() => onIgnorePrediction(prediction.id)}
                            disabled={Boolean(fillingPredictionId)}
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ))
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Confidence Signals
              </p>
              {analysis.strengths.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Add clearer requirement rules to reduce likely defect zones.
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
                Recommended Next Step
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {analysis.predictions.length > 0
                  ? "Use these likely defect zones to prioritize the first test cases, reviews, and change-risk checks."
                  : "The requirement looks stable enough to move into generation and coverage review with fewer obvious defect hotspots."}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
