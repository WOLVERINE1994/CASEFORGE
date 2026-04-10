import { inferTestCaseType } from "./parser";
import { suggestTestData } from "./test-data";

export type LifecycleStatus =
  | "keep"
  | "new"
  | "obsolete"
  | "needs-review"
  | "needs-update";

export type TestCaseWorkflowStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "blocked"
  | "done";

export type TestCasePriority = "highest" | "high" | "medium" | "low";

export type TestCaseExecutionResult =
  | "not-run"
  | "passed"
  | "failed"
  | "blocked";

export type TestCaseAutomationStatus =
  | "manual"
  | "candidate"
  | "automated";

export type SourceArtifactType =
  | "jira"
  | "prd"
  | "api-spec"
  | "user-story"
  | "changelog";

export type SignoffStatus =
  | "draft"
  | "in-review"
  | "approved"
  | "changes-requested";

export type TestCaseReviewStatus =
  | "draft"
  | "in-review"
  | "approved"
  | "changes-requested";

export type SourceArtifact = {
  id: string;
  type: SourceArtifactType;
  title: string;
  rawContent: string;
  normalizedContent: string;
  importedAt: number;
};

export type AuditEntry = {
  id: string;
  action: string;
  detail: string;
  createdAt: number;
  actorName?: string;
  actorEmail?: string;
};

export type TestCaseComment = {
  id: string;
  body: string;
  createdAt: number;
  mentions?: Array<{
    label: string;
    matchedUserId?: string;
  }>;
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
  resolvedAt?: number;
  resolvedBy?: {
    id?: string;
    name?: string;
    email?: string;
  };
};

export type TestCaseWatcher = {
  id: string;
  name?: string;
  email?: string;
  addedAt: number;
};

export type ReviewerNotification = {
  id: string;
  type: "case-mention" | "case-watch" | "template-operation";
  createdAt: number;
  title: string;
  detail: string;
  severity?: "low" | "medium" | "high";
  baseSeverity?: "low" | "medium" | "high";
  severityLifted?: boolean;
  severityLiftReason?: "source" | "import" | "export";
  operation?: "import" | "export";
  sourceLabel?: string;
  rowId?: string;
  commentId?: string;
  recipientId?: string;
  recipientLabel?: string;
  readAt?: number;
  archivedAt?: number;
};

export type TestCaseVersionEntry = {
  id: string;
  createdAt: number;
  reason: string;
  rowSnapshot: TestCaseRow;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
};

export type CaseReviewHistoryEntry = {
  id: string;
  createdAt: number;
  action: string;
  detail: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
};

export type TestDataSet = {
  id: string;
  name: string;
  description?: string;
  content: string;
  updatedAt: number;
};

export type CaseTemplate = {
  id: string;
  name: string;
  externalTemplateId?: string;
  packVersion?: number;
  category?: "general" | "provider-starter";
  pinned?: boolean;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
  automationProvider?: string;
  automationReference?: string;
  sourceProjectName?: string;
  sourceExportedAt?: string;
  sourceExportedBy?: string;
  updatedAt: number;
};

export type ProjectViewPreferences = {
  casesDefaultPreset?: "default" | "review-queue" | "failed-linked";
  runsDefaultPreset?: "default" | "high-risk" | "failed-linked";
  casesDefaultSavedViewId?: string;
  runsDefaultSavedViewId?: string;
};

export type CasesSavedView = {
  id: string;
  name: string;
  pinned?: boolean;
  filters: {
    searchQuery: string;
    assignee: string;
    priority: TestCaseRow["priority"] | "";
    linked: "all" | "linked" | "unlinked";
      execution: TestCaseRow["executionResult"] | "";
      review: TestCaseRow["reviewStatus"] | "";
      reviewHealth: "" | "open-notes" | "history";
    collaboration: "" | "watching" | "mentioned" | "attention";
    suite: string;
    component: string;
    automation: TestCaseRow["automationStatus"] | "";
    automationProvider: string;
    archived: "active" | "archived" | "all";
  };
  updatedAt: number;
};

export type RunsSavedView = {
  id: string;
  name: string;
  pinned?: boolean;
  filters: {
    searchQuery: string;
    execution: TestCaseExecutionResult | "";
    linked: "all" | "linked" | "unlinked";
    highRiskOnly: boolean;
  };
  updatedAt: number;
};

export type ReleaseReviewState = {
  reviewedReasonIds: string[];
  reviewedActionIds: string[];
  lastReviewedAt?: number;
  recordedDecision?: "safe" | "caution" | "blocked";
  decisionNote?: string;
  decisionRecordedAt?: number;
  decisionRecordedBy?: {
    id?: string;
    name?: string;
    email?: string;
  };
  waivedAutomationProviders?: Array<{
    provider: string;
    note?: string;
    recordedAt: number;
    recordedBy?: {
      id?: string;
      name?: string;
      email?: string;
    };
  }>;
  snapshots?: Array<{
    id: string;
    recordedDecision: "safe" | "caution" | "blocked";
    decisionNote?: string;
    decisionRecordedAt: number;
    recordedBy?: {
      id?: string;
      name?: string;
      email?: string;
    };
    score: number;
    level: "safe" | "caution" | "blocked";
    recommendation: string;
    automationCoveragePercent?: number;
    automatedCases?: number;
    candidateCases?: number;
    automationReadyCases?: number;
    automationProviders?: Array<{
      provider: string;
      count: number;
    }>;
    waivedAutomationProviders?: Array<{
      provider: string;
      note?: string;
    }>;
    automationHotspots?: Array<{
      area: string;
      automated: number;
      candidate: number;
      strongReady: number;
      rowIds?: string[];
    }>;
  }>;
};

export type TestRunRecord = {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  rowResults: Record<string, TestCaseExecutionResult>;
  rowActualResults: Record<string, string>;
  rowNotes: Record<string, string>;
  rowStepResults: Record<string, Record<string, TestCaseExecutionResult>>;
  rowStepNotes: Record<string, Record<string, string>>;
  rowStepActualResults: Record<string, Record<string, string>>;
  rowStepEvidence: Record<string, Record<string, string>>;
  linkedDefectIds: Record<string, string[]>;
  createdAt: number;
  updatedAt: number;
};

export type TestCaseRow = {
  id: string;
  issueId?: string;
  issueKey?: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
  workflowStatus?: TestCaseWorkflowStatus;
  priority?: TestCasePriority;
  executionResult?: TestCaseExecutionResult;
  reviewStatus?: TestCaseReviewStatus;
  reviewOwner?: string;
  suiteName?: string;
  componentArea?: string;
  testDataSetId?: string;
  automationStatus?: TestCaseAutomationStatus;
  automationProvider?: string;
  automationReference?: string;
  archived?: boolean;
  assignee?: string;
  labels?: string[];
  gapSourceId?: string;
  gapSourceLabel?: string;
  gapSourceMethod?: "auto" | "manual";
  predictionSourceId?: string;
  predictionSourceLabel?: string;
  predictionSourceMethod?: "auto" | "manual";
  changeSourceLabel?: string;
  changeSourceType?: "new" | "updated";
  lifecycleStatus?: LifecycleStatus;
  createdAt?: number;
  updatedAt?: number;
};

export type GenerationMode =
  | "functional"
  | "negative"
  | "edge"
  | "ui"
  | "api"
  | "regression";

export type CoverageDepth = "basic" | "standard" | "thorough";

export type Persona =
  | "all"
  | "admin"
  | "guest"
  | "first-time-user"
  | "returning-user"
  | "blocked-user";

export const personaLabels: Record<Persona, string> = {
  all: "All Users",
  admin: "Admin",
  guest: "Guest",
  "first-time-user": "First-Time User",
  "returning-user": "Returning User",
  "blocked-user": "Blocked User",
};

export const sourceArtifactLabels: Record<SourceArtifactType, string> = {
  jira: "Jira Story",
  prd: "PRD",
  "api-spec": "API Spec",
  "user-story": "User Story",
  changelog: "Changelog",
};

export const signoffStatusLabels: Record<SignoffStatus, string> = {
  draft: "Draft",
  "in-review": "In Review",
  approved: "Approved",
  "changes-requested": "Changes Requested",
};

export const workflowStatusLabels: Record<TestCaseWorkflowStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  blocked: "Blocked",
  done: "Done",
};

export const priorityLabels: Record<TestCasePriority, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const executionResultLabels: Record<TestCaseExecutionResult, string> = {
  "not-run": "Not Run",
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
};

export const automationStatusLabels: Record<TestCaseAutomationStatus, string> = {
  manual: "Manual",
  candidate: "Candidate",
  automated: "Automated",
};

export const automationProviderOptions = [
  "Playwright",
  "Cypress",
  "Postman",
  "Selenium",
  "Jest/Vitest",
  "API Automation",
  "UI Automation",
  "Unspecified",
] as const;

export const normalizeAutomationProvider = (value: string | undefined | null) => {
  const trimmedValue = value?.trim() || "";
  if (!trimmedValue) {
    return "";
  }

  return automationProviderOptions.includes(
    trimmedValue as (typeof automationProviderOptions)[number]
  )
    ? trimmedValue
    : "";
};

export const reviewStatusLabels: Record<TestCaseReviewStatus, string> = {
  draft: "Draft",
  "in-review": "In Review",
  approved: "Approved",
  "changes-requested": "Changes Requested",
};

export const parseLabels = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export type Project = {
  id: string;
  name: string;
  projectKey?: string;
  sprintName?: string;
  releaseName?: string;
  teamName?: string;
  input: string;
  oldRequirement?: string;
  rows: TestCaseRow[];
  generationMode: GenerationMode;
  coverageDepth: CoverageDepth;
  persona: Persona;
  autosaveEnabled: boolean;
  sourceArtifacts: SourceArtifact[];
  reviewerName: string;
  reviewerNotes: string;
  signoffStatus: SignoffStatus;
  auditTrail: AuditEntry[];
  caseComments?: Record<string, TestCaseComment[]>;
  caseWatchers?: Record<string, TestCaseWatcher[]>;
  notifications?: ReviewerNotification[];
  caseVersionHistory?: Record<string, TestCaseVersionEntry[]>;
  caseReviewHistory?: Record<string, CaseReviewHistoryEntry[]>;
  testDataSets?: TestDataSet[];
  caseTemplates?: CaseTemplate[];
  viewPreferences?: ProjectViewPreferences;
  savedViews?: {
    cases: CasesSavedView[];
    runs: RunsSavedView[];
  };
  releaseReview?: ReleaseReviewState;
  runs?: TestRunRecord[];
  activeRunId?: string;
  lastGeneratedChangeImpactSignature?: string | null;
  latestChangeEntries?: Array<{
    id: string;
    type: "added" | "removed" | "changed";
    oldSentence?: string;
    newSentence?: string;
    summary: string;
  }>;
  changeComparisonCount?: number;
  activeRequirementId?: string;
  requirementCount?: number;
  testCaseCount?: number;
  createdAt: number;
  updatedAt: number;
};

export const formatTestCaseId = (index: number) =>
  `TC${String(index + 1).padStart(3, "0")}`;

export const modePrimaryType: Record<GenerationMode, TestCaseRow["type"]> = {
  functional: "Functional",
  negative: "Negative",
  edge: "Edge",
  ui: "UI",
  api: "API",
  regression: "Regression",
};

const allowedTypesByMode: Record<GenerationMode, TestCaseRow["type"][]> = {
  functional: ["Functional", "Negative", "Edge"],
  negative: ["Negative", "Edge"],
  edge: ["Edge", "Negative"],
  ui: ["UI", "Negative", "Edge"],
  api: ["API", "Negative", "Edge"],
  regression: ["Regression", "Functional"],
};

export const resolveTypeForMode = (
  mode: GenerationMode,
  row: Pick<TestCaseRow, "title" | "preconditions" | "steps" | "expectedResult">,
  preferredType?: string
) => {
  const inferredType =
    preferredType ||
    inferTestCaseType({
      title: row.title,
      preconditions: row.preconditions,
      steps: row.steps,
      expectedResult: row.expectedResult,
    });

  return allowedTypesByMode[mode].includes(inferredType)
    ? inferredType
    : modePrimaryType[mode];
};

export const normalizeRows = (rows: TestCaseRow[], mode: GenerationMode) =>
  rows.map((row, index) => ({
    id: row.id || formatTestCaseId(index),
    issueId: row.issueId?.trim() || undefined,
    issueKey: row.issueKey?.trim() || undefined,
    title: row.title || "",
    preconditions: row.preconditions || "",
    steps: row.steps || "",
    expectedResult: row.expectedResult || "",
    testData:
      row.testData?.trim() ||
      suggestTestData({
        type: row.type,
        title: row.title || "",
        preconditions: row.preconditions || "",
        steps: row.steps || "",
        expectedResult: row.expectedResult || "",
      }),
    workflowStatus: row.workflowStatus ?? "backlog",
    priority: row.priority ?? "medium",
    executionResult: row.executionResult ?? "not-run",
    reviewStatus: row.reviewStatus ?? "draft",
    reviewOwner: row.reviewOwner?.trim() || "",
    suiteName: row.suiteName?.trim() || "",
    componentArea: row.componentArea?.trim() || "",
    testDataSetId: row.testDataSetId?.trim() || undefined,
    automationStatus: row.automationStatus ?? "manual",
    automationProvider: normalizeAutomationProvider(row.automationProvider),
    automationReference: row.automationReference?.trim() || "",
    archived: row.archived ?? false,
    assignee: row.assignee?.trim() || "",
    labels: parseLabels(row.labels),
    gapSourceId: row.gapSourceId,
    gapSourceLabel: row.gapSourceLabel,
    gapSourceMethod: row.gapSourceMethod,
    predictionSourceId: row.predictionSourceId,
    predictionSourceLabel: row.predictionSourceLabel,
    predictionSourceMethod: row.predictionSourceMethod,
    changeSourceLabel: row.changeSourceLabel,
    changeSourceType: row.changeSourceType,
    lifecycleStatus: row.lifecycleStatus,
    createdAt: row.createdAt ?? Date.now(),
    updatedAt: row.updatedAt ?? row.createdAt ?? Date.now(),
    type: resolveTypeForMode(
      mode,
      {
        title: row.title || "",
        preconditions: row.preconditions || "",
        steps: row.steps || "",
        expectedResult: row.expectedResult || "",
      },
      row.type
    ),
  }));

const sanitizeGeneratedInlineText = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();

const normalizeGeneratedListField = (value: string) => {
  const segments = value
    .split(/\n|;/)
    .map((segment) =>
      sanitizeGeneratedInlineText(
        segment.replace(/^\s*\d+[\).\s-]*/, "")
      )
    )
    .filter(
      (segment) => segment && !/^(none|n\/a|na|not applicable)$/i.test(segment)
    );

  return Array.from(
    new Map(
      segments.map((segment) => [
        segment.toLowerCase(),
        segment.charAt(0).toUpperCase() + segment.slice(1),
      ])
    ).values()
  ).join("; ");
};

const normalizeGeneratedTitle = (value: string, fallbackType: string, index: number) => {
  const cleaned = sanitizeGeneratedInlineText(
    value
      .replace(/^(title|scenario|test case)\s*:\s*/i, "")
      .replace(/^\d+[\).\s-]*/, "")
  );

  if (cleaned) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return `${fallbackType} coverage scenario ${index + 1}`;
};

const normalizeGeneratedExpectedResult = (value: string) =>
  sanitizeGeneratedInlineText(
    value.replace(/^(expected result|result|outcome)\s*:\s*/i, "")
  );

const buildGeneratedRowSignature = (row: TestCaseRow) =>
  [
    row.type,
    row.title,
    row.preconditions,
    row.steps,
    row.expectedResult,
    row.testData ?? "",
  ]
    .map((value) => sanitizeGeneratedInlineText(value).toLowerCase())
    .join("|");

export const prepareGeneratedRows = (rows: TestCaseRow[], mode: GenerationMode) => {
  const cleanedRows = rows
    .map((row, index) => {
      const normalizedType = resolveTypeForMode(
        mode,
        {
          title: row.title || "",
          preconditions: row.preconditions || "",
          steps: row.steps || "",
          expectedResult: row.expectedResult || "",
        },
        row.type
      );

      return {
        ...row,
        type: normalizedType,
        title: normalizeGeneratedTitle(row.title || "", normalizedType, index),
        preconditions: normalizeGeneratedListField(row.preconditions || ""),
        steps: normalizeGeneratedListField(row.steps || ""),
        expectedResult: normalizeGeneratedExpectedResult(row.expectedResult || ""),
        testData: normalizeGeneratedListField(row.testData || ""),
      };
    })
    .filter(
      (row) =>
        row.title.trim() &&
        row.steps.trim() &&
        row.expectedResult.trim()
    );

  const uniqueRows: TestCaseRow[] = [];
  const seen = new Set<string>();

  cleanedRows.forEach((row) => {
    const signature = buildGeneratedRowSignature(row);
    if (seen.has(signature)) {
      return;
    }

    seen.add(signature);
    uniqueRows.push(row);
  });

  return normalizeRows(
    uniqueRows.map((row, index) => ({
      ...row,
      id: formatTestCaseId(index),
    })),
    mode
  );
};

export const mergeRows = (
  currentRows: TestCaseRow[],
  incomingRows: TestCaseRow[],
  mode: GenerationMode
) =>
  normalizeRows(
    [
      ...currentRows,
      ...incomingRows.map((row, index) => ({
        ...row,
        id: formatTestCaseId(currentRows.length + index),
      })),
    ],
    mode
  ).map((row, index) => ({
    ...row,
    id: formatTestCaseId(index),
  }));

export const buildTypeCounts = (rows: TestCaseRow[]) =>
  Array.from(
    rows.reduce((accumulator, row) => {
      const key = row.type || "Functional";
      accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>())
  )
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count);

export const toDisplayLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const toPersonaLabel = (persona: Persona) => personaLabels[persona];
