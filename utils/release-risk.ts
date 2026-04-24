import type { IssueRecord } from "../services/issue-service";
import type { Project, TestCaseExecutionResult, TestCaseRow } from "./workspace";
import { buildAutomationCandidateInsights } from "./test-case-management";

export type ReleaseRiskLevel = "safe" | "caution" | "blocked";

export interface ReleaseRiskReason {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  metric?: number;
  affectedArea?: string;
  actionHint?: string;
  linkedCaseIds?: string[];
  linkedIssueIds?: string[];
}

export interface ReleaseActionItem {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  linkedCaseIds?: string[];
  linkedIssueIds?: string[];
  automationProvider?: string;
}

export interface ReleaseHotspot {
  area: string;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  openIssues: number;
  criticalOpenIssues: number;
  riskScore: number;
}

export interface ReleaseRiskSummary {
  score: number;
  level: ReleaseRiskLevel;
  decisionLabel?: "Ready" | "Ready with Risk" | "Not Ready";
  recommendation: string;
  totalCases: number;
  executedCases: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
  notRunCases: number;
  executionCompletionPercent: number;
  criticalAreasUntestedPercent: number;
  linkedCoveragePercent: number;
  openIssues: number;
  openHighPriorityIssues: number;
  openCriticalIssues: number;
  blockerIssues: number;
  automationExecutedCases?: number;
  automationFailedCases?: number;
  automationBlockedCases?: number;
  highRiskSecurityCases?: number;
  failedHighRiskSecurityCases?: number;
  accessibilityFailedCases?: number;
  unresolvedLinkedIssues?: number;
  coverageGapCases?: number;
  regressionInstabilityPercent?: number;
  reasons: ReleaseRiskReason[];
  actions: ReleaseActionItem[];
  hotspots: ReleaseHotspot[];
  generatedAt: string;
}

export type ReleaseRiskContext = {
  groupingStrategy: string;
  dataNotes: string[];
  totalAreas: number;
  criticalAreas: string[];
  untestedCriticalAreas: string[];
  lowCoverageAreas: Array<{
    area: string;
    completionPercent: number;
  }>;
  automationRiskAreas: Array<{
    area: string;
    uncoveredCriticalCases: number;
  }>;
  automationProviderGaps: Array<{
    provider: string;
    manualReadyCases: number;
  }>;
  automationExecutionSummary?: {
    executedCases: number;
    failedCases: number;
    blockedCases: number;
  };
  securityRiskAreas: Array<{
    area: string;
    caseCount: number;
    failedCount: number;
    rowIds: string[];
  }>;
  accessibilityRiskCases?: Array<{
    rowId: string;
    title: string;
    complianceReference?: string;
  }>;
  regressionInstabilityPercent?: number;
};

type ReleaseRiskComputationResult = {
  summary: ReleaseRiskSummary;
  context: ReleaseRiskContext;
};

type EffectiveCase = TestCaseRow & {
  executionResult: TestCaseExecutionResult;
  area: string;
};

const GENERIC_LABELS = new Set([
  "smoke",
  "regression",
  "qa",
  "test",
  "release",
  "critical",
  "high",
  "medium",
  "low",
]);

const keywordGroups = [
  { area: "Authentication", keywords: ["auth", "login", "logout", "signup", "sign in", "password"] },
  { area: "Checkout", keywords: ["checkout", "payment", "billing", "card", "invoice"] },
  { area: "Cart", keywords: ["cart", "basket", "add to cart"] },
  { area: "Search", keywords: ["search", "filter", "sort", "discover"] },
  { area: "Profile", keywords: ["profile", "account", "settings", "preferences"] },
  { area: "Notifications", keywords: ["notification", "email", "sms", "alert"] },
  { area: "API", keywords: ["api", "endpoint", "request", "response", "service"] },
  { area: "Reporting", keywords: ["report", "dashboard", "analytics", "export"] },
  { area: "Admin", keywords: ["admin", "role", "permission", "access"] },
];

const toPercent = (value: number, total: number) =>
  total <= 0 ? 0 : Math.round((value / total) * 100);

const titleCase = (value: string) =>
  value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const inferAreaFromKeywords = (content: string) => {
  const normalized = content.toLowerCase();
  const match = keywordGroups.find((group) =>
    group.keywords.some((keyword) => normalized.includes(keyword))
  );

  return match?.area ?? "Uncategorized";
};

const inferAreaForCase = (
  row: TestCaseRow,
  linkedIssue: IssueRecord | undefined
): { area: string; strategy: string } => {
  const meaningfulLabel = row.labels?.find((label) => {
    const normalized = label.trim().toLowerCase();
    return normalized && !GENERIC_LABELS.has(normalized);
  });

  if (meaningfulLabel) {
    return {
      area: titleCase(meaningfulLabel),
      strategy: "labels",
    };
  }

  if (row.assignee?.trim()) {
    return {
      area: `Owner: ${row.assignee.trim()}`,
      strategy: "assignee",
    };
  }

  if (linkedIssue?.type) {
    return {
      area: titleCase(linkedIssue.type),
      strategy: "linked issue categories",
    };
  }

  return {
    area: inferAreaFromKeywords(
      [row.title, row.steps, linkedIssue?.summary, linkedIssue?.description]
        .filter(Boolean)
        .join(" ")
    ),
    strategy: "keyword grouping",
  };
};

const inferAreaForIssue = (issue: IssueRecord): string =>
  inferAreaFromKeywords(
    [issue.summary, issue.description, issue.type, issue.priority].join(" ")
  );

const severityRank: Record<ReleaseRiskReason["severity"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const priorityRank: Record<ReleaseActionItem["priority"], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export const buildReleaseRiskSummary = (
  project: Project | null,
  issues: IssueRecord[]
): ReleaseRiskComputationResult => {
  const dataNotes: string[] = [];

  if (!project) {
    return {
      summary: {
        score: 0,
        level: "blocked",
        recommendation: "Not ready for release: project data is unavailable.",
        totalCases: 0,
        executedCases: 0,
        passedCases: 0,
        failedCases: 0,
        blockedCases: 0,
        notRunCases: 0,
        executionCompletionPercent: 0,
        criticalAreasUntestedPercent: 0,
        linkedCoveragePercent: 0,
        openIssues: 0,
        openHighPriorityIssues: 0,
        openCriticalIssues: 0,
        blockerIssues: 0,
        automationExecutedCases: 0,
        automationFailedCases: 0,
        automationBlockedCases: 0,
        decisionLabel: "Not Ready",
        accessibilityFailedCases: 0,
        unresolvedLinkedIssues: 0,
        coverageGapCases: 0,
        regressionInstabilityPercent: 0,
        reasons: [
          {
            id: "project-missing",
            title: "Project data unavailable",
            description: "The release decision engine could not load project data.",
            severity: "critical",
            actionHint: "Reload the project and confirm that saved project data exists.",
          },
        ],
        actions: [
          {
            id: "restore-project-data",
            title: "Restore project data",
            description: "Load a valid project before using the release dashboard.",
            priority: "high",
          },
        ],
        hotspots: [],
        generatedAt: new Date().toISOString(),
      },
      context: {
        groupingStrategy: "no data",
        dataNotes: ["Project data is unavailable."],
        totalAreas: 0,
        criticalAreas: [],
        untestedCriticalAreas: [],
        lowCoverageAreas: [],
        automationRiskAreas: [],
        automationProviderGaps: [],
        automationExecutionSummary: {
          executedCases: 0,
          failedCases: 0,
          blockedCases: 0,
        },
        securityRiskAreas: [],
        accessibilityRiskCases: [],
        regressionInstabilityPercent: 0,
      },
    };
  }

  const issueMap = new Map(
    issues.map((issue) => [issue.id, issue] as const)
  );

  const activeRun =
    project.runs?.find((run) => run.id === project.activeRunId) ??
    project.runs?.[0] ??
    null;

  if (!activeRun) {
    dataNotes.push("No named run found, using current case execution state.");
  }

  if (issues.length === 0) {
    dataNotes.push("No live issue data found, release blockers are based on execution only.");
  }

  const effectiveCases: EffectiveCase[] = (project.rows ?? []).map((row) => {
    const linkedIssue = row.issueId ? issueMap.get(row.issueId) : undefined;
    const inferredArea = inferAreaForCase(row, linkedIssue);

    return {
      ...row,
      executionResult:
        activeRun?.rowResults[row.id] ??
        row.executionResult ??
        "not-run",
      area: inferredArea.area,
    };
  });

  const groupingStrategies = new Set(
    effectiveCases.map((row) => {
      const linkedIssue = row.issueId ? issueMap.get(row.issueId) : undefined;
      return inferAreaForCase(row, linkedIssue).strategy;
    })
  );
  const groupingStrategy = groupingStrategies.has("labels")
    ? "labels"
    : groupingStrategies.has("assignee")
    ? "assignee fallback"
    : groupingStrategies.has("linked issue categories")
    ? "linked issue categories"
    : "keyword grouping";

  if (groupingStrategy !== "labels") {
    dataNotes.push(`Labels were incomplete, using ${groupingStrategy} to infer critical areas.`);
  }

  const totalCases = effectiveCases.length;
  const passedCases = effectiveCases.filter((row) => row.executionResult === "passed").length;
  const failedCases = effectiveCases.filter((row) => row.executionResult === "failed").length;
  const blockedCases = effectiveCases.filter((row) => row.executionResult === "blocked").length;
  const notRunCases = effectiveCases.filter((row) => row.executionResult === "not-run").length;
  const executedCases = totalCases - notRunCases;
  const executionCompletionPercent = toPercent(executedCases, totalCases);
  const linkedCoveragePercent = toPercent(
    effectiveCases.filter((row) => row.issueId || row.issueKey).length,
    totalCases
  );
  const automationInsights = buildAutomationCandidateInsights(project.rows ?? []);
  const latestAutomationExecutionByCase = [...(project.automationExecutions ?? [])]
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
  const automationExecutedCases = Array.from(latestAutomationExecutionByCase.values()).filter(
    (execution) => execution.status !== "not-run"
  ).length;
  const automationFailedCases = Array.from(latestAutomationExecutionByCase.values()).filter(
    (execution) => execution.status === "failed"
  ).length;
  const automationBlockedCases = Array.from(latestAutomationExecutionByCase.values()).filter(
    (execution) => execution.status === "blocked"
  ).length;
  const highRiskSecurityCases = effectiveCases.filter(
    (row) => row.testDomain === "security" && (row.riskLevel ?? "medium") === "high"
  );
  const failedHighRiskSecurityCases = highRiskSecurityCases.filter((row) => {
    const latestAutomation = latestAutomationExecutionByCase.get(row.id);
    return (
      row.executionResult === "failed" ||
      row.executionResult === "blocked" ||
      latestAutomation?.status === "failed" ||
      latestAutomation?.status === "blocked"
    );
  });
  const accessibilityFailedCases = effectiveCases.filter((row) => {
    const wcagTagged = Boolean(row.complianceReference?.toLowerCase().includes("wcag"));
    return (
      (row.testDomain === "accessibility" || wcagTagged) &&
      (row.executionResult === "failed" || row.executionResult === "blocked")
    );
  });
  const unresolvedLinkedIssues = Array.from(
    new Set(
      effectiveCases
        .map((row) => row.issueId)
        .filter((value): value is string => Boolean(value))
        .filter((issueId) => issueMap.get(issueId)?.status !== "done")
    )
  );
  const coverageGapCases = effectiveCases.filter((row) => Boolean(row.gapSourceId));
  const recentRuns = [...(project.runs ?? [])]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    .slice(0, 3);
  const regressionInstabilityPercent =
    recentRuns.length < 2 || effectiveCases.length === 0
      ? 0
      : toPercent(
          effectiveCases.filter((row) => {
            const resultSet = new Set(
              recentRuns
                .map((run) => run.rowResults?.[row.id])
                .filter(
                  (value): value is TestCaseExecutionResult =>
                    value === "passed" ||
                    value === "failed" ||
                    value === "blocked" ||
                    value === "not-run"
                )
            );
            return resultSet.size >= 2;
          }).length,
          effectiveCases.length
        );

  const openIssues = issues.filter((issue) => issue.status !== "done").length;
  const openHighPriorityIssues = issues.filter(
    (issue) =>
      issue.status !== "done" &&
      (issue.priority === "high" || issue.priority === "highest")
  ).length;
  const openCriticalIssues = issues.filter(
    (issue) => issue.status !== "done" && issue.priority === "highest"
  ).length;
  const blockerIssues = issues.filter(
    (issue) => issue.status === "blocked"
  ).length;

  const areaMap = new Map<
    string,
    {
      area: string;
      totalCases: number;
      passed: number;
      failed: number;
      blocked: number;
      notRun: number;
      issueIds: Set<string>;
      criticalIssueIds: Set<string>;
    }
  >();

  effectiveCases.forEach((row) => {
    const current = areaMap.get(row.area) ?? {
      area: row.area,
      totalCases: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      notRun: 0,
      issueIds: new Set<string>(),
      criticalIssueIds: new Set<string>(),
    };
    current.totalCases += 1;
    current[row.executionResult === "not-run" ? "notRun" : row.executionResult] += 1;

    if (row.issueId) {
      const linkedIssue = issueMap.get(row.issueId);
      if (linkedIssue && linkedIssue.status !== "done") {
        current.issueIds.add(linkedIssue.id);
        if (linkedIssue.priority === "highest" || linkedIssue.priority === "high") {
          current.criticalIssueIds.add(linkedIssue.id);
        }
      }
    }

    areaMap.set(row.area, current);
  });

  issues
    .filter((issue) => issue.status !== "done")
    .forEach((issue) => {
      const alreadyMapped = effectiveCases.some(
        (row) => row.issueId === issue.id || row.issueKey === issue.issueKey
      );

      if (alreadyMapped) {
        return;
      }

      const area = inferAreaForIssue(issue);
      const current = areaMap.get(area) ?? {
        area,
        totalCases: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        notRun: 0,
        issueIds: new Set<string>(),
        criticalIssueIds: new Set<string>(),
      };
      current.issueIds.add(issue.id);
      if (issue.priority === "highest" || issue.priority === "high") {
        current.criticalIssueIds.add(issue.id);
      }
      areaMap.set(area, current);
    });

  const criticalAreas = Array.from(areaMap.values())
    .filter(
      (area) =>
        area.criticalIssueIds.size > 0 ||
        effectiveCases.some(
          (row) =>
            row.area === area.area &&
            (row.priority === "highest" || row.priority === "high")
        )
    )
    .map((area) => area.area);

  const untestedCriticalAreas = criticalAreas.filter((area) => {
    const areaStats = areaMap.get(area);
    if (!areaStats) {
      return false;
    }

    return areaStats.passed + areaStats.failed + areaStats.blocked === 0;
  });

  const criticalAreasUntestedPercent = toPercent(
    untestedCriticalAreas.length,
    criticalAreas.length
  );

  const hotspots: ReleaseHotspot[] = Array.from(areaMap.values())
    .map((area) => {
      const executionRiskPenalty = Math.min(
        60,
        area.failed * 18 + area.blocked * 14 + area.notRun * 7
      );
      const issuePenalty = Math.min(
        35,
        area.issueIds.size * 5 + area.criticalIssueIds.size * 8
      );
      const lowExecutionPenalty =
        area.totalCases > 0
          ? Math.max(
              0,
              20 -
                Math.round(
                  ((area.passed + area.failed + area.blocked) / area.totalCases) * 20
                )
            )
          : 0;

      return {
        area: area.area,
        totalCases: area.totalCases,
        passed: area.passed,
        failed: area.failed,
        blocked: area.blocked,
        notRun: area.notRun,
        openIssues: area.issueIds.size,
        criticalOpenIssues: area.criticalIssueIds.size,
        riskScore: Math.max(0, 100 - executionRiskPenalty - issuePenalty - lowExecutionPenalty),
      };
    })
    .sort((left, right) => left.riskScore - right.riskScore);

  const lowCoverageAreas = hotspots
    .filter((hotspot) => {
      if (hotspot.totalCases === 0) {
        return false;
      }

      return toPercent(
        hotspot.passed + hotspot.failed + hotspot.blocked,
        hotspot.totalCases
      ) < 60;
    })
    .map((hotspot) => ({
      area: hotspot.area,
      completionPercent: toPercent(
        hotspot.passed + hotspot.failed + hotspot.blocked,
        hotspot.totalCases
      ),
    }));
  const automationRiskAreas = Array.from(areaMap.values())
    .map((area) => ({
      area: area.area,
      uncoveredCriticalCases: effectiveCases.filter(
        (row) =>
          row.area === area.area &&
          (row.priority === "highest" || row.priority === "high") &&
          (row.automationStatus ?? "manual") !== "automated"
      ).length,
    }))
    .filter((entry) => entry.uncoveredCriticalCases > 0)
    .sort((left, right) => right.uncoveredCriticalCases - left.uncoveredCriticalCases)
    .slice(0, 5);
  const automationProviderGaps = Array.from(
    automationInsights.reduce((accumulator, entry) => {
      if (entry.automationStatus === "automated" || !entry.isStrongCandidate) {
        return accumulator;
      }

      const provider = entry.provider || "Unspecified";
      accumulator.set(provider, (accumulator.get(provider) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([provider, manualReadyCases]) => ({ provider, manualReadyCases }))
    .sort((left, right) => right.manualReadyCases - left.manualReadyCases)
    .slice(0, 4);
  const securityRiskAreas = Array.from(
    highRiskSecurityCases.reduce((accumulator, row) => {
      const current = accumulator.get(row.area) ?? {
        area: row.area,
        caseCount: 0,
        failedCount: 0,
        rowIds: [] as string[],
      };
      current.caseCount += 1;
      if (
        row.executionResult === "failed" ||
        row.executionResult === "blocked" ||
        latestAutomationExecutionByCase.get(row.id)?.status === "failed" ||
        latestAutomationExecutionByCase.get(row.id)?.status === "blocked"
      ) {
        current.failedCount += 1;
      }
      if (current.rowIds.length < 8) {
        current.rowIds.push(row.id);
      }
      accumulator.set(row.area, current);
      return accumulator;
    }, new Map<string, { area: string; caseCount: number; failedCount: number; rowIds: string[] }>())
  )
    .map(([, value]) => value)
    .sort((left, right) => right.failedCount - left.failedCount || right.caseCount - left.caseCount)
    .slice(0, 5);

  let score = 100;
  score -= Math.min(35, failedCases * 9);
  score -= Math.min(24, blockedCases * 8);
  score -= Math.min(20, Math.round((notRunCases / Math.max(totalCases, 1)) * 25));
  score -= Math.min(28, openHighPriorityIssues * 7);
  score -= Math.min(22, openCriticalIssues * 12);
  score -= Math.min(24, blockerIssues * 14);
  score -= Math.min(18, Math.round((criticalAreasUntestedPercent / 100) * 18));
  score -= executionCompletionPercent < 70 ? Math.min(12, 70 - executionCompletionPercent) : 0;
  score -= linkedCoveragePercent < 55 ? Math.min(10, Math.round((55 - linkedCoveragePercent) / 5)) : 0;
  score -= hotspots[0] && hotspots[0].riskScore < 50 ? 10 : 0;
  const strongAutomationReadyCount = automationInsights.filter(
    (entry) => entry.automationStatus !== "automated" && entry.isStrongCandidate
  ).length;
  score -= strongAutomationReadyCount >= 3 ? Math.min(8, strongAutomationReadyCount * 2) : 0;
  score -= automationFailedCases > 0 ? Math.min(14, automationFailedCases * 5) : 0;
  score -= automationBlockedCases > 0 ? Math.min(8, automationBlockedCases * 3) : 0;
  score -=
    failedHighRiskSecurityCases.length > 0
      ? Math.min(12, failedHighRiskSecurityCases.length * 4)
      : 0;
  score -= accessibilityFailedCases.length > 0 ? Math.min(8, accessibilityFailedCases.length * 3) : 0;
  score -= unresolvedLinkedIssues.length > 0 ? Math.min(8, unresolvedLinkedIssues.length * 2) : 0;
  score -= coverageGapCases.length > 0 ? Math.min(6, coverageGapCases.length * 2) : 0;
  score -= regressionInstabilityPercent >= 20 ? Math.min(8, Math.round(regressionInstabilityPercent / 10)) : 0;
  score = Math.max(0, Math.min(100, score));

  let level: ReleaseRiskLevel =
    score >= 80 ? "safe" : score >= 55 ? "caution" : "blocked";

  if (blockerIssues > 0) {
    level = "blocked";
  } else if (openCriticalIssues >= 2 || (openCriticalIssues >= 1 && failedCases > 0)) {
    level = "blocked";
  } else if (criticalAreas.length > 0 && criticalAreasUntestedPercent >= 50) {
    level = "blocked";
  } else if (openHighPriorityIssues > 0 || failedCases > 0 || blockedCases > 0) {
    level = level === "safe" ? "caution" : level;
  }
  if (automationFailedCases > 0) {
    level = level === "safe" ? "caution" : level;
  }
  if (failedHighRiskSecurityCases.length > 0) {
    level = level === "safe" ? "caution" : level;
  }
  if (accessibilityFailedCases.length > 0 || unresolvedLinkedIssues.length >= 3) {
    level = level === "safe" ? "caution" : level;
  }

  const reasons: ReleaseRiskReason[] = [];
  const failedCaseIds = effectiveCases
    .filter((row) => row.executionResult === "failed")
    .map((row) => row.id);
  const notRunCaseIds = effectiveCases
    .filter((row) => row.executionResult === "not-run")
    .map((row) => row.id);
  const unlinkedCaseIds = effectiveCases
    .filter((row) => !row.issueId && !row.issueKey)
    .map((row) => row.id);
  const blockerIssueIds = issues
    .filter((issue) => issue.status === "blocked")
    .map((issue) => issue.id);
  const highPriorityIssueIds = issues
    .filter(
      (issue) =>
        issue.status !== "done" &&
        (issue.priority === "high" || issue.priority === "highest")
    )
    .map((issue) => issue.id);

  if (failedCases > 0) {
    reasons.push({
      id: "failed-cases",
      title: "Failed cases remain in the active release scope",
      description: `${failedCases} case${failedCases === 1 ? "" : "s"} are currently failing in the release scope.`,
      severity: failedCases >= 3 ? "critical" : "high",
      metric: failedCases,
      actionHint: "Review failing cases in the active run and convert unresolved failures into tracked defects.",
      linkedCaseIds: failedCaseIds,
    });
  }

  if (automationFailedCases > 0) {
    reasons.push({
      id: "automation-failures",
      title: "Automation failures are affecting release confidence",
      description: `${automationFailedCases} automated case${automationFailedCases === 1 ? "" : "s"} most recently failed, and ${automationBlockedCases} are blocked.`,
      severity: automationFailedCases >= 2 ? "high" : "medium",
      metric: automationFailedCases,
      actionHint: "Review the latest automation failures, capture defects where needed, and rerun before release.",
      linkedCaseIds: Array.from(latestAutomationExecutionByCase.values())
        .filter((execution) => execution.status === "failed")
        .map((execution) => execution.caseId),
      linkedIssueIds: Array.from(latestAutomationExecutionByCase.values())
        .filter((execution) => execution.status === "failed" && execution.linkedIssueId)
        .map((execution) => execution.linkedIssueId as string),
    });
  }

  if (failedHighRiskSecurityCases.length > 0) {
    reasons.push({
      id: "high-risk-security-failures",
      title: "High-risk security cases still need release attention",
      description: `${failedHighRiskSecurityCases.length} high-risk security case${
        failedHighRiskSecurityCases.length === 1 ? "" : "s"
      } failed or remain blocked in the current release view.`,
      severity: failedHighRiskSecurityCases.length >= 2 ? "critical" : "high",
      metric: failedHighRiskSecurityCases.length,
      actionHint:
        "Review auth, authorization, session, input validation, and abuse-resistance coverage before sign-off.",
      linkedCaseIds: failedHighRiskSecurityCases.map((row) => row.id),
      linkedIssueIds: failedHighRiskSecurityCases
        .map((row) => row.issueId)
        .filter((value): value is string => Boolean(value)),
    });
  }

  if (accessibilityFailedCases.length > 0) {
    reasons.push({
      id: "accessibility-failures",
      title: "Accessibility validation is still failing in release scope",
      description: `${accessibilityFailedCases.length} accessibility or WCAG-tagged case${
        accessibilityFailedCases.length === 1 ? "" : "s"
      } failed or remain blocked in the current release view.`,
      severity: accessibilityFailedCases.length >= 2 ? "high" : "medium",
      metric: accessibilityFailedCases.length,
      actionHint:
        "Review keyboard flow, focus management, form semantics, error announcements, and screen-reader expectations before sign-off.",
      linkedCaseIds: accessibilityFailedCases.map((row) => row.id),
      linkedIssueIds: accessibilityFailedCases
        .map((row) => row.issueId)
        .filter((value): value is string => Boolean(value)),
    });
  }

  if (blockerIssues > 0) {
    reasons.push({
      id: "blocker-issues",
      title: "Release blockers are still open",
      description: `${blockerIssues} blocker issue${blockerIssues === 1 ? "" : "s"} are still unresolved.`,
      severity: "critical",
      metric: blockerIssues,
      actionHint: "Resolve blocker issues or explicitly remove them from the release decision.",
      linkedIssueIds: blockerIssueIds,
    });
  }

  if (criticalAreasUntestedPercent > 0) {
    reasons.push({
      id: "critical-areas-untested",
      title: "Critical areas lack executed coverage",
      description: `${criticalAreasUntestedPercent}% of inferred critical areas have no executed cases yet.`,
      severity: criticalAreasUntestedPercent >= 50 ? "critical" : "high",
      metric: criticalAreasUntestedPercent,
      actionHint: "Run at least one meaningful execution pass in each critical area before release.",
      linkedCaseIds: effectiveCases
        .filter(
          (row) =>
            untestedCriticalAreas.includes(row.area) &&
            row.executionResult === "not-run"
        )
        .map((row) => row.id),
    });
  }

  if (notRunCases > 0) {
    reasons.push({
      id: "not-run-cases",
      title: "Execution coverage is incomplete",
      description: `${notRunCases} case${notRunCases === 1 ? "" : "s"} have not been executed in the current release view.`,
      severity: notRunCases >= Math.max(3, Math.ceil(totalCases * 0.3)) ? "high" : "medium",
      metric: notRunCases,
      actionHint: "Complete execution for remaining priority coverage before making a release call.",
      linkedCaseIds: notRunCaseIds,
    });
  }

  if (openHighPriorityIssues > 0) {
    reasons.push({
      id: "open-high-priority-issues",
      title: "High-priority defects are still open",
      description: `${openHighPriorityIssues} high-priority issue${openHighPriorityIssues === 1 ? "" : "s"} remain unresolved.`,
      severity: openCriticalIssues > 0 ? "critical" : "high",
      metric: openHighPriorityIssues,
      actionHint: "Review open high and highest priority issues before approving release.",
      linkedIssueIds: highPriorityIssueIds,
    });
  }

  if (unresolvedLinkedIssues.length > 0) {
    reasons.push({
      id: "unresolved-linked-issues",
      title: "Linked release issues are still unresolved",
      description: `${unresolvedLinkedIssues.length} linked issue${
        unresolvedLinkedIssues.length === 1 ? "" : "s"
      } tied to in-scope cases are still open.`,
      severity: unresolvedLinkedIssues.length >= 3 ? "high" : "medium",
      metric: unresolvedLinkedIssues.length,
      actionHint: "Review linked defects alongside execution evidence before making the final ship call.",
      linkedIssueIds: unresolvedLinkedIssues,
    });
  }

  if (coverageGapCases.length > 0) {
    reasons.push({
      id: "coverage-gap-follow-through",
      title: "Coverage gaps still need follow-through",
      description: `${coverageGapCases.length} gap-focused case${
        coverageGapCases.length === 1 ? "" : "s"
      } remain in the current scope, which suggests requirement coverage is still maturing.`,
      severity: coverageGapCases.length >= 3 ? "medium" : "low",
      metric: coverageGapCases.length,
      actionHint: "Confirm the remaining gap-driven cases are either executed, accepted, or intentionally deferred.",
      linkedCaseIds: coverageGapCases.map((row) => row.id),
    });
  }

  if (regressionInstabilityPercent >= 20) {
    reasons.push({
      id: "regression-instability",
      title: "Recent run history shows unstable regression behavior",
      description: `${regressionInstabilityPercent}% of in-scope cases changed result across the recent run history.`,
      severity: regressionInstabilityPercent >= 35 ? "high" : "medium",
      metric: regressionInstabilityPercent,
      actionHint: "Inspect recent run flips and decide whether the instability reflects flaky automation, partial fixes, or genuine regression risk.",
    });
  }

  if (linkedCoveragePercent < 60 && totalCases > 0) {
    reasons.push({
      id: "linked-coverage",
      title: "Case-to-issue traceability is still weak",
      description: `Only ${linkedCoveragePercent}% of cases are linked to tracked work items.`,
      severity: linkedCoveragePercent < 40 ? "high" : "medium",
      metric: linkedCoveragePercent,
      actionHint: "Link important cases to issues so release scope and execution risk stay aligned.",
      linkedCaseIds: unlinkedCaseIds,
    });
  }

  if (hotspots[0] && hotspots[0].riskScore < 60) {
    const hotspotCaseIds = effectiveCases
      .filter((row) => row.area === hotspots[0].area)
      .map((row) => row.id);
    const hotspotIssueIds = issues
      .filter((issue) => inferAreaForIssue(issue) === hotspots[0].area)
      .map((issue) => issue.id);

    reasons.push({
      id: "hotspot-concentration",
      title: "Failure risk is concentrated in one area",
      description: `${hotspots[0].area} is the highest-risk hotspot with concentrated failures, blockers, or open issues.`,
      severity: hotspots[0].riskScore < 40 ? "critical" : "high",
      affectedArea: hotspots[0].area,
      actionHint: `Stabilize ${hotspots[0].area} before approving the release.`,
      linkedCaseIds: hotspotCaseIds,
      linkedIssueIds: hotspotIssueIds,
    });
  }

  if (strongAutomationReadyCount >= 3) {
    reasons.push({
      id: "automation-gap",
      title: "High-value manual cases still create regression load",
      description: `${strongAutomationReadyCount} strong automation-ready cases are still manual or only partially prepared, increasing release-time verification pressure.`,
      severity: strongAutomationReadyCount >= 5 ? "high" : "medium",
      metric: strongAutomationReadyCount,
      affectedArea: automationRiskAreas[0]?.area,
      actionHint: "Promote the strongest repetitive manual cases into the automation queue before the next release cycle.",
      linkedCaseIds: automationInsights
        .filter((entry) => entry.automationStatus !== "automated" && entry.isStrongCandidate)
        .slice(0, 5)
        .map((entry) => entry.rowId),
    });
  }

  const actions: ReleaseActionItem[] = [];

  if (blockerIssues > 0) {
    actions.push({
      id: "resolve-blockers",
      title: "Resolve blocker issues",
      description: "Clear blocker issues before release sign-off.",
      priority: "high",
      linkedIssueIds: issues
        .filter((issue) => issue.status === "blocked")
        .map((issue) => issue.id),
    });
  }

  if (failedCases > 0) {
    actions.push({
      id: "triage-failures",
      title: "Triage failing cases",
      description: "Confirm each failed execution is either fixed, accepted, or tracked as a release defect.",
      priority: "high",
      linkedCaseIds: effectiveCases
        .filter((row) => row.executionResult === "failed")
        .map((row) => row.id),
    });
  }

  if (automationFailedCases > 0 || automationBlockedCases > 0) {
    actions.push({
      id: "stabilize-automation-failures",
      title: "Stabilize recent automation failures",
      description: "Review failed and blocked automated cases, fix flaky coverage, and link unresolved failures to defects.",
      priority: automationFailedCases >= 2 ? "high" : "medium",
      linkedCaseIds: Array.from(latestAutomationExecutionByCase.values())
        .filter(
          (execution) =>
            execution.status === "failed" || execution.status === "blocked"
        )
        .map((execution) => execution.caseId),
      linkedIssueIds: Array.from(latestAutomationExecutionByCase.values())
        .filter(
          (execution) =>
            (execution.status === "failed" || execution.status === "blocked") &&
            execution.linkedIssueId
        )
        .map((execution) => execution.linkedIssueId as string),
    });
  }

  if (failedHighRiskSecurityCases.length > 0) {
    actions.push({
      id: "review-high-risk-security-cases",
      title: "Review high-risk security cases before release",
      description:
        "Check failing or blocked defensive security validation cases and confirm mitigations or tracked defects before sign-off.",
      priority: failedHighRiskSecurityCases.length >= 2 ? "high" : "medium",
      linkedCaseIds: failedHighRiskSecurityCases.map((row) => row.id),
      linkedIssueIds: failedHighRiskSecurityCases
        .map((row) => row.issueId)
        .filter((value): value is string => Boolean(value)),
    });
  }

  if (accessibilityFailedCases.length > 0) {
    actions.push({
      id: "review-accessibility-failures",
      title: "Resolve accessibility and WCAG failures",
      description:
        "Review failed accessibility validations, confirm fixes or waivers, and keep inclusive UX risk visible before release.",
      priority: accessibilityFailedCases.length >= 2 ? "high" : "medium",
      linkedCaseIds: accessibilityFailedCases.map((row) => row.id),
      linkedIssueIds: accessibilityFailedCases
        .map((row) => row.issueId)
        .filter((value): value is string => Boolean(value)),
    });
  }

  if (untestedCriticalAreas.length > 0) {
    actions.push({
      id: "cover-critical-areas",
      title: "Execute critical areas with zero coverage",
      description: `Run coverage for ${untestedCriticalAreas.join(", ")} before release.`,
      priority: "high",
    });
  }

  if (openHighPriorityIssues > 0) {
    actions.push({
      id: "review-high-priority-issues",
      title: "Review open high-priority issues",
      description: "Decide whether unresolved high-priority work should block release or be explicitly waived.",
      priority: "medium",
      linkedIssueIds: issues
        .filter(
          (issue) =>
            issue.status !== "done" &&
            (issue.priority === "high" || issue.priority === "highest")
        )
        .map((issue) => issue.id),
    });
  }

  if (unresolvedLinkedIssues.length > 0) {
    actions.push({
      id: "resolve-linked-release-issues",
      title: "Resolve linked release issues or document waivers",
      description:
        "Every linked in-scope defect should be resolved, accepted with explicit risk, or intentionally removed from the release decision.",
      priority: unresolvedLinkedIssues.length >= 3 ? "high" : "medium",
      linkedIssueIds: unresolvedLinkedIssues,
    });
  }

  if (coverageGapCases.length > 0) {
    actions.push({
      id: "close-coverage-gap-follow-up",
      title: "Close the remaining coverage-gap follow-up",
      description:
        "Work through the remaining requirement-gap cases so release confidence is backed by intentional coverage, not just generated drafts.",
      priority: "medium",
      linkedCaseIds: coverageGapCases.map((row) => row.id),
    });
  }

  if (regressionInstabilityPercent >= 20) {
    actions.push({
      id: "stabilize-regression-instability",
      title: "Investigate recent regression instability",
      description:
        "Recent run history is changing too often for a clean release call. Review flipped results and stabilize the highest-signal regressions first.",
      priority: regressionInstabilityPercent >= 35 ? "high" : "medium",
    });
  }

  if (linkedCoveragePercent < 60) {
    actions.push({
      id: "improve-traceability",
      title: "Improve case-to-issue traceability",
      description: "Link remaining important cases to their source issues so the release scope is defendable.",
      priority: "medium",
    });
  }

  if (lowCoverageAreas.length > 0) {
    actions.push({
      id: "finish-low-coverage-areas",
      title: "Increase execution in low-coverage areas",
      description: `Areas below 60% execution coverage: ${lowCoverageAreas
        .slice(0, 3)
        .map((area) => area.area)
        .join(", ")}.`,
      priority: "medium",
    });
  }

  if (strongAutomationReadyCount >= 3) {
    actions.push({
      id: "automation-follow-through",
      title: "Prioritize strong automation-ready cases",
      description: "Reduce manual regression pressure by moving the best repetitive cases into automation planning.",
      priority: strongAutomationReadyCount >= 5 ? "high" : "medium",
      linkedCaseIds: automationInsights
        .filter((entry) => entry.automationStatus !== "automated" && entry.isStrongCandidate)
        .slice(0, 5)
        .map((entry) => entry.rowId),
    });
  }

  const topProviderGap = automationInsights
    .filter((entry) => entry.automationStatus !== "automated" && entry.isStrongCandidate)
    .reduce(
      (accumulator, entry) => {
        const provider = entry.provider || "Unspecified";
        accumulator.set(provider, (accumulator.get(provider) ?? 0) + 1);
        return accumulator;
      },
      new Map<string, number>()
    );
  const sortedProviderGaps = Array.from(topProviderGap.entries()).sort(
    (left, right) => right[1] - left[1]
  );

  if (sortedProviderGaps.length > 0) {
    const [provider, count] = sortedProviderGaps[0];
    actions.push({
      id: "provider-focused-automation",
      title: `Push ${provider} automation follow-through`,
      description: `${count} strong automation-ready cases are leaning toward ${provider}. Convert that pressure into a focused provider-specific automation push.`,
      priority: count >= 4 ? "high" : "medium",
      automationProvider: provider,
      linkedCaseIds: automationInsights
        .filter(
          (entry) =>
            entry.provider === provider &&
            entry.automationStatus !== "automated" &&
            entry.isStrongCandidate
        )
        .slice(0, 5)
        .map((entry) => entry.rowId),
    });
  }

  reasons.sort(
    (left, right) => severityRank[right.severity] - severityRank[left.severity]
  );
  actions.sort(
    (left, right) => priorityRank[right.priority] - priorityRank[left.priority]
  );

  const recommendation =
    level === "safe"
      ? "Ready: current evidence supports release with only minor follow-up."
      : level === "caution"
      ? "Ready with Risk: unresolved high-risk signals still need explicit review."
      : "Not Ready: critical blockers or unstable evidence still need resolution.";
  const decisionLabel =
    level === "safe"
      ? "Ready"
      : level === "caution"
      ? "Ready with Risk"
      : "Not Ready";

  return {
    summary: {
      score,
      level,
      decisionLabel,
      recommendation,
      totalCases,
      executedCases,
      passedCases,
      failedCases,
      blockedCases,
      notRunCases,
      executionCompletionPercent,
      criticalAreasUntestedPercent,
      linkedCoveragePercent,
      openIssues,
      openHighPriorityIssues,
      openCriticalIssues,
      blockerIssues,
      automationExecutedCases,
      automationFailedCases,
      automationBlockedCases,
      highRiskSecurityCases: highRiskSecurityCases.length,
      failedHighRiskSecurityCases: failedHighRiskSecurityCases.length,
      accessibilityFailedCases: accessibilityFailedCases.length,
      unresolvedLinkedIssues: unresolvedLinkedIssues.length,
      coverageGapCases: coverageGapCases.length,
      regressionInstabilityPercent,
      reasons: reasons.slice(0, 5),
      actions: actions.slice(0, 6),
      hotspots: hotspots.slice(0, 6),
      generatedAt: new Date().toISOString(),
    },
    context: {
      groupingStrategy,
      dataNotes,
      totalAreas: areaMap.size,
      criticalAreas,
      untestedCriticalAreas,
      lowCoverageAreas,
      automationRiskAreas,
      automationProviderGaps,
      automationExecutionSummary: {
        executedCases: automationExecutedCases,
        failedCases: automationFailedCases,
        blockedCases: automationBlockedCases,
      },
      securityRiskAreas,
      accessibilityRiskCases: accessibilityFailedCases.map((row) => ({
        rowId: row.id,
        title: row.title,
        complianceReference: row.complianceReference,
      })),
      regressionInstabilityPercent,
    },
  };
};
