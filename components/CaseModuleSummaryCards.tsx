"use client";

import Link from "next/link";
import { formatUtcDate } from "../utils/date-format";
import {
  CompactMetricCard,
  CompactMetricGrid,
  compactBadgeClassName,
  compactEyebrowClassName,
} from "./FilterWorkspaceSections";
import type {
  ActorAttribution,
  AutomationEnvironmentBinding,
  CaseReviewHistoryEntry,
  TestCaseRow,
  TestCaseVersionEntry,
} from "../utils/workspace";

type WorkflowAuditSummaryCardProps = {
  row: TestCaseRow;
  reviewHistory: CaseReviewHistoryEntry[];
  projectRouteRef: string | null;
};

type VersionHistorySummaryCardProps = {
  rowId: string;
  versionHistory: TestCaseVersionEntry[];
  projectRouteRef: string | null;
};

type EnvironmentSummaryCardProps = {
  environment: AutomationEnvironmentBinding | null;
  projectRouteRef: string | null;
  rowId: string;
};

const renderActor = (actor?: ActorAttribution) =>
  actor?.name?.trim() || actor?.email?.trim() || "Not recorded";

export function WorkflowAuditSummaryCard({
  row,
  reviewHistory,
  projectRouteRef,
}: WorkflowAuditSummaryCardProps) {
  const encodedProjectRef = projectRouteRef ? encodeURIComponent(projectRouteRef) : null;
  const activityHref = encodedProjectRef
    ? `/projects/${encodedProjectRef}/activity?rowId=${encodeURIComponent(row.id)}`
    : null;

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={compactEyebrowClassName}>
            Workflow Audit
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Approval and review state stays visible here, while full audit detail lives in Activity.
          </p>
        </div>
        <span className={`${compactBadgeClassName} border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`}>
          {reviewHistory.length} event{reviewHistory.length === 1 ? "" : "s"}
        </span>
      </div>

      <CompactMetricGrid className="mt-4">
        <CompactMetricCard label="Review Status" value={row.reviewStatus ?? "draft"} valueClassName="capitalize" />
        <CompactMetricCard
          label="Last Updated"
          value={
            row.updatedAt || row.createdAt
              ? formatUtcDate(row.updatedAt ?? row.createdAt ?? 0)
              : "Not recorded"
          }
        />
        <CompactMetricCard label="Last Editor" value={renderActor(row.editedBy)} />
        <CompactMetricCard label="Review Owner" value={row.reviewOwner?.trim() || "Unassigned"} />
      </CompactMetricGrid>

      {activityHref ? (
        <div className="mt-4">
          <Link
            href={activityHref}
            className="inline-flex rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            View Full History
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function VersionHistorySummaryCard({
  rowId,
  versionHistory,
  projectRouteRef,
}: VersionHistorySummaryCardProps) {
  const encodedProjectRef = projectRouteRef ? encodeURIComponent(projectRouteRef) : null;
  const activityHref = encodedProjectRef
    ? `/projects/${encodedProjectRef}/activity?rowId=${encodeURIComponent(rowId)}`
    : null;
  const latestVersion = versionHistory[0] ?? null;

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={compactEyebrowClassName}>
            Version History
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Compare and restore snapshots from the Activity module when you need the full timeline.
          </p>
        </div>
        <span className={`${compactBadgeClassName} border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`}>
          {versionHistory.length} snapshot{versionHistory.length === 1 ? "" : "s"}
        </span>
      </div>

      <CompactMetricGrid className="mt-4">
        <CompactMetricCard label="Latest Snapshot" value={latestVersion?.reason || "No snapshot yet"} />
        <CompactMetricCard
          label="Captured"
          value={latestVersion?.createdAt ? formatUtcDate(latestVersion.createdAt) : "Not recorded"}
        />
      </CompactMetricGrid>

      {activityHref ? (
        <div className="mt-4">
          <Link
            href={activityHref}
            className="inline-flex rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Open Version Timeline
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function EnvironmentSummaryCard({
  environment,
  projectRouteRef,
  rowId,
}: EnvironmentSummaryCardProps) {
  const encodedProjectRef = projectRouteRef ? encodeURIComponent(projectRouteRef) : null;
  const environmentsHref = encodedProjectRef
    ? `/projects/${encodedProjectRef}/automation/environments?rowId=${encodeURIComponent(rowId)}`
    : null;

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={compactEyebrowClassName}>
            Environment
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Environment setup stays compact here and opens in the Automation Environments module.
          </p>
        </div>
        {environment?.isDefault ? (
          <span className={`${compactBadgeClassName} border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300`}>
            Default
          </span>
        ) : null}
      </div>

      <CompactMetricGrid className="mt-4">
        <CompactMetricCard label="Active Environment" value={environment?.name || "Default Environment"} />
        <CompactMetricCard label="Base URL" value={environment?.baseUrl?.trim() || "Not set"} valueClassName="break-all" />
      </CompactMetricGrid>

      {environmentsHref ? (
        <div className="mt-4">
          <Link
            href={environmentsHref}
            className="inline-flex rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Manage Environment
          </Link>
        </div>
      ) : null}
    </div>
  );
}
