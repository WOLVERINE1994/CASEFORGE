"use client";

import type { TraceabilityAnalysis } from "../utils/traceability";

type Props = {
  analysis: TraceabilityAnalysis;
  hasRequirement: boolean;
  hasRows: boolean;
};

export default function TraceabilityMap({
  analysis,
  hasRequirement,
  hasRows,
}: Props) {
  const coveredCount = analysis.sentenceCoverage.filter(
    (item) => item.covered
  ).length;
  const totalCount = analysis.sentenceCoverage.length;

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Traceability Map
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Link each test case back to what it protects
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Review which requirement sentences are covered, which risk areas each case addresses, and how the selected generation mode shaped the suite.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Sentence Coverage
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {totalCount === 0 ? 0 : `${coveredCount}/${totalCount}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!hasRequirement ? (
        <div className="px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          Add a requirement first to map test cases back to specific requirement sentences.
        </div>
      ) : !hasRows ? (
        <div className="px-6 py-10 text-sm text-zinc-500 dark:text-zinc-400">
          Generate or add test cases to see sentence-level traceability and risk coverage.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            {analysis.sentenceCoverage.map((item) => (
              <div
                key={item.sentence}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.sentence}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {item.covered
                        ? `Linked rows: ${item.rowIds.join(", ")}`
                        : "No linked rows yet"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      item.covered
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                    }`}
                  >
                    {item.covered ? "Covered" : "Uncovered"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Covered Risk Areas
              </p>
              {analysis.coveredRiskAreas.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Risk-linked coverage will appear here after test cases are mapped.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {analysis.coveredRiskAreas.map((riskArea) => (
                    <div
                      key={riskArea}
                      className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                    >
                      {riskArea}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Uncovered Sentences
              </p>
              {analysis.uncoveredSentences.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Every detected requirement sentence has at least one linked test case.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {analysis.uncoveredSentences.map((sentence) => (
                    <div
                      key={sentence}
                      className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                    >
                      {sentence}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
