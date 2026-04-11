import type { IssueRecord } from "../services/issue-service";
import type {
  Project,
  ReleaseReviewState,
  TestCaseExecutionResult,
  TestRunRecord,
} from "./workspace";
import { formatUtcDate } from "./date-format";
import {
  buildAutomationCandidateInsights,
  buildAutomationProviderSummary,
} from "./test-case-management";

export type DistributionSlice = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type RunTrendPoint = {
  id: string;
  name: string;
  status: TestRunRecord["status"];
  createdAt: number;
  updatedAt: number;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  completionPercent: number;
  passPercent: number;
};

export type ReleaseSnapshotHistoryEntry = NonNullable<
  ReleaseReviewState["snapshots"]
>[number] & {
  scoreDeltaFromPrevious: number | null;
  scoreDeltaDirection: "up" | "down" | "flat" | "none";
  previousRecordedDecision?: "safe" | "caution" | "blocked";
  levelChangedFromPrevious: boolean;
};

export type ReleaseTrendPoint = {
  id: string;
  label: string;
  score: number;
  recordedDecision: "safe" | "caution" | "blocked";
  decisionRecordedAt: number;
};

export type ProjectReportsSummary = {
  totalCases: number;
  totalIssues: number;
  linkedCases: number;
  unlinkedCases: number;
  linkedCoveragePercent: number;
  automationCoveragePercent: number;
  automatedCases: number;
  candidateCases: number;
  automationReadyCases: number;
  automationHotspots: Array<{
    area: string;
    automated: number;
    candidate: number;
    strongReady: number;
    total: number;
    leadRowId?: string;
    rowIds: string[];
  }>;
  automationTrend: Array<{
    id: string;
    label: string;
    value: number;
    secondaryValue: number;
  }>;
  automationProviderDistribution: DistributionSlice[];
  automationSnapshotTrend: Array<{
    id: string;
    label: string;
    value: number;
    secondaryValue: number;
  }>;
  automationProviderSnapshotChanges: Array<{
    provider: string;
    latestCount: number;
    previousCount: number;
    delta: number;
    direction: "up" | "down" | "flat";
  }>;
  automationHotspotSnapshotChanges: Array<{
    area: string;
    latestStrongReady: number;
    previousStrongReady: number;
    delta: number;
    direction: "up" | "down" | "flat";
    rowIds: string[];
  }>;
  openIssues: number;
  doneIssues: number;
  blockerIssues: number;
  failedCases: number;
  blockedCases: number;
  notRunCases: number;
  executionSummary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    notRun: number;
  };
  failureInsights: Array<{
    rowId: string;
    title: string;
    executionResult: TestCaseExecutionResult;
    failedSteps: number;
    blockedSteps: number;
    latestAutomationStatus?: "not-run" | "passed" | "failed" | "blocked";
    latestAutomationFailureMessage?: string;
    linkedIssueId?: string;
    linkedIssueKey?: string;
    runId?: string;
    runName?: string;
  }>;
  releaseSignal: {
    level: "low" | "medium" | "high";
    summary: string;
  };
  executionDistribution: DistributionSlice[];
  issuePriorityDistribution: DistributionSlice[];
  issueStatusDistribution: DistributionSlice[];
  runTrend: RunTrendPoint[];
  releaseTrend: ReleaseTrendPoint[];
  releaseSnapshots: ReleaseSnapshotHistoryEntry[];
  latestReleaseDelta: number | null;
  templateOperations: {
    importedPacks: number;
    exportedPacks: number;
    suppressedAlerts: number;
    prioritizedAlerts: number;
    trend: Array<{
      id: string;
      label: string;
      value: number;
      secondaryValue: number;
    }>;
    recentHistory: Array<{
      id: string;
      action: string;
      detail: string;
        createdAt: number;
      }>;
    providerTrend: Array<{
      provider: string;
      importedCount: number;
      exportedCount: number;
    }>;
    sourceDashboards: Array<{
      source: string;
      importedCount: number;
      exportedCount: number;
      prioritizedCount: number;
      suppressedCount: number;
    }>;
    sourceRuleTrend: Array<{
      id: string;
      label: string;
      value: number;
      secondaryValue: number;
    }>;
    prioritizedSources: Array<{
      source: string;
      count: number;
    }>;
    mutedSources: Array<{
      source: string;
      count: number;
    }>;
  };
};

const csvEscape = (value: string | number | undefined | null) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

export const buildExecutionReportCsv = (
  summary: ProjectReportsSummary,
  projectName: string
) => {
  const lines = [
    ["Project", projectName],
    ["Total Tests", summary.executionSummary.total],
    ["Passed", summary.executionSummary.passed],
    ["Failed", summary.executionSummary.failed],
    ["Blocked", summary.executionSummary.blocked],
    ["Not Run", summary.executionSummary.notRun],
    ["Release Signal", summary.releaseSignal.level],
    ["Release Summary", summary.releaseSignal.summary],
    [],
    [
      "Case ID",
      "Title",
      "Execution",
      "Failed Steps",
      "Blocked Steps",
      "Automation Status",
      "Automation Failure",
      "Issue Key",
      "Run",
    ],
    ...summary.failureInsights.map((entry) => [
      entry.rowId,
      entry.title,
      entry.executionResult,
      entry.failedSteps,
      entry.blockedSteps,
      entry.latestAutomationStatus ?? "",
      entry.latestAutomationFailureMessage ?? "",
      entry.linkedIssueKey ?? "",
      entry.runName ?? "",
    ]),
  ];

  return lines
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\n");
};

const toPercent = (value: number, total: number) =>
  total <= 0 ? 0 : Math.round((value / total) * 100);

const parseTemplateOperationAuditSegments = (detail: string, segmentLabel: string) => {
  const match = detail.match(new RegExp(`${segmentLabel}:\\s([^.]*)`));
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, value] = entry.split(":").map((part) => part.trim());
      return {
        label,
        count: Number(value ?? 0) || 0,
      };
    })
    .filter((entry) => entry.label);
};

const buildExecutionDistribution = (
  counts: Record<TestCaseExecutionResult, number>,
  total: number
): DistributionSlice[] =>
  [
    { key: "passed", label: "Passed", count: counts.passed },
    { key: "failed", label: "Failed", count: counts.failed },
    { key: "blocked", label: "Blocked", count: counts.blocked },
    { key: "not-run", label: "Not Run", count: counts["not-run"] },
  ].map((entry) => ({
    ...entry,
    percent: toPercent(entry.count, total),
  }));

export const buildProjectReportsSummary = (
  project: Project | null,
  issues: IssueRecord[]
): ProjectReportsSummary => {
  const totalCases = project?.testCaseCount ?? project?.rows.length ?? 0;
  const rows = project?.rows ?? [];
  const executionCounts = rows.reduce<Record<TestCaseExecutionResult, number>>(
    (accumulator, row) => {
      const key = row.executionResult ?? "not-run";
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    },
    {
      passed: 0,
      failed: 0,
      blocked: 0,
      "not-run": 0,
    }
  );
  const linkedCases = rows.filter((row) => row.issueId || row.issueKey).length;
  const unlinkedCases = Math.max(totalCases - linkedCases, 0);
  const automationInsights = buildAutomationCandidateInsights(rows);
  const automatedCases = rows.filter(
    (row) => (row.automationStatus ?? "manual") === "automated"
  ).length;
  const candidateCases = rows.filter(
    (row) => (row.automationStatus ?? "manual") === "candidate"
  ).length;
  const automationReadyCases = automationInsights.filter(
    (entry) =>
      entry.automationStatus !== "automated" &&
      entry.isStrongCandidate
  ).length;
  const automationProviderDistribution = buildAutomationProviderSummary(rows).map((entry) => ({
    key: entry.provider,
    label: entry.provider,
    count: entry.count,
    percent: toPercent(entry.count, automatedCases + candidateCases),
  }));
  const automationHotspots = Array.from(
    rows.reduce(
      (accumulator, row) => {
        const insight = automationInsights.find((entry) => entry.rowId === row.id);
        const area =
          row.componentArea?.trim() ||
          row.suiteName?.trim() ||
          row.labels?.[0]?.trim() ||
          "Uncategorized";
        const current =
          accumulator.get(area) ?? {
            area,
            automated: 0,
            candidate: 0,
            strongReady: 0,
            total: 0,
            leadRowId: undefined as string | undefined,
            rowIds: [] as string[],
          };

        current.total += 1;
        if ((row.automationStatus ?? "manual") === "automated") {
          current.automated += 1;
        }
        if ((row.automationStatus ?? "manual") === "candidate") {
          current.candidate += 1;
        }
        if (insight && insight.automationStatus !== "automated" && insight.isStrongCandidate) {
          current.strongReady += 1;
          if (current.rowIds.length < 8) {
            current.rowIds.push(row.id);
          }
          if (!current.leadRowId) {
            current.leadRowId = row.id;
          }
        }
        if (!current.leadRowId && (row.automationStatus ?? "manual") === "candidate") {
          current.leadRowId = row.id;
        }
        if (
          current.rowIds.length < 8 &&
          !current.rowIds.includes(row.id) &&
          (row.automationStatus ?? "manual") === "candidate"
        ) {
          current.rowIds.push(row.id);
        }

        accumulator.set(area, current);
        return accumulator;
      },
      new Map<
        string,
        {
          area: string;
          automated: number;
          candidate: number;
          strongReady: number;
          total: number;
          leadRowId?: string;
          rowIds: string[];
        }
      >()
    )
  )
    .map(([, value]) => value)
    .filter((entry) => entry.automated > 0 || entry.candidate > 0 || entry.strongReady > 0)
    .sort((left, right) => right.strongReady - left.strongReady || right.candidate - left.candidate)
    .slice(0, 5);
  const openIssues = issues.filter((issue) => issue.status !== "done").length;
  const doneIssues = issues.filter((issue) => issue.status === "done").length;
  const blockerIssues = issues.filter((issue) => issue.status === "blocked").length;
  const priorityCounts = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.priority] = (accumulator[issue.priority] ?? 0) + 1;
    return accumulator;
  }, {});
  const statusCounts = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.status] = (accumulator[issue.status] ?? 0) + 1;
    return accumulator;
  }, {});

  const issuePriorityDistribution = (["highest", "high", "medium", "low"] as const).map(
    (priority) => ({
      key: priority,
      label:
        priority === "highest"
          ? "Highest"
          : priority === "high"
          ? "High"
          : priority === "medium"
          ? "Medium"
          : "Low",
      count: priorityCounts[priority] ?? 0,
      percent: toPercent(priorityCounts[priority] ?? 0, issues.length),
    })
  );

  const issueStatusDistribution = (
    ["backlog", "todo", "in-progress", "blocked", "in-review", "done"] as const
  ).map((status) => ({
    key: status,
    label:
      status === "todo"
        ? "To Do"
        : status === "in-progress"
        ? "In Progress"
        : status === "in-review"
        ? "In Review"
        : status.charAt(0).toUpperCase() + status.slice(1),
    count: statusCounts[status] ?? 0,
    percent: toPercent(statusCounts[status] ?? 0, issues.length),
  }));
  const templateOperationEntries = [...(project?.auditTrail ?? [])]
    .filter(
      (entry) =>
        entry.action === "Case template pack imported" ||
        entry.action === "Case template pack exported"
    )
    .sort((left, right) => right.createdAt - left.createdAt);
  const importedPacks = templateOperationEntries.filter(
    (entry) => entry.action === "Case template pack imported"
  ).length;
  const exportedPacks = templateOperationEntries.filter(
    (entry) => entry.action === "Case template pack exported"
  ).length;
  const templateOperationTrend = Array.from(
    templateOperationEntries.reduce((accumulator, entry) => {
      const bucket = formatUtcDate(entry.createdAt);
      const current = accumulator.get(bucket) ?? { imports: 0, exports: 0 };
      if (entry.action === "Case template pack imported") {
        current.imports += 1;
      }
      if (entry.action === "Case template pack exported") {
        current.exports += 1;
      }
      accumulator.set(bucket, current);
      return accumulator;
    }, new Map<string, { imports: number; exports: number }>())
  )
    .map(([label, counts], index) => ({
      id: `template-ops-${index}-${label}`,
      label,
      value: counts.imports,
      secondaryValue: counts.exports,
    }))
    .reverse();
  const templateOperationProviderTrend = Array.from(
    templateOperationEntries.reduce(
      (accumulator, entry) => {
        const parsedProviders = parseTemplateOperationAuditSegments(
          entry.detail,
          "Providers"
        );

        parsedProviders.forEach(({ label, count }) => {
          const current = accumulator.get(label) ?? {
            provider: label,
            importedCount: 0,
            exportedCount: 0,
          };
          if (entry.action === "Case template pack imported") {
            current.importedCount += count;
          }
          if (entry.action === "Case template pack exported") {
            current.exportedCount += count;
          }
          accumulator.set(label, current);
        });

        return accumulator;
      },
      new Map<
        string,
        { provider: string; importedCount: number; exportedCount: number }
      >()
    )
  )
    .map(([, value]) => value)
    .sort(
      (left, right) =>
        right.importedCount +
          right.exportedCount -
          (left.importedCount + left.exportedCount) ||
        left.provider.localeCompare(right.provider)
    )
    .slice(0, 8);
  const suppressedAlertEntries = [...(project?.auditTrail ?? [])].filter(
    (entry) => entry.action === "Template alert suppressed"
  );
  const templateOperationSourceDashboards = Array.from(
    templateOperationEntries.reduce(
      (accumulator, entry) => {
        const parsedSources = parseTemplateOperationAuditSegments(entry.detail, "Sources");

        parsedSources.forEach(({ label, count }) => {
          const current = accumulator.get(label) ?? {
            source: label,
            importedCount: 0,
            exportedCount: 0,
            prioritizedCount: 0,
            suppressedCount: 0,
          };
          if (entry.action === "Case template pack imported") {
            current.importedCount += count;
          }
          if (entry.action === "Case template pack exported") {
            current.exportedCount += count;
          }
          accumulator.set(label, current);
        });

        return accumulator;
      },
      new Map<
        string,
        {
          source: string;
          importedCount: number;
          exportedCount: number;
          prioritizedCount: number;
          suppressedCount: number;
        }
      >()
    )
  );
  const prioritizedTemplateSources = Array.from(
    (project?.notifications ?? []).reduce((accumulator, notification) => {
      if (
        notification.archivedAt ||
        notification.type !== "template-operation" ||
        !notification.severityLifted ||
        !notification.sourceLabel?.trim()
      ) {
        return accumulator;
      }
      const sourceLabel = notification.sourceLabel.trim();
      const currentDashboard = templateOperationSourceDashboards.find(
        ([source]) => source === sourceLabel
      )?.[1];
      if (currentDashboard) {
        currentDashboard.prioritizedCount += 1;
      }
      accumulator.set(sourceLabel, (accumulator.get(sourceLabel) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 6);
  const mutedTemplateSources = Array.from(
    suppressedAlertEntries.reduce((accumulator, entry) => {
      const sourceMatch = entry.detail.match(/from (.+?) was suppressed/i);
      const sourceLabel = sourceMatch?.[1]?.trim();
      if (!sourceLabel) {
        return accumulator;
      }
      const currentDashboard = templateOperationSourceDashboards.find(
        ([source]) => source === sourceLabel
      )?.[1];
      if (currentDashboard) {
        currentDashboard.suppressedCount += 1;
      }
      accumulator.set(sourceLabel, (accumulator.get(sourceLabel) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 6);
  const sourceDashboards = templateOperationSourceDashboards
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
    .slice(0, 8);
  const sourceRuleTrend = Array.from(
    [
      ...(project?.notifications ?? [])
        .filter(
          (notification) =>
            notification.type === "template-operation" &&
            notification.severityLifted &&
            notification.sourceLabel?.trim()
        )
        .map((notification) => ({
          bucket: formatUtcDate(notification.createdAt),
          kind: "prioritized" as const,
        })),
      ...suppressedAlertEntries.map((entry) => ({
        bucket: formatUtcDate(entry.createdAt),
        kind: "suppressed" as const,
      })),
    ].reduce((accumulator, entry) => {
      const current = accumulator.get(entry.bucket) ?? { prioritized: 0, suppressed: 0 };
      if (entry.kind === "prioritized") {
        current.prioritized += 1;
      } else {
        current.suppressed += 1;
      }
      accumulator.set(entry.bucket, current);
      return accumulator;
    }, new Map<string, { prioritized: number; suppressed: number }>())
  )
    .map(([label, counts], index) => ({
      id: `template-source-rules-${index}-${label}`,
      label,
      value: counts.prioritized,
      secondaryValue: counts.suppressed,
    }))
    .reverse();

  const runTrend = [...(project?.runs ?? [])]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((run) => {
      const totalRunCases = rows.length;
      const counts = rows.reduce<Record<TestCaseExecutionResult, number>>(
        (accumulator, row) => {
          const result = run.rowResults[row.id] ?? row.executionResult ?? "not-run";
          accumulator[result] = (accumulator[result] ?? 0) + 1;
          return accumulator;
        },
        {
          passed: 0,
          failed: 0,
          blocked: 0,
          "not-run": 0,
        }
      );
      const executed = counts.passed + counts.failed + counts.blocked;

      return {
        id: run.id,
        name: run.name,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        totalCases: totalRunCases,
        passed: counts.passed,
        failed: counts.failed,
        blocked: counts.blocked,
        notRun: counts["not-run"],
        completionPercent: toPercent(executed, totalRunCases),
        passPercent: toPercent(counts.passed, totalRunCases),
      };
    });
  const activeRun =
    project?.runs?.find((run) => run.id === project.activeRunId) ??
    project?.runs?.[0] ??
    null;
  const latestAutomationExecutionByCase = [...(project?.automationExecutions ?? [])]
    .sort((left, right) => right.startedAt - left.startedAt)
    .reduce<Map<string, NonNullable<Project["automationExecutions"]>[number]>>(
      (accumulator, execution) => {
        if (!accumulator.has(execution.caseId)) {
          accumulator.set(execution.caseId, execution);
        }
        return accumulator;
      },
      new Map()
    );
  const failureInsights = rows
    .map((row) => {
      const stepResults = activeRun?.rowStepResults[row.id] ?? {};
      const failedSteps = Object.values(stepResults).filter(
        (value) => value === "failed"
      ).length;
      const blockedSteps = Object.values(stepResults).filter(
        (value) => value === "blocked"
      ).length;
      const latestAutomation = latestAutomationExecutionByCase.get(row.id);
      const executionResult =
        activeRun?.rowResults[row.id] ?? row.executionResult ?? "not-run";

      return {
        rowId: row.id,
        title: row.title.trim() || "Untitled test case",
        executionResult,
        failedSteps,
        blockedSteps,
        latestAutomationStatus: latestAutomation?.status,
        latestAutomationFailureMessage: latestAutomation?.failureMessage,
        linkedIssueId: row.issueId,
        linkedIssueKey: row.issueKey,
        runId: activeRun?.id,
        runName: activeRun?.name,
      };
    })
    .filter(
      (entry) =>
        entry.executionResult === "failed" ||
        entry.executionResult === "blocked" ||
        entry.failedSteps > 0 ||
        entry.blockedSteps > 0 ||
        entry.latestAutomationStatus === "failed" ||
        entry.latestAutomationStatus === "blocked"
    )
    .sort(
      (left, right) =>
        (right.executionResult === "failed"
          ? 3
          : right.executionResult === "blocked"
            ? 2
            : 1) -
          (left.executionResult === "failed"
            ? 3
            : left.executionResult === "blocked"
              ? 2
              : 1) ||
        right.failedSteps - left.failedSteps ||
        right.blockedSteps - left.blockedSteps
    )
    .slice(0, 12);
  const highRiskFailureCount = failureInsights.filter(
    (entry) =>
      entry.executionResult === "failed" ||
      entry.latestAutomationStatus === "failed"
  ).length;
  const releaseSignal =
    highRiskFailureCount >= 3
      ? {
          level: "high" as const,
          summary: `${highRiskFailureCount} high-risk failures are pulling release confidence down.`,
        }
      : highRiskFailureCount > 0 || executionCounts.blocked > 0
        ? {
            level: "medium" as const,
            summary: "Failures or blocked cases need review before release sign-off.",
          }
        : {
            level: "low" as const,
            summary: "No active failure cluster is currently dragging release readiness.",
          };
  const automationTrend = runTrend.map((run) => {
    const automatedCoverage = toPercent(automatedCases, totalCases);
    const candidateCoverage = toPercent(candidateCases + automationReadyCases, totalCases);

    return {
      id: run.id,
      label: run.name,
      value: automatedCoverage,
      secondaryValue: candidateCoverage,
    };
  });

  const releaseSnapshotsDescending = [...(project?.releaseReview?.snapshots ?? [])].sort(
    (left, right) => right.decisionRecordedAt - left.decisionRecordedAt
  );
  const releaseSnapshots = releaseSnapshotsDescending.map((snapshot, index) => {
    const previousSnapshot = releaseSnapshotsDescending[index + 1];
    const scoreDeltaFromPrevious = previousSnapshot
      ? snapshot.score - previousSnapshot.score
      : null;

    return {
      ...snapshot,
      scoreDeltaFromPrevious,
      scoreDeltaDirection: (scoreDeltaFromPrevious === null
        ? "none"
        : scoreDeltaFromPrevious > 0
        ? "up"
        : scoreDeltaFromPrevious < 0
        ? "down"
        : "flat") as ReleaseSnapshotHistoryEntry["scoreDeltaDirection"],
      previousRecordedDecision: previousSnapshot?.recordedDecision,
      levelChangedFromPrevious: previousSnapshot
        ? previousSnapshot.recordedDecision !== snapshot.recordedDecision ||
          previousSnapshot.level !== snapshot.level
        : false,
    };
  });
  const releaseTrend = [...releaseSnapshotsDescending]
    .sort((left, right) => left.decisionRecordedAt - right.decisionRecordedAt)
    .map((snapshot) => ({
      id: snapshot.id,
      label: formatUtcDate(snapshot.decisionRecordedAt),
      score: snapshot.score,
      recordedDecision: snapshot.recordedDecision,
      decisionRecordedAt: snapshot.decisionRecordedAt,
    }));
  const automationSnapshotTrend = [...releaseSnapshotsDescending]
    .sort((left, right) => left.decisionRecordedAt - right.decisionRecordedAt)
    .filter(
      (snapshot) =>
        typeof snapshot.automationCoveragePercent === "number" ||
        typeof snapshot.automationReadyCases === "number"
    )
    .map((snapshot) => ({
      id: snapshot.id,
      label: formatUtcDate(snapshot.decisionRecordedAt),
      value: snapshot.automationCoveragePercent ?? 0,
      secondaryValue:
        totalCases > 0
          ? toPercent(snapshot.automationReadyCases ?? 0, totalCases)
          : snapshot.automationReadyCases ?? 0,
    }));
  const latestProviderSnapshot = releaseSnapshotsDescending.find(
    (snapshot) =>
      Array.isArray(snapshot.automationProviders) && snapshot.automationProviders.length > 0
  );
  const previousProviderSnapshot = releaseSnapshotsDescending.find(
    (snapshot) =>
      snapshot.id !== latestProviderSnapshot?.id &&
      Array.isArray(snapshot.automationProviders) &&
      snapshot.automationProviders.length > 0
  );
  const automationProviderSnapshotChanges = latestProviderSnapshot?.automationProviders
    ? latestProviderSnapshot.automationProviders
        .map((entry) => {
          const previousCount =
            previousProviderSnapshot?.automationProviders?.find(
              (previousEntry) => previousEntry.provider === entry.provider
            )?.count ?? 0;
          const delta = entry.count - previousCount;

          return {
            provider: entry.provider,
            latestCount: entry.count,
            previousCount,
            delta,
            direction: (delta > 0 ? "up" : delta < 0 ? "down" : "flat") as
              | "up"
              | "down"
              | "flat",
          };
        })
        .sort(
          (left, right) =>
            Math.abs(right.delta) - Math.abs(left.delta) ||
            right.latestCount - left.latestCount
        )
        .slice(0, 5)
    : [];
  const latestAutomationSnapshot = releaseSnapshotsDescending[0];
  const previousAutomationSnapshot = releaseSnapshotsDescending[1];
  const automationHotspotSnapshotChanges = latestAutomationSnapshot?.automationHotspots
    ? latestAutomationSnapshot.automationHotspots
        .map((hotspot) => {
          const previousHotspot = previousAutomationSnapshot?.automationHotspots?.find(
            (entry) => entry.area === hotspot.area
          );
          const latestStrongReady = hotspot.strongReady;
          const previousStrongReady = previousHotspot?.strongReady ?? 0;
          const delta = latestStrongReady - previousStrongReady;

          return {
            area: hotspot.area,
            latestStrongReady,
            previousStrongReady,
            delta,
            rowIds: hotspot.rowIds ?? [],
            direction: (delta > 0 ? "up" : delta < 0 ? "down" : "flat") as
              | "up"
              | "down"
              | "flat",
          };
        })
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
        .slice(0, 5)
    : [];

  return {
    totalCases,
    totalIssues: issues.length,
    linkedCases,
    unlinkedCases,
    linkedCoveragePercent: toPercent(linkedCases, totalCases),
    automationCoveragePercent: toPercent(automatedCases, totalCases),
    automatedCases,
    candidateCases,
    automationReadyCases,
    automationHotspots,
    automationTrend,
    automationProviderDistribution,
    automationSnapshotTrend,
    automationProviderSnapshotChanges,
    automationHotspotSnapshotChanges,
    openIssues,
    doneIssues,
    blockerIssues,
    failedCases: executionCounts.failed,
    blockedCases: executionCounts.blocked,
    notRunCases: executionCounts["not-run"],
    executionSummary: {
      total: totalCases,
      passed: executionCounts.passed,
      failed: executionCounts.failed,
      blocked: executionCounts.blocked,
      notRun: executionCounts["not-run"],
    },
    failureInsights,
    releaseSignal,
    executionDistribution: buildExecutionDistribution(executionCounts, totalCases),
    issuePriorityDistribution,
    issueStatusDistribution,
    runTrend,
    releaseTrend,
    releaseSnapshots,
    latestReleaseDelta: releaseSnapshots[0]?.scoreDeltaFromPrevious ?? null,
    templateOperations: {
      importedPacks,
      exportedPacks,
      suppressedAlerts: suppressedAlertEntries.length,
      prioritizedAlerts: (project?.notifications ?? []).filter(
        (notification) =>
          !notification.archivedAt &&
          notification.type === "template-operation" &&
          notification.severityLifted
      ).length,
      trend: templateOperationTrend,
      recentHistory: templateOperationEntries.slice(0, 6).map((entry) => ({
        id: entry.id,
        action: entry.action,
        detail: entry.detail,
        createdAt: entry.createdAt,
      })),
      providerTrend: templateOperationProviderTrend,
      sourceDashboards,
      sourceRuleTrend,
      prioritizedSources: prioritizedTemplateSources,
      mutedSources: mutedTemplateSources,
    },
  };
};
