"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AutomationArtifactViewer from "./AutomationArtifactViewer";
import AutomationStepEditor from "./AutomationStepEditor";
import type {
  AutomationBindingMode,
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationProvider,
  AutomationScript,
  AutomationStep,
  TestCaseRow,
} from "../utils/workspace";

type Props = {
  row: TestCaseRow;
  script: AutomationScript | null;
  steps: AutomationStep[];
  latestExecution: AutomationExecution | null;
  latestArtifacts: AutomationExecutionArtifact[];
  projectRouteRef: string | null;
  onSave: (payload: {
    rowId: string;
    mode: AutomationBindingMode;
    provider: AutomationProvider;
    name: string;
    description?: string;
    steps: AutomationStep[];
  }) => void;
  onRun: (rowId: string) => Promise<void>;
  onCreateIssueFromFailure?: (rowId: string) => Promise<void>;
};

export default function CaseAutomationPanel({
  row,
  script,
  steps,
  latestExecution,
  latestArtifacts,
  projectRouteRef,
  onSave,
  onRun,
  onCreateIssueFromFailure,
}: Props) {
  const [draftName, setDraftName] = useState(script?.name ?? `${row.id} flow`);
  const [draftDescription, setDraftDescription] = useState(script?.description ?? "");
  const [draftProvider, setDraftProvider] = useState<AutomationProvider>(
    script?.provider ?? "playwright"
  );
  const [draftMode, setDraftMode] = useState<AutomationBindingMode>(
    row.automationBindingMode ?? "automated"
  );
  const [draftSteps, setDraftSteps] = useState<AutomationStep[]>(
    steps.length > 0
      ? steps
      : [
          {
            id: crypto.randomUUID(),
            scriptId: script?.id ?? "",
            order: 0,
            action: "goto",
            targetType: "url",
            targetValue: "",
            timeoutMs: 5000,
          },
        ]
  );
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const runHref = useMemo(() => {
    if (!projectRouteRef || !latestExecution) {
      return null;
    }

    const params = new URLSearchParams({
      runId: latestExecution.runId,
      rowId: row.id,
    });

    return `/projects/${encodeURIComponent(projectRouteRef)}/runs?${params.toString()}`;
  }, [latestExecution, projectRouteRef, row.id]);

  const reportHref = useMemo(() => {
    if (!projectRouteRef) {
      return null;
    }

    return `/projects/${encodeURIComponent(projectRouteRef)}/reports`;
  }, [projectRouteRef]);

  const headerChips = useMemo(
    () => [
      draftMode,
      draftProvider,
      script ? "bound" : "not saved",
      latestExecution?.status ?? "not-run",
    ],
    [draftMode, draftProvider, latestExecution?.status, script]
  );

  const validate = async () => {
    setIsValidating(true);
    try {
      const response = await fetch("/api/automation/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: draftProvider,
          steps: draftSteps,
        }),
      });
      const data = (await response.json()) as { valid: boolean; errors: string[] };
      setValidationErrors(data.valid ? [] : data.errors);
    } finally {
      setIsValidating(false);
    }
  };

  const save = () => {
    onSave({
      rowId: row.id,
      mode: draftMode,
      provider: draftProvider,
      name: draftName,
      description: draftDescription,
      steps: draftSteps,
    });
  };

  const run = async () => {
    setIsRunning(true);
    try {
      await onRun(row.id);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Automation
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Keep automation secondary to the case, but ready when this flow is worth repeating.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {headerChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input
          type="text"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="Script name"
          className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={draftProvider}
          onChange={(event) => setDraftProvider(event.target.value as AutomationProvider)}
          className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="playwright">Playwright</option>
          <option value="cypress">Cypress (planned)</option>
          <option value="api">API (planned)</option>
          <option value="mobile">Mobile (planned)</option>
        </select>
        <input
          type="text"
          value={draftDescription}
          onChange={(event) => setDraftDescription(event.target.value)}
          placeholder="What this script covers"
          className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={draftMode}
          onChange={(event) => setDraftMode(event.target.value as AutomationBindingMode)}
          className="min-h-[42px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="manual">Manual</option>
          <option value="automated">Automated</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      <div className="mt-4">
        <AutomationStepEditor steps={draftSteps} onChange={setDraftSteps} />
      </div>

      {validationErrors.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {validationErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
        >
          Save Automation
        </button>
        <button
          type="button"
          onClick={validate}
          disabled={isValidating}
          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {isValidating ? "Validating..." : "Validate"}
        </button>
        <button
          type="button"
          onClick={run}
          disabled={isRunning}
          className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
        >
          {isRunning ? "Running..." : "Run Automation"}
        </button>
        {latestExecution &&
        (latestExecution.status === "failed" || latestExecution.status === "blocked") &&
        !latestExecution.linkedIssueId &&
        onCreateIssueFromFailure ? (
          <button
            type="button"
            onClick={() => void onCreateIssueFromFailure(row.id)}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
          >
            Create Issue From Failure
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <AutomationArtifactViewer
          execution={latestExecution}
          artifacts={latestArtifacts}
        />
      </div>

      {latestExecution ? (
        <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50/90 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                Latest Automation Result
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {latestExecution.status === "passed"
                  ? "Execution completed successfully."
                  : latestExecution.status === "failed"
                  ? "Execution failed and is ready for triage."
                  : latestExecution.status === "blocked"
                  ? "Execution was blocked and needs follow-up."
                  : "Execution result is available."}
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                Use Runs for the case-level execution detail and Reports for the project summary.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {runHref ? (
                <Link
                  href={runHref}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Open Run Result
                </Link>
              ) : null}
              {reportHref ? (
                <Link
                  href={reportHref}
                  className="rounded-2xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 dark:border-sky-500/30 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
                >
                  Open Report
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
