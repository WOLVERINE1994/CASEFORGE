"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import BarChart from "./charts/BarChart";
import DonutChart from "./charts/DonutChart";
import StackedExecutionChart from "./charts/StackedExecutionChart";
import TrendChart from "./charts/TrendChart";
import {
  buildExecutionReportHtml,
  type ProjectReportsSummary,
} from "../utils/project-reports";
import {
  buildReleaseReviewHistoryCsv,
  buildReleaseReviewHistoryMarkdown,
} from "../utils/release-review-export";
import { formatUtcDateTime } from "../utils/date-format";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import { loadReviewerNotificationPreferences } from "../utils/reviewer-notification-preferences";

type Props = {
  summary: ProjectReportsSummary;
};

const parseTemplateOperationAuditSegments = (detail: string, segmentLabel: string) => {
  const match = detail.match(new RegExp(`${segmentLabel}:\\s([^.]*)`));
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(":").map((part) => part.trim())[0] ?? "")
    .filter(Boolean);
};

const executionColor = {
  passed: "#22c55e",
  failed: "#f43f5e",
  blocked: "#f59e0b",
  "not-run": "#94a3b8",
} as const;

const issuePriorityColor = {
  highest: "#f43f5e",
  high: "#f59e0b",
  medium: "#0ea5e9",
  low: "#94a3b8",
} as const;

const issueStatusColor = {
  backlog: "#94a3b8",
  todo: "#0ea5e9",
  "in-progress": "#f59e0b",
  blocked: "#f43f5e",
  "in-review": "#8b5cf6",
  done: "#22c55e",
} as const;

const releaseSnapshotTone = {
  safe: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  caution:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
} as const;

const releaseDeltaTone = {
  up: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  down: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  flat: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  none: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
} as const;

const exportButtonClassName =
  "rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900";

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function downloadBlob(filename: string, blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export default function ProjectReportsDashboard({ summary }: Props) {
  const searchParams = useSearchParams();
  const initialTemplateHistoryProviderFilter = searchParams.get("provider")?.trim() || null;
  const initialTemplateHistorySourceFilter = searchParams.get("source")?.trim() || null;
  const [templateHistoryProviderFilter, setTemplateHistoryProviderFilter] = useState<
    string | null
  >(initialTemplateHistoryProviderFilter);
  const [templateHistorySourceFilter, setTemplateHistorySourceFilter] = useState<
    string | null
  >(initialTemplateHistorySourceFilter);
  const [isExportingExecutionPdf, setIsExportingExecutionPdf] = useState(false);
  const projectDataState = useProjectDataState();
  const activeReviewerSession = useActiveReviewerSession();
  const projectName = projectDataState?.project?.name?.trim() || "Project";
  const projectId = projectDataState?.project?.id ?? null;
  const projectKey =
    projectDataState?.project?.projectKey?.trim() || projectDataState?.project?.id || "";
  const safeProjectSlug = projectName.replace(/\s+/g, "-").toLowerCase();
  const exportReviewer = activeReviewerSession.reviewer ?? null;
  const reviewerPreferenceId =
    exportReviewer?.id || exportReviewer?.email || exportReviewer?.name || "";
  const reviewerNotificationPreferences = useMemo(() => {
    if (!projectId || !reviewerPreferenceId) {
      return null;
    }

    return loadReviewerNotificationPreferences(projectId, reviewerPreferenceId);
  }, [projectId, reviewerPreferenceId]);
  const projectAuditTrail = useMemo(
    () => projectDataState?.project?.auditTrail ?? [],
    [projectDataState?.project?.auditTrail]
  );
  const sourceGovernanceSectionRef = useRef<HTMLElement | null>(null);
  const executionSlices = summary.executionDistribution.map((slice) => ({
    ...slice,
    color: executionColor[slice.key as keyof typeof executionColor] ?? "#94a3b8",
  }));
  const priorityBars = summary.issuePriorityDistribution.map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.count,
    color: issuePriorityColor[slice.key as keyof typeof issuePriorityColor] ?? "#94a3b8",
  }));
  const statusBars = summary.issueStatusDistribution.map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.count,
    color: issueStatusColor[slice.key as keyof typeof issueStatusColor] ?? "#94a3b8",
  }));
  const linkedCoverageDonut = [
    {
      key: "linked",
      label: "Linked Cases",
      value: summary.linkedCases,
      color: "#22c55e",
    },
    {
      key: "unlinked",
      label: "Unlinked Cases",
      value: summary.unlinkedCases,
      color: "#94a3b8",
    },
  ];
  const issueClosureDonut = [
    {
      key: "done",
      label: "Done Issues",
      value: summary.doneIssues,
      color: "#22c55e",
    },
    {
      key: "open",
      label: "Open Issues",
      value: summary.openIssues,
      color: "#f59e0b",
    },
  ];
  const runTrendPoints = summary.runTrend.map((run) => ({
    key: run.id,
    label: run.name,
    value: run.completionPercent,
    secondaryValue: run.passPercent,
  }));
  const releaseTrendPoints = summary.releaseTrend.map((snapshot) => ({
    key: snapshot.id,
    label: snapshot.label,
    value: snapshot.score,
  }));
  const automationTrendPoints = summary.automationTrend.map((point) => ({
    key: point.id,
    label: point.label,
    value: point.value,
    secondaryValue: point.secondaryValue,
  }));
  const automationProviderBars = summary.automationProviderDistribution.map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.count,
    color:
      slice.label === "Playwright"
        ? "#0f766e"
        : slice.label === "Cypress"
        ? "#16a34a"
        : slice.label === "Postman"
        ? "#f97316"
        : slice.label === "Selenium"
        ? "#0284c7"
        : slice.label === "Jest/Vitest"
        ? "#7c3aed"
        : slice.label === "API Automation"
        ? "#0891b2"
        : slice.label === "UI Automation"
        ? "#ea580c"
        : "#94a3b8",
  }));
  const automationSnapshotTrendPoints = summary.automationSnapshotTrend.map((point) => ({
    key: point.id,
    label: point.label,
    value: point.value,
    secondaryValue: point.secondaryValue,
  }));
  const templateOperationTrendPoints = summary.templateOperations.trend.map((point) => ({
    key: point.id,
    label: point.label,
    value: point.value,
    secondaryValue: point.secondaryValue,
  }));
  const templateOperationProviderBars = summary.templateOperations.providerTrend.map(
    (entry) => ({
      key: entry.provider,
      label: entry.provider,
      value: entry.importedCount + entry.exportedCount,
      color: entry.importedCount >= entry.exportedCount ? "#0ea5e9" : "#22c55e",
    })
  );
  const templateOperationSourceBars = summary.templateOperations.sourceDashboards.map((entry) => ({
    key: entry.source,
    label: entry.source,
    value: entry.importedCount + entry.exportedCount,
    color:
      entry.prioritizedCount > entry.suppressedCount
        ? "#f59e0b"
        : entry.suppressedCount > 0
        ? "#f43f5e"
        : "#0ea5e9",
  }));
  const templateSourceRuleTrendPoints = summary.templateOperations.sourceRuleTrend.map(
    (point) => ({
      key: point.id,
      label: point.label,
      value: point.value,
      secondaryValue: point.secondaryValue,
    })
  );
  const prioritizedTemplateSourceBars = summary.templateOperations.prioritizedSources.map(
    (entry) => ({
      key: entry.source,
      label: entry.source,
      value: entry.count,
      color: "#f59e0b",
    })
  );
  const mutedTemplateSourceBars = summary.templateOperations.mutedSources.map((entry) => ({
    key: entry.source,
    label: entry.source,
    value: entry.count,
    color: "#f43f5e",
  }));
  const templateOperationHistoryProviderOptions = useMemo(
    () =>
      Array.from(
        new Set(
          summary.templateOperations.recentHistory.flatMap((entry) =>
            parseTemplateOperationAuditSegments(entry.detail, "Providers")
          )
        )
      ).sort((left, right) => left.localeCompare(right)),
    [summary.templateOperations.recentHistory]
  );
  const templateOperationHistorySourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          summary.templateOperations.recentHistory.flatMap((entry) =>
            parseTemplateOperationAuditSegments(entry.detail, "Sources")
          )
        )
      ).sort((left, right) => left.localeCompare(right)),
    [summary.templateOperations.recentHistory]
  );
  const filteredTemplateOperationHistory = useMemo(
    () =>
      summary.templateOperations.recentHistory.filter((entry) => {
        const providerMatch = templateHistoryProviderFilter
          ? parseTemplateOperationAuditSegments(entry.detail, "Providers").includes(
              templateHistoryProviderFilter
            )
          : true;
        const sourceMatch = templateHistorySourceFilter
          ? parseTemplateOperationAuditSegments(entry.detail, "Sources").includes(
              templateHistorySourceFilter
            )
          : true;
        return providerMatch && sourceMatch;
      }),
    [
      summary.templateOperations.recentHistory,
      templateHistoryProviderFilter,
      templateHistorySourceFilter,
    ]
  );
  const templateActionFilter = searchParams.get("templateAction") ?? "all";
  const reportFocus = searchParams.get("focus") ?? "";
  const actionFilteredTemplateOperationHistory = useMemo(
    () =>
      filteredTemplateOperationHistory.filter((entry) => {
        if (templateActionFilter === "imported") {
          return entry.action === "Case template pack imported";
        }
        if (templateActionFilter === "exported") {
          return entry.action === "Case template pack exported";
        }
        return true;
      }),
    [filteredTemplateOperationHistory, templateActionFilter]
  );
  const buildTemplateActionHref = (value: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      nextParams.delete("templateAction");
    } else {
      nextParams.set("templateAction", value);
    }
    const query = nextParams.toString();
    return query ? `?${query}` : "";
  };
  useEffect(() => {
    if (reportFocus !== "source-governance") {
      return;
    }

    sourceGovernanceSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [reportFocus]);
  const providerSnapshotChangeBars = summary.automationProviderSnapshotChanges.map((change) => ({
    key: change.provider,
    label: change.provider,
    value: change.latestCount,
    color:
      change.direction === "down"
        ? "#16a34a"
        : change.direction === "up"
        ? "#f43f5e"
        : "#94a3b8",
  }));
  const csvExport = useMemo(
    () =>
      buildReleaseReviewHistoryCsv(
        summary,
        projectName,
        exportReviewer,
        projectAuditTrail,
        reviewerNotificationPreferences,
        projectKey
      ),
    [
      exportReviewer,
      projectAuditTrail,
      projectKey,
      projectName,
      reviewerNotificationPreferences,
      summary,
    ]
  );
  const markdownExport = useMemo(
    () =>
      buildReleaseReviewHistoryMarkdown(
        summary,
        projectName,
        exportReviewer,
        projectAuditTrail,
        reviewerNotificationPreferences,
        projectKey
      ),
    [
      exportReviewer,
      projectAuditTrail,
      projectKey,
      projectName,
      reviewerNotificationPreferences,
      summary,
    ]
  );
  const latestReleaseDeltaLabel =
    summary.latestReleaseDelta === null
      ? "First recorded review"
      : summary.latestReleaseDelta > 0
      ? `+${summary.latestReleaseDelta} safer than previous review`
      : summary.latestReleaseDelta < 0
      ? `${summary.latestReleaseDelta} points vs previous review`
      : "No score change vs previous review";
  const derivedExecutionCompletionPercent =
    summary.totalCases === 0
      ? 0
      : Math.round(
          ((summary.totalCases - summary.notRunCases) / summary.totalCases) * 100
        );
  const templateOperationBars = [
    {
      key: "imports",
      label: "Imported Packs",
      value: summary.templateOperations.importedPacks,
      color: "#0ea5e9",
    },
    {
      key: "exports",
      label: "Exported Packs",
      value: summary.templateOperations.exportedPacks,
      color: "#22c55e",
    },
  ];

  const exportExecutionPdf = async () => {
    try {
      setIsExportingExecutionPdf(true);

      const html = buildExecutionReportHtml(summary, projectName, {
        appBaseUrl:
          typeof window !== "undefined" ? window.location.origin : undefined,
      });

      const response = await fetch("/api/reports/pdf" as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html,
          filename: `${safeProjectSlug}-execution-report.pdf`,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to export PDF report.");
      }

      const blob = await response.blob();
      downloadBlob(`${safeProjectSlug}-execution-report.pdf`, blob);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to export PDF report.";
      window.alert(message);
    } finally {
      setIsExportingExecutionPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 px-6 py-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Reports
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Deeper delivery and execution analytics
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Use this route when you want denser reporting than the Overview or Release pages:
              execution distribution, run-by-run trend, issue mix, linkage quality, and
              release-review momentum.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                Active Reviewer:{" "}
                {activeReviewerSession.reviewer?.name?.trim() ||
                  activeReviewerSession.reviewer?.email?.trim() ||
                  (activeReviewerSession.loading ? "Loading..." : "Not set")}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                Export actor:{" "}
                {exportReviewer?.name?.trim() ||
                  exportReviewer?.email?.trim() ||
                  "Pending reviewer selection"}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                Inbox defaults:{" "}
                {reviewerNotificationPreferences
                  ? `${reviewerNotificationPreferences.mentionAlerts ? "mentions on" : "mentions off"} | ${
                      reviewerNotificationPreferences.watchAlerts ? "watched on" : "watched off"
                    } | ${
                      reviewerNotificationPreferences.unreadOnlyDefault ? "unread default on" : "unread default off"
                    }`
                  : "Not available"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
          {[
            ["Cases", summary.totalCases],
            ["Issues", summary.totalIssues],
            ["Open Issues", summary.openIssues],
            ["Blockers", summary.blockerIssues],
            ["Linked Coverage", `${summary.linkedCoveragePercent}%`],
            ["Failures", summary.executionSummary.failed + summary.executionSummary.blocked],
          ].map(([label, value]) => (
            <article
              key={label}
              className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/90 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {value}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportExecutionPdf}
            className={exportButtonClassName}
            disabled={isExportingExecutionPdf}
          >
            {isExportingExecutionPdf ? "Preparing PDF..." : "Export Execution PDF"}
          </button>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                `${safeProjectSlug}-execution-report.html`,
                buildExecutionReportHtml(summary, projectName, {
                  appBaseUrl:
                    typeof window !== "undefined" ? window.location.origin : undefined,
                }),
                "text/html;charset=utf-8"
              )
            }
            className={exportButtonClassName}
          >
            Export Execution HTML
          </button>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
            Release signal: {summary.releaseSignal.level}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
            {summary.executionSummary.passed} passed | {summary.executionSummary.failed} failed | {summary.executionSummary.blocked} blocked
          </span>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Security high risk: {summary.domainInsights.highRiskSecurityCases}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
            Accessibility: {summary.domainInsights.accessibilityCases}
          </span>
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/72">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Reports Command Center
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Read the project like a reporting pack, not a chart dump.
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              The visual analytics stay visible, while the export and history layers are grouped more deliberately below.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Execution
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {derivedExecutionCompletionPercent}%
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                completion across project cases
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Open Risk
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {summary.openIssues}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {summary.blockerIssues} blockers included
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Linkage
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {summary.linkedCoveragePercent}%
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                linked case coverage
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Automation
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {summary.automationCoveragePercent}%
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {summary.automationReadyCases} strong candidates
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Security
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {summary.domainInsights.highRiskSecurityCases}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {summary.domainInsights.failedHighRiskSecurityCases} failed or blocked high-risk cases
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/72">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Domain Mix
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Keep security and accessibility review visible in the same reporting rhythm.
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              This shows how much of the project is leaning into defensive security review versus accessibility and WCAG-oriented validation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/projects/${encodeURIComponent(projectKey)}/cases?testDomain=security`}
              className={exportButtonClassName}
            >
              Open Security Cases
            </Link>
            <Link
              href={`/projects/${encodeURIComponent(projectKey)}/cases?testDomain=accessibility`}
              className={exportButtonClassName}
            >
              Open Accessibility Cases
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <article className="rounded-[22px] border border-red-200/80 bg-red-50/90 px-4 py-4 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">
              Security Cases
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {summary.domainInsights.securityCases}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              {summary.domainInsights.highRiskSecurityCases} tagged high risk
            </p>
          </article>
          <article className="rounded-[22px] border border-red-200/80 bg-white/90 px-4 py-4 dark:border-red-500/30 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">
              Security Pressure
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {summary.domainInsights.failedHighRiskSecurityCases}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              failed high-risk security cases
            </p>
          </article>
          <article className="rounded-[22px] border border-sky-200/80 bg-sky-50/90 px-4 py-4 dark:border-sky-500/30 dark:bg-sky-500/10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
              Accessibility Cases
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {summary.domainInsights.accessibilityCases}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              manual accessibility validation coverage
            </p>
          </article>
          <article className="rounded-[22px] border border-sky-200/80 bg-white/90 px-4 py-4 dark:border-sky-500/30 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
              WCAG Tagged
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {summary.domainInsights.wcagTaggedCases}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              cases carrying compliance review references
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Reporting Signals
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Visual evidence for delivery, quality, and release momentum
            </h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Core charts stay grouped together so the page reads like one reporting surface.
          </p>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <StackedExecutionChart
            title="Stacked Execution Chart"
            description="Project-wide execution mix across passed, failed, blocked, and not-run cases."
            slices={executionSlices}
          />
          <TrendChart
            title="Run Trend Chart"
            description="Completion and pass rate movement across named runs."
            points={runTrendPoints}
            primaryLabel="Completion"
            secondaryLabel="Pass Rate"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <TrendChart
            title="Release Score Trend"
            description="Score movement across recorded release reviews, so managers can see confidence improving or slipping."
            points={releaseTrendPoints}
            primaryLabel="Release Score"
            primaryColor="#0f766e"
            valueSuffix=""
          />
          <article className="rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Release Review Momentum
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              How readiness is moving between reviews
            </h3>
            <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              This gives managers a fast read on whether the team is closing risk before
              release or accumulating new concerns.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Latest Delta
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {summary.latestReleaseDelta === null
                    ? "n/a"
                    : summary.latestReleaseDelta > 0
                    ? `+${summary.latestReleaseDelta}`
                    : summary.latestReleaseDelta}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {latestReleaseDeltaLabel}
                </p>
              </div>
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Recorded By
                </p>
                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Pending auth wiring
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Snapshot authorship is now part of the data model and will populate
                  automatically when user identity is fully wired.
                </p>
              </div>
            </div>
          </article>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <article className="rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 xl:col-span-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  Failure Insights
                </p>
                <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  Understand failures fast and move directly to action
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  The summary stays lightweight: what failed, whether automation was involved, and where to jump next for issue creation or release review.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  Release signal: {summary.releaseSignal.level}
                </span>
                <button
                  type="button"
                  onClick={exportExecutionPdf}
                  className={exportButtonClassName}
                  disabled={isExportingExecutionPdf}
                >
                  {isExportingExecutionPdf ? "Preparing PDF..." : "Export Execution PDF"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {[
                ["Total Tests", summary.executionSummary.total],
                ["Passed", summary.executionSummary.passed],
                ["Failed", summary.executionSummary.failed],
                ["Blocked", summary.executionSummary.blocked],
              ].map(([label, value]) => (
                <article
                  key={label}
                  className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {value}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {summary.releaseSignal.summary}
            </div>

            <div className="mt-5 space-y-3">
              {summary.failureInsights.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No active failures are recorded right now.
                </div>
              ) : (
                summary.failureInsights.map((entry) => (
                  <article
                    key={entry.rowId}
                    className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                          {entry.rowId}
                        </p>
                        <h4 className="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                          {entry.title}
                        </h4>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                            {entry.executionResult}
                          </span>
                          {entry.failedSteps > 0 ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                              {entry.failedSteps} failed step{entry.failedSteps === 1 ? "" : "s"}
                            </span>
                          ) : null}
                          {entry.blockedSteps > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              {entry.blockedSteps} blocked step{entry.blockedSteps === 1 ? "" : "s"}
                            </span>
                          ) : null}
                          {entry.latestAutomationStatus ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                              Automation {entry.latestAutomationStatus}
                            </span>
                          ) : null}
                          {entry.linkedIssueKey ? (
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                              {entry.linkedIssueKey}
                            </span>
                          ) : null}
                        </div>
                        {entry.latestAutomationFailureMessage ? (
                          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                            {entry.latestAutomationFailureMessage}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/projects/${encodeURIComponent(projectKey)}/runs?${new URLSearchParams({
                            ...(entry.runId ? { runId: entry.runId } : {}),
                            rowId: entry.rowId,
                          }).toString()}`}
                          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          Open In Runs
                        </Link>
                        <Link
                          href={`/projects/${encodeURIComponent(projectKey)}/runs?${new URLSearchParams({
                            ...(entry.runId ? { runId: entry.runId } : {}),
                            rowId: entry.rowId,
                          }).toString()}`}
                          className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                        >
                          {entry.linkedIssueId ? "Review Linked Issue" : "Create Issue"}
                        </Link>
                        <Link
                          href={`/projects/${encodeURIComponent(projectKey)}/release`}
                          className="inline-flex items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                        >
                          Release Impact
                        </Link>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </article>

          <BarChart
            title="Bar Chart: Issue Priority Mix"
            description="Volume by issue priority across the project."
            data={priorityBars}
          />
          <BarChart
            title="Bar Chart: Issue Status Mix"
            description="Volume by issue workflow state."
            data={statusBars}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <DonutChart
            title="Donut Chart: Case Linkage"
            description="How much of the case library is linked back to tracked work."
            data={linkedCoverageDonut}
            centerLabel="Linked"
            centerValue={`${summary.linkedCoveragePercent}%`}
          />
          <DonutChart
            title="Donut Chart: Issue Closure"
            description="Closed vs open issue split for the project."
            data={issueClosureDonut}
            centerLabel="Open Issues"
            centerValue={String(summary.openIssues)}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <article className="rounded-[24px] border border-zinc-200/80 bg-white/85 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Automated Cases
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
              {summary.automatedCases}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Current automated share of the case library.
            </p>
          </article>
          <article className="rounded-[24px] border border-zinc-200/80 bg-white/85 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Candidate Cases
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
              {summary.candidateCases}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Cases already marked as automation candidates.
            </p>
          </article>
          <article className="rounded-[24px] border border-zinc-200/80 bg-white/85 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Strong Ready
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
              {summary.automationReadyCases}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              High-confidence next automation opportunities.
            </p>
          </article>
        </div>

        <div className="mt-6">
          <TrendChart
            title="Automation Trend"
            description="Automated coverage vs candidate-ready coverage across named runs."
            points={automationTrendPoints}
            primaryLabel="Automated"
            secondaryLabel="Candidate-ready"
            primaryColor="#0f766e"
          />
        </div>

        {automationProviderBars.length > 0 ? (
          <div className="mt-6">
            <BarChart
              title="Automation Integration Mix"
              description="Where current automated and candidate coverage is concentrated by tool or provider signal."
              data={automationProviderBars}
            />
          </div>
        ) : null}

        {(summary.templateOperations.importedPacks > 0 ||
          summary.templateOperations.exportedPacks > 0) ? (
          <div className="mt-6">
            <BarChart
              title="Template Operations"
              description="Import and export activity recorded through the reusable template workflow."
              data={templateOperationBars}
            />
          </div>
        ) : null}

        {templateOperationTrendPoints.length > 0 ? (
          <div className="mt-6">
            <TrendChart
              title="Template Operation Trend"
              description="Import and export activity over time based on the project audit trail."
              points={templateOperationTrendPoints}
              primaryLabel="Imports"
              secondaryLabel="Exports"
              primaryColor="#0ea5e9"
            />
          </div>
        ) : null}

        {templateOperationProviderBars.length > 0 ? (
          <div className="mt-6">
            <BarChart
              title="Template Provider Activity"
              description="Import and export activity grouped by template provider tags recorded in audit history."
              data={templateOperationProviderBars}
            />
          </div>
        ) : null}

        {prioritizedTemplateSourceBars.length > 0 ? (
          <div className="mt-6">
            <BarChart
              title="Prioritized Template Sources"
              description="Sources whose template alerts were severity-lifted by reviewer rules."
              data={prioritizedTemplateSourceBars}
            />
          </div>
        ) : null}

        {mutedTemplateSourceBars.length > 0 ? (
          <div className="mt-6">
            <BarChart
              title="Muted Template Sources"
              description="Sources whose template alerts were suppressed by allow/block rules."
              data={mutedTemplateSourceBars}
            />
          </div>
        ) : null}

        {automationSnapshotTrendPoints.length > 0 ? (
          <div className="mt-6">
            <TrendChart
              title="Automation Snapshot Trend"
              description="Automation coverage and strong-ready pressure captured at each recorded release review."
              points={automationSnapshotTrendPoints}
              primaryLabel="Automated Coverage"
              secondaryLabel="Strong-ready Pressure"
              primaryColor="#0f766e"
            />
          </div>
        ) : null}

        {summary.automationProviderSnapshotChanges.length > 0 ? (
          <div className="mt-6 rounded-[24px] border border-zinc-200/80 bg-white/85 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Provider Snapshot Changes
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Compare the latest recorded release review against the previous one to see which automation stack grew or shrank.
                </p>
              </div>
            </div>
            <div className="mt-5">
              <BarChart
                title="Provider Trend Chart"
                description="Latest provider pressure, colored by whether the latest release snapshot improved or worsened versus the previous one."
                data={providerSnapshotChangeBars}
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.automationProviderSnapshotChanges.map((change) => (
                <div
                  key={change.provider}
                  className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {change.provider}
                    </p>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                        change.direction === "down"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : change.direction === "up"
                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      }`}
                    >
                      {change.direction === "down"
                        ? `${Math.abs(change.delta)} fewer`
                        : change.direction === "up"
                        ? `+${change.delta} more`
                        : "No change"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>Latest: {change.latestCount}</span>
                    <span>Previous: {change.previousCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {summary.automationHotspotSnapshotChanges.length > 0 ? (
          <div className="mt-6 rounded-[24px] border border-zinc-200/80 bg-white/85 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Hotspot Snapshot Changes
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Compare the latest recorded release review against the previous one to see which automation hotspot areas improved or worsened.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {summary.automationHotspotSnapshotChanges.map((change) => (
                <div
                  key={change.area}
                  className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{change.area}</p>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                        change.direction === "down"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : change.direction === "up"
                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      }`}
                    >
                      {change.direction === "down"
                        ? `${Math.abs(change.delta)} fewer strong-ready`
                        : change.direction === "up"
                        ? `+${change.delta} strong-ready`
                        : "No change"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>Latest: {change.latestStrongReady}</span>
                    <span>Previous: {change.previousStrongReady}</span>
                  </div>
                  {projectDataState?.project ? (
                    <div className="mt-3">
                      <a
                        href={`/projects/${encodeURIComponent(
                          projectDataState.project.projectKey?.trim() || projectDataState.project.id
                        )}/cases?automation=candidate${
                          change.rowIds.length > 0
                            ? `&rowIds=${encodeURIComponent(change.rowIds.join(","))}&rowId=${encodeURIComponent(change.rowIds[0])}`
                            : `&search=${encodeURIComponent(change.area)}`
                        }`}
                        className={exportButtonClassName}
                      >
                        {change.rowIds.length > 1
                          ? `Open ${change.rowIds.length} hotspot cases`
                          : change.rowIds.length === 1
                          ? "Open hotspot case"
                          : "Open hotspot area"}
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-[24px] border border-zinc-200/80 bg-white/85 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Automation Hotspots
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Areas where automation opportunity or existing automation concentration is strongest.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {summary.automationHotspots.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No meaningful automation hotspots detected yet.
              </div>
            ) : (
              summary.automationHotspots.map((hotspot) => (
                <div
                  key={hotspot.area}
                  className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{hotspot.area}</p>
                    <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                      {hotspot.total} total cases
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>{hotspot.automated} automated</span>
                    <span>{hotspot.candidate} candidate</span>
                    <span>{hotspot.strongReady} strong ready</span>
                  </div>
                  {projectDataState?.project ? (
                    <div className="mt-3">
                      <a
                        href={`/projects/${encodeURIComponent(
                          projectDataState.project.projectKey?.trim() || projectDataState.project.id
                        )}/cases?automation=candidate${
                          hotspot.rowIds.length > 0
                            ? `&rowIds=${encodeURIComponent(hotspot.rowIds.join(","))}${
                                hotspot.leadRowId
                                  ? `&rowId=${encodeURIComponent(hotspot.leadRowId)}`
                                  : ""
                              }`
                            : hotspot.leadRowId
                            ? `&rowId=${encodeURIComponent(hotspot.leadRowId)}`
                            : `&search=${encodeURIComponent(hotspot.area)}`
                        }`}
                        className={exportButtonClassName}
                      >
                        {hotspot.rowIds.length > 1
                          ? `Open ${hotspot.rowIds.length} Candidate Cases`
                          : hotspot.leadRowId
                          ? "Open Lead Candidate"
                          : "Open Candidate Cases"}
                      </a>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Release Snapshot History
              </p>
              <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Recorded release decisions over time
              </h3>
              <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                Export this history when a manager needs a shareable release trail for
                audits, handoffs, or release review calls.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `${safeProjectSlug}-release-history.csv`,
                    csvExport,
                    "text/csv;charset=utf-8"
                  )
                }
                className={exportButtonClassName}
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `${safeProjectSlug}-release-history.md`,
                    markdownExport,
                    "text/markdown;charset=utf-8"
                  )
                }
                className={exportButtonClassName}
              >
                Export Audit Notes
              </button>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                History Export
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {summary.releaseSnapshots.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No release snapshots yet. Record a release decision from the Release page to
                start building history.
              </div>
            ) : (
              summary.releaseSnapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${releaseSnapshotTone[snapshot.recordedDecision]}`}
                      >
                        {snapshot.recordedDecision === "safe"
                          ? "Safe to Release"
                          : snapshot.recordedDecision === "caution"
                          ? "Release with Caution"
                          : "Not Ready"}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatUtcDateTime(snapshot.decisionRecordedAt)}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${releaseDeltaTone[snapshot.scoreDeltaDirection]}`}
                      >
                        {snapshot.scoreDeltaFromPrevious === null
                          ? "First review"
                          : snapshot.scoreDeltaFromPrevious > 0
                          ? `+${snapshot.scoreDeltaFromPrevious} vs previous`
                          : snapshot.scoreDeltaFromPrevious < 0
                          ? `${snapshot.scoreDeltaFromPrevious} vs previous`
                          : "No delta vs previous"}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        Score
                      </p>
                      <p className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {snapshot.score}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {snapshot.recommendation}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Recorded by{" "}
                    {snapshot.recordedBy?.name?.trim() ||
                      snapshot.recordedBy?.email?.trim() ||
                      "pending auth wiring"}
                    {snapshot.levelChangedFromPrevious && snapshot.previousRecordedDecision
                      ? ` | decision changed from ${snapshot.previousRecordedDecision}`
                      : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {typeof snapshot.automationCoveragePercent === "number" ? (
                      <span>Automation {snapshot.automationCoveragePercent}%</span>
                    ) : null}
                    {typeof snapshot.automatedCases === "number" ? (
                      <span>{snapshot.automatedCases} automated</span>
                    ) : null}
                    {typeof snapshot.candidateCases === "number" ? (
                      <span>{snapshot.candidateCases} candidate</span>
                    ) : null}
                    {typeof snapshot.automationReadyCases === "number" ? (
                      <span>{snapshot.automationReadyCases} strong-ready</span>
                    ) : null}
                    {snapshot.waivedAutomationProviders?.length ? (
                      <span>
                        Waived providers:{" "}
                        {snapshot.waivedAutomationProviders
                          .map((entry) => entry.provider)
                          .join(", ")}
                      </span>
                    ) : null}
                  </div>
                  {snapshot.waivedAutomationProviders?.length ? (
                    <div className="mt-2 space-y-1">
                      {snapshot.waivedAutomationProviders.map((entry) => (
                        <p
                          key={`${snapshot.id}-${entry.provider}`}
                          className="text-xs text-amber-700 dark:text-amber-300"
                        >
                          {entry.provider}: {entry.note?.trim() || "No waiver note captured."}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {snapshot.decisionNote?.trim()
                      ? snapshot.decisionNote
                      : "No decision note was captured for this snapshot."}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-[24px] border border-zinc-200/80 bg-white/96 p-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Recent Audit Context
            </p>
            <h3 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Latest project-side review events
            </h3>
            <span className="self-start rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              Audit Trail
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {projectAuditTrail.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No project audit entries have been recorded yet.
              </div>
            ) : (
              projectAuditTrail.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {entry.action}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatUtcDateTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {entry.detail}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Actor: {entry.actorName?.trim() || entry.actorEmail?.trim() || "No actor recorded"}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      {(templateOperationSourceBars.length > 0 || templateSourceRuleTrendPoints.length > 0) ? (
        <section
          ref={sourceGovernanceSectionRef}
          className="grid gap-4 xl:grid-cols-2 scroll-mt-24"
        >
          {templateOperationSourceBars.length > 0 ? (
            <div className="space-y-4">
              <BarChart
                title="Source Dashboards"
                description="Template packs by source pressure, combining import/export volume with rule-driven attention."
                data={templateOperationSourceBars}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {summary.templateOperations.sourceDashboards.slice(0, 5).map((entry) => (
                  <a
                    key={`template-source-dashboard-${entry.source}`}
                    href={`/projects/${encodeURIComponent(projectKey)}/notifications?type=template-operation&source=${encodeURIComponent(entry.source)}&unread=1`}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    {entry.source}: {entry.importedCount + entry.exportedCount} ops |{" "}
                    {entry.prioritizedCount} prioritized | {entry.suppressedCount} muted
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {templateSourceRuleTrendPoints.length > 0 ? (
            <TrendChart
              title="Source Rule Trend"
              description="Shows whether source rules are amplifying more template alerts or suppressing more of them over time."
              points={templateSourceRuleTrendPoints}
              primaryLabel="Prioritized"
              secondaryLabel="Suppressed"
              primaryColor="#f59e0b"
              secondaryColor="#f43f5e"
              valueSuffix=""
            />
          ) : null}
        </section>
      ) : null}

      <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Template Activity
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Recent import and export history
            </h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Pulled from the same project audit trail that powers the template workflow.
          </p>
        </div>
        {actionFilteredTemplateOperationHistory.length > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {actionFilteredTemplateOperationHistory.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[18px] border border-zinc-200/80 bg-white/85 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {entry.action}
                  </p>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatUtcDateTime(entry.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {entry.detail}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-300">
            {summary.templateOperations.recentHistory.length === 0
              ? "No template import or export activity has been recorded yet."
              : "No template activity matches the current action/provider/source filters."}
          </p>
        )}
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Template Activity Filters
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Import and export flow at a glance
            </h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Recent history cards below already reflect the underlying audit trail.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["all", "All Activity"],
            ["imported", "Imports Only"],
            ["exported", "Exports Only"],
          ].map(([value, label]) => (
            <a
              key={`template-action-${value}`}
              href={buildTemplateActionHref(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                templateActionFilter === value
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              {label}
            </a>
          ))}
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
            Imports: {summary.templateOperations.importedPacks}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            Exports: {summary.templateOperations.exportedPacks}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            Prioritized Alerts: {summary.templateOperations.prioritizedAlerts}
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            Suppressed Alerts: {summary.templateOperations.suppressedAlerts}
          </span>
          {summary.templateOperations.providerTrend.slice(0, 4).map((entry) => (
            <span
              key={`template-op-provider-${entry.provider}`}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              {entry.provider}: {entry.importedCount + entry.exportedCount}
            </span>
          ))}
        </div>
        {(templateOperationHistoryProviderOptions.length > 0 ||
          templateOperationHistorySourceOptions.length > 0) ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {templateOperationHistoryProviderOptions.map((provider) => (
              <button
                key={`report-template-provider-${provider}`}
                type="button"
                onClick={() =>
                  setTemplateHistoryProviderFilter((current) =>
                    current === provider ? null : provider
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  templateHistoryProviderFilter === provider
                    ? "border-sky-700 bg-sky-700 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-zinc-950"
                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                }`}
              >
                {provider}
              </button>
            ))}
            {templateOperationHistorySourceOptions.map((source) => (
              <button
                key={`report-template-source-${source}`}
                type="button"
                onClick={() =>
                  setTemplateHistorySourceFilter((current) =>
                    current === source ? null : source
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  templateHistorySourceFilter === source
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {source}
              </button>
            ))}
            {(templateHistoryProviderFilter || templateHistorySourceFilter) ? (
              <button
                type="button"
                onClick={() => {
                  setTemplateHistoryProviderFilter(null);
                  setTemplateHistorySourceFilter(null);
                }}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Clear Filters
              </button>
            ) : null}
          </div>
        ) : null}
        {(summary.templateOperations.prioritizedSources.length > 0 ||
          summary.templateOperations.mutedSources.length > 0) ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {summary.templateOperations.prioritizedSources.slice(0, 4).map((entry) => (
              <a
                key={`report-priority-source-${entry.source}`}
                href={`/projects/${encodeURIComponent(projectKey)}/notifications?type=template-operation&source=${encodeURIComponent(entry.source)}&unread=1`}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              >
                Priority: {entry.source} ({entry.count})
              </a>
            ))}
            {summary.templateOperations.mutedSources.slice(0, 4).map((entry) => (
              <a
                key={`report-muted-source-${entry.source}`}
                href={`/projects/${encodeURIComponent(projectKey)}/notifications?type=template-operation&source=${encodeURIComponent(entry.source)}&unread=1`}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              >
                Muted: {entry.source} ({entry.count})
              </a>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}



