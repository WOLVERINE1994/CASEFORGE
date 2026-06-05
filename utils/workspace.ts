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

export type AutomationProvider =
  | "playwright"
  | "cypress"
  | "api"
  | "mobile";

export type AutomationBindingMode = "manual" | "automated" | "hybrid";
export type ApprovalState = "pending" | "approved" | "rejected";
export type TestCaseHandoffState =
  | "needs-qa-review"
  | "needs-automation"
  | "needs-product-signoff"
  | "release-blocking";

export type AutomationStepAction =
  | "goto"
  | "click"
  | "fill"
  | "select"
  | "press"
  | "wait-for"
  | "assert-element"
  | "assert-attribute"
  | "assert-style"
  | "assert-image"
  | "assert-text"
  | "assert-visible"
  | "assert-url"
  | "assert-value"
  | "run-block";

export type AutomationTargetType =
  | "selector"
  | "xpath"
  | "url"
  | "endpoint"
  | "text"
  | "role"
  | "label"
  | "placeholder"
  | "value"
  | "key"
  | "shared-block"
  | "selector-preset"
  | "route";

export type AutomationExecutionStatus =
  | "not-run"
  | "passed"
  | "failed"
  | "blocked";

export type AutomationStepExecutionStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "skipped";

export type AutomationValidationIssueField =
  | "step"
  | "action"
  | "targetType"
  | "targetValue"
  | "inputValue"
  | "expectedValue"
  | "assertionType"
  | "attributeName"
  | "cssProperty"
  | "locator"
  | "sharedBlockId"
  | "selectorPresetId"
  | "timeoutMs";

export type AutomationLocatorMode = "smart" | "manual";

export type AutomationLocatorStrategy =
  | "selector"
  | "xpath"
  | "text"
  | "role"
  | "label"
  | "placeholder";

export type AutomationLocatorCandidate = {
  id: string;
  strategy: AutomationLocatorStrategy;
  value: string;
  preview: string;
  label: string;
  reason: string;
  rank: number;
  roleName?: string;
  roleValue?: string;
  matchCount?: number;
  isUnique?: boolean;
  recommended?: boolean;
  refinedFrom?: string;
};

export type AutomationStepLocator = {
  mode: AutomationLocatorMode;
  strategy: AutomationLocatorStrategy;
  value: string;
  preview: string;
  roleName?: string;
  roleValue?: string;
  candidates?: AutomationLocatorCandidate[];
};

export type AutomationElementFingerprint = {
  tag?: string;
  text?: string;
  role?: string;
  ariaLabel?: string;
  placeholder?: string;
  label?: string;
  attributes?: Record<string, string>;
  parentText?: string;
  parentTag?: string;
  cssPath?: string;
  xpath?: string;
  boundingBox?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  confidenceScore?: number;
};

export type AutomationLocatorBundle = {
  primary: AutomationStepLocator;
  fallbacks: AutomationLocatorCandidate[];
  fingerprint?: AutomationElementFingerprint;
  confidenceScore?: number;
  generatedAt?: number;
};

export type AutomationLocatorHealingMetadata = {
  used: boolean;
  originalLocator?: AutomationStepLocator | AutomationLocatorCandidate;
  healedLocator?: AutomationLocatorCandidate;
  attemptedLocators?: Array<{
    locator: AutomationStepLocator | AutomationLocatorCandidate;
    matchCount?: number;
    reason: string;
    confidenceScore?: number;
  }>;
  confidenceScore?: number;
  reason?: string;
  accepted?: boolean;
};

export type AutomationLocatorApprovalStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "superseded";

export type AutomationLocatorApprovalRecord = {
  id: string;
  status: AutomationLocatorApprovalStatus;
  scenarioId?: string;
  scenarioName?: string;
  actionId?: string;
  actionName?: string;
  stepId: string;
  stepOrder?: number;
  stepAction?: AutomationStepAction;
  originalLocator?: AutomationStepLocator | AutomationLocatorCandidate;
  healedLocator?: AutomationLocatorCandidate;
  confidenceScore?: number;
  reason?: string;
  source: "self-healing" | "manual" | "regenerated";
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
};

export type AutomationVisualObjectStatus =
  | "approved"
  | "pending-review"
  | "needs-repair";

export type AutomationVisualObjectRecord = {
  id: string;
  name: string;
  status: AutomationVisualObjectStatus;
  primaryLocator?: AutomationStepLocator;
  fallbackCount: number;
  fingerprint?: AutomationElementFingerprint;
  confidenceScore?: number;
  usageCount: number;
  scenarioIds: string[];
  actionIds: string[];
  lastSeenAt?: number;
  updatedAt: number;
  approvalIds?: string[];
};

export type AutomationVisionMetadata = {
  used: boolean;
  mode: "fallback" | "assertion" | "debug" | "recording";
  targetText?: string;
  confidenceScore?: number;
  coordinates?: {
    x: number;
    y: number;
  };
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  candidates?: Array<{
    text?: string;
    role?: string;
    tag?: string;
    confidenceScore: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    reason: string;
  }>;
  screenshotPath?: string;
  explanation?: string;
};

export type AutomationElementAssertionType =
  | "exists"
  | "visible"
  | "hidden"
  | "not-present";

export type AutomationAssertionComparison =
  | "exact"
  | "contains"
  | "starts-with"
  | "ends-with"
  | "exists"
  | "does-not-exist";

export type AutomationImageAssertionType =
  | "exists"
  | "visible"
  | "src"
  | "alt"
  | "natural-size"
  | "loaded";

export type AutomationAttributeAssertion = {
  attributeName: string;
  comparison: AutomationAssertionComparison;
  expectedValue?: string;
};

export type AutomationStyleAssertion = {
  property: string;
  comparison: AutomationAssertionComparison;
  expectedValue?: string;
};

export type AutomationImageAssertion = {
  check: AutomationImageAssertionType;
  comparison?: AutomationAssertionComparison;
  expectedValue?: string;
};

export type AutomationValidationIssue = {
  code: string;
  message: string;
  stepId?: string;
  stepIndex?: number;
  field?: AutomationValidationIssueField;
  severity?: "error" | "warning";
};

export type AutomationValidationResult = {
  valid: boolean;
  errors: string[];
  issues: AutomationValidationIssue[];
};

export type AutomationArtifactType =
  | "log"
  | "screenshot"
  | "video"
  | "trace";

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

export type ActorAttribution = {
  id?: string;
  name?: string;
  email?: string;
  at?: number;
};

export type GeneratedCaseSnapshot = {
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
  type?: string;
  testDomain?: string;
  riskLevel?: string;
  labels?: string[];
};

export type GenerationFeedbackSignal =
  | "useful"
  | "needed-edits"
  | "low-quality"
  | "duplicate"
  | "missing-important-scenario";

export type GenerationFeedbackRecord = {
  rowId: string;
  sourceRequirement?: string;
  generationMode?: string;
  generatedAt?: number;
  originalGenerated?: GeneratedCaseSnapshot;
  finalEdited?: GeneratedCaseSnapshot;
  editDeltaSummary?: {
    changedFields: string[];
    changedFieldCount: number;
    editIntensity: "low" | "medium" | "high";
  };
  reviewSignal?: GenerationFeedbackSignal;
  disposition?: "accepted" | "rejected" | "regenerated";
  duplicateRemoved?: boolean;
  executionOutcome?: TestCaseExecutionResult;
  linkedIssueId?: string;
  linkedIssueKey?: string;
  lastUpdatedAt?: number;
};

export type AutomationReusableBlock = {
  id: string;
  name: string;
  description?: string;
  provider: AutomationProvider;
  steps: AutomationStep[];
  createdAt: number;
  updatedAt: number;
};

export type AutomationSelectorPreset = {
  id: string;
  name: string;
  selector: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
};

export type AutomationEnvironmentBinding = {
  id: string;
  name: string;
  baseUrl?: string;
  routePresets?: Record<string, string>;
  credentialAliases?: string[];
  platformDomain?: "salesforce";
  environmentScope?: string;
  salesforceOrgAlias?: string;
  salesforceUserAliases?: string[];
  salesforceProfileAliases?: string[];
  salesforceAppAliases?: string[];
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
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
    testDomain: NonNullable<TestCaseRow["testDomain"]> | "";
    riskLevel: NonNullable<TestCaseRow["riskLevel"]> | "";
    securityCategory: NonNullable<TestCaseRow["securityCategory"]> | "";
    accessibilityCategory: NonNullable<TestCaseRow["accessibilityCategory"]> | "";
    approvalState: NonNullable<TestCaseRow["approvalState"]> | "";
    handoffState: NonNullable<TestCaseRow["handoffState"]> | "";
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

export type AutomationExecutionMode = "headless" | "headed";

export type AutomationScriptSource = "case-linked" | "standalone";

export type AutomationScenarioPriority =
  | "highest"
  | "high"
  | "medium"
  | "low";

export type AutomationScenarioStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused";

export type AutomationSuiteStatus =
  | "draft"
  | "active"
  | "paused";

export type AutomationScenarioParameterizationMode =
  | "default-only"
  | "selected-dataset"
  | "all-datasets";

export type AutomationScheduleFrequency =
  | "once"
  | "daily"
  | "weekly"
  | "custom";

export type AutomationScheduleStatus =
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export type AutomationSuite = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  scenarioIds?: string[];
  tags?: string[];
  status?: AutomationSuiteStatus;
  environmentBindingId?: string;
  createdAt: number;
  updatedAt: number;
};

export type AutomationActionParameter = {
  id: string;
  name: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
};

export type AutomationActionOutput = {
  name: string;
  description?: string;
};

export type AutomationAction = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  tags?: string[];
  provider: AutomationProvider;
  parameters?: AutomationActionParameter[];
  steps: AutomationStep[];
  outputs?: AutomationActionOutput[];
  backingBlockId?: string;
  createdAt: number;
  updatedAt: number;
};

export type AutomationScenario = {
  id: string;
  projectId: string;
  suiteId?: string;
  scriptId?: string;
  provider: AutomationProvider;
  executionMode?: AutomationExecutionMode;
  environmentBindingId?: string;
  startUrl?: string;
  name: string;
  description?: string;
  tags?: string[];
  priority?: AutomationScenarioPriority;
  status?: AutomationScenarioStatus;
  testDataSetIds?: string[];
  defaultDataSetId?: string;
  parameterizationMode?: AutomationScenarioParameterizationMode;
  sourceType?: AutomationScriptSource;
  linkedCaseIds?: string[];
  linkedRequirementIds?: string[];
  linkedReleaseIds?: string[];
  linkedIssueIds?: string[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
};

export type ScenarioTestDataSet = {
  id: string;
  scenarioId: string;
  name: string;
  description?: string;
  variables: Record<string, string>;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AutomationScript = {
  id: string;
  projectId: string;
  provider: AutomationProvider;
  executionMode?: AutomationExecutionMode;
  environmentBindingId?: string;
  startUrl?: string;
  name: string;
  description?: string;
  sourceType?: AutomationScriptSource;
  linkedCaseIds?: string[];
  linkedRequirementIds?: string[];
  linkedReleaseIds?: string[];
  linkedIssueIds?: string[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
};

export type AutomationSchedule = {
  id: string;
  scriptId: string;
  suiteId?: string;
  scenarioId?: string;
  datasetId?: string;
  runAllDataSets?: boolean;
  name: string;
  frequency: AutomationScheduleFrequency;
  cronExpression?: string;
  scheduledFor?: number;
  nextRunAt?: number;
  environmentBindingId?: string;
  executionMode?: AutomationExecutionMode;
  isEnabled: boolean;
  status?: AutomationScheduleStatus;
  lastRunStatus?: AutomationExecutionStatus;
  lastExecutionId?: string;
  lastError?: string;
  lastRunAt?: number;
  lastCheckedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStep = {
  id: string;
  scriptId: string;
  order: number;
  action: AutomationStepAction;
  targetType?: AutomationTargetType;
  targetValue?: string;
  inputValue?: string;
  assertionType?: string;
  expectedValue?: string;
  timeoutMs?: number;
  sharedBlockId?: string;
  selectorPresetId?: string;
  routeKey?: string;
  metaJson?: Record<string, unknown>;
  sourceStepId?: string;
  sourceOrigin?: "local-step" | "shared-block";
  sourceReferenceId?: string;
  sourceReferenceLabel?: string;
};

export type AutomationBinding = {
  id: string;
  testCaseId: string;
  scriptId: string;
  mode: AutomationBindingMode;
};

export type AutomationExecutionArtifact = {
  id: string;
  executionId: string;
  type: AutomationArtifactType;
  path: string;
  metadataJson?: Record<string, unknown>;
};

export type AutomationExecutionEventType =
  | "step_start"
  | "step_success"
  | "step_failure"
  | "log_message"
  | "execution_complete";

export type AutomationExecutionEventArtifact = {
  type: AutomationArtifactType;
  path: string;
  metadataJson?: Record<string, unknown>;
};

export type AutomationStepResult = {
  stepId: string;
  sourceStepId?: string;
  stepIndex: number;
  action: AutomationStepAction;
  status: AutomationStepExecutionStatus;
  targetValue?: string;
  message?: string;
  failureReason?: string;
  logLines?: string[];
  healing?: AutomationLocatorHealingMetadata;
  vision?: AutomationVisionMetadata;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  origin?: "local-step" | "shared-block";
  referenceId?: string;
  referenceLabel?: string;
};

export type AutomationDebugStatus =
  | "idle"
  | "starting"
  | "running"
  | "passed"
  | "failed"
  | "blocked";

export type AutomationRecorderEventType =
  | "goto"
  | "click"
  | "fill"
  | "select"
  | "press";

export type AutomationRecorderEvent = {
  id: string;
  type: AutomationRecorderEventType;
  timestamp: number;
  pageUrl?: string;
  url?: string;
  selector?: string;
  value?: string;
  key?: string;
  label?: string;
  locator?: AutomationStepLocator;
  locatorCandidates?: AutomationLocatorCandidate[];
  inspectedElement?: {
    tagName?: string;
    role?: string;
    text?: string;
    placeholder?: string;
    label?: string;
    attributes?: Record<string, string>;
    parentTag?: string;
    parentText?: string;
    cssPath?: string;
    xpath?: string;
    boundingBox?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    computedStyles?: Record<string, string>;
  };
};

export type AutomationRecorderStatus =
  | "idle"
  | "starting"
  | "recording"
  | "paused"
  | "stopping"
  | "stopped"
  | "failed";

export type AutomationDebugSession = {
  id: string;
  rowId: string;
  scriptName: string;
  status: AutomationDebugStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  currentStepId?: string;
  currentSourceStepId?: string;
  currentStepIndex?: number;
  logs: string[];
  stepResults: AutomationStepResult[];
  failureMessage?: string;
  outputDir: string;
};

export type AutomationRecorderSession = {
  id: string;
  rowId: string;
  scriptName: string;
  status: AutomationRecorderStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  logs: string[];
  events: AutomationRecorderEvent[];
  generatedSteps: AutomationStep[];
  failureMessage?: string;
  outputDir: string;
  startUrl?: string;
};

export type AutomationExecution = {
  id: string;
  runId: string;
  caseId: string;
  scriptId: string;
  suiteId?: string;
  suiteName?: string;
  scenarioId?: string;
  scenarioName?: string;
  dataSetId?: string;
  dataSetName?: string;
  dataSetVariables?: Record<string, string>;
  environmentBindingId?: string;
  environmentName?: string;
  provider: AutomationProvider;
  executionMode?: AutomationExecutionMode;
  triggerType?: "manual" | "scheduled";
  scheduleId?: string;
  scheduleName?: string;
  status: AutomationExecutionStatus;
  startedAt: number;
  finishedAt?: number;
  logSummary?: string;
  failureMessage?: string;
  failureOrigin?: "local-step" | "shared-block";
  failureReferenceId?: string;
  stepResults?: AutomationStepResult[];
  artifactIds: string[];
  linkedIssueId?: string;
  linkedIssueKey?: string;
};

export type AutomationExecutionEvent = {
  type: AutomationExecutionEventType;
  timestamp: number;
  executionId: string;
  caseId?: string;
  scenarioId?: string;
  scenarioName?: string;
  dataSetId?: string;
  dataSetName?: string;
  stepId?: string;
  sourceStepId?: string;
  stepIndex?: number;
  message?: string;
  level?: "info" | "success" | "error";
  status?: AutomationExecutionStatus;
  failureMessage?: string;
  stepResult?: AutomationStepResult;
  artifact?: AutomationExecutionEventArtifact;
  execution?: AutomationExecution;
  artifacts?: AutomationExecutionArtifact[];
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
  platformDomain?: "salesforce";
  testDomain?:
    | "functional"
    | "regression"
    | "api"
    | "ui"
    | "negative"
    | "edge"
    | "security"
    | "accessibility";
  securityCategory?:
    | "auth"
    | "authorization"
    | "session"
    | "validation"
    | "data-protection"
    | "api-security"
    | "upload-safety"
    | "business-logic"
    | "abuse-resistance";
  accessibilityCategory?:
    | "keyboard-navigation"
    | "focus-management"
    | "screen-reader"
    | "forms"
    | "semantics"
    | "contrast"
    | "zoom-reflow"
    | "error-handling"
    | "media-content";
  complianceReference?: string;
  riskLevel?: "low" | "medium" | "high";
  automationPotential?: "low" | "medium" | "high";
  generationSource?: "ai-generated" | "manual" | "imported";
  generationFeedback?: GenerationFeedbackRecord;
  approvalState?: ApprovalState;
  handoffState?: TestCaseHandoffState;
  generatedBy?: ActorAttribution;
  editedBy?: ActorAttribution;
  approvedBy?: ActorAttribution;
  rejectedBy?: ActorAttribution;
  releaseReviewedBy?: ActorAttribution;
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
  automationScriptId?: string;
  automationBindingMode?: AutomationBindingMode;
  salesforceModule?: string;
  salesforceObjectType?: string;
  salesforceTestType?: string;
  permissionScope?: string;
  environmentScope?: string;
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
  | "regression"
  | "security"
  | "accessibility"
  | "salesforce";

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

export const generationModeLabels: Record<GenerationMode, string> = {
  functional: "Functional Cases",
  regression: "Regression Cases",
  api: "API Cases",
  ui: "UI Cases",
  negative: "Negative Cases",
  edge: "Edge Cases",
  security: "Security Cases",
  accessibility: "Accessibility / WCAG Cases",
  salesforce: "Salesforce Cases",
};

export const handoffStateLabels: Record<TestCaseHandoffState, string> = {
  "needs-qa-review": "Needs QA Review",
  "needs-automation": "Needs Automation",
  "needs-product-signoff": "Needs Product Signoff",
  "release-blocking": "Release Blocking",
};

export const approvalStateLabels: Record<ApprovalState, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
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
  automationSuites?: AutomationSuite[];
  automationScenarios?: AutomationScenario[];
  automationActions?: AutomationAction[];
  automationScenarioTestDataSets?: ScenarioTestDataSet[];
  automationScripts?: AutomationScript[];
  automationSteps?: Record<string, AutomationStep[]>;
  automationBindings?: AutomationBinding[];
  automationExecutions?: AutomationExecution[];
  automationArtifacts?: AutomationExecutionArtifact[];
  automationReusableBlocks?: AutomationReusableBlock[];
  automationSelectorPresets?: AutomationSelectorPreset[];
  automationEnvironmentBindings?: AutomationEnvironmentBinding[];
  automationSchedules?: AutomationSchedule[];
  automationVisualObjects?: AutomationVisualObjectRecord[];
  automationLocatorApprovals?: AutomationLocatorApprovalRecord[];
  activeAutomationEnvironmentId?: string;
  generationFeedbackLog?: GenerationFeedbackRecord[];
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
  security: "Security",
  accessibility: "UI",
  salesforce: "Functional",
};

const allowedTypesByMode: Record<GenerationMode, TestCaseRow["type"][]> = {
  functional: ["Functional", "Negative", "Edge"],
  negative: ["Negative", "Edge"],
  edge: ["Edge", "Negative"],
  ui: ["UI", "Negative", "Edge"],
  api: ["API", "Negative", "Edge"],
  regression: ["Regression", "Functional"],
  security: ["Security", "API", "Negative", "Edge", "Functional", "UI"],
  accessibility: ["UI", "Functional", "Negative", "Edge"],
  salesforce: ["Functional", "Regression", "UI", "Negative", "Edge", "Integration"],
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
    platformDomain: row.platformDomain,
    testDomain: row.testDomain,
    securityCategory: row.securityCategory,
    accessibilityCategory: row.accessibilityCategory,
    complianceReference: row.complianceReference?.trim() || undefined,
    riskLevel: row.riskLevel,
    automationPotential: row.automationPotential,
    generationSource: row.generationSource ?? "manual",
    generationFeedback: row.generationFeedback,
    approvalState: row.approvalState ?? "pending",
    handoffState: row.handoffState,
    generatedBy: row.generatedBy,
    editedBy: row.editedBy,
    approvedBy: row.approvedBy,
    rejectedBy: row.rejectedBy,
    releaseReviewedBy: row.releaseReviewedBy,
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
    automationScriptId: row.automationScriptId?.trim() || undefined,
    automationBindingMode:
      row.automationBindingMode === "automated" ||
      row.automationBindingMode === "hybrid" ||
      row.automationBindingMode === "manual"
        ? row.automationBindingMode
        : undefined,
    salesforceModule: row.salesforceModule?.trim() || undefined,
    salesforceObjectType: row.salesforceObjectType?.trim() || undefined,
    salesforceTestType: row.salesforceTestType?.trim() || undefined,
    permissionScope: row.permissionScope?.trim() || undefined,
    environmentScope: row.environmentScope?.trim() || undefined,
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

