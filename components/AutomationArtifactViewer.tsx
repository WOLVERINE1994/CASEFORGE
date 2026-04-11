"use client";

import type { AutomationExecution, AutomationExecutionArtifact } from "../utils/workspace";

type Props = {
  execution: AutomationExecution | null;
  artifacts: AutomationExecutionArtifact[];
};

export default function AutomationArtifactViewer({ execution, artifacts }: Props) {
  if (!execution) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No automation run yet. Execute the script to capture logs and failure evidence.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold dark:border-zinc-700 dark:bg-zinc-950">
            {execution.status}
          </span>
          {execution.linkedIssueKey ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Linked issue {execution.linkedIssueKey}
            </span>
          ) : null}
        </div>
        {execution.failureMessage ? (
          <p className="mt-2 leading-5 text-rose-700 dark:text-rose-300">
            {execution.failureMessage}
          </p>
        ) : null}
        {execution.logSummary ? (
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-zinc-950 px-3 py-3 text-[11px] leading-5 text-zinc-100">
            {execution.logSummary}
          </pre>
        ) : null}
      </div>
      {artifacts.length > 0 ? (
        <div className="space-y-2">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className={`rounded-2xl border px-3 py-2.5 text-xs dark:bg-zinc-900 ${
                artifact.type === "screenshot"
                  ? "border-rose-200/80 bg-rose-50/70 text-rose-900 dark:border-rose-500/20 dark:text-rose-100"
                  : artifact.type === "log"
                    ? "border-sky-200/80 bg-sky-50/70 text-sky-900 dark:border-sky-500/20 dark:text-sky-100"
                    : "border-zinc-200/80 bg-white text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold capitalize">{artifact.type}</p>
                {artifact.metadataJson ? (
                  <span className="rounded-full border border-current/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    captured
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] opacity-80">
                {artifact.type === "screenshot"
                  ? "Failure evidence saved for follow-up."
                  : artifact.type === "log"
                    ? "Execution log saved for review."
                    : "Artifact recorded for this execution."}
              </p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-950 px-3 py-2 text-[11px] leading-5 text-zinc-100">
                {artifact.path}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
