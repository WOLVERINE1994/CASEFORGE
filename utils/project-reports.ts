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
  projectContext: {
    name: string;
    routeRef: string;
    projectKey?: string;
    sprintName?: string;
    releaseName?: string;
    teamName?: string;
    requirementText?: string;
    sourceArtifacts: Array<{
      id: string;
      title: string;
      type: string;
    }>;
    activeRunName?: string;
    activeRunId?: string;
    generatedAt: number;
  };
  domainInsights: {
    securityCases: number;
    accessibilityCases: number;
    highRiskSecurityCases: number;
    failedHighRiskSecurityCases: number;
    wcagTaggedCases: number;
  };
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
  executionDetails: Array<{
    rowId: string;
    title: string;
    type: string;
    scenario: string;
    preconditions: string;
    steps: string;
    expectedResult: string;
    testData?: string;
    executionResult: TestCaseExecutionResult;
    workflowStatus?: string;
    priority?: string;
    reviewStatus?: string;
    automationStatus?: string;
    automationProvider?: string;
    latestAutomationStatus?: "not-run" | "passed" | "failed" | "blocked";
    latestAutomationFailureMessage?: string;
    artifactPaths: string[];
    linkedIssueId?: string;
    linkedIssueKey?: string;
    runId?: string;
    runName?: string;
    failedSteps: number;
    blockedSteps: number;
    actualResult?: string;
    notes?: string;
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

const htmlEscape = (value: string | number | undefined | null) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMultilineHtml = (value: string | undefined | null) => {
  const text = (value ?? "").trim();
  if (!text) {
    return "<span class=\"muted\">Not captured.</span>";
  }

  return htmlEscape(text).replace(/\n/g, "<br />");
};

const toHtmlList = (items: string[]) =>
  items.length > 0
    ? `<ul>${items.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul>`
    : '<span class="muted">None</span>';

export const buildExecutionReportCsv = (
  summary: ProjectReportsSummary,
  projectName: string
) => {
  const lines = [
    ["Project", projectName],
    ["Security Cases", summary.domainInsights.securityCases],
    ["Accessibility Cases", summary.domainInsights.accessibilityCases],
    ["High Risk Security Cases", summary.domainInsights.highRiskSecurityCases],
    [
      "Failed High Risk Security Cases",
      summary.domainInsights.failedHighRiskSecurityCases,
    ],
    ["WCAG Tagged Cases", summary.domainInsights.wcagTaggedCases],
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

export const buildExecutionReportHtml = (
  summary: ProjectReportsSummary,
  projectName: string,
  options?: {
    appBaseUrl?: string;
  }
) => {
  const generatedAt = formatUtcDate(summary.projectContext.generatedAt);
  const requirementText = summary.projectContext.requirementText?.trim() || "";
  const sourceArtifacts = summary.projectContext.sourceArtifacts;
  const normalizedBaseUrl = options?.appBaseUrl?.trim().replace(/\/$/, "") || "";
  const projectRouteRef = summary.projectContext.routeRef?.trim();
  const casesUrl =
    normalizedBaseUrl && projectRouteRef
      ? `${normalizedBaseUrl}/projects/${encodeURIComponent(projectRouteRef)}/cases`
      : "";
  const runsUrl =
    normalizedBaseUrl && projectRouteRef
      ? `${normalizedBaseUrl}/projects/${encodeURIComponent(projectRouteRef)}/runs`
      : "";
  const issuesUrl =
    normalizedBaseUrl && projectRouteRef
      ? `${normalizedBaseUrl}/projects/${encodeURIComponent(projectRouteRef)}/issues`
      : "";

  const renderChip = (label: string, href?: string) =>
    href
      ? `<a class="chip chip-link" href="${htmlEscape(href)}" target="_blank" rel="noreferrer">${htmlEscape(
          label
        )}</a>`
      : `<span class="chip">${htmlEscape(label)}</span>`;

  const executionRowsMarkup = summary.executionDetails
    .map((entry) => {
      const toneClass =
        entry.executionResult === "passed"
          ? "tone-passed"
          : entry.executionResult === "failed"
          ? "tone-failed"
          : entry.executionResult === "blocked"
          ? "tone-blocked"
          : "tone-not-run";
      const automationSummary = [
        entry.automationStatus ? `Case mode: ${entry.automationStatus}` : "",
        entry.automationProvider ? `Provider: ${entry.automationProvider}` : "",
        entry.latestAutomationStatus
          ? `Latest run: ${entry.latestAutomationStatus}`
          : "",
      ]
        .filter(Boolean)
        .join(" | ");

      return `
        <article class="case-card">
          <div class="case-header">
            <div>
              <p class="eyebrow">${htmlEscape(entry.rowId)} | ${htmlEscape(entry.type)}</p>
              <h3>${htmlEscape(entry.title)}</h3>
              <p class="meta">${htmlEscape(entry.runName ?? "No named run")} | ${htmlEscape(
                entry.executionResult
              )}${entry.linkedIssueKey ? ` | Issue ${htmlEscape(entry.linkedIssueKey)}` : ""}</p>
            </div>
            <span class="status-pill ${toneClass}">${htmlEscape(entry.executionResult)}</span>
          </div>
          <div class="case-grid">
            <div>
              <h4>Scenario</h4>
              <p>${formatMultilineHtml(entry.scenario)}</p>
            </div>
            <div>
              <h4>Expected Result</h4>
              <p>${formatMultilineHtml(entry.expectedResult)}</p>
            </div>
            <div>
              <h4>Preconditions</h4>
              <p>${formatMultilineHtml(entry.preconditions)}</p>
            </div>
            <div>
              <h4>Test Data</h4>
              <p>${formatMultilineHtml(entry.testData)}</p>
            </div>
          </div>
          <div class="stack">
            <div>
              <h4>Steps</h4>
              <p>${formatMultilineHtml(entry.steps)}</p>
            </div>
            <div class="chips">
              ${renderChip(`Workflow: ${entry.workflowStatus ?? "n/a"}`, casesUrl || undefined)}
              ${renderChip(`Priority: ${entry.priority ?? "n/a"}`, casesUrl || undefined)}
              ${renderChip(`Review: ${entry.reviewStatus ?? "n/a"}`, casesUrl || undefined)}
              ${renderChip(`Failed steps: ${entry.failedSteps}`, runsUrl || undefined)}
              ${renderChip(`Blocked steps: ${entry.blockedSteps}`, runsUrl || undefined)}
              ${
                entry.linkedIssueKey
                  ? renderChip(`Issue: ${entry.linkedIssueKey}`, issuesUrl || undefined)
                  : ""
              }
            </div>
            <div>
              <h4>Execution Notes</h4>
              <p>${formatMultilineHtml(entry.notes)}</p>
            </div>
            <div>
              <h4>Actual Result</h4>
              <p>${formatMultilineHtml(entry.actualResult)}</p>
            </div>
            <div>
              <h4>Automation</h4>
              <p>${automationSummary ? htmlEscape(automationSummary) : '<span class="muted">Manual or not configured.</span>'}</p>
              ${
                entry.latestAutomationFailureMessage
                  ? `<p class="failure-copy">${htmlEscape(entry.latestAutomationFailureMessage)}</p>`
                  : ""
              }
            </div>
            <div>
              <h4>Artifacts</h4>
              ${toHtmlList(entry.artifactPaths)}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(projectName)} Execution Report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --panel: #ffffff;
        --border: #d7deea;
        --text: #111827;
        --muted: #6b7280;
        --passed: #166534;
        --passed-bg: #dcfce7;
        --failed: #be123c;
        --failed-bg: #ffe4e6;
        --blocked: #b45309;
        --blocked-bg: #fef3c7;
        --notrun: #475569;
        --notrun-bg: #e2e8f0;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        background: var(--bg);
        color: var(--text);
        font: 14px/1.5 "Segoe UI", Arial, sans-serif;
      }
      .report {
        max-width: 1180px;
        margin: 0 auto;
        display: grid;
        gap: 20px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 24px;
      }
      .hero {
        display: grid;
        gap: 18px;
      }
      .eyebrow {
        margin: 0;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 11px;
        font-weight: 700;
      }
      h1, h2, h3, h4, p { margin: 0; }
      h1 { font-size: 32px; line-height: 1.15; }
      h2 { font-size: 22px; }
      h3 { font-size: 18px; }
      h4 {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .subtle { color: var(--muted); }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
      }
      .stat {
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
        background: #fafbfd;
      }
      .stat strong {
        display: block;
        font-size: 24px;
        margin-top: 8px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip, .status-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 10px;
        border: 1px solid var(--border);
        background: #f8fafc;
        font-size: 12px;
        font-weight: 600;
      }
      .chip-link {
        color: inherit;
        text-decoration: none;
        transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .chip-link:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
        background: #eef2ff;
      }
      .tone-passed { background: var(--passed-bg); color: var(--passed); border-color: #86efac; }
      .tone-failed { background: var(--failed-bg); color: var(--failed); border-color: #fda4af; }
      .tone-blocked { background: var(--blocked-bg); color: var(--blocked); border-color: #fcd34d; }
      .tone-not-run { background: var(--notrun-bg); color: var(--notrun); border-color: #cbd5e1; }
      .context-grid, .case-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .case-card {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
        background: #fcfdff;
      }
      .case-header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }
      .meta {
        color: var(--muted);
        margin-top: 6px;
      }
      .stack {
        display: grid;
        gap: 14px;
        margin-top: 16px;
      }
      .muted { color: var(--muted); }
      .failure-copy {
        margin-top: 8px;
        color: var(--failed);
        font-weight: 600;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      @media print {
        body { padding: 0; background: #fff; }
        .panel, .case-card, .stat { box-shadow: none; break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main class="report">
      <section class="panel hero">
        <div>
          <p class="eyebrow">Execution Report</p>
          <h1>${htmlEscape(projectName)}</h1>
          <p class="subtle">Generated ${htmlEscape(generatedAt)}${
            summary.projectContext.projectKey
              ? ` | Project Key ${htmlEscape(summary.projectContext.projectKey)}`
              : ""
          }${
            summary.projectContext.activeRunName
              ? ` | Run ${htmlEscape(summary.projectContext.activeRunName)}`
              : ""
          }</p>
        </div>
        <div class="stats">
          <div class="stat"><span>Security Cases</span><strong>${summary.domainInsights.securityCases}</strong></div>
          <div class="stat"><span>Accessibility Cases</span><strong>${summary.domainInsights.accessibilityCases}</strong></div>
          <div class="stat"><span>High-Risk Security</span><strong>${summary.domainInsights.highRiskSecurityCases}</strong></div>
          <div class="stat"><span>Failed High-Risk Security</span><strong>${summary.domainInsights.failedHighRiskSecurityCases}</strong></div>
          <div class="stat"><span>Total Tests</span><strong>${summary.executionSummary.total}</strong></div>
          <div class="stat"><span>Passed</span><strong>${summary.executionSummary.passed}</strong></div>
          <div class="stat"><span>Failed</span><strong>${summary.executionSummary.failed}</strong></div>
          <div class="stat"><span>Blocked</span><strong>${summary.executionSummary.blocked}</strong></div>
          <div class="stat"><span>Not Run</span><strong>${summary.executionSummary.notRun}</strong></div>
          <div class="stat"><span>Release Signal</span><strong>${htmlEscape(summary.releaseSignal.level)}</strong></div>
        </div>
        <div class="chips">
          <span class="chip">Linked Coverage: ${summary.linkedCoveragePercent}%</span>
          <span class="chip">Automation Coverage: ${summary.automationCoveragePercent}%</span>
          <span class="chip">Open Issues: ${summary.openIssues}</span>
          <span class="chip">Blockers: ${summary.blockerIssues}</span>
          <span class="chip">WCAG Tagged: ${summary.domainInsights.wcagTaggedCases}</span>
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Scenario Context</p>
        <h2>What this run was validating</h2>
        <div class="context-grid" style="margin-top: 16px;">
          <div>
            <h4>Requirement</h4>
            <p>${formatMultilineHtml(requirementText)}</p>
          </div>
          <div>
            <h4>Project Context</h4>
            <p>${formatMultilineHtml(
              [
                summary.projectContext.teamName
                  ? `Team: ${summary.projectContext.teamName}`
                  : "",
                summary.projectContext.releaseName
                  ? `Release: ${summary.projectContext.releaseName}`
                  : "",
                summary.projectContext.sprintName
                  ? `Sprint: ${summary.projectContext.sprintName}`
                  : "",
                `Release signal: ${summary.releaseSignal.summary}`,
              ]
                .filter(Boolean)
                .join("\n")
            )}</p>
          </div>
        </div>
        <div style="margin-top: 16px;">
          <h4>Linked Source Artifacts</h4>
          ${
            sourceArtifacts.length > 0
              ? toHtmlList(
                  sourceArtifacts.map((artifact) => `${artifact.type}: ${artifact.title}`)
                )
              : '<span class="muted">No linked source artifacts were captured.</span>'
          }
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Execution Details</p>
        <h2>Case-by-case results</h2>
        <p class="subtle" style="margin-top: 8px;">Each case includes the scenario, expected outcome, actual run state, and any automation failure details or artifacts captured during execution.</p>
        <div class="stack" style="margin-top: 18px;">
          ${executionRowsMarkup || '<p class="muted">No execution records are available for this project yet.</p>'}
        </div>
      </section>
    </main>
  </body>
</html>`;
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
  const securityCases = rows.filter((row) => row.testDomain === "security").length;
  const accessibilityCases = rows.filter(
    (row) => row.testDomain === "accessibility"
  ).length;
  const highRiskSecurityCaseIds = rows
    .filter(
      (row) => row.testDomain === "security" && (row.riskLevel ?? "medium") === "high"
    )
    .map((row) => row.id);
  const wcagTaggedCases = rows.filter((row) =>
    (row.complianceReference ?? "").toLowerCase().includes("wcag")
  ).length;
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
  const automationArtifactsByExecution = (project?.automationArtifacts ?? []).reduce<
    Map<string, NonNullable<Project["automationArtifacts"]>>
  >((accumulator, artifact) => {
    const current = accumulator.get(artifact.executionId) ?? [];
    current.push(artifact);
    accumulator.set(artifact.executionId, current);
    return accumulator;
  }, new Map());
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
  const failedHighRiskSecurityCases = rows.filter((row) => {
    if (
      row.testDomain !== "security" ||
      (row.riskLevel ?? "medium") !== "high"
    ) {
      return false;
    }

    const executionResult =
      activeRun?.rowResults[row.id] ?? row.executionResult ?? "not-run";
    const latestAutomation = latestAutomationExecutionByCase.get(row.id);
    return executionResult === "failed" || latestAutomation?.status === "failed";
  }).length;
  const executionDetails = rows
    .map((row) => {
      const stepResults = activeRun?.rowStepResults[row.id] ?? {};
      const failedSteps = Object.values(stepResults).filter(
        (value) => value === "failed"
      ).length;
      const blockedSteps = Object.values(stepResults).filter(
        (value) => value === "blocked"
      ).length;
      const latestAutomation = latestAutomationExecutionByCase.get(row.id);
      const artifactPaths = latestAutomation
        ? (automationArtifactsByExecution.get(latestAutomation.id) ?? []).map(
            (artifact) => artifact.path
          )
        : [];

      return {
        rowId: row.id,
        title: row.title.trim() || "Untitled test case",
        type: row.type,
        scenario:
          [
            row.suiteName?.trim() ? `Suite: ${row.suiteName.trim()}` : "",
            row.componentArea?.trim() ? `Area: ${row.componentArea.trim()}` : "",
            row.title.trim(),
          ]
            .filter(Boolean)
            .join("\n") || "Scenario not captured",
        preconditions: row.preconditions,
        steps: row.steps,
        expectedResult: row.expectedResult,
        testData: row.testData,
        executionResult: activeRun?.rowResults[row.id] ?? row.executionResult ?? "not-run",
        workflowStatus: row.workflowStatus,
        priority: row.priority,
        reviewStatus: row.reviewStatus,
        automationStatus: row.automationStatus,
        automationProvider: row.automationProvider,
        latestAutomationStatus: latestAutomation?.status,
        latestAutomationFailureMessage: latestAutomation?.failureMessage,
        artifactPaths,
        linkedIssueId: row.issueId,
        linkedIssueKey: row.issueKey,
        runId: activeRun?.id,
        runName: activeRun?.name,
        failedSteps,
        blockedSteps,
        actualResult: activeRun?.rowActualResults[row.id] ?? "",
        notes: activeRun?.rowNotes[row.id] ?? "",
      };
    })
    .sort((left, right) => {
      const score = (result: TestCaseExecutionResult) =>
        result === "failed" ? 3 : result === "blocked" ? 2 : result === "passed" ? 1 : 0;

      return (
        score(right.executionResult) - score(left.executionResult) ||
        right.failedSteps - left.failedSteps ||
        left.rowId.localeCompare(right.rowId)
      );
    });
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
    projectContext: {
      name: project?.name ?? "Project",
      routeRef: project?.projectKey?.trim() || project?.id || "",
      projectKey: project?.projectKey,
      sprintName: project?.sprintName,
      releaseName: project?.releaseName,
      teamName: project?.teamName,
      requirementText: project?.input,
      sourceArtifacts: (project?.sourceArtifacts ?? []).map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
      })),
      activeRunName: activeRun?.name,
      activeRunId: activeRun?.id,
      generatedAt: Date.now(),
    },
    domainInsights: {
      securityCases,
      accessibilityCases,
      highRiskSecurityCases: highRiskSecurityCaseIds.length,
      failedHighRiskSecurityCases,
      wcagTaggedCases,
    },
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
    executionDetails,
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
