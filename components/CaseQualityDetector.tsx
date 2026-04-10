"use client";

import type { CaseQualityAnalysis } from "../utils/case-quality";

type Props = {
  analysis: CaseQualityAnalysis;
  hasRows: boolean;
  activeFindingId: string | null;
  ignoredFindingIds: string[];
  rowTitles: Record<string, string>;
  onMergeFinding: (findingId: string) => void;
  onKeepBestFinding: (findingId: string) => void;
  onRewriteFinding: (findingId: string) => void;
  onIgnoreFinding: (findingId: string) => void;
  onFocusRow: (rowId: string) => void;
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

export default function CaseQualityDetector({
  analysis,
  hasRows,
  activeFindingId,
  rowTitles,
  onMergeFinding,
  onKeepBestFinding,
  onRewriteFinding,
  onIgnoreFinding,
  onFocusRow,
}: Props) {
  const status = statusMeta[analysis.status];

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Draft Cleanup Guide
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Fix weak drafts before review handoff
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Review the suite for near-duplicates, vague rows, thin structure, and overlapping coverage before asking someone to approve it.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Quality Score
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
          Generate or add test cases to review duplicate, overlapping, or weak rows.
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            {analysis.findings.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  No major duplicate or weak-case issues detected.
                </p>
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                  The current suite looks distinct enough to move into review, execution, or export.
                </p>
              </div>
            ) : (
              analysis.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {finding.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {finding.summary}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${severityTone[finding.severity]}`}
                    >
                      {finding.severity}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {finding.rowIds.map((rowId) => (
                      <button
                        key={rowId}
                        onClick={() => onFocusRow(rowId)}
                        className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {rowId}
                      </button>
                    ))}
                  </div>
                  {finding.rowIds.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-white/85 px-4 py-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                      <span className="font-semibold">
                        {finding.rowIds.length > 1 ? "Cases:" : "Case:"}
                      </span>{" "}
                      {finding.rowIds
                        .map(
                          (rowId) =>
                            `${rowId}: ${rowTitles[rowId] || "Untitled test case"}`
                        )
                        .join("  |  ")}
                    </div>
                  )}
                  <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
                    <span className="font-semibold">Suggested fix:</span> {finding.suggestion}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {finding.rowIds.length === 1 && (
                      <button
                        onClick={() => onFocusRow(finding.rowIds[0])}
                        disabled={Boolean(activeFindingId)}
                        className="rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-500/30 dark:bg-zinc-900 dark:text-sky-300 dark:hover:bg-sky-500/10"
                      >
                        Show In Workspace
                      </button>
                    )}
                    {finding.rowIds.length > 1 &&
                      finding.rowIds.map((rowId) => (
                        <button
                          key={`focus-${finding.id}-${rowId}`}
                          onClick={() => onFocusRow(rowId)}
                          disabled={Boolean(activeFindingId)}
                          className="rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-500/30 dark:bg-zinc-900 dark:text-sky-300 dark:hover:bg-sky-500/10"
                        >
                          Show {rowId}
                        </button>
                      ))}
                    {(finding.type === "duplicate" || finding.type === "overlap") && (
                      <>
                        <button
                          onClick={() => onMergeFinding(finding.id)}
                          disabled={Boolean(activeFindingId)}
                          className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                        >
                          {activeFindingId === finding.id
                            ? "Merging..."
                            : "Merge Similar Cases"}
                        </button>
                        <button
                          onClick={() => onKeepBestFinding(finding.id)}
                          disabled={Boolean(activeFindingId)}
                          className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          Keep Best Version
                        </button>
                      </>
                    )}
                    {(finding.type === "vague" ||
                      finding.type === "low-value" ||
                      finding.type === "weak") && (
                      <button
                        onClick={() => onRewriteFinding(finding.id)}
                        disabled={Boolean(activeFindingId)}
                        className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        {activeFindingId === finding.id
                          ? "Rewriting..."
                          : "Rewrite Weak Case"}
                      </button>
                    )}
                    <button
                      onClick={() => onIgnoreFinding(finding.id)}
                      disabled={Boolean(activeFindingId)}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Ignore
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
                  Strength signals will appear here once the suite quality improves.
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
                {analysis.findings.length > 0
                  ? "Tighten vague titles, remove duplicates, and rewrite thin drafts first so the suite is easier to approve."
                  : "The suite looks distinct and meaningful enough to move into review or approval."}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
