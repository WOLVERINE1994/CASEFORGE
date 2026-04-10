"use client";

import type { RequirementRiskAnalysis } from "../utils/risk-analysis";

type Props = {
  analysis: RequirementRiskAnalysis;
  hasRequirement: boolean;
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

export default function RequirementRiskHeatmap({
  analysis,
  hasRequirement,
}: Props) {
  const status = statusMeta[analysis.status];

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Requirement Risk Heatmap
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Surface ambiguity before test generation
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              The workspace scans your requirement for missing validation, roles, failure paths, and edge-case signals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Risk Score
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
          Add a requirement above to see risk hotspots and missing QA angles.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div>
            <div className="space-y-4">
              {analysis.risks.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    No major risk gaps detected.
                  </p>
                  <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                    This requirement already includes several signals that help QA generate strong coverage.
                  </p>
                </div>
              ) : (
                analysis.risks.map((risk) => (
                  <div
                    key={risk.id}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {risk.title}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                          {risk.summary}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${severityTone[risk.severity]}`}
                      >
                        {risk.severity}
                      </span>
                    </div>
                    <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                      <span className="font-semibold">QA follow-up:</span> {risk.question}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Strength Signals
              </p>
              {analysis.strengths.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Add more explicit business rules to raise confidence.
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
                {analysis.risks.length > 0
                  ? "Tighten the requirement using the QA follow-up prompts, then generate cases once the biggest gaps are clarified."
                  : "The requirement looks solid enough to generate cases now, with fewer hidden assumptions."}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
