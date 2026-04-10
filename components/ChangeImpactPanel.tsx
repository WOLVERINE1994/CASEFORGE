"use client";

import type { ChangeImpactAnalysis } from "../utils/change-impact";

type Props = {
  oldRequirement: string;
  setOldRequirement: (value: string) => void;
  analysis: ChangeImpactAnalysis;
  hasNewRequirement: boolean;
  hasRows: boolean;
  isGeneratingCases: boolean;
  hasGeneratedCurrentCases: boolean;
  onGenerateCases: () => void;
  onApplyRecommendedStatuses: () => void;
  onSetRowLifecycleStatus: (
    rowId: string,
    status: "obsolete" | "needs-review" | "needs-update"
  ) => void;
};

const statusMeta = {
  stable: {
    label: "Stable",
    tone:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  watch: {
    label: "Watch",
    tone:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  "high-impact": {
    label: "High Impact",
    tone:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
} as const;

const changeTone = {
  added:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  removed:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  changed:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
} as const;

export default function ChangeImpactPanel({
  oldRequirement,
  setOldRequirement,
  analysis,
  hasNewRequirement,
  hasRows,
  isGeneratingCases,
  hasGeneratedCurrentCases,
  onGenerateCases,
  onApplyRecommendedStatuses,
  onSetRowLifecycleStatus,
}: Props) {
  const status = statusMeta[analysis.status];

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Change Impact Testing
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Compare requirement versions and plan regression impact
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Paste the old requirement below, compare it with the current requirement, and review what changed, which rows are impacted, and what new regression coverage is needed.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {analysis.changes.length > 0 && hasNewRequirement && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={onApplyRecommendedStatuses}
                  disabled={!hasRows || analysis.changes.length === 0}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Apply Recommended Statuses
                </button>
                <button
                  onClick={onGenerateCases}
                  disabled={isGeneratingCases || hasGeneratedCurrentCases}
                  className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {isGeneratingCases
                    ? "Generating Cases..."
                    : hasGeneratedCurrentCases
                    ? "Cases Already Generated"
                    : "Generate New Cases From Changes"}
                </button>
              </div>
            )}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Impact Score
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

      <div className="border-b border-zinc-200 px-6 py-6 dark:border-zinc-800">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Old Requirement
        </label>
        <textarea
          className="mt-3 min-h-[140px] w-full rounded-[24px] border border-zinc-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fafafa_100%)] px-5 py-4 text-sm leading-6 text-zinc-900 shadow-inner outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
          placeholder="Paste the previous version of the requirement here to compare it with the current workspace requirement..."
          value={oldRequirement}
          onChange={(event) => setOldRequirement(event.target.value)}
        />
      </div>

      {!oldRequirement.trim() || !hasNewRequirement ? (
        <div className="px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          Add both an old requirement here and a current requirement in the workspace to see impact analysis.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            {analysis.changes.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  No meaningful requirement changes detected.
                </p>
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                  The current requirement appears very close to the previous version.
                </p>
              </div>
            ) : (
              analysis.changes.map((change) => (
                <div
                  key={change.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {change.summary}
                      </p>
                      {change.oldSentence && (
                        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                          Old: {change.oldSentence}
                        </p>
                      )}
                      {change.newSentence && (
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          New: {change.newSentence}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${changeTone[change.type]}`}
                    >
                      {change.type}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Impacted Existing Cases
              </p>
              {!hasRows ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Generate or add test cases to identify impacted rows.
                </p>
              ) : analysis.impactedRows.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  No exact traceability matches were found yet, so CaseForge will use the closest related rows when you apply statuses.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {analysis.impactedRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                    >
                      <span className="font-semibold">{row.id}</span>: {row.title}
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Risk area: {row.riskArea}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Recommended: {row.recommendedAction.replace("-", " ")}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {row.reason}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            onSetRowLifecycleStatus(row.id, "obsolete")
                          }
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
                        >
                          Mark Obsolete
                        </button>
                        <button
                          onClick={() =>
                            onSetRowLifecycleStatus(row.id, "needs-update")
                          }
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15"
                        >
                          Needs Update
                        </button>
                        <button
                          onClick={() =>
                            onSetRowLifecycleStatus(row.id, "needs-review")
                          }
                          className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/15"
                        >
                          Needs Review
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                New Regression Tests Needed
              </p>
              {analysis.suggestedRegressionCases.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  New regression suggestions will appear when requirement changes are detected.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {analysis.suggestedRegressionCases.map((item) => (
                    <div
                      key={`${item.title}-${item.reason}`}
                      className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                    >
                      <div className="font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {item.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {hasGeneratedCurrentCases && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                  Generation Locked
                </p>
                <p className="mt-3 text-sm leading-6 text-emerald-800 dark:text-emerald-200">
                  This change set has already generated its batch of new cases. Update the old or current requirement to unlock a fresh generation.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
