"use client";

import Link from "next/link";
import { automationProviderLabels } from "../utils/automation";
import { formatUtcDate } from "../utils/date-format";
import {
  CompactMetricCard,
  CompactMetricGrid,
  compactBadgeClassName,
  compactEyebrowClassName,
  compactMetricLabelClassName,
} from "./FilterWorkspaceSections";
import type {
  AutomationBinding,
  AutomationExecution,
  AutomationScript,
  TestCaseRow,
} from "../utils/workspace";

type Props = {
  row: TestCaseRow;
  script: AutomationScript | null;
  binding: AutomationBinding | null;
  latestExecution: AutomationExecution | null;
  projectRouteRef: string | null;
  onRunAutomation?: (rowId: string) => Promise<{
    tone: "info" | "success" | "error";
    text: string;
  } | void>;
  onCreateIssueFromFailure?: (rowId: string) => Promise<void>;
};

const statusTone = {
  passed:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  failed:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  blocked:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  "not-run":
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
} as const;

export default function CaseAutomationLinkPanel({
  row,
  script,
  binding,
  latestExecution,
  projectRouteRef,
  onRunAutomation,
  onCreateIssueFromFailure,
}: Props) {
  const encodedProjectRef = projectRouteRef ? encodeURIComponent(projectRouteRef) : null;
  const automationHref = encodedProjectRef
    ? `/projects/${encodedProjectRef}/automation/scripts?caseId=${encodeURIComponent(row.id)}`
    : null;
  const runHref =
    encodedProjectRef && latestExecution
      ? `/projects/${encodedProjectRef}/automation/runs?executionId=${encodeURIComponent(
          latestExecution.id
        )}`
      : null;
  const sourceCaseHref = encodedProjectRef
    ? `/projects/${encodedProjectRef}/cases?rowId=${encodeURIComponent(row.id)}`
    : null;
  const latestStatus = latestExecution?.status ?? "not-run";
  const providerLabel = script
    ? automationProviderLabels[script.provider]
    : row.automationProvider?.trim() || "Not linked";
  const mappingLabel = binding?.mode ?? row.automationBindingMode ?? "manual";
  const scriptLabel =
    script?.name?.trim() || row.automationReference?.trim() || "Not linked";
  const lastRunLabel = latestExecution?.startedAt
    ? formatUtcDate(latestExecution.startedAt)
    : "Not run";

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={compactEyebrowClassName}>
            Automation Link
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Keep case review focused here. Open the full automation authoring and failure workflow
            in Automation when you need to go deeper.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`${compactBadgeClassName} border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`}>
            {script ? "1 linked automation" : "No linked automation"}
          </span>
          <span
            className={`${compactBadgeClassName} border ${
              statusTone[latestStatus]
            }`}
          >
            Latest {latestStatus}
          </span>
        </div>
      </div>

      <CompactMetricGrid className="mt-4">
        <CompactMetricCard label="Provider" value={providerLabel} />
        <CompactMetricCard label="Binding Mode" value={mappingLabel} valueClassName="capitalize" />
        <CompactMetricCard label="Script / Reference" value={scriptLabel} />
        <CompactMetricCard label="Last Run" value={lastRunLabel} />
      </CompactMetricGrid>

      <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/80">
        <p className={compactMetricLabelClassName}>
          Automation Summary
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {script
            ? `${providerLabel} automation is linked to this case${latestExecution ? ` with the latest run marked ${latestStatus}.` : "."}`
            : "No automation is linked yet. Open Automation to author or attach a flow for this case."}
        </p>
      </div>

      {latestExecution?.failureMessage ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {latestExecution.failureMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {automationHref ? (
          <Link
            href={automationHref}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
          >
            Open In Automation
          </Link>
        ) : null}
        {runHref ? (
          <Link
            href={runHref}
            className="rounded-2xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 dark:border-sky-500/30 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
          >
            Open Latest Automation Run
          </Link>
        ) : null}
        {sourceCaseHref ? (
          <Link
            href={sourceCaseHref}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Open Case Record
          </Link>
        ) : null}
        {onRunAutomation ? (
          <button
            type="button"
            onClick={() => void onRunAutomation(row.id)}
            className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
          >
            Run From Here
          </button>
        ) : null}
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
    </div>
  );
}
