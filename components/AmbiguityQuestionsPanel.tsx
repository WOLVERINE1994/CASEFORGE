"use client";

import type { AmbiguityQuestionAnalysis } from "../utils/ambiguity-questions";

type Props = {
  analysis: AmbiguityQuestionAnalysis;
  hasRequirement: boolean;
};

const statusMeta = {
  clear: {
    label: "Clear",
    tone:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  watch: {
    label: "Watch",
    tone:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  unclear: {
    label: "Unclear",
    tone:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
} as const;

const priorityTone = {
  high: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  medium:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  low: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
} as const;

export default function AmbiguityQuestionsPanel({
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
              Ambiguity Questions
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Ask the smartest QA follow-ups before generation
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              The workspace turns unclear requirements into concrete questions about access, timeouts, validation limits, state changes, and expected outcomes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Clarity Score
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
          Add a requirement above to see the most useful QA follow-up questions.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            {analysis.questions.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  No major ambiguity questions detected.
                </p>
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                  The requirement already looks specific enough to support generation with fewer hidden assumptions.
                </p>
              </div>
            ) : (
              analysis.questions.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          {item.category}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.question}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {item.reason}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${priorityTone[item.priority]}`}
                    >
                      {item.priority}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Covered Areas
              </p>
              {analysis.coveredAreas.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Add more concrete business rules to reduce open questions.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {analysis.coveredAreas.map((area) => (
                    <div
                      key={area}
                      className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                    >
                      {area}
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
                {analysis.questions.length > 0
                  ? "Use these questions to tighten the requirement before generation so the test suite starts from clearer business rules."
                  : "The requirement is already specific enough to move into generation or coverage review."}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
