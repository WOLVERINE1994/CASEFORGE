import Link from "next/link";
import BarChart from "../../../components/charts/BarChart";
import TrendChart from "../../../components/charts/TrendChart";
import type { SharedIssueRecord } from "../../../components/ProjectIssueStateContext";
import { readProjectByRef } from "../../../utils/project-store";
import { formatUtcDateTime } from "../../../utils/date-format";
import { buildProjectReportsSummary } from "../../../utils/project-reports";
import { buildAutomationCandidateInsights } from "../../../utils/test-case-management";
import {
  listProjectIssuesForUi,
} from "../../../services/issue-service";

const statusChipClassName: Record<string, string> = {
  backlog:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  todo: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  "in-progress":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  "in-review":
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};

const issueTypeLabel: Record<string, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
  "test-case": "Test Case",
  "test-plan": "Test Plan",
  "test-run": "Test Run",
};

const releaseDecisionTone = {
  safe: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  caution:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
} as const;

const executionVisualTone = {
  passed: "bg-emerald-500",
  failed: "bg-rose-500",
  blocked: "bg-amber-500",
  "not-run": "bg-zinc-400",
} as const;

type ProjectOverviewPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
  searchParams?: Promise<{
    from?: string;
  }>;
};

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: ProjectOverviewPageProps) {
  const { projectKey } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const project = await readProjectByRef(projectKey);
  let issues: SharedIssueRecord[] = [];

  try {
    issues = await listProjectIssuesForUi(projectKey);
  } catch (error) {
    console.error("PROJECT OVERVIEW ISSUE LOAD ERROR:", error);
  }

  const resolvedProjectKey = project?.projectKey?.trim() || projectKey;
  const encodedProjectKey = encodeURIComponent(resolvedProjectKey);
  const cameFromRelease = resolvedSearchParams?.from === "release";
  const buildProjectHref = (path: string) =>
    cameFromRelease ? `${path}${path.includes("?") ? "&" : "?"}from=release` : path;
  const reportsSummary = buildProjectReportsSummary(project, issues);
  const totalCases = project?.testCaseCount ?? project?.rows.length ?? 0;
  const automationProviderPressure = Array.from(
    buildAutomationCandidateInsights(project?.rows ?? []).reduce((accumulator, entry) => {
      if (entry.automationStatus === "automated" || !entry.isStrongCandidate) {
        return accumulator;
      }

      const provider = entry.provider || "Unspecified";
      accumulator.set(provider, (accumulator.get(provider) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider))
    .slice(0, 4);
  const providerSnapshotsDescending = [...(project?.releaseReview?.snapshots ?? [])].sort(
    (left, right) => right.decisionRecordedAt - left.decisionRecordedAt
  );
  const latestProviderSnapshot = providerSnapshotsDescending.find(
    (snapshot) =>
      Array.isArray(snapshot.automationProviders) && snapshot.automationProviders.length > 0
  );
  const previousProviderSnapshot = providerSnapshotsDescending.find(
    (snapshot) =>
      snapshot.id !== latestProviderSnapshot?.id &&
      Array.isArray(snapshot.automationProviders) &&
      snapshot.automationProviders.length > 0
  );
  const automationProviderTrendBars =
    latestProviderSnapshot?.automationProviders
      ?.map((entry) => {
        const previousCount =
          previousProviderSnapshot?.automationProviders?.find(
            (previousEntry) => previousEntry.provider === entry.provider
          )?.count ?? 0;
        const delta = entry.count - previousCount;

        return {
          key: entry.provider,
          label: entry.provider,
          value: entry.count,
          color: delta < 0 ? "#16a34a" : delta > 0 ? "#f43f5e" : "#94a3b8",
        };
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 4) ?? [];
  const executionCounts = (project?.rows ?? []).reduce<Record<string, number>>(
    (accumulator, row) => {
      const key = row.executionResult ?? "not-run";
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    },
    {}
  );
  const passedCases = executionCounts.passed ?? 0;
  const failedCases = executionCounts.failed ?? 0;
  const blockedCases = executionCounts.blocked ?? 0;
  const notRunCases = executionCounts["not-run"] ?? totalCases;
  const totalIssues = issues.length;
  const blockedIssues = issues.filter((issue) => issue.status === "blocked").length;
  const doneIssues = issues.filter((issue) => issue.status === "done").length;
  const linkedCases = (project?.rows ?? []).filter((row) => row.issueId || row.issueKey).length;
  const unlinkedCases = Math.max(totalCases - linkedCases, 0);
  const templateImportAuditEntries = (project?.auditTrail ?? []).filter(
    (entry) => entry.action === "Case template pack imported"
  );
  const templateExportAuditEntries = (project?.auditTrail ?? []).filter(
    (entry) => entry.action === "Case template pack exported"
  );
  const latestTemplateOperationEntry = [...(project?.auditTrail ?? [])]
    .filter(
      (entry) =>
        entry.action === "Case template pack imported" ||
        entry.action === "Case template pack exported"
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  const templateSourceDashboardCards = reportsSummary.templateOperations.sourceDashboards.slice(0, 4);
  const templateSourceRuleTrendPoints = reportsSummary.templateOperations.sourceRuleTrend.map(
    (point) => ({
      key: point.id,
      label: point.label,
      value: point.value,
      secondaryValue: point.secondaryValue,
    })
  );
  const prioritizedTemplateSourceCards = reportsSummary.templateOperations.prioritizedSources.slice(0, 4);
  const mutedTemplateSourceCards = reportsSummary.templateOperations.mutedSources.slice(0, 4);
  const completionRate =
    totalIssues === 0 ? 0 : Math.round((doneIssues / totalIssues) * 100);
  const blockedRate =
    totalIssues === 0 ? 0 : Math.round((blockedIssues / totalIssues) * 100);
  const executionDistribution = [
    {
      key: "passed" as const,
      label: "Passed",
      count: passedCases,
    },
    {
      key: "failed" as const,
      label: "Failed",
      count: failedCases,
    },
    {
      key: "blocked" as const,
      label: "Blocked",
      count: blockedCases,
    },
    {
      key: "not-run" as const,
      label: "Not Run",
      count: notRunCases,
    },
  ].map((entry) => ({
    ...entry,
    percent: totalCases === 0 ? 0 : Math.round((entry.count / totalCases) * 100),
  }));
  const priorityCounts = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.priority] = (accumulator[issue.priority] ?? 0) + 1;
    return accumulator;
  }, {});
  const priorityDistribution = (["highest", "high", "medium", "low"] as const)
    .map((priority) => ({
      priority,
      count: priorityCounts[priority] ?? 0,
    }))
    .filter((entry) => entry.count > 0);
  const typeCounts = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.type] = (accumulator[issue.type] ?? 0) + 1;
    return accumulator;
  }, {});
  const issueTypeDistribution = (
    ["bug", "task", "story", "test-case", "test-plan", "test-run", "epic"] as const
  )
    .map((type) => ({
      type,
      count: typeCounts[type] ?? 0,
    }))
    .filter((entry) => entry.count > 0);
  const assigneeWorkload = Array.from(
    issues.reduce((accumulator, issue) => {
      const key = issue.assigneeId || "unassigned";
      accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([assignee, count]) => ({
      assignee,
      count,
    }))
    .sort((left, right) => right.count - left.count);
  const activeOwners = assigneeWorkload.filter((entry) => entry.assignee !== "unassigned").length;
  const recentCaseActivity = [...(project?.rows ?? [])].slice(-5).reverse();
  const latestReleaseDecision = project?.releaseReview?.recordedDecision;
  const latestReleaseDecisionLabel =
    latestReleaseDecision === "safe"
      ? "Safe to release"
      : latestReleaseDecision === "caution"
      ? "Release with caution"
      : latestReleaseDecision === "blocked"
      ? "Not ready for release"
      : null;
  const latestReleaseDecisionNote = project?.releaseReview?.decisionNote?.trim() || "";
  const latestReleaseDecisionAt = project?.releaseReview?.decisionRecordedAt;
  const recentActivity = [
    ...issues.slice(0, 4).map((issue) => ({
      id: issue.id,
      title: issue.summary,
      meta: `${issue.issueKey} moved into ${issue.status}`,
      href: `/projects/${encodedProjectKey}/issues?issueId=${encodeURIComponent(issue.id)}`,
      tone: "issue" as const,
    })),
    ...recentCaseActivity.slice(0, 3).map((row) => ({
      id: row.id,
      title: row.title.trim() || "Untitled test case",
      meta: row.issueKey ? `Case linked to ${row.issueKey}` : "Case updated in the library",
      href: `/projects/${encodedProjectKey}/cases`,
      tone: "case" as const,
    })),
  ].slice(0, 6);
  const releaseDecisionSummaryText = latestReleaseDecisionLabel
    ? latestReleaseDecisionAt
      ? `${latestReleaseDecisionLabel} recorded ${formatUtcDateTime(latestReleaseDecisionAt)}`
      : latestReleaseDecisionLabel
    : "No release decision recorded yet";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[34px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.34)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Overview
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Project health at a glance
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Use this route as the project home for delivery status, case coverage, and the fastest path into
              the workspace, cases, board, or issues.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/workspace`)}
              className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
            >
              Open Workspace
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/reports`)}
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Open Reports
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/board`)}
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Open Board
            </Link>
          </div>
        </div>

        {cameFromRelease && (
          <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50/90 px-5 py-4 text-sm text-sky-900 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">Release review mode is active</p>
                <p className="mt-1 text-sky-800/80 dark:text-sky-200/80">
                  You are still in the release decision flow. Use this overview to re-check health, then jump back into focused cases, runs, issues, or the release dashboard.
                </p>
              </div>
              <Link
                href={`/projects/${encodedProjectKey}/release`}
                className="inline-flex items-center justify-center rounded-2xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 dark:border-sky-400/30 dark:bg-zinc-950 dark:text-sky-200 dark:hover:bg-zinc-900"
              >
                Back to Release
              </Link>
            </div>
          </div>
        )}

        {latestReleaseDecision && latestReleaseDecisionLabel && (
          <div
            className={`mt-6 rounded-[24px] border px-5 py-4 shadow-sm ${
              releaseDecisionTone[latestReleaseDecision]
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                  Latest Release Decision
                </p>
                <p className="mt-2 text-lg font-semibold">{latestReleaseDecisionLabel}</p>
                {latestReleaseDecisionAt ? (
                  <p className="mt-1 text-sm opacity-80">
                    Recorded {formatUtcDateTime(latestReleaseDecisionAt)}
                  </p>
                ) : null}
                {latestReleaseDecisionNote ? (
                  <p className="mt-3 max-w-3xl text-sm leading-7 opacity-90">
                    {latestReleaseDecisionNote}
                  </p>
                ) : (
                  <p className="mt-3 text-sm opacity-80">
                    No release note was recorded with the last manager decision.
                  </p>
                )}
              </div>

              <Link
                href={buildProjectHref(`/projects/${encodedProjectKey}/release`)}
                className="inline-flex items-center justify-center rounded-2xl border border-current/20 bg-white/70 px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-white dark:bg-zinc-950/50 dark:hover:bg-zinc-950"
              >
                Open Release Decision
              </Link>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(135deg,_rgba(240,253,250,0.95)_0%,_rgba(236,253,245,0.92)_100%)] px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Linked Cases
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{linkedCases}</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Cases already tied to delivery issues.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(135deg,_rgba(255,251,235,0.95)_0%,_rgba(254,243,199,0.9)_100%)] px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Unlinked Cases
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{unlinkedCases}</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Cases that still need issue coverage.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(135deg,_rgba(239,246,255,0.95)_0%,_rgba(219,234,254,0.9)_100%)] px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Active Owners
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{activeOwners}</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              People currently carrying tracked issue load.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/75 bg-[linear-gradient(135deg,_rgba(254,242,242,0.96)_0%,_rgba(254,226,226,0.9)_100%)] px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Blocked Rate
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{blockedRate}%</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Share of tracked work currently blocked.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-zinc-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(244,247,246,0.98)_100%)] px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-[linear-gradient(180deg,_rgba(24,24,27,0.96)_0%,_rgba(12,12,14,0.98)_100%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Overview Command Center
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Read the project like a briefing, then jump to the right surface.
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              The cards below are for immediate signal. The deeper execution, issue, and activity views stay available further down when you need more detail.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Cases
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {totalCases}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {linkedCases} linked, {unlinkedCases} unlinked
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Delivery
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {completionRate}%
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {totalIssues} issues in tracked flow
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Execution
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {passedCases}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                passed, {failedCases} failed, {blockedCases} blocked
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Release Signal
              </p>
              <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {latestReleaseDecisionLabel ?? "No decision yet"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {latestReleaseDecision ? "Manager call recorded" : "Decision still pending"}
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Template Ops
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {templateImportAuditEntries.length}
                <span className="mx-1 text-zinc-400">/</span>
                {templateExportAuditEntries.length}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                imports / exports recorded
              </p>
            </div>
          </div>
        </div>
      </section>

      {(templateImportAuditEntries.length > 0 || templateExportAuditEntries.length > 0) ? (
        <section className="rounded-[28px] border border-zinc-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(244,247,246,0.98)_100%)] px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-[linear-gradient(180deg,_rgba(24,24,27,0.96)_0%,_rgba(12,12,14,0.98)_100%)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Template Operation Pressure
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Keep reusable-template activity visible before diving into workspace.
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Imports and exports affect how reusable assets move across the team, so they deserve a spot in the project home too.
              </p>
            </div>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/workspace?focus=template-library`)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Open Template Library
            </Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-[20px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Imports
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {templateImportAuditEntries.length}
              </p>
            </article>
            <article className="rounded-[20px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Exports
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {templateExportAuditEntries.length}
              </p>
            </article>
            <article className="rounded-[20px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Latest Activity
              </p>
              <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {latestTemplateOperationEntry?.action || "No activity"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {latestTemplateOperationEntry
                  ? formatUtcDateTime(latestTemplateOperationEntry.createdAt)
                  : "No template activity yet"}
              </p>
            </article>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/reports?templateAction=imported`)}
              className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
            >
              View Import Activity
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/reports?templateAction=exported`)}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              View Export Activity
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/reports?templateAction=all`)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Open Template Activity In Reports
            </Link>
          </div>
          {templateSourceDashboardCards.length > 0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {templateSourceDashboardCards.map((entry) => (
                <Link
                  key={`overview-template-source-${entry.source}`}
                  href={buildProjectHref(
                    `/projects/${encodedProjectKey}/reports?templateAction=all&source=${encodeURIComponent(entry.source)}&focus=source-governance`
                  )}
                  className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    {entry.source}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {entry.importedCount + entry.exportedCount}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    ops, {entry.prioritizedCount} prioritized, {entry.suppressedCount} muted
                  </p>
                </Link>
              ))}
            </div>
          ) : null}
          {(prioritizedTemplateSourceCards.length > 0 || mutedTemplateSourceCards.length > 0) ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {prioritizedTemplateSourceCards.map((entry) => (
                <Link
                  key={`overview-prioritized-template-source-${entry.source}`}
                  href={buildProjectHref(
                    `/projects/${encodedProjectKey}/reports?templateAction=all&source=${encodeURIComponent(entry.source)}&focus=source-governance`
                  )}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                >
                  Prioritized: {entry.source} ({entry.count})
                </Link>
              ))}
              {mutedTemplateSourceCards.map((entry) => (
                <Link
                  key={`overview-muted-template-source-${entry.source}`}
                  href={buildProjectHref(
                    `/projects/${encodedProjectKey}/reports?templateAction=all&source=${encodeURIComponent(entry.source)}&focus=source-governance`
                  )}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                >
                  Muted: {entry.source} ({entry.count})
                </Link>
              ))}
            </div>
          ) : null}
          {templateSourceRuleTrendPoints.length > 0 ? (
            <div className="mt-6">
              <TrendChart
                title="Template Source Rule Trend"
                description="Shows whether reviewer rules are amplifying or suppressing more source activity across recent checkpoints."
                points={templateSourceRuleTrendPoints}
                primaryLabel="Prioritized"
                secondaryLabel="Suppressed"
                primaryColor="#f59e0b"
                secondaryColor="#f43f5e"
                valueSuffix=""
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {automationProviderPressure.length > 0 ? (
        <section className="rounded-[28px] border border-zinc-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(244,247,246,0.98)_100%)] px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-[linear-gradient(180deg,_rgba(24,24,27,0.96)_0%,_rgba(12,12,14,0.98)_100%)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Automation Provider Pressure
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                See which stack is carrying the strongest ready-to-automate manual load.
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                These are high-confidence manual candidates grouped by provider so the team can route the next automation push faster.
              </p>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Direct drill-downs open the candidate slice in Cases.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {automationProviderPressure.map((entry) => (
              <Link
                key={entry.provider}
                href={buildProjectHref(
                  `/projects/${encodedProjectKey}/cases?automation=candidate&automationProvider=${encodeURIComponent(entry.provider)}`
                )}
                className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  {entry.provider}
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {entry.count}
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  strong-ready manual candidates
                </p>
              </Link>
            ))}
          </div>
          {automationProviderTrendBars.length > 0 ? (
            <div className="mt-6">
              <BarChart
                title="Provider Trend Snapshot"
                description="Latest provider pressure, colored by whether the most recent release snapshot improved or worsened versus the previous one."
                data={automationProviderTrendBars}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <details className="group rounded-[28px] border border-zinc-200 bg-white/88 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
        <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Metric Snapshot
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              The raw KPI blocks are still here, but grouped so the top of the page feels more deliberate.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              {releaseDecisionSummaryText}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              Deep Dive
            </span>
          </div>
        </summary>
        <div className="border-t border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Cases
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            {totalCases}
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Manual and generated test assets in this project.
          </p>
        </article>

        <article className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Passed
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            {passedCases}
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Cases already marked as passed in execution tracking.
          </p>
        </article>

        <article className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Issues
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            {totalIssues}
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Tracked work items currently linked to this project shell.
          </p>
        </article>

        <article className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Completion
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            {completionRate}%
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Based on issues currently in the `Done` lane.
          </p>
        </article>

        <article className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Blocked
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            {blockedIssues}
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Work items that currently need attention to move again.
          </p>
        </article>
      </section>
        </div>
      </details>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-3">
        <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Not Run
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {notRunCases}
          </p>
        </article>
        <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Failed
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {failedCases}
          </p>
        </article>
        <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Blocked Cases
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {blockedCases}
          </p>
        </article>
      </section>

      <section className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Execution Distribution
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Current case execution mix
            </h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            A compact view of how much of the project is passed, failed, blocked, or not run.
          </p>
        </div>

        <div className="mt-5 h-4 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          {executionDistribution.map((entry) =>
            entry.percent > 0 ? (
              <div
                key={entry.key}
                className={`h-full ${executionVisualTone[entry.key]}`}
                style={{ width: `${entry.percent}%`, float: "left" }}
              />
            ) : null
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {executionDistribution.map((entry) => (
            <div
              key={entry.key}
              className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${executionVisualTone[entry.key]}`}
                  />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {entry.label}
                  </span>
                </div>
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                  {entry.percent}%
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {entry.count} case{entry.count === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Recent Issues
              </p>
              <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Latest tracked work
              </h3>
            </div>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/issues`)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Open Issues
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {issues.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No issues yet. Create the first tracked work item for this project.
              </div>
            ) : (
              issues.slice(0, 5).map((issue) => (
                <Link
                  key={issue.id}
                  href={`${buildProjectHref(`/projects/${encodedProjectKey}/issues`)}${cameFromRelease ? "&" : "?"}issueId=${encodeURIComponent(issue.id)}`}
                  className="block rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] p-4 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      {issue.issueKey}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        statusChipClassName[issue.status] ?? statusChipClassName.backlog
                      }`}
                    >
                      {issue.status}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                      {issue.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    {issue.summary}
                  </p>
                  {issue.description && (
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {issue.description}
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
            Quick Links
          </p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Jump into the right surface
          </h3>

          <div className="mt-5 space-y-3">
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/workspace`)}
              className="block rounded-[24px] border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <span className="font-semibold">Workspace</span>
              <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                Shape requirements, generate cases, and refine AI output.
              </span>
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/cases`)}
              className="block rounded-[24px] border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <span className="font-semibold">Cases</span>
              <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                Edit manual and generated cases, and link them to tracked issues.
              </span>
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/board`)}
              className="block rounded-[24px] border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <span className="font-semibold">Board</span>
              <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                Track delivery flow across backlog, in-progress, blocked, and done.
              </span>
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/runs`)}
              className="block rounded-[24px] border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <span className="font-semibold">Runs</span>
              <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                Execute filtered cases in batches and update pass, fail, or blocked results.
              </span>
            </Link>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/release`)}
              className="block rounded-[24px] border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <span className="font-semibold">Release</span>
              <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                Decide whether the current release is safe to ship and what still blocks it.
              </span>
            </Link>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Assignee Workload
              </p>
              <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Who is carrying the current issue load
              </h3>
            </div>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/board`)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Open Board
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {assigneeWorkload.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No issue ownership data yet. Assign a few issues to see workload balance.
              </div>
            ) : (
              assigneeWorkload.map((entry) => (
                <div
                  key={entry.assignee}
                  className="flex items-center justify-between rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {entry.assignee === "unassigned" ? "Unassigned" : entry.assignee}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Active work items currently mapped to this owner
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                    {entry.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Priority Mix
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              How urgent the current issue backlog is
            </h3>
          </div>

          <div className="mt-5 space-y-3">
            {priorityDistribution.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No issue priority distribution yet. Create issues to see urgency spread.
              </div>
            ) : (
              priorityDistribution.map((entry) => (
                <div key={entry.priority} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold capitalize text-zinc-900 dark:text-zinc-100">
                      {entry.priority}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {entry.count} issue{entry.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${
                        entry.priority === "highest"
                          ? "bg-rose-500"
                          : entry.priority === "high"
                            ? "bg-amber-500"
                            : entry.priority === "medium"
                              ? "bg-sky-500"
                              : "bg-zinc-500"
                      }`}
                      style={{
                        width: `${Math.max(8, Math.round((entry.count / Math.max(totalIssues, 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Issue Types
              </p>
              <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                What kind of work is in the project
              </h3>
            </div>
            <Link
              href={buildProjectHref(`/projects/${encodedProjectKey}/issues`)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Open Issues
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {issueTypeDistribution.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No issue type mix yet. Create issues to start shaping the work profile.
              </div>
            ) : (
              issueTypeDistribution.map((entry) => (
                <div
                  key={entry.type}
                  className="rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    {issueTypeLabel[entry.type] ?? entry.type}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {entry.count}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Activity
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Lightweight project pulse
            </h3>
          </div>

          <div className="mt-5 space-y-3">
            {recentActivity.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No recent project activity yet. Add cases or issues to start building momentum.
              </div>
            ) : (
              recentActivity.map((item) => (
                <Link
                  key={`${item.tone}-${item.id}`}
                  href={item.href.includes("?")
                    ? `${item.href}${cameFromRelease ? "&from=release" : ""}`
                    : `${item.href}${cameFromRelease ? "?from=release" : ""}`}
                  className="flex items-start gap-3 rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] px-4 py-4 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
                >
                  <span
                    className={`mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full text-[11px] font-bold uppercase tracking-[0.12em] ${
                      item.tone === "issue"
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    }`}
                  >
                    {item.tone === "issue" ? "IS" : "CS"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.meta}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Recent Case Activity
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Latest saved case rows in this project
            </h3>
          </div>
          <Link
            href={buildProjectHref(`/projects/${encodedProjectKey}/cases`)}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Open Cases
          </Link>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {recentCaseActivity.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No saved cases yet. Generate or add a few cases to populate recent activity.
            </div>
          ) : (
            recentCaseActivity.map((row) => (
              <div
                key={row.id}
                className="rounded-[24px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(247,249,248,0.98)_100%)] p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {row.id}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                    {row.type}
                  </span>
                  {row.issueKey && (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                      {row.issueKey}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {row.title.trim() || "Untitled test case"}
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {row.assignee?.trim()
                    ? `Assigned to ${row.assignee.trim()}`
                    : "Currently unassigned"}
                  {" | "}
                  {(row.priority || "medium").toUpperCase()} priority
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}


