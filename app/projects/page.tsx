import Link from "next/link";
import ActiveReviewerBanner from "../../components/ActiveReviewerBanner";
import AppSidebar from "../../components/AppSidebar";
import BarChart from "../../components/charts/BarChart";
import TrendChart from "../../components/charts/TrendChart";
import ResponsiveShell from "../../components/ResponsiveShell";
import {
  listProjectIssuesForUi,
} from "../../services/issue-service";
import { readProjects } from "../../utils/project-store";
import type { Project } from "../../utils/workspace";
import { formatUtcDate } from "../../utils/date-format";
import { buildAutomationCandidateInsights } from "../../utils/test-case-management";

const projectHref = (projectKey: string | undefined, projectId: string) =>
  `/projects/${encodeURIComponent(projectKey?.trim() || projectId)}`;

const releaseDecisionTone = {
  safe: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  caution:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
} as const;

type ReleaseDecisionKey = keyof typeof releaseDecisionTone;

const portfolioDistributionTone = {
  safe: "bg-emerald-500",
  caution: "bg-amber-500",
  blocked: "bg-rose-500",
  none: "bg-zinc-400",
} as const;

type ReleaseSnapshot = NonNullable<
  NonNullable<Project["releaseReview"]>["snapshots"]
>[number];

type AutomationProviderSnapshotEntry = NonNullable<
  ReleaseSnapshot["automationProviders"]
>[number];

type TemplateSourceCount = {
  source: string;
  count: number;
};

type ProjectNotificationSummary = {
  total: number;
  unread: number;
  mentions: number;
  watchAlerts: number;
  templateAlerts: number;
  templateImportAlerts: number;
  templateExportAlerts: number;
  highSeverityTemplateAlerts: number;
  templateSources: Map<string, number>;
  dominantTemplateSource: TemplateSourceCount | null;
};

type AutomationProviderPressure = {
  provider: string;
  count: number;
};

type ProjectWithSignals = Project & {
  blockerIssueCount: number;
  failedCaseCount: number;
  blockedCaseCount: number;
  automationProviderPressure: AutomationProviderPressure[];
  notificationSummary: ProjectNotificationSummary;
};

const projectNotifications = (project: Project) => project.notifications ?? [];
const projectAuditTrail = (project: Project) => project.auditTrail;
const projectSnapshots = (project: Project): ReleaseSnapshot[] =>
  project.releaseReview?.snapshots ?? [];

const toReleaseDecisionKey = (
  value: NonNullable<Project["releaseReview"]>["recordedDecision"]
): ReleaseDecisionKey | null =>
  value === "safe" || value === "caution" || value === "blocked" ? value : null;

type ProjectsPageProps = {
  searchParams?: Promise<{
    release?: string;
    sort?: string;
    signal?: string;
    provider?: string;
    source?: string;
    templateAction?: string;
  }>;
};

const libraryFilterClassName = (active: boolean) =>
  `inline-flex items-center rounded-xl border px-4 py-2 text-sm font-semibold transition ${
    active
      ? "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/10"
      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
  }`;

const escapeCsv = (value: string | number | null | undefined) => {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
};

const escapeMarkdown = (value: string | number | null | undefined) =>
  String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  let projects: Project[] = [];
  let projectLoadError = false;

  try {
    projects = await readProjects();
  } catch (error) {
    projectLoadError = true;
    console.error("Failed to load project library projects:", error);
  }
  const rawProjectsWithSignals: ProjectWithSignals[] = await Promise.all(
    projects.map(async (project): Promise<ProjectWithSignals> => {
      const rows = project.rows;
      const notifications = projectNotifications(project);
      let blockerIssueCount = 0;

      try {
        const issues = await listProjectIssuesForUi(
          project.projectKey?.trim() || project.id
        );
        blockerIssueCount = issues.filter((issue) => issue.status === "blocked").length;
      } catch (error) {
        console.error("PROJECT LIBRARY ISSUE SIGNAL ERROR:", error);
      }

      const failedCaseCount = rows.filter(
        (row) => row.executionResult === "failed"
      ).length;
      const blockedCaseCount = rows.filter(
        (row) => row.executionResult === "blocked"
      ).length;
      const automationProviderPressure = Array.from(
        buildAutomationCandidateInsights(rows).reduce((accumulator, entry) => {
          if (entry.automationStatus === "automated" || !entry.isStrongCandidate) {
            return accumulator;
          }

          const provider = entry.provider || "Unspecified";
          accumulator.set(provider, (accumulator.get(provider) ?? 0) + 1);
          return accumulator;
        }, new Map<string, number>())
      )
        .map(([provider, count]) => ({ provider, count }))
        .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider));

      return {
        ...project,
        blockerIssueCount,
        failedCaseCount,
        blockedCaseCount,
        automationProviderPressure,
        notificationSummary: notifications.reduce<ProjectNotificationSummary>(
          (summary, notification) => {
            if (notification.archivedAt) {
              return summary;
            }

            summary.total += 1;

            if (!notification.readAt) {
              summary.unread += 1;
            }

            if (notification.type === "case-mention") {
              summary.mentions += 1;
            }

            if (notification.type === "case-watch") {
              summary.watchAlerts += 1;
            }

            if (notification.type === "template-operation") {
              summary.templateAlerts += 1;
              if (notification.operation === "import") {
                summary.templateImportAlerts += 1;
              }
              if (notification.operation === "export") {
                summary.templateExportAlerts += 1;
              }
              if (notification.severity === "high") {
                summary.highSeverityTemplateAlerts += 1;
              }
              if (!notification.readAt && notification.sourceLabel?.trim()) {
                const sourceLabel = notification.sourceLabel.trim();
                summary.templateSources.set(
                  sourceLabel,
                  (summary.templateSources.get(sourceLabel) ?? 0) + 1
                );
              }
            }

            return summary;
          },
          {
            total: 0,
            unread: 0,
            mentions: 0,
            watchAlerts: 0,
            templateAlerts: 0,
            templateImportAlerts: 0,
            templateExportAlerts: 0,
            highSeverityTemplateAlerts: 0,
            templateSources: new Map<string, number>(),
            dominantTemplateSource: null,
          }
        ),
      };
    })
  );
  const projectsWithSignals: ProjectWithSignals[] = rawProjectsWithSignals.map((project) => ({
    ...project,
    notificationSummary: {
      ...project.notificationSummary,
      dominantTemplateSource:
        Array.from(project.notificationSummary.templateSources.entries())
          .map(([source, count]) => ({ source, count }))
          .sort(
            (left, right) =>
              right.count - left.count || left.source.localeCompare(right.source)
          )[0] ?? null,
    },
  }));

  const releaseFilter =
    resolvedSearchParams?.release === "safe" ||
    resolvedSearchParams?.release === "caution" ||
    resolvedSearchParams?.release === "blocked" ||
    resolvedSearchParams?.release === "none"
      ? resolvedSearchParams.release
      : "all";
  const signalFilter =
    resolvedSearchParams?.signal === "failed" ||
    resolvedSearchParams?.signal === "blockers" ||
    resolvedSearchParams?.signal === "attention" ||
    resolvedSearchParams?.signal === "source-prioritized" ||
    resolvedSearchParams?.signal === "source-muted" ||
    resolvedSearchParams?.signal === "source-governance"
      ? resolvedSearchParams.signal
      : "all";
  const sortMode =
    resolvedSearchParams?.sort === "risk"
      ? "risk"
      : resolvedSearchParams?.sort === "automation"
      ? "automation"
      : resolvedSearchParams?.sort === "name"
      ? "name"
      : "updated";
  const providerFilter = resolvedSearchParams?.provider?.trim() || "all";
  const sourceFilter = resolvedSearchParams?.source?.trim() || "all";
  const templateActionFilter =
    resolvedSearchParams?.templateAction === "imported" ||
    resolvedSearchParams?.templateAction === "exported"
      ? resolvedSearchParams.templateAction
      : "all";

  const releaseCounts = {
    all: projectsWithSignals.length,
    safe: projectsWithSignals.filter(
      (project) => project.releaseReview?.recordedDecision === "safe"
    ).length,
    caution: projectsWithSignals.filter(
      (project) => project.releaseReview?.recordedDecision === "caution"
    ).length,
    blocked: projectsWithSignals.filter(
      (project) => project.releaseReview?.recordedDecision === "blocked"
    ).length,
    none: projectsWithSignals.filter((project) => !project.releaseReview?.recordedDecision)
      .length,
  };
  const portfolioCounts = {
    totalCases: projectsWithSignals.reduce(
      (accumulator, project) => accumulator + (project.testCaseCount ?? project.rows.length),
      0
    ),
    withDecision: projectsWithSignals.filter(
      (project) => project.releaseReview?.recordedDecision
    ).length,
    withNotes: projectsWithSignals.filter((project) =>
      project.releaseReview?.decisionNote?.trim()
    ).length,
    withFailedCases: projectsWithSignals.filter((project) => project.failedCaseCount > 0).length,
    withBlockers: projectsWithSignals.filter((project) => project.blockerIssueCount > 0).length,
    withSourceGovernance: projectsWithSignals.filter(
      (project) =>
        projectNotifications(project).some(
          (notification) =>
            !notification.archivedAt &&
            notification.type === "template-operation" &&
            notification.severityLifted
        ) ||
        projectAuditTrail(project).some((entry) => entry.action === "Template alert suppressed")
    ).length,
    withPrioritizedSources: projectsWithSignals.filter((project) =>
      projectNotifications(project).some(
        (notification) =>
          !notification.archivedAt &&
          notification.type === "template-operation" &&
          notification.severityLifted
      )
    ).length,
    withMutedSources: projectsWithSignals.filter((project) =>
      projectAuditTrail(project).some((entry) => entry.action === "Template alert suppressed")
    ).length,
    importedTemplatePacks: projectsWithSignals.reduce(
      (accumulator, project) =>
        accumulator +
        projectAuditTrail(project).filter(
          (entry) => entry.action === "Case template pack imported"
        ).length,
      0
    ),
    exportedTemplatePacks: projectsWithSignals.reduce(
      (accumulator, project) =>
        accumulator +
        projectAuditTrail(project).filter(
          (entry) => entry.action === "Case template pack exported"
        ).length,
      0
    ),
  };
  const portfolioAutomationProviderPressure = Array.from(
    projectsWithSignals.reduce((accumulator, project) => {
      project.automationProviderPressure.forEach((entry) => {
        accumulator.set(entry.provider, (accumulator.get(entry.provider) ?? 0) + entry.count);
      });
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider))
    .slice(0, 4);
  const projectsWithProviderSnapshots = projectsWithSignals.filter((project) =>
    projectSnapshots(project).some(
      (snapshot) => Array.isArray(snapshot.automationProviders) && snapshot.automationProviders.length > 0
    )
  );
  const portfolioProviderTrend = Array.from(
    projectsWithProviderSnapshots.reduce((accumulator, project) => {
      const snapshots = projectSnapshots(project);
      const latestProviderSnapshot = [...snapshots]
        .sort((left, right) => right.decisionRecordedAt - left.decisionRecordedAt)
        .find(
          (snapshot) =>
            Array.isArray(snapshot.automationProviders) && snapshot.automationProviders.length > 0
        );
      const previousProviderSnapshot = [...snapshots]
        .sort((left, right) => right.decisionRecordedAt - left.decisionRecordedAt)
        .find(
          (snapshot) =>
            snapshot.id !== latestProviderSnapshot?.id &&
            Array.isArray(snapshot.automationProviders) &&
            snapshot.automationProviders.length > 0
        );

      const latestProviders: AutomationProviderSnapshotEntry[] =
        latestProviderSnapshot?.automationProviders ?? [];
      const previousProviders: AutomationProviderSnapshotEntry[] =
        previousProviderSnapshot?.automationProviders ?? [];

      latestProviders.forEach((entry) => {
        const previousCount =
          previousProviders.find(
            (previousEntry) => previousEntry.provider === entry.provider
          )?.count ?? 0;
        const current = accumulator.get(entry.provider) ?? { latest: 0, previous: 0 };
        current.latest += entry.count;
        current.previous += previousCount;
        accumulator.set(entry.provider, current);
      });

      return accumulator;
    }, new Map<string, { latest: number; previous: number }>())
  )
    .map(([provider, counts]) => ({
      provider,
      latest: counts.latest,
      previous: counts.previous,
      delta: counts.latest - counts.previous,
    }))
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || right.latest - left.latest)
    .slice(0, 4);
  const providerTrendBars = portfolioProviderTrend.map((entry) => ({
    key: entry.provider,
    label: entry.provider,
    value: entry.latest,
    color:
      entry.delta < 0 ? "#16a34a" : entry.delta > 0 ? "#f43f5e" : "#94a3b8",
  }));
  const portfolioDistribution = [
    { key: "safe" as const, label: "Safe", count: releaseCounts.safe },
    { key: "caution" as const, label: "Caution", count: releaseCounts.caution },
    { key: "blocked" as const, label: "Blocked", count: releaseCounts.blocked },
    { key: "none" as const, label: "No Decision", count: releaseCounts.none },
  ].map((entry) => ({
    ...entry,
    percent:
      projectsWithSignals.length === 0
        ? 0
        : Math.round((entry.count / projectsWithSignals.length) * 100),
  }));
  const recentTemplateOperationEntries = projectsWithSignals
    .flatMap((project) =>
      projectAuditTrail(project)
        .filter(
          (entry) =>
            entry.action === "Case template pack imported" ||
            entry.action === "Case template pack exported"
        )
        .map((entry) => ({
          ...entry,
          projectName: project.name,
          projectHref: projectHref(project.projectKey, project.id),
        }))
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .filter((entry) =>
      templateActionFilter === "imported"
        ? entry.action === "Case template pack imported"
        : templateActionFilter === "exported"
        ? entry.action === "Case template pack exported"
        : true
    )
    .slice(0, 6);
  const dominantTemplateSourceCards = Array.from(
    projectsWithSignals.reduce((accumulator, project) => {
      const dominantSource = project.notificationSummary.dominantTemplateSource;
      if (!dominantSource) {
        return accumulator;
      }

      const current = accumulator.get(dominantSource.source) ?? {
        source: dominantSource.source,
        count: 0,
        projectHref: `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
          dominantSource.source
        )}&unread=1`,
        strongestProjectCount: 0,
      };
      current.count += dominantSource.count;
      if (dominantSource.count > current.strongestProjectCount) {
        current.strongestProjectCount = dominantSource.count;
        current.projectHref = `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
          dominantSource.source
        )}&unread=1`;
      }
      accumulator.set(dominantSource.source, current);
      return accumulator;
    }, new Map<string, { source: string; count: number; projectHref: string; strongestProjectCount: number }>())
  )
    .map(([, value]) => value)
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 4);
  const prioritizedTemplateSourceCards = Array.from(
    projectsWithSignals.reduce((accumulator, project) => {
      projectNotifications(project).forEach((notification) => {
        if (
          notification.archivedAt ||
          notification.type !== "template-operation" ||
          !notification.severityLifted ||
          !notification.sourceLabel?.trim()
        ) {
          return;
        }
        const sourceLabel = notification.sourceLabel.trim();
        const current = accumulator.get(sourceLabel) ?? {
          source: sourceLabel,
          count: 0,
          projectHref: `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            sourceLabel
          )}&unread=1`,
          strongestProjectCount: 0,
        };
        current.count += 1;
        if (current.strongestProjectCount < 1) {
          current.strongestProjectCount = 1;
          current.projectHref = `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            sourceLabel
          )}&unread=1`;
        }
        accumulator.set(sourceLabel, current);
      });
      return accumulator;
    }, new Map<string, { source: string; count: number; projectHref: string; strongestProjectCount: number }>())
  )
    .map(([, value]) => value)
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 4);
  const mutedTemplateSourceCards = Array.from(
    projectsWithSignals.reduce((accumulator, project) => {
      projectAuditTrail(project).forEach((entry) => {
        if (entry.action !== "Template alert suppressed") {
          return;
        }
        const sourceMatch = entry.detail.match(/from (.+?) was suppressed/i);
        const sourceLabel = sourceMatch?.[1]?.trim();
        if (!sourceLabel) {
          return;
        }
        const current = accumulator.get(sourceLabel) ?? {
          source: sourceLabel,
          count: 0,
          projectHref: `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            sourceLabel
          )}`,
          strongestProjectCount: 0,
        };
        current.count += 1;
        if (current.strongestProjectCount < 1) {
          current.strongestProjectCount = 1;
          current.projectHref = `${projectHref(project.projectKey, project.id)}/notifications?type=template-operation&source=${encodeURIComponent(
            sourceLabel
          )}`;
        }
        accumulator.set(sourceLabel, current);
      });
      return accumulator;
    }, new Map<string, { source: string; count: number; projectHref: string; strongestProjectCount: number }>())
  )
    .map(([, value]) => value)
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 4);
  const portfolioTemplateSourceDashboards = Array.from(
    projectsWithSignals.reduce((accumulator, project) => {
      projectAuditTrail(project).forEach((entry) => {
        const sourceSegments = entry.detail.includes("Sources:")
          ? entry.detail
              .match(/Sources:\s([^.]*)/)?.[1]
              ?.split(",")
              .map((segment) => segment.trim())
              .filter(Boolean)
              .map((segment) => {
                const [label, rawCount] = segment.split(":").map((part) => part.trim());
                return { label, count: Number(rawCount ?? 0) || 0 };
              }) ?? []
          : [];

        sourceSegments.forEach(({ label, count }) => {
          if (!label) {
            return;
          }
          const current = accumulator.get(label) ?? {
            source: label,
            importedCount: 0,
            exportedCount: 0,
            prioritizedCount: 0,
            suppressedCount: 0,
            projectHref: `${projectHref(project.projectKey, project.id)}/reports?templateAction=all&source=${encodeURIComponent(
              label
            )}`,
            strongestProjectCount: 0,
          };
          if (entry.action === "Case template pack imported") {
            current.importedCount += count;
          }
          if (entry.action === "Case template pack exported") {
            current.exportedCount += count;
          }
          const totalCount = current.importedCount + current.exportedCount;
          if (totalCount > current.strongestProjectCount) {
            current.strongestProjectCount = totalCount;
            current.projectHref = `${projectHref(project.projectKey, project.id)}/reports?templateAction=all&source=${encodeURIComponent(
              label
            )}`;
          }
          accumulator.set(label, current);
        });
      });

      projectNotifications(project).forEach((notification) => {
        if (
          notification.archivedAt ||
          notification.type !== "template-operation" ||
          !notification.sourceLabel?.trim()
        ) {
          return;
        }
        const sourceLabel = notification.sourceLabel.trim();
        const current = accumulator.get(sourceLabel) ?? {
          source: sourceLabel,
          importedCount: 0,
          exportedCount: 0,
          prioritizedCount: 0,
          suppressedCount: 0,
          projectHref: `${projectHref(project.projectKey, project.id)}/reports?templateAction=all&source=${encodeURIComponent(
            sourceLabel
          )}`,
          strongestProjectCount: 0,
        };
        if (notification.severityLifted) {
          current.prioritizedCount += 1;
        }
        accumulator.set(sourceLabel, current);
      });

      projectAuditTrail(project).forEach((entry) => {
        if (entry.action !== "Template alert suppressed") {
          return;
        }
        const sourceMatch = entry.detail.match(/from (.+?) was suppressed/i);
        const sourceLabel = sourceMatch?.[1]?.trim();
        if (!sourceLabel) {
          return;
        }
        const current = accumulator.get(sourceLabel) ?? {
          source: sourceLabel,
          importedCount: 0,
          exportedCount: 0,
          prioritizedCount: 0,
          suppressedCount: 0,
          projectHref: `${projectHref(project.projectKey, project.id)}/reports?templateAction=all&source=${encodeURIComponent(
            sourceLabel
          )}`,
          strongestProjectCount: 0,
        };
        current.suppressedCount += 1;
        accumulator.set(sourceLabel, current);
      });

      return accumulator;
    }, new Map<
      string,
      {
        source: string;
        importedCount: number;
        exportedCount: number;
        prioritizedCount: number;
        suppressedCount: number;
        projectHref: string;
        strongestProjectCount: number;
      }
    >())
  )
    .map(([, value]) => value)
    .sort(
      (left, right) =>
        right.importedCount +
          right.exportedCount +
          right.prioritizedCount +
          right.suppressedCount -
          (left.importedCount +
            left.exportedCount +
            left.prioritizedCount +
            left.suppressedCount) ||
        left.source.localeCompare(right.source)
    )
    .slice(0, 6);
  const portfolioSourceRuleTrendPoints = Array.from(
    projectsWithSignals.reduce((accumulator, project) => {
      projectNotifications(project).forEach((notification) => {
        if (
          notification.archivedAt ||
          notification.type !== "template-operation" ||
          !notification.severityLifted
        ) {
          return;
        }
        const bucket = formatUtcDate(notification.createdAt);
        const current = accumulator.get(bucket) ?? { prioritized: 0, suppressed: 0 };
        current.prioritized += 1;
        accumulator.set(bucket, current);
      });
      projectAuditTrail(project).forEach((entry) => {
        if (entry.action !== "Template alert suppressed") {
          return;
        }
        const bucket = formatUtcDate(entry.createdAt);
        const current = accumulator.get(bucket) ?? { prioritized: 0, suppressed: 0 };
        current.suppressed += 1;
        accumulator.set(bucket, current);
      });
      return accumulator;
    }, new Map<string, { prioritized: number; suppressed: number }>())
  )
    .map(([label, counts], index) => ({
      key: `portfolio-source-rule-${index}-${label}`,
      label,
      value: counts.prioritized,
      secondaryValue: counts.suppressed,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(-8);
  const portfolioSourceGovernanceCsv = [
    ["source", "imports", "exports", "prioritized", "muted", "deep_link"],
    ...portfolioTemplateSourceDashboards.map((entry) => [
      entry.source,
      entry.importedCount,
      entry.exportedCount,
      entry.prioritizedCount,
      entry.suppressedCount,
      entry.projectHref,
    ]),
  ]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
  const portfolioSourceGovernanceExportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    portfolioSourceGovernanceCsv
  )}`;
  const portfolioSourceGovernanceMarkdown = [
    "# Portfolio Source Governance",
    "",
    "| Source | Imports | Exports | Prioritized | Muted | Deep Link |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...portfolioTemplateSourceDashboards.map(
      (entry) =>
        `| ${escapeMarkdown(entry.source)} | ${entry.importedCount} | ${entry.exportedCount} | ${entry.prioritizedCount} | ${entry.suppressedCount} | ${escapeMarkdown(
          entry.projectHref
        )} |`
    ),
  ].join("\n");
  const portfolioSourceGovernanceMarkdownHref = `data:text/markdown;charset=utf-8,${encodeURIComponent(
    portfolioSourceGovernanceMarkdown
  )}`;
  const portfolioSourceGovernanceHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Portfolio Source Governance</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; padding: 32px; line-height: 1.5; }
      h1, h2 { margin-bottom: 8px; }
      p { color: #4b5563; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 13px; }
      th { background: #f9fafb; }
      .muted { color: #6b7280; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Portfolio Source Governance</h1>
    <p>Current source-level template governance across the visible project set.</p>
    <p class="muted">Includes import/export volume plus prioritized and muted source pressure.</p>
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th>Imports</th>
          <th>Exports</th>
          <th>Prioritized</th>
          <th>Muted</th>
          <th>Deep Link</th>
        </tr>
      </thead>
      <tbody>
        ${
          portfolioTemplateSourceDashboards.length === 0
            ? "<tr><td colspan=\"6\">No source governance activity recorded yet.</td></tr>"
            : portfolioTemplateSourceDashboards
                .map(
                  (entry) =>
                    `<tr><td>${escapeMarkdown(entry.source)}</td><td>${entry.importedCount}</td><td>${entry.exportedCount}</td><td>${entry.prioritizedCount}</td><td>${entry.suppressedCount}</td><td>${escapeMarkdown(
                      entry.projectHref
                    )}</td></tr>`
                )
                .join("")
        }
      </tbody>
    </table>
  </body>
</html>`;
  const portfolioSourceGovernanceHtmlHref = `data:text/html;charset=utf-8,${encodeURIComponent(
    portfolioSourceGovernanceHtml
  )}`;

  const releaseFilteredProjects = projectsWithSignals.filter((project) => {
    if (releaseFilter === "all") {
      return true;
    }

    if (releaseFilter === "none") {
      return !project.releaseReview?.recordedDecision;
    }

    return project.releaseReview?.recordedDecision === releaseFilter;
  });

  const filteredProjects = releaseFilteredProjects.filter((project) => {
    if (signalFilter === "all") {
      return true;
    }

    if (signalFilter === "failed") {
      return project.failedCaseCount > 0;
    }

    if (signalFilter === "blockers") {
      return project.blockerIssueCount > 0;
    }

    if (signalFilter === "source-governance") {
      const hasPrioritizedTemplateSources = projectNotifications(project).some(
        (notification) =>
          !notification.archivedAt &&
          notification.type === "template-operation" &&
          notification.severityLifted
      );
      const hasMutedTemplateSources = projectAuditTrail(project).some(
        (entry) => entry.action === "Template alert suppressed"
      );
      return hasPrioritizedTemplateSources || hasMutedTemplateSources;
    }

    if (signalFilter === "source-prioritized") {
      return projectNotifications(project).some(
        (notification) =>
          !notification.archivedAt &&
          notification.type === "template-operation" &&
          notification.severityLifted
      );
    }

    if (signalFilter === "source-muted") {
      return projectAuditTrail(project).some(
        (entry) => entry.action === "Template alert suppressed"
      );
    }

    return project.failedCaseCount > 0 || project.blockerIssueCount > 0;
  });
  const providerFilteredProjects = filteredProjects.filter((project) => {
    if (providerFilter === "all") {
      return true;
    }

    return project.automationProviderPressure.some(
      (entry) => entry.provider === providerFilter
    );
  });
  const sourceFilteredProjects = providerFilteredProjects.filter((project) => {
    if (sourceFilter === "all") {
      return true;
    }

    const hasUnreadSource = project.notificationSummary.templateSources.has(sourceFilter);
    const hasSuppressedSource = projectAuditTrail(project).some(
      (entry) =>
        entry.action === "Template alert suppressed" &&
        entry.detail.includes(`from ${sourceFilter} was suppressed`)
    );
    const hasTemplateSourceActivity = projectAuditTrail(project).some(
      (entry) =>
        (entry.action === "Case template pack imported" ||
          entry.action === "Case template pack exported") &&
        entry.detail.includes(`Sources: ${sourceFilter}:`)
    );

    return hasUnreadSource || hasSuppressedSource || hasTemplateSourceActivity;
  });

  const decisionRank = {
    blocked: 0,
    caution: 1,
    none: 2,
    safe: 3,
  } as const;

  const sortedProjects = [...sourceFilteredProjects].sort((left, right) => {
    if (sortMode === "name") {
      return left.name.localeCompare(right.name);
    }

    if (sortMode === "risk") {
      const leftDecision = toReleaseDecisionKey(left.releaseReview?.recordedDecision) ?? "none";
      const rightDecision = toReleaseDecisionKey(right.releaseReview?.recordedDecision) ?? "none";
      const decisionDelta = decisionRank[leftDecision] - decisionRank[rightDecision];

      if (decisionDelta !== 0) {
        return decisionDelta;
      }
    }

    if (sortMode === "automation") {
      const leftPressure =
        left.automationProviderPressure.reduce(
          (sum, entry) =>
            sum +
            (providerFilter === "all" || entry.provider === providerFilter ? entry.count : 0),
          0
        );
      const rightPressure =
        right.automationProviderPressure.reduce(
          (sum, entry) =>
            sum +
            (providerFilter === "all" || entry.provider === providerFilter ? entry.count : 0),
          0
        );
      if (rightPressure !== leftPressure) {
        return rightPressure - leftPressure;
      }
    }

    return right.updatedAt - left.updatedAt;
  });

  const buildLibraryHref = (
    nextRelease: string,
    nextSort: string,
    nextSignal: string,
    nextProvider: string,
    nextTemplateAction: string = templateActionFilter,
    nextSource: string = sourceFilter
  ) => {
    const params = new URLSearchParams();

    if (nextRelease !== "all") {
      params.set("release", nextRelease);
    }

    if (nextSort !== "updated") {
      params.set("sort", nextSort);
    }

    if (nextSignal !== "all") {
      params.set("signal", nextSignal);
    }

    if (nextProvider !== "all") {
      params.set("provider", nextProvider);
    }
    if (nextSource !== "all") {
      params.set("source", nextSource);
    }
    if (nextTemplateAction !== "all") {
      params.set("templateAction", nextTemplateAction);
    }

    const query = params.toString();
    return query ? `/projects?${query}` : "/projects";
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
      <ResponsiveShell
        mobileTitle="Project Library"
        mobileSubtitle="Browse and open workspaces"
        desktopSidebar={<AppSidebar projectCount={projects.length} />}
        mobileSidebar={<AppSidebar projectCount={projects.length} />}
        storageKey="caseforge:drawer:project-library"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <ActiveReviewerBanner compact projects={projects} />
        {projectLoadError ? (
          <section className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
              Library Fallback
            </p>
            <h2 className="mt-1 text-lg font-semibold text-amber-950 dark:text-amber-50">
              We could not load the saved project portfolio right now.
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">
              You can still start a new requirement-first workspace from the dashboard. Portfolio cards and project comparisons will return once the project store connection is available again.
            </p>
          </section>
        ) : null}
        <section className="rounded-[34px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.34)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Project Library
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Open a project and keep moving
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                Open a saved project when you already know what you want to continue. If you are
                starting from a fresh requirement, the faster path is still a new workspace first.
              </p>
              <p className="mt-2 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
                Primary action: open a project. Filters are optional and help only when the library gets crowded.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Back to Dashboard
              </Link>
              <Link
                href="/projects/new"
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
              >
                New Project Workspace
              </Link>
            </div>
          </div>
        </section>

        {projectsWithSignals.length === 0 ? (
          <section className="rounded-[30px] border border-dashed border-zinc-200 bg-white/90 px-8 py-10 text-sm text-zinc-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400">
            No saved projects yet. Start with a new workspace, generate a useful draft, and save it once the project is worth keeping.
          </section>
        ) : (
          <>
            <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 px-5 py-5 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Release Filters
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Narrow the library by the latest recorded release decision.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildLibraryHref("all", sortMode, signalFilter, providerFilter)}
                    className={libraryFilterClassName(releaseFilter === "all")}
                  >
                    All ({releaseCounts.all})
                  </Link>
                  <Link
                    href={buildLibraryHref("safe", sortMode, signalFilter, providerFilter)}
                    className={libraryFilterClassName(releaseFilter === "safe")}
                  >
                    Safe ({releaseCounts.safe})
                  </Link>
                  <Link
                    href={buildLibraryHref("caution", sortMode, signalFilter, providerFilter)}
                    className={libraryFilterClassName(releaseFilter === "caution")}
                  >
                    Caution ({releaseCounts.caution})
                  </Link>
                  <Link
                    href={buildLibraryHref("blocked", sortMode, signalFilter, providerFilter)}
                    className={libraryFilterClassName(releaseFilter === "blocked")}
                  >
                    Blocked ({releaseCounts.blocked})
                  </Link>
                  <Link
                    href={buildLibraryHref("none", sortMode, signalFilter, providerFilter)}
                    className={libraryFilterClassName(releaseFilter === "none")}
                  >
                    No Decision ({releaseCounts.none})
                  </Link>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 px-5 py-5 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Focus Filters
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Focus the library on projects with execution failures or blocked issue load.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildLibraryHref(releaseFilter, sortMode, "all", providerFilter)}
                    className={libraryFilterClassName(signalFilter === "all")}
                  >
                    All Signals
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, sortMode, "failed", providerFilter)}
                    className={libraryFilterClassName(signalFilter === "failed")}
                  >
                    Has Failed Cases ({portfolioCounts.withFailedCases})
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, sortMode, "blockers", providerFilter)}
                    className={libraryFilterClassName(signalFilter === "blockers")}
                  >
                    Has Blockers ({portfolioCounts.withBlockers})
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, sortMode, "attention", providerFilter)}
                    className={libraryFilterClassName(signalFilter === "attention")}
                  >
                    Needs Attention
                  </Link>
                  <Link
                    href={buildLibraryHref(
                      releaseFilter,
                      sortMode,
                      "source-governance",
                      providerFilter
                    )}
                    className={libraryFilterClassName(signalFilter === "source-governance")}
                  >
                    Source Governance ({portfolioCounts.withSourceGovernance})
                  </Link>
                  <Link
                    href={buildLibraryHref(
                      releaseFilter,
                      sortMode,
                      "source-prioritized",
                      providerFilter
                    )}
                    className={libraryFilterClassName(signalFilter === "source-prioritized")}
                  >
                    Prioritized Only ({portfolioCounts.withPrioritizedSources})
                  </Link>
                  <Link
                    href={buildLibraryHref(
                      releaseFilter,
                      sortMode,
                      "source-muted",
                      providerFilter
                    )}
                    className={libraryFilterClassName(signalFilter === "source-muted")}
                  >
                    Muted Only ({portfolioCounts.withMutedSources})
                  </Link>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 px-5 py-5 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Sort Order
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Choose whether to scan the most recent work first or triage the riskiest releases first.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildLibraryHref(releaseFilter, "updated", signalFilter, providerFilter)}
                    className={libraryFilterClassName(sortMode === "updated")}
                  >
                    Recently Updated
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, "risk", signalFilter, providerFilter)}
                    className={libraryFilterClassName(sortMode === "risk")}
                  >
                    Highest Risk First
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, "automation", signalFilter, providerFilter)}
                    className={libraryFilterClassName(sortMode === "automation")}
                  >
                    Automation Pressure
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, "name", signalFilter, providerFilter)}
                    className={libraryFilterClassName(sortMode === "name")}
                  >
                    Name
                  </Link>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[20px] border border-zinc-200/80 bg-white/96 p-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.2)] dark:border-zinc-800 dark:bg-zinc-900/94">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Portfolio Projects
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {projectsWithSignals.length}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Total saved projects in the library.
                </p>
              </article>
              <article className="rounded-[20px] border border-zinc-200/80 bg-white/96 p-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.2)] dark:border-zinc-800 dark:bg-zinc-900/94">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Decisions Recorded
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {portfolioCounts.withDecision}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Projects with a latest release call already captured.
                </p>
              </article>
              <article className="rounded-[20px] border border-zinc-200/80 bg-white/96 p-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.2)] dark:border-zinc-800 dark:bg-zinc-900/94">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Release Notes
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {portfolioCounts.withNotes}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Projects with manager context saved beside the decision.
                </p>
              </article>
              <article className="rounded-[20px] border border-zinc-200/80 bg-white/96 p-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.2)] dark:border-zinc-800 dark:bg-zinc-900/94">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Total Cases
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {portfolioCounts.totalCases}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Combined case volume across the library.
                </p>
              </article>
              <article className="rounded-[20px] border border-zinc-200/80 bg-white/96 p-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.2)] dark:border-zinc-800 dark:bg-zinc-900/94">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Template Alerts
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {projectsWithSignals.reduce(
                    (count, project) => count + project.notificationSummary.templateAlerts,
                    0
                  )}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Active template-operation alerts across reviewer-scoped projects.
                </p>
              </article>
              <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  High Template Alerts
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {projectsWithSignals.reduce(
                    (count, project) => count + project.notificationSummary.highSeverityTemplateAlerts,
                    0
                  )}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  High-severity template alerts that likely need quicker reviewer follow-up.
                </p>
              </article>
            </section>

            {(prioritizedTemplateSourceCards.length > 0 || mutedTemplateSourceCards.length > 0) ? (
              <section className="grid gap-4 md:grid-cols-2">
                {prioritizedTemplateSourceCards.length > 0 ? (
                  <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Prioritized Template Sources
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {prioritizedTemplateSourceCards.map((entry) => (
                        <Link
                          key={`prioritized-template-source-${entry.source}`}
                          href={buildLibraryHref(
                            releaseFilter,
                            sortMode,
                            signalFilter,
                            providerFilter,
                            templateActionFilter,
                            entry.source
                          )}
                          className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                        >
                          {entry.source}: {entry.count}
                        </Link>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                      Sources whose template alerts were severity-lifted by reviewer rules.
                    </p>
                  </article>
                ) : null}
                {mutedTemplateSourceCards.length > 0 ? (
                  <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Muted Template Sources
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {mutedTemplateSourceCards.map((entry) => (
                        <Link
                          key={`muted-template-source-${entry.source}`}
                          href={buildLibraryHref(
                            releaseFilter,
                            sortMode,
                            signalFilter,
                            providerFilter,
                            templateActionFilter,
                            entry.source
                          )}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                        >
                          {entry.source}: {entry.count}
                        </Link>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                      Sources whose template alerts were suppressed by reviewer source rules.
                    </p>
                  </article>
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {dominantTemplateSourceCards.map((entry) => (
                  <Link
                    key={`template-source-${entry.source}`}
                    href={buildLibraryHref(
                      releaseFilter,
                      sortMode,
                      signalFilter,
                      providerFilter,
                      templateActionFilter,
                      entry.source
                    )}
                    className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_65px_-34px_rgba(15,23,42,0.36)] dark:border-zinc-800 dark:bg-zinc-900/88"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Dominant Template Source
                    </p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {entry.source}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {entry.count} unread template alert{entry.count === 1 ? "" : "s"} across visible projects.
                    </p>
                  </Link>
                ))}
            </section>

            {(portfolioTemplateSourceDashboards.length > 0 || portfolioSourceRuleTrendPoints.length > 0) ? (
              <section className="grid gap-4 xl:grid-cols-2">
                {portfolioTemplateSourceDashboards.length > 0 ? (
                  <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                          Portfolio Source Dashboards
                        </p>
                      </div>
                      <a
                        href={portfolioSourceGovernanceExportHref}
                        download="portfolio-source-governance.csv"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Export CSV
                      </a>
                      <a
                        href={portfolioSourceGovernanceMarkdownHref}
                        download="portfolio-source-governance.md"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Export Markdown
                      </a>
                      <a
                        href={portfolioSourceGovernanceHtmlHref}
                        download="portfolio-source-governance.html"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Export HTML
                      </a>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {portfolioTemplateSourceDashboards.slice(0, 5).map((entry) => (
                        <Link
                          key={`portfolio-template-source-dashboard-${entry.source}`}
                          href={buildLibraryHref(
                            releaseFilter,
                            sortMode,
                            signalFilter,
                            providerFilter,
                            templateActionFilter,
                            entry.source
                          )}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          {entry.source}: {entry.importedCount + entry.exportedCount} ops |{" "}
                          {entry.prioritizedCount} prioritized | {entry.suppressedCount} muted
                        </Link>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                      These source-level cards open the strongest matching project report already focused on that source.
                    </p>
                  </article>
                ) : null}
                {portfolioSourceRuleTrendPoints.length > 0 ? (
                  <TrendChart
                    title="Portfolio Source Rule Trend"
                    description="Shows whether source-based reviewer rules are prioritizing more template alerts or suppressing more of them across the visible project set."
                    points={portfolioSourceRuleTrendPoints}
                    primaryLabel="Prioritized"
                    secondaryLabel="Suppressed"
                    primaryColor="#f59e0b"
                    secondaryColor="#f43f5e"
                    valueSuffix=""
                  />
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Template Imports
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {portfolioCounts.importedTemplatePacks}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Pack imports recorded across the portfolio.
                </p>
              </article>
              <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Template Exports
                </p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {portfolioCounts.exportedTemplatePacks}
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Pack exports recorded across the portfolio.
                </p>
              </article>
              <article className="rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Recent Template Activity
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={buildLibraryHref(releaseFilter, sortMode, signalFilter, providerFilter, "all")}
                    className={libraryFilterClassName(templateActionFilter === "all")}
                  >
                    All Activity
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, sortMode, signalFilter, providerFilter, "imported")}
                    className={libraryFilterClassName(templateActionFilter === "imported")}
                  >
                    Imports Only
                  </Link>
                  <Link
                    href={buildLibraryHref(releaseFilter, sortMode, signalFilter, providerFilter, "exported")}
                    className={libraryFilterClassName(templateActionFilter === "exported")}
                  >
                    Exports Only
                  </Link>
                </div>
                {recentTemplateOperationEntries.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {recentTemplateOperationEntries.slice(0, 3).map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Link
                            href={`${entry.projectHref}/workspace?focus=template-library`}
                            className="text-sm font-semibold text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                          >
                            {entry.projectName}
                          </Link>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {formatUtcDate(entry.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          {entry.action}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {entry.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                    No template import or export activity has been recorded yet.
                  </p>
                )}
              </article>
            </section>

            <section className="rounded-[28px] border border-white/80 bg-white/92 px-5 py-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Portfolio Release Distribution
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    A compact visual split of safe, caution, blocked, and undecided projects.
                  </p>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Filtered view keeps using the full portfolio as the comparison base.
                </p>
              </div>

              <div className="mt-5 h-4 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                {portfolioDistribution.map((entry) =>
                  entry.percent > 0 ? (
                    <div
                      key={entry.key}
                      className={`h-full ${portfolioDistributionTone[entry.key]}`}
                      style={{ width: `${entry.percent}%`, float: "left" }}
                    />
                  ) : null
                )}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {portfolioDistribution.map((entry) => (
                  <div
                    key={entry.key}
                    className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${portfolioDistributionTone[entry.key]}`}
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
                      {entry.count} project{entry.count === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {portfolioAutomationProviderPressure.length > 0 ? (
              <section className="rounded-[28px] border border-white/80 bg-white/92 px-5 py-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      Automation Stack Pressure
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      Compare which automation providers hold the strongest manual-but-ready case pressure across the portfolio.
                    </p>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Strong-ready manual candidates aggregated across visible projects.
                  </p>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {portfolioAutomationProviderPressure.map((entry) => (
                    <Link
                      key={entry.provider}
                      href={buildLibraryHref(releaseFilter, sortMode, signalFilter, entry.provider)}
                      className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
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
                {providerFilter !== "all" ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Active Provider Filter: {providerFilter}
                    </p>
                    <Link
                      href={buildLibraryHref(releaseFilter, sortMode, signalFilter, "all")}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Clear Provider Filter
                    </Link>
                  </div>
                ) : null}
                {sourceFilter !== "all" ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Active Source Filter: {sourceFilter}
                    </p>
                    <Link
                      href={buildLibraryHref(
                        releaseFilter,
                        sortMode,
                        signalFilter,
                        providerFilter,
                        templateActionFilter,
                        "all"
                      )}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Clear Source Filter
                    </Link>
                  </div>
                ) : null}
              </section>
            ) : null}

            {portfolioProviderTrend.length > 0 ? (
              <section className="rounded-[28px] border border-white/80 bg-white/92 px-5 py-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] dark:border-zinc-800 dark:bg-zinc-900/88">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      Provider Trend Rollup
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      Compare the latest provider pressure against the previous recorded release checkpoints across projects.
                    </p>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Based on projects that already have provider-aware release snapshots.
                  </p>
                </div>
                <div className="mt-5">
                  <BarChart
                    title="Provider Trend Chart"
                    description="Latest portfolio provider pressure, colored by whether each stack improved or worsened versus the previous release snapshot."
                    data={providerTrendBars}
                  />
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {portfolioProviderTrend.map((entry) => (
                    <div
                      key={entry.provider}
                      className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {entry.provider}
                        </p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            entry.delta < 0
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : entry.delta > 0
                              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                              : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                          }`}
                        >
                          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                        </span>
                      </div>
                      <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {entry.latest}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        previous {entry.previous} strong-ready manual candidates
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {sortedProjects.length === 0 ? (
              <section className="rounded-[30px] border border-dashed border-zinc-200 bg-white/90 px-8 py-10 text-sm text-zinc-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400">
                No projects match the current filters. Clear one or more filters to widen the library view.
              </section>
            ) : (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sortedProjects.map((project) => {
                  const releaseDecision = toReleaseDecisionKey(
                    project.releaseReview?.recordedDecision
                  );
                  const releaseDecisionNote = project.releaseReview?.decisionNote?.trim() ?? "";
                  const releaseDecisionLabel =
                    releaseDecision === "safe"
                      ? "Safe to Release"
                      : releaseDecision === "caution"
                      ? "Release with Caution"
                      : releaseDecision === "blocked"
                      ? "Not Ready"
                      : null;
                  const cardNotifications = projectNotifications(project);
                  const cardAuditTrail = projectAuditTrail(project);
                  const hasPrioritizedSources = cardNotifications.some(
                    (notification) =>
                      !notification.archivedAt &&
                      notification.type === "template-operation" &&
                      notification.severityLifted
                  );
                  const hasMutedSources = cardAuditTrail.some(
                    (entry) => entry.action === "Template alert suppressed"
                  );

                    const projectRouteHref = projectHref(project.projectKey, project.id);
                    const notificationsHref = `${projectRouteHref}/notifications`;

                    return (
                    <article
                      key={project.id}
                      className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_22px_55px_-36px_rgba(15,23,42,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_65px_-34px_rgba(15,23,42,0.36)] dark:border-zinc-800 dark:bg-zinc-900/88"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link
                            href={projectRouteHref}
                            className="text-lg font-semibold text-zinc-950 transition hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
                          >
                            {project.name}
                          </Link>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {(project.projectKey || "NO-KEY").trim()} | {(project.sprintName || "No sprint").trim()}
                          </p>
                        </div>
                        <Link
                          href={projectRouteHref}
                          className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                        >
                          Open Project
                        </Link>
                      </div>

                      {releaseDecision && releaseDecisionLabel ? (
                        <div
                          className={`mt-4 inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            releaseDecisionTone[releaseDecision]
                          }`}
                        >
                          <span>{releaseDecisionLabel}</span>
                          {project.releaseReview?.decisionRecordedAt ? (
                            <span className="normal-case tracking-normal opacity-80">
                              {formatUtcDate(project.releaseReview.decisionRecordedAt)}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          No Release Decision Yet
                        </div>
                      )}

                      <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                        <p>Release: {(project.releaseName || "No release").trim()}</p>
                        <p>Team: {(project.teamName || "No team").trim()}</p>
                        <p>Cases: {project.testCaseCount ?? project.rows.length}</p>
                        <p>Failed Cases: {project.failedCaseCount}</p>
                        <p>Blocked Issues: {project.blockerIssueCount}</p>
                        <p>Updated: {formatUtcDate(project.updatedAt)}</p>
                      </div>

                        <div className="mt-4 rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-300">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Release Note Preview
                          </p>
                          <p className="mt-2 leading-6">
                          {releaseDecisionNote
                            ? releaseDecisionNote.length > 140
                              ? `${releaseDecisionNote.slice(0, 140).trimEnd()}...`
                              : releaseDecisionNote
                              : "No release note has been recorded for this project yet."}
                          </p>
                        </div>

                        <div className="mt-4 rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-300">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Automation Stack Pressure
                          </p>
                          {project.automationProviderPressure.length > 0 ? (
                            <>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {project.automationProviderPressure.slice(0, 3).map((entry) => (
                                  <Link
                                    key={`${project.id}-${entry.provider}`}
                                    href={`${projectRouteHref}/cases?automation=candidate&automationProvider=${encodeURIComponent(entry.provider)}`}
                                    className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                                  >
                                    {entry.provider}: {entry.count}
                                  </Link>
                                ))}
                              </div>
                              <p className="mt-2 leading-6">
                                Strong automation-ready manual coverage is concentrated in{" "}
                                {project.automationProviderPressure
                                  .slice(0, 2)
                                  .map((entry) => `${entry.provider} (${entry.count})`)
                                  .join(", ")}
                                .
                              </p>
                            </>
                          ) : (
                            <p className="mt-2 leading-6">
                              No meaningful provider-specific automation pressure is detected for this project yet.
                            </p>
                          )}
                        </div>

                        <div className="mt-4 rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-300">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Reviewer Alert Signals
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link
                              href={`${notificationsHref}?unread=1`}
                              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                            >
                              {project.notificationSummary.unread} unread
                            </Link>
                            <Link
                              href={`${notificationsHref}?type=case-mention`}
                              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                            >
                              {project.notificationSummary.mentions} mentions
                            </Link>
                            <Link
                              href={`${notificationsHref}?type=case-watch`}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                            >
                              {project.notificationSummary.watchAlerts} watched
                            </Link>
                            <Link
                              href={`${notificationsHref}?type=template-operation`}
                              className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                            >
                              {project.notificationSummary.templateAlerts} template
                            </Link>
                            {project.notificationSummary.templateImportAlerts > 0 ? (
                              <Link
                                href={`${notificationsHref}?type=template-operation&unread=1`}
                                className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                              >
                                {project.notificationSummary.templateImportAlerts} imports
                              </Link>
                            ) : null}
                            {project.notificationSummary.templateExportAlerts > 0 ? (
                              <Link
                                href={`${notificationsHref}?type=template-operation&unread=1`}
                                className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-700 transition hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/20"
                              >
                                {project.notificationSummary.templateExportAlerts} exports
                              </Link>
                            ) : null}
                            {project.notificationSummary.highSeverityTemplateAlerts > 0 ? (
                              <Link
                                href={`${notificationsHref}?type=template-operation&severity=high&unread=1`}
                                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                              >
                                {project.notificationSummary.highSeverityTemplateAlerts} high severity
                              </Link>
                            ) : null}
                          </div>
                          <p className="mt-2 leading-6">
                            {project.notificationSummary.total > 0
                              ? `${project.notificationSummary.total} active reviewer alert${
                                  project.notificationSummary.total === 1 ? "" : "s"
                                } are stored on this project.`
                              : "No active reviewer alerts are stored on this project right now."}
                          </p>
                          {project.notificationSummary.dominantTemplateSource ? (
                            <p className="mt-2 text-xs text-violet-600 dark:text-violet-300">
                              Dominant source:{" "}
                              <span className="font-semibold">
                                {project.notificationSummary.dominantTemplateSource.source}
                              </span>
                              {" | "}
                              {project.notificationSummary.dominantTemplateSource.count} unread
                              template alert
                              {project.notificationSummary.dominantTemplateSource.count === 1 ? "" : "s"}
                            </p>
                          ) : null}
                          {hasPrioritizedSources || hasMutedSources ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {hasPrioritizedSources ? (
                                <Link
                                  href={`${projectRouteHref}/reports?templateAction=all&focus=source-governance`}
                                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                                >
                                  Prioritized Sources Active
                                </Link>
                              ) : null}
                              {hasMutedSources ? (
                                <Link
                                  href={`${projectRouteHref}/reports?templateAction=all&focus=source-governance`}
                                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                >
                                  Muted Sources Active
                                </Link>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-4 flex gap-2 text-xs font-semibold">
                          <Link
                            href={`${projectRouteHref}/workspace`}
                            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                          >
                            Workspace
                          </Link>
                          <Link
                            href={`${projectRouteHref}/board`}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                          >
                            Board
                          </Link>
                          <Link
                            href={`${projectRouteHref}/release`}
                            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Release
                          </Link>
                        </div>
                      </article>
                    );
                })}
              </section>
            )}
          </>
        )}
        </div>
      </ResponsiveShell>
    </main>
  );
}







