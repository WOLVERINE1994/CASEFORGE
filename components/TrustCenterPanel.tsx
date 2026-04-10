"use client";

import type { TrustCenterAnalysis } from "../utils/trust-center";
import { formatUtcDateTime } from "../utils/date-format";

type Props = {
  analysis: TrustCenterAnalysis;
};

export default function TrustCenterPanel({ analysis }: Props) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          Trust Center
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          Make scoring, formatting, and workflow actions easy to trust
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Review deterministic workspace rules, visible reasoning for risk and gap scoring, and an audit trail of recent QA actions.
        </p>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Deterministic Rules
          </p>
          <div className="mt-3 space-y-2">
            {analysis.deterministicRules.map((rule) => (
              <div
                key={rule}
                className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
              >
                {rule}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Visible Reasoning
          </p>
          <div className="mt-3 space-y-2">
            {analysis.riskReasoning.concat(analysis.gapReasoning).slice(0, 8).map((reason) => (
              <div
                key={reason}
                className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
              >
                {reason}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Audit Trail
          </p>
          {analysis.auditTrail.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Recent actions will appear here once the workspace records imports, generation, signoff, and review updates.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {analysis.auditTrail.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                >
                  <div className="font-semibold">{entry.action}</div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {entry.detail}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatUtcDateTime(entry.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
