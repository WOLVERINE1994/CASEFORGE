import type { Project, TestCaseAutomationStatus, TestCaseRow } from "./workspace";
import type { TraceabilityAnalysis } from "./traceability";
import type { CaseQualityAnalysis } from "./case-quality";
import type { RequirementRiskAnalysis, RiskSeverity } from "./risk-analysis";

const inferArea = (row: TestCaseRow) =>
  row.componentArea?.trim() ||
  row.suiteName?.trim() ||
  row.labels?.[0]?.trim() ||
  "Uncategorized";

const inferAutomationProvider = (row: TestCaseRow) => {
  const explicitProvider = row.automationProvider?.trim();
  if (explicitProvider) {
    return explicitProvider;
  }

  const reference = row.automationReference?.trim().toLowerCase() ?? "";
  const title = row.title.trim().toLowerCase();
  const steps = row.steps.trim().toLowerCase();
  const type = row.type.trim().toLowerCase();
  const haystack = `${reference} ${title} ${steps} ${type}`;

  if (/\bplaywright\b/.test(haystack)) {
    return "Playwright";
  }
  if (/\bcypress\b/.test(haystack)) {
    return "Cypress";
  }
  if (/\bpostman\b/.test(haystack)) {
    return "Postman";
  }
  if (/\bselenium\b/.test(haystack)) {
    return "Selenium";
  }
  if (/\bjest\b|\bvitest\b/.test(haystack)) {
    return "Jest/Vitest";
  }
  if (/\bapi\b|\brest\b|\bgraphql\b/.test(haystack)) {
    return "API Automation";
  }
  if (/\bui\b|\bvisual\b|\bbrowser\b/.test(haystack)) {
    return "UI Automation";
  }

  return "Unspecified";
};

export const getAutomationStrongThreshold = (provider: string) => {
  switch (provider) {
    case "Postman":
    case "API Automation":
      return 68;
    case "Playwright":
    case "Cypress":
    case "Jest/Vitest":
      return 72;
    case "UI Automation":
      return 74;
    case "Selenium":
      return 78;
    case "Unspecified":
    default:
      return 80;
  }
};

export const buildAutomationProviderSummary = (rows: TestCaseRow[]) =>
  Array.from(
    rows.reduce((accumulator, row) => {
      if ((row.automationStatus ?? "manual") === "manual") {
        return accumulator;
      }

      const provider = inferAutomationProvider(row);
      accumulator.set(provider, (accumulator.get(provider) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider));

export const buildTraceabilityMatrix = (
  rows: TestCaseRow[],
  traceabilityAnalysis: TraceabilityAnalysis
) =>
  rows.map((row) => ({
    rowId: row.id,
    title: row.title || "Untitled test case",
    issueKey: row.issueKey || null,
    suiteName: row.suiteName?.trim() || "Unassigned",
    componentArea: inferArea(row),
    requirementSentence:
      traceabilityAnalysis.links[row.id]?.requirementSentence ||
      "No direct sentence mapping",
    riskArea:
      traceabilityAnalysis.links[row.id]?.riskArea || "General coverage",
    covered: Boolean(traceabilityAnalysis.links[row.id]),
  }));

export const buildTraceabilityHealthSummary = (
  rows: TestCaseRow[],
  traceabilityAnalysis: TraceabilityAnalysis
) => {
  const coveredSentences = traceabilityAnalysis.sentenceCoverage.filter(
    (entry) => entry.covered
  ).length;
  const uncoveredSentences = traceabilityAnalysis.uncoveredSentences.length;
  const multiMappedSentences = traceabilityAnalysis.sentenceCoverage.filter(
    (entry) => entry.rowIds.length > 1
  ).length;
  const casesWithoutDirectMapping = rows.filter(
    (row) => !traceabilityAnalysis.links[row.id]
  ).length;
  const linkedMappedCases = rows.filter(
    (row) => traceabilityAnalysis.links[row.id] && (row.issueId || row.issueKey)
  ).length;

  return {
    totalSentences: traceabilityAnalysis.sentenceCoverage.length,
    coveredSentences,
    uncoveredSentences,
    coveragePercent:
      traceabilityAnalysis.sentenceCoverage.length === 0
        ? 0
        : Math.round(
            (coveredSentences / traceabilityAnalysis.sentenceCoverage.length) * 100
          ),
    multiMappedSentences,
    casesWithoutDirectMapping,
    linkedMappedCases,
    coveredRiskAreasCount: traceabilityAnalysis.coveredRiskAreas.length,
  };
};

const highSeverityPatterns = [
  /\bpermission\b/i,
  /\bauthori[sz]ation\b/i,
  /\bauthentication\b/i,
  /\bsecurity\b/i,
  /\bpayment\b/i,
  /\bbilling\b/i,
  /\bdelete\b/i,
  /\bexport\b/i,
  /\badmin\b/i,
  /\bunauthori[sz]ed\b/i,
  /\bfail(?:ure|ed)?\b/i,
  /\bblocked\b/i,
  /\btimeout\b/i,
  /\bservice\b/i,
  /\bintegration\b/i,
];

const mediumSeverityPatterns = [
  /\bvalidate\b/i,
  /\bvalidation\b/i,
  /\brequired\b/i,
  /\berror\b/i,
  /\bstatus\b/i,
  /\bstate\b/i,
  /\blimit\b/i,
  /\bboundary\b/i,
  /\bminimum\b/i,
  /\bmaximum\b/i,
  /\bfilter\b/i,
  /\bsearch\b/i,
  /\bsort\b/i,
];

const severityRank: Record<RiskSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const nextSeverity = (current: RiskSeverity, candidate: RiskSeverity) =>
  severityRank[candidate] > severityRank[current] ? candidate : current;

const inferUncoveredRequirementSeverity = (
  sentence: string,
  requirementRiskAnalysis: RequirementRiskAnalysis
): RiskSeverity => {
  let severity: RiskSeverity = "low";

  if (highSeverityPatterns.some((pattern) => pattern.test(sentence))) {
    severity = "high";
  } else if (mediumSeverityPatterns.some((pattern) => pattern.test(sentence))) {
    severity = "medium";
  }

  requirementRiskAnalysis.risks.forEach((risk) => {
    const normalizedRisk = `${risk.title} ${risk.summary}`.toLowerCase();
    const sentenceTokens = sentence
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3);

    if (sentenceTokens.some((token) => normalizedRisk.includes(token))) {
      severity = nextSeverity(severity, risk.severity);
    }
  });

  return severity;
};

export const buildUncoveredRequirementInsights = (
  uncoveredSentences: string[],
  requirementRiskAnalysis: RequirementRiskAnalysis
) =>
  uncoveredSentences.map((sentence, index) => {
    const severity = inferUncoveredRequirementSeverity(
      sentence,
      requirementRiskAnalysis
    );
    const suggestedPriority: "low" | "medium" | "high" =
      severity === "high" ? "high" : severity === "medium" ? "medium" : "low";

    return {
      id: `uncovered-${index}`,
      sentence,
      severity,
      suggestedPriority,
      actionHint:
        severity === "high"
          ? "Cover this before release review or signoff."
          : severity === "medium"
          ? "Plan coverage soon so this gap does not slip into execution."
          : "Capture this as supporting coverage when the core scope is stable.",
    };
  });

export const buildCoverageHotspots = (rows: TestCaseRow[]) =>
  Array.from(
    rows.reduce((accumulator, row) => {
      const area = inferArea(row);
      const current =
        accumulator.get(area) ??
        {
          area,
          total: 0,
          linked: 0,
          automated: 0,
          approved: 0,
          failed: 0,
          notRun: 0,
        };

      current.total += 1;
      if (row.issueId || row.issueKey) {
        current.linked += 1;
      }
      if ((row.automationStatus ?? "manual") === "automated") {
        current.automated += 1;
      }
      if ((row.reviewStatus ?? "draft") === "approved") {
        current.approved += 1;
      }
      if ((row.executionResult ?? "not-run") === "failed") {
        current.failed += 1;
      }
      if ((row.executionResult ?? "not-run") === "not-run") {
        current.notRun += 1;
      }

      accumulator.set(area, current);
      return accumulator;
    }, new Map<string, {
      area: string;
      total: number;
      linked: number;
      automated: number;
      approved: number;
      failed: number;
      notRun: number;
    }>())
  )
    .map(([, value]) => ({
      ...value,
      riskPercent:
        value.total === 0
          ? 0
          : Math.round(((value.failed + value.notRun) / value.total) * 100),
    }))
    .sort((left, right) => right.riskPercent - left.riskPercent);

export const buildAutomationCandidateInsights = (rows: TestCaseRow[]) =>
  rows
    .map((row) => {
      const reasons: string[] = [];
      let score = 0;
      const provider = inferAutomationProvider(row);
      const strongThreshold = getAutomationStrongThreshold(provider);
      const normalizedSteps = row.steps.trim().toLowerCase();
      const normalizedExpected = row.expectedResult.trim().toLowerCase();
      const normalizedTitle = row.title.trim().toLowerCase();
      const normalizedData = row.testData?.trim().toLowerCase() ?? "";
      const hasStructuredSteps = normalizedSteps.length > 0 && /(\n|- |\d+\.)/.test(row.steps);
      const hasExpectedResult = normalizedExpected.length > 0;
      const hasStableSignals = [
        /\blogin\b/,
        /\bsearch\b/,
        /\bfilter\b/,
        /\bnavigation\b/,
        /\bcreate\b/,
        /\bupdate\b/,
        /\bsubmit\b/,
        /\bapi\b/,
      ].some((pattern) => pattern.test(normalizedTitle) || pattern.test(normalizedSteps));
      const hasDataDefined = normalizedData.length > 0;
      const isAlreadyAutomated = (row.automationStatus ?? "manual") === "automated";
      const isCandidate = (row.automationStatus ?? "manual") === "candidate";
      const isBlocked = (row.executionResult ?? "not-run") === "blocked";

      if (hasStructuredSteps) {
        score += 25;
        reasons.push("Has structured repeatable steps");
      }

      if (hasExpectedResult) {
        score += 20;
        reasons.push("Expected result is clearly defined");
      }

      if (hasStableSignals) {
        score += 20;
        reasons.push("Looks like a stable repeatable workflow");
      }

      if (hasDataDefined) {
        score += 10;
        reasons.push("Test data is already captured");
      }

      if ((row.reviewStatus ?? "draft") === "approved") {
        score += 10;
        reasons.push("Case is already approved");
      }

      if ((row.executionResult ?? "not-run") === "passed") {
        score += 10;
        reasons.push("Has a passing manual execution signal");
      }

      if ((row.priority ?? "medium") === "highest" || (row.priority ?? "medium") === "high") {
        score += 10;
        reasons.push("High-value coverage path");
      }

      if (isBlocked) {
        score -= 15;
        reasons.push("Currently blocked in execution");
      }

      if (isAlreadyAutomated) {
        score = Math.max(score, 95);
      } else if (isCandidate) {
        score = Math.max(score, 70);
      }

      const normalizedScore = Math.max(0, Math.min(100, score));
      const isStrongCandidate =
        !isAlreadyAutomated && normalizedScore >= strongThreshold;

      return {
        rowId: row.id,
        title: row.title.trim() || "Untitled test case",
        area: inferArea(row),
        automationStatus: row.automationStatus ?? "manual",
        provider,
        automationReference: row.automationReference?.trim() || "",
        strongThreshold,
        isStrongCandidate,
        score: normalizedScore,
        recommendation:
          isAlreadyAutomated
            ? "Already automated"
            : isStrongCandidate
            ? "Strong automation candidate"
            : normalizedScore >= Math.max(50, strongThreshold - 20)
            ? "Worth evaluating for automation"
            : "Keep manual for now",
        reasons: reasons.slice(0, 4),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.title.localeCompare(right.title);
    });

export const buildCaseManagementSummary = (
  project: Project,
  caseQualityAnalysis: CaseQualityAnalysis
) => {
  const rows = project.rows;
  const now = Date.now();
  const automationInsights = buildAutomationCandidateInsights(rows);
  const automationProviderSummary = buildAutomationProviderSummary(rows);
  const automationCounts = rows.reduce<Record<TestCaseAutomationStatus, number>>(
    (accumulator, row) => {
      const key = row.automationStatus ?? "manual";
      accumulator[key] += 1;
      return accumulator;
    },
    {
      manual: 0,
      candidate: 0,
      automated: 0,
    }
  );

  const archivedCount = rows.filter((row) => row.archived).length;
  const unreviewedCount = rows.filter(
    (row) =>
      (row.reviewStatus ?? "draft") === "draft" ||
      (row.reviewStatus ?? "draft") === "changes-requested"
  ).length;
  const agingCount = rows.filter((row) => {
    const updatedAt = row.updatedAt ?? row.createdAt ?? now;
    return now - updatedAt > 1000 * 60 * 60 * 24 * 14;
  }).length;

  return {
    totalCases: rows.length,
    archivedCount,
    unreviewedCount,
    agingCount,
    linkedCoveragePercent:
      rows.length === 0
        ? 0
        : Math.round(
            (rows.filter((row) => row.issueId || row.issueKey).length / rows.length) *
              100
          ),
    automationCoveragePercent:
      rows.length === 0
        ? 0
        : Math.round((automationCounts.automated / rows.length) * 100),
    automationCounts,
    automationProviderSummary,
    automationReadyCount: automationInsights.filter(
      (entry) =>
        entry.automationStatus !== "automated" &&
        entry.isStrongCandidate
    ).length,
    automationCandidateInsights: automationInsights.slice(0, 5),
    duplicateCount: caseQualityAnalysis.findings.filter(
      (finding) => finding.type === "duplicate"
    ).length,
    weakCaseCount: caseQualityAnalysis.findings.filter(
      (finding) => finding.type === "weak" || finding.type === "low-value"
    ).length,
  };
};
