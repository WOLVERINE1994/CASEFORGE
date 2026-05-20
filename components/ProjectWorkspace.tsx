"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { parseResultToRows, rowsToText } from "../utils/parser";
import RequirementRiskHeatmap from "./RequirementRiskHeatmap";
import BugPredictionPanel from "./BugPredictionPanel";
import AcceptanceCriteriaPanel from "./AcceptanceCriteriaPanel";
import CasesFilterToolbar from "./CasesFilterToolbar";
import CasesSavedViewsSection from "./CasesSavedViewsSection";
import SourceImportPanel from "./SourceImportPanel";
import AmbiguityQuestionsPanel from "./AmbiguityQuestionsPanel";
import CoverageGapDetector from "./CoverageGapDetector";
import TraceabilityMap from "./TraceabilityMap";
import CaseQualityDetector from "./CaseQualityDetector";
import ChangeImpactPanel from "./ChangeImpactPanel";
import ExecutionReadinessPanel from "./ExecutionReadinessPanel";
import BusinessReportPanel from "./BusinessReportPanel";
import CollaborationPanel from "./CollaborationPanel";
import TrustCenterPanel from "./TrustCenterPanel";
import WorkflowValuePath from "./WorkflowValuePath";
import {
  AdvancedFiltersPanel,
  SecondaryMetadataPanel,
} from "./FilterWorkspaceSections";
import { downloadCSV, downloadExcel } from "../utils/export";
import ProjectManager from "./ProjectManager";
import TestCaseTable from "./TestCaseTable";
import { useActiveReviewerSession } from "./useActiveReviewerSession";
import { analyzeRequirementRisk } from "../utils/risk-analysis";
import {
  analyzeAcceptanceCriteria,
  buildRequirementWithAcceptanceCriteria,
} from "../utils/acceptance-criteria";
import {
  analyzeBugPredictions,
  createManualPredictionDraft,
  getBugPredictionTitle,
} from "../utils/bug-prediction";
import { analyzeAmbiguityQuestions } from "../utils/ambiguity-questions";
import { analyzeTraceability } from "../utils/traceability";
import { analyzeCaseQuality } from "../utils/case-quality";
import { analyzeChangeImpact } from "../utils/change-impact";
import { analyzeExecutionReadiness } from "../utils/execution-readiness";
import { buildReviewInsights } from "../utils/review-intelligence";
import {
  downloadCollaborationMarkdown,
  downloadReportPdf,
  openReportWindow,
} from "../utils/report-export";
import { buildWorkspaceReportData } from "../utils/report-data";
import { importSourceArtifact } from "../utils/source-imports";
import { suggestTestData } from "../utils/test-data";
import { buildTrustCenterAnalysis } from "../utils/trust-center";
import { buildDefaultAutomationReuseLibrary } from "../utils/automation-reuse";
import {
  normalizeAutomationRuntimeProvider,
} from "../utils/automation";
import { inferAutomationGenerationDomain } from "../utils/automation-step-generation";
import {
  analyzeCoverageGaps,
  createManualGapDraft,
  getCoverageGapTitle,
} from "../utils/coverage-gap-analysis";
import {
  buildGenerationFeedbackRecord,
  buildGenerationQualitySignals,
} from "../utils/generation-feedback";
import { buildCognitiveOrchestrationPlan } from "../utils/cognitive-orchestration";
import {
  approvalStateLabels,
  automationProviderOptions,
  formatTestCaseId,
  generationModeLabels,
  handoffStateLabels,
  mergeRows,
  modePrimaryType,
  normalizeAutomationProvider,
  normalizeRows,
  parseLabels,
  personaLabels,
  prepareGeneratedRows,
  reviewStatusLabels,
  resolveTypeForMode,
  type AuditEntry,
  type AutomationBinding,
  type AutomationExecution,
  type AutomationExecutionArtifact,
  type AutomationEnvironmentBinding,
  type AutomationReusableBlock,
  type AutomationSelectorPreset,
  type AutomationScript,
  type AutomationStep,
  type CaseTemplate,
  type CasesSavedView,
  type CoverageDepth,
  type CaseReviewHistoryEntry,
  type GenerationMode,
  type Persona,
  type Project,
  type ReviewerNotification,
  type SignoffStatus,
  type SourceArtifactType,
  type SourceArtifact,
  type TestDataSet,
  type TestCaseComment,
  type TestCaseWatcher,
  type TestCaseVersionEntry,
  type TestCaseRow,
} from "../utils/workspace";
import { enrichGeneratedRowsWithDomainMetadata } from "../utils/security-accessibility-metadata";
import {
  buildCaseManagementSummary,
  buildCoverageHotspots,
  getAutomationStrongThreshold,
  buildTraceabilityHealthSummary,
  buildTraceabilityMatrix,
  buildUncoveredRequirementInsights,
} from "../utils/test-case-management";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";
import { useProjectDataState } from "./ProjectDataStateContext";
import { formatUtcDate, formatUtcDateTime } from "../utils/date-format";
import {
  defaultReviewerNotificationPreferences,
  loadReviewerNotificationPreferences,
  type ReviewerNotificationPreferences,
} from "../utils/reviewer-notification-preferences";

const STORAGE_KEY = "tc_projects_v1";

const parseAutomationApiResponse = async <T,>(response: Response): Promise<T> => {
  const raw = await response.text();

  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    const trimmed = raw.trim();
    if (/^<!doctype html>|^<html/i.test(trimmed)) {
      throw new Error(
        "The automation API returned an HTML error page instead of JSON. Check the server console for the underlying error."
      );
    }

    throw new Error("The automation API returned an invalid response.");
  }
};

const downloadJsonFile = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
};

type PendingTemplateImportItem = {
  template: CaseTemplate;
  importStatus: "new" | "rename" | "replace";
  matchedTemplateName?: string;
  matchedTemplate?: CaseTemplate;
};

const summarizeTemplateFieldChanges = (
  incomingTemplate: CaseTemplate,
  existingTemplate?: CaseTemplate
) => {
  if (!existingTemplate) {
    return [];
  }

  const changes: string[] = [];
  if (incomingTemplate.title.trim() !== existingTemplate.title.trim()) {
    changes.push("title");
  }
  if (incomingTemplate.steps.trim() !== existingTemplate.steps.trim()) {
    changes.push("steps");
  }
  if (incomingTemplate.expectedResult.trim() !== existingTemplate.expectedResult.trim()) {
    changes.push("expected result");
  }
  if (
    (incomingTemplate.automationProvider?.trim() || "") !==
    (existingTemplate.automationProvider?.trim() || "")
  ) {
    changes.push("provider");
  }
  if ((incomingTemplate.packVersion ?? 1) !== (existingTemplate.packVersion ?? 1)) {
    changes.push("pack version");
  }

  return changes;
};

const templateFieldChanged = (
  incomingTemplate: CaseTemplate,
  existingTemplate: CaseTemplate | undefined,
  field:
    | "title"
    | "preconditions"
    | "steps"
    | "expectedResult"
    | "testData"
    | "automationProvider"
    | "packVersion"
) => {
  if (!existingTemplate) {
    return false;
  }

  switch (field) {
    case "title":
      return incomingTemplate.title.trim() !== existingTemplate.title.trim();
    case "preconditions":
      return (
        incomingTemplate.preconditions.trim() !==
        existingTemplate.preconditions.trim()
      );
    case "steps":
      return incomingTemplate.steps.trim() !== existingTemplate.steps.trim();
    case "expectedResult":
      return (
        incomingTemplate.expectedResult.trim() !==
        existingTemplate.expectedResult.trim()
      );
    case "testData":
      return (
        (incomingTemplate.testData?.trim() || "") !==
        (existingTemplate.testData?.trim() || "")
      );
    case "automationProvider":
      return (
        (incomingTemplate.automationProvider?.trim() || "") !==
        (existingTemplate.automationProvider?.trim() || "")
      );
    case "packVersion":
      return (incomingTemplate.packVersion ?? 1) !== (existingTemplate.packVersion ?? 1);
    default:
      return false;
  }
};

const formatTemplateExternalId = (externalTemplateId?: string) => {
  if (!externalTemplateId?.trim()) {
    return "Local only";
  }

  return externalTemplateId.length > 12
    ? `${externalTemplateId.slice(0, 8)}...${externalTemplateId.slice(-4)}`
    : externalTemplateId;
};

const parseTemplateOperationAuditSegments = (detail: string, segmentLabel: string) => {
  const match = detail.match(new RegExp(`${segmentLabel}:\\s([^.]*)`));
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const templateSeverityRank = {
  low: 0,
  medium: 1,
  high: 2,
} as const;

const buildTemplateOperationSeverity = (count: number) =>
  count >= 8 ? "high" : count >= 4 ? "medium" : "low";

const elevateSeverity = (severity: "low" | "medium" | "high") =>
  severity === "low" ? "medium" : "high";

const evaluateTemplateAlert = ({
  severity,
  operation,
  isExternalSource,
  sourceLabel,
  preferences,
}: {
  severity: "low" | "medium" | "high";
  operation: "import" | "export";
  isExternalSource: boolean;
  sourceLabel: string;
  preferences: ReviewerNotificationPreferences;
}) => {
  const normalizedSourceLabel = sourceLabel.trim().toLowerCase();
  const highPrioritySources = preferences.templateAlertHighPrioritySources.map((entry) =>
    entry.trim().toLowerCase()
  );
  const operationPrioritySources =
    operation === "import"
      ? preferences.templateImportHighPrioritySources.map((entry) =>
          entry.trim().toLowerCase()
        )
      : preferences.templateExportHighPrioritySources.map((entry) =>
          entry.trim().toLowerCase()
        );
  const severityLiftReason =
    normalizedSourceLabel && operationPrioritySources.includes(normalizedSourceLabel)
      ? operation === "import"
        ? "import"
        : "export"
      : normalizedSourceLabel && highPrioritySources.includes(normalizedSourceLabel)
      ? "source"
      : undefined;
  const effectiveSeverity = severityLiftReason ? elevateSeverity(severity) : severity;
  const operationThreshold =
    operation === "import"
      ? preferences.templateImportAlertMinimumSeverity
      : preferences.templateExportAlertMinimumSeverity;
  const sourceThreshold = isExternalSource
    ? preferences.templateExternalAlertMinimumSeverity
    : preferences.templateLocalAlertMinimumSeverity;
  const allowedSources = preferences.templateAlertAllowedSources.map((entry) =>
    entry.trim().toLowerCase()
  );
  const blockedSources = preferences.templateAlertBlockedSources.map((entry) =>
    entry.trim().toLowerCase()
  );

  if (normalizedSourceLabel && blockedSources.includes(normalizedSourceLabel)) {
    return {
      shouldNotify: false,
      effectiveSeverity,
      severityLifted: Boolean(severityLiftReason),
      severityLiftReason,
      suppressionReason: "blocked-source",
    } as const;
  }

  if (
    allowedSources.length > 0 &&
    normalizedSourceLabel &&
    !allowedSources.includes(normalizedSourceLabel)
  ) {
    return {
      shouldNotify: false,
      effectiveSeverity,
      severityLifted: Boolean(severityLiftReason),
      severityLiftReason,
      suppressionReason: "not-allowed-source",
    } as const;
  }

  const meetsThreshold =
    templateSeverityRank[effectiveSeverity] >= templateSeverityRank[operationThreshold] &&
    templateSeverityRank[effectiveSeverity] >= templateSeverityRank[sourceThreshold];

  return {
    shouldNotify: meetsThreshold,
    effectiveSeverity,
    severityLifted: Boolean(severityLiftReason),
    severityLiftReason,
    suppressionReason: meetsThreshold ? undefined : "threshold",
  } as const;
};

const hydrateProject = (project: Project): Project => ({
  ...project,
  projectKey: project.projectKey ?? "",
  sprintName: project.sprintName ?? "",
  releaseName: project.releaseName ?? "",
  teamName: project.teamName ?? "",
  oldRequirement: project.oldRequirement ?? "",
  latestChangeEntries: project.latestChangeEntries ?? [],
  persona: project.persona ?? "all",
  sourceArtifacts: project.sourceArtifacts ?? [],
  reviewerName: project.reviewerName ?? "",
  reviewerNotes: project.reviewerNotes ?? "",
  signoffStatus: project.signoffStatus ?? "draft",
  auditTrail: project.auditTrail ?? [],
  caseComments: project.caseComments ?? {},
  caseWatchers: project.caseWatchers ?? {},
  notifications: project.notifications ?? [],
  caseVersionHistory: project.caseVersionHistory ?? {},
  caseReviewHistory: project.caseReviewHistory ?? {},
  testDataSets: project.testDataSets ?? [],
  caseTemplates: project.caseTemplates ?? [],
  automationScripts: project.automationScripts ?? [],
  automationSteps: project.automationSteps ?? {},
  automationBindings: project.automationBindings ?? [],
  automationExecutions: project.automationExecutions ?? [],
  automationArtifacts: project.automationArtifacts ?? [],
  automationReusableBlocks: project.automationReusableBlocks ?? [],
  automationSelectorPresets: project.automationSelectorPresets ?? [],
  automationEnvironmentBindings: project.automationEnvironmentBindings ?? [],
  activeAutomationEnvironmentId: project.activeAutomationEnvironmentId ?? "",
  generationFeedbackLog: project.generationFeedbackLog ?? [],
  viewPreferences: project.viewPreferences ?? {},
  savedViews: project.savedViews ?? { cases: [], runs: [] },
  lastGeneratedChangeImpactSignature:
    project.lastGeneratedChangeImpactSignature ?? null,
});

const ensureAutomationReuseDefaults = (projectId: string, project?: Project | null) => {
  if (
    (project?.automationReusableBlocks?.length ?? 0) > 0 ||
    (project?.automationSelectorPresets?.length ?? 0) > 0 ||
    (project?.automationEnvironmentBindings?.length ?? 0) > 0
  ) {
    return {
      blocks: project?.automationReusableBlocks ?? [],
      selectorPresets: project?.automationSelectorPresets ?? [],
      environments: project?.automationEnvironmentBindings ?? [],
      activeEnvironmentId:
        project?.activeAutomationEnvironmentId ||
        project?.automationEnvironmentBindings?.find((item) => item.isDefault)?.id ||
        "",
    };
  }

  return buildDefaultAutomationReuseLibrary(projectId);
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const starterRequirementExamples = [
  {
    label: "Checkout coupon",
    requirement:
      "Returning customer applies a valid coupon at checkout and sees the order total update before placing the order.",
  },
  {
    label: "Password reset",
    requirement:
      "Registered user requests a password reset email, opens the reset link, sets a new password, and signs in with the updated credentials.",
  },
  {
    label: "Access restriction",
    requirement:
      "Guest user attempts to open the billing page and is redirected to sign in without seeing account details.",
  },
] as const;

const deriveWorkspaceNameFromRequirement = (requirement: string) => {
  const firstMeaningfulLine =
    requirement
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";

  const cleaned = firstMeaningfulLine
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Quick QA Draft";
  }

  const shortName = cleaned
    .split(" ")
    .slice(0, 6)
    .join(" ")
    .replace(/[^\w\s-]/g, "")
    .trim();

  return shortName || "Quick QA Draft";
};

const parseCaseCommentMentions = (
  body: string,
  userOptions: Array<{ id: string; name: string; email: string }>
) => {
  const tokens = Array.from(new Set(body.match(/@\S+/g) ?? []));

  return tokens.flatMap((token) => {
      const normalized = token.slice(1).trim().toLowerCase();
      if (!normalized) {
        return [];
      }

      const matchedUser = userOptions.find((user) => {
        const candidates = [user.name, user.email]
          .filter(Boolean)
          .map((value) => value.toLowerCase());
        return candidates.some((candidate) => candidate.includes(normalized));
      });

      return [
        {
          label: token,
          matchedUserId: matchedUser?.id,
        },
      ];
    });
};

const matchesReviewerNotification = (
  notification: ReviewerNotification,
  reviewer?: { id?: string; name?: string; email?: string } | null
) => {
  if (!reviewer) {
    return false;
  }

  const reviewerIds = [reviewer.id, reviewer.email, reviewer.name]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());

  const recipientIds = [notification.recipientId, notification.recipientLabel]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());

  return recipientIds.some((value) => reviewerIds.includes(value));
};

const fetchWithRetry = async (
  input: string,
  init?: RequestInit,
  retries = 1
) => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;

      if (!(error instanceof TypeError) || attempt === retries) {
        throw error;
      }

      await wait(350 * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed.");
};

type WorkspaceFilter =
  | "all"
  | "draft-cleanup"
  | "approval-ready"
  | "keep"
  | "new"
  | "needs-update"
  | "needs-review"
  | "obsolete"
  | "duplicate"
  | "impacted"
  | "manual"
  | "gap"
  | "defect";

type ProjectWorkspaceProps = {
  initialProjectRef?: string | null;
  initialSection?: "workspace" | "cases";
  embedded?: boolean;
  focusedRowId?: string | null;
  focusedCommentId?: string | null;
};

type IssueRecord = {
  id: string;
  issueKey: string;
  summary: string;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
};

export default function ProjectWorkspace({
  initialProjectRef = null,
  initialSection = "workspace",
  embedded = false,
  focusedRowId = null,
  focusedCommentId = null,
}: ProjectWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const metrics = useProjectRouteMetrics();
  const projectDataState = useProjectDataState();
  const { reviewer: activeReviewer } = useActiveReviewerSession();
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<TestCaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [workspaceFilter, setWorkspaceFilter] =
    useState<WorkspaceFilter>("all");
  const [generationMode, setGenerationMode] =
    useState<GenerationMode>("functional");
  const [coverageDepth, setCoverageDepth] =
    useState<CoverageDepth>("standard");
  const [persona, setPersona] = useState<Persona>("all");
  const [sourceArtifacts, setSourceArtifacts] = useState<SourceArtifact[]>([]);
  const [oldRequirement, setOldRequirement] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [sprintName, setSprintName] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [signoffStatus, setSignoffStatus] = useState<SignoffStatus>("draft");
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [caseComments, setCaseComments] = useState<
    Record<string, TestCaseComment[]>
  >({});
  const [caseWatchers, setCaseWatchers] = useState<
    Record<string, TestCaseWatcher[]>
  >({});
  const [notifications, setNotifications] = useState<ReviewerNotification[]>([]);
  const [caseVersionHistory, setCaseVersionHistory] = useState<
    Record<string, TestCaseVersionEntry[]>
  >({});
  const [caseReviewHistory, setCaseReviewHistory] = useState<
    Record<string, CaseReviewHistoryEntry[]>
  >({});
  const [testDataSets, setTestDataSets] = useState<TestDataSet[]>([]);
  const [caseTemplates, setCaseTemplates] = useState<CaseTemplate[]>([]);
  const [automationScripts, setAutomationScripts] = useState<AutomationScript[]>([]);
  const [automationSteps, setAutomationSteps] = useState<
    Record<string, AutomationStep[]>
  >({});
  const [automationBindings, setAutomationBindings] = useState<AutomationBinding[]>(
    []
  );
  const [automationExecutions, setAutomationExecutions] = useState<
    AutomationExecution[]
  >([]);
  const [automationArtifacts, setAutomationArtifacts] = useState<
    AutomationExecutionArtifact[]
  >([]);
  const [automationReusableBlocks, setAutomationReusableBlocks] = useState<
    AutomationReusableBlock[]
  >([]);
  const [automationSelectorPresets, setAutomationSelectorPresets] = useState<
    AutomationSelectorPreset[]
  >([]);
  const [automationEnvironmentBindings, setAutomationEnvironmentBindings] = useState<
    AutomationEnvironmentBinding[]
  >([]);
  const [activeAutomationEnvironmentId, setActiveAutomationEnvironmentId] =
    useState("");
  const [generatingAutomationRowIds, setGeneratingAutomationRowIds] = useState<string[]>([]);
  const [generationFeedbackLog, setGenerationFeedbackLog] = useState<
    NonNullable<Project["generationFeedbackLog"]>
  >([]);
  const generationModeHelperText = useMemo(() => {
    if (generationMode === "security") {
      return "Generate defensive manual validation for authentication, authorization, sessions, input validation, data protection, abuse resistance, and safe failure handling.";
    }
    if (generationMode === "accessibility") {
      return "Generate manual WCAG-oriented validation for keyboard flow, focus behavior, semantics, forms, screen readers, contrast, zoom and reflow, and status messaging.";
    }
    if (generationMode === "salesforce") {
      return "Generate Salesforce-ready manual coverage for objects, permissions, Lightning flows, validations, approvals, reporting, and environment-aware business workflows.";
    }
    return "Advanced QA tools stay below so the first pass stays focused.";
  }, [generationMode]);
  const [casesDefaultPreset, setCasesDefaultPreset] = useState<
    "default" | "review-queue" | "failed-linked"
  >("default");
  const [casesDefaultSavedViewId, setCasesDefaultSavedViewId] = useState<string | null>(
    null
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] =
    useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [fillingGapId, setFillingGapId] = useState<string | null>(null);
  const [isFillingAllCriticalGaps, setIsFillingAllCriticalGaps] =
    useState(false);
  const [seenGapIds, setSeenGapIds] = useState<string[]>([]);
  const [activeQualityFindingId, setActiveQualityFindingId] = useState<
    string | null
  >(null);
  const [ignoredQualityFindingIds, setIgnoredQualityFindingIds] = useState<
    string[]
  >([]);
  const [ignoredPredictionIds, setIgnoredPredictionIds] = useState<string[]>([]);
  const [fillingPredictionId, setFillingPredictionId] = useState<string | null>(
    null
  );
  const [workspaceNotice, setWorkspaceNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
    actions?: Array<{
      label: string;
      href: string;
    }>;
  } | null>(null);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkAssigneeValue, setBulkAssigneeValue] = useState("");
  const [bulkWorkflowStatus, setBulkWorkflowStatus] = useState<
    TestCaseRow["workflowStatus"] | ""
  >("");
  const [bulkPriority, setBulkPriority] = useState<TestCaseRow["priority"] | "">(
    ""
  );
  const [bulkExecutionResult, setBulkExecutionResult] = useState<
    TestCaseRow["executionResult"] | ""
  >("");
  const [bulkReviewStatus, setBulkReviewStatus] = useState<
    TestCaseRow["reviewStatus"] | ""
  >("");
  const [bulkSuiteName, setBulkSuiteName] = useState("");
  const [bulkComponentArea, setBulkComponentArea] = useState("");
  const [bulkAutomationStatus, setBulkAutomationStatus] = useState<
    TestCaseRow["automationStatus"] | ""
  >("");
  const [bulkTestDataSetId, setBulkTestDataSetId] = useState("");
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const [caseAssigneeFilter, setCaseAssigneeFilter] = useState("");
  const [casePriorityFilter, setCasePriorityFilter] = useState<
    TestCaseRow["priority"] | ""
  >("");
  const [caseTestDomainFilter, setCaseTestDomainFilter] = useState<
    NonNullable<TestCaseRow["testDomain"]> | ""
  >("");
  const [caseRiskLevelFilter, setCaseRiskLevelFilter] = useState<
    NonNullable<TestCaseRow["riskLevel"]> | ""
  >("");
  const [caseSecurityCategoryFilter, setCaseSecurityCategoryFilter] = useState<
    NonNullable<TestCaseRow["securityCategory"]> | ""
  >("");
  const [
    caseAccessibilityCategoryFilter,
    setCaseAccessibilityCategoryFilter,
  ] = useState<NonNullable<TestCaseRow["accessibilityCategory"]> | "">("");
  const [caseApprovalStateFilter, setCaseApprovalStateFilter] = useState<
    NonNullable<TestCaseRow["approvalState"]> | ""
  >("");
  const [caseHandoffStateFilter, setCaseHandoffStateFilter] = useState<
    NonNullable<TestCaseRow["handoffState"]> | ""
  >("");
  const [caseLinkedFilter, setCaseLinkedFilter] = useState<"all" | "linked" | "unlinked">(
    "all"
  );
  const [caseExecutionFilter, setCaseExecutionFilter] = useState<
    TestCaseRow["executionResult"] | ""
  >("");
  const [caseReviewFilter, setCaseReviewFilter] = useState<
    TestCaseRow["reviewStatus"] | ""
  >("");
  const [caseReviewHealthFilter, setCaseReviewHealthFilter] = useState<
    "" | "open-notes" | "history"
  >("");
  const [caseCollaborationFilter, setCaseCollaborationFilter] = useState<
    "" | "watching" | "mentioned" | "attention"
  >("");
  const [caseSuiteFilter, setCaseSuiteFilter] = useState("");
  const [caseComponentFilter, setCaseComponentFilter] = useState("");
  const [caseAutomationFilter, setCaseAutomationFilter] = useState<
    TestCaseRow["automationStatus"] | ""
  >("");
  const [caseAutomationProviderFilter, setCaseAutomationProviderFilter] = useState("");
  const [caseArchivedFilter, setCaseArchivedFilter] = useState<
    "active" | "archived" | "all"
  >("active");
  const [caseCommentDrafts, setCaseCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [newDataSetName, setNewDataSetName] = useState("");
  const [newDataSetDescription, setNewDataSetDescription] = useState("");
  const [newDataSetContent, setNewDataSetContent] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [templateFilterMode, setTemplateFilterMode] = useState<
    "all" | "favorites" | "starters" | "provider" | "imported" | "local"
  >("all");
  const [templateImportFilterMode, setTemplateImportFilterMode] = useState<
    "all" | "new" | "rename" | "replace"
  >("all");
  const [pendingTemplateImport, setPendingTemplateImport] = useState<{
    items: PendingTemplateImportItem[];
    selectedTemplateIds: string[];
    renamedCount: number;
    replacementCount: number;
    sourceProjectName?: string;
    exportedAt?: string;
    exportedBy?: string;
    packVersion?: number;
  } | null>(null);
  const [selectedTemplateImportDiffId, setSelectedTemplateImportDiffId] = useState<
    string | null
  >(null);
  const [templateImportProviderFilter, setTemplateImportProviderFilter] = useState<
    string | null
  >(null);
  const [templateImportSourceFilter, setTemplateImportSourceFilter] = useState<
    string | null
  >(null);
  const [templateImportSortMode, setTemplateImportSortMode] = useState<
    "default" | "replace-first" | "new-first"
  >("default");
  const [templateHistoryProviderFilter, setTemplateHistoryProviderFilter] = useState<
    string | null
  >(null);
  const [templateHistorySourceFilter, setTemplateHistorySourceFilter] = useState<
    string | null
  >(null);
  const [casesSavedViews, setCasesSavedViews] = useState<CasesSavedView[]>([]);
  const [newCasesViewName, setNewCasesViewName] = useState("");
  const [editingCasesViewId, setEditingCasesViewId] = useState<string | null>(null);
  const [editingCasesViewName, setEditingCasesViewName] = useState("");
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [highlightedRowLabel, setHighlightedRowLabel] = useState<string | null>(
    null
  );
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [isGeneratingChangeImpactCases, setIsGeneratingChangeImpactCases] =
    useState(false);
  const [lastGeneratedChangeImpactSignature, setLastGeneratedChangeImpactSignature] =
    useState<string | null>(null);
  const [projectIssues, setProjectIssues] = useState<IssueRecord[]>([]);
  const [loadingProjectIssues, setLoadingProjectIssues] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [reviewerNotificationPreferences, setReviewerNotificationPreferences] =
    useState<ReviewerNotificationPreferences>(defaultReviewerNotificationPreferences);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistQueueRef = useRef<Promise<Project[]>>(Promise.resolve([]));
  const didLoadProjectsRef = useRef(false);
  const currentProjectIdRef = useRef<string | null>(null);
  const requirementTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectsRef = useRef<Project[]>([]);
  const didResolveInitialProjectRef = useRef(false);
  const didApplyFocusedRowRef = useRef(false);
  const didApplyCasesDefaultPresetRef = useRef(false);
  const didShowBrowserFallbackNoticeRef = useRef(false);
  const templateImportInputRef = useRef<HTMLInputElement | null>(null);
  const templateLibrarySectionRef = useRef<HTMLDivElement | null>(null);
  const generatedCasesSectionRef = useRef<HTMLElement | null>(null);
  const uncoveredRequirementSectionRef = useRef<HTMLDetailsElement | null>(null);
  const savedViewsSectionRef = useRef<HTMLDivElement | null>(null);

  const hasRows = rows.length > 0;
  const isCasesSection = initialSection === "cases";
  const cameFromRelease = searchParams.get("from") === "release";
  const focusTarget = searchParams.get("focus") ?? "";
  const focusedRowIds = useMemo(
    () =>
      (searchParams.get("rowIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [searchParams]
  );
  const activeReviewerPreferenceId = useMemo(
    () => activeReviewer?.id || activeReviewer?.email || activeReviewer?.name || "",
    [activeReviewer?.email, activeReviewer?.id, activeReviewer?.name]
  );

  useEffect(() => {
    if (!focusTarget) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (focusTarget === "template-library") {
        templateLibrarySectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      if (focusTarget === "requirement") {
        focusRequirementComposer();
        return;
      }

      if (focusTarget === "generated-review") {
        focusGeneratedCasesSection();
        return;
      }

      if (focusTarget === "coverage-handoff") {
        uncoveredRequirementSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      if (focusTarget === "saved-views") {
        savedViewsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  useEffect(() => {
    if (!currentProjectId || !activeReviewerPreferenceId) {
      setReviewerNotificationPreferences(defaultReviewerNotificationPreferences);
      return;
    }

    setReviewerNotificationPreferences(
      loadReviewerNotificationPreferences(currentProjectId, activeReviewerPreferenceId)
    );
  }, [activeReviewerPreferenceId, currentProjectId]);

  const applyCasesPreset = useCallback((
    preset: "default" | "review-queue" | "failed-linked"
  ) => {
    setCaseSearchQuery("");
    setCaseAssigneeFilter("");
    setCasePriorityFilter("");
    setCaseTestDomainFilter("");
    setCaseRiskLevelFilter("");
    setCaseSecurityCategoryFilter("");
    setCaseAccessibilityCategoryFilter("");
    setCaseApprovalStateFilter("");
    setCaseHandoffStateFilter("");
    setCaseCollaborationFilter("");
    setCaseSuiteFilter("");
    setCaseComponentFilter("");
    setCaseAutomationFilter("");
    setCaseAutomationProviderFilter("");
    setCaseArchivedFilter("active");

    if (preset === "review-queue") {
      setCaseLinkedFilter("all");
      setCaseExecutionFilter("");
      setCaseReviewFilter("");
      setCaseReviewHealthFilter("open-notes");
      return;
    }

    if (preset === "failed-linked") {
      setCaseLinkedFilter("linked");
      setCaseExecutionFilter("failed");
      setCaseReviewFilter("");
      setCaseReviewHealthFilter("");
      return;
    }

    setCaseLinkedFilter("all");
    setCaseExecutionFilter("");
    setCaseReviewFilter("");
    setCaseReviewHealthFilter("");
  }, []);

  const applyCaseFilters = useCallback((filters: CasesSavedView["filters"]) => {
    setCaseSearchQuery(filters.searchQuery);
    setCaseAssigneeFilter(filters.assignee);
    setCasePriorityFilter(filters.priority);
    setCaseTestDomainFilter(filters.testDomain);
    setCaseRiskLevelFilter(filters.riskLevel);
    setCaseSecurityCategoryFilter(filters.securityCategory);
    setCaseAccessibilityCategoryFilter(filters.accessibilityCategory);
    setCaseApprovalStateFilter(filters.approvalState ?? "");
    setCaseHandoffStateFilter(filters.handoffState ?? "");
    setCaseLinkedFilter(filters.linked);
    setCaseExecutionFilter(filters.execution);
    setCaseReviewFilter(filters.review);
    setCaseReviewHealthFilter(filters.reviewHealth);
    setCaseCollaborationFilter(filters.collaboration);
    setCaseSuiteFilter(filters.suite);
    setCaseComponentFilter(filters.component);
    setCaseAutomationFilter(filters.automation);
    setCaseAutomationProviderFilter(filters.automationProvider);
    setCaseArchivedFilter(filters.archived);
  }, []);

  const applySavedCasesView = useCallback((view: CasesSavedView) => {
    applyCaseFilters(view.filters);
  }, [applyCaseFilters]);

  const resetCaseFilters = useCallback(() => {
    applyCasesPreset("default");
  }, [applyCasesPreset]);

  useEffect(() => {
    if (!isCasesSection) {
      return;
    }

    const nextSearch = searchParams.get("search") ?? "";
    const nextAssignee = searchParams.get("assignee") ?? "";
    const nextPriority = searchParams.get("priority");
    const nextTestDomain = searchParams.get("testDomain");
    const nextRiskLevel = searchParams.get("riskLevel");
    const nextSecurityCategory = searchParams.get("securityCategory");
    const nextAccessibilityCategory = searchParams.get("accessibilityCategory");
    const nextApprovalState = searchParams.get("approvalState");
    const nextHandoffState = searchParams.get("handoffState");
    const nextExecution = searchParams.get("execution");
    const nextLinked = searchParams.get("linked");
    const nextReview = searchParams.get("review");
    const nextSuite = searchParams.get("suite") ?? "";
    const nextComponent = searchParams.get("component") ?? "";
    const nextAutomation = searchParams.get("automation");
    const nextAutomationProvider = searchParams.get("automationProvider") ?? "";
    const nextArchived = searchParams.get("archived");
    const nextReviewHealth = searchParams.get("reviewHealth");
    const nextCollaboration = searchParams.get("collaboration");

    setCaseSearchQuery(nextSearch);
    setCaseAssigneeFilter(nextAssignee);
    setCasePriorityFilter(
      nextPriority === "highest" ||
        nextPriority === "high" ||
        nextPriority === "medium" ||
        nextPriority === "low"
        ? nextPriority
        : ""
    );
    setCaseTestDomainFilter(
      nextTestDomain === "functional" ||
        nextTestDomain === "regression" ||
        nextTestDomain === "api" ||
        nextTestDomain === "ui" ||
        nextTestDomain === "negative" ||
        nextTestDomain === "edge" ||
        nextTestDomain === "security" ||
        nextTestDomain === "accessibility"
        ? nextTestDomain
        : ""
    );
    setCaseRiskLevelFilter(
      nextRiskLevel === "low" ||
        nextRiskLevel === "medium" ||
        nextRiskLevel === "high"
        ? nextRiskLevel
        : ""
    );
    setCaseSecurityCategoryFilter(
      nextSecurityCategory === "auth" ||
        nextSecurityCategory === "authorization" ||
        nextSecurityCategory === "session" ||
        nextSecurityCategory === "validation" ||
        nextSecurityCategory === "data-protection" ||
        nextSecurityCategory === "api-security" ||
        nextSecurityCategory === "upload-safety" ||
        nextSecurityCategory === "business-logic" ||
        nextSecurityCategory === "abuse-resistance"
        ? nextSecurityCategory
        : ""
    );
    setCaseAccessibilityCategoryFilter(
      nextAccessibilityCategory === "keyboard-navigation" ||
        nextAccessibilityCategory === "focus-management" ||
        nextAccessibilityCategory === "screen-reader" ||
        nextAccessibilityCategory === "forms" ||
        nextAccessibilityCategory === "semantics" ||
        nextAccessibilityCategory === "contrast" ||
        nextAccessibilityCategory === "zoom-reflow" ||
        nextAccessibilityCategory === "error-handling" ||
        nextAccessibilityCategory === "media-content"
        ? nextAccessibilityCategory
        : ""
    );
    setCaseApprovalStateFilter(
      nextApprovalState === "pending" ||
        nextApprovalState === "approved" ||
        nextApprovalState === "rejected"
        ? nextApprovalState
        : ""
    );
    setCaseHandoffStateFilter(
      nextHandoffState === "needs-qa-review" ||
        nextHandoffState === "needs-automation" ||
        nextHandoffState === "needs-product-signoff" ||
        nextHandoffState === "release-blocking"
        ? nextHandoffState
        : ""
    );
    setCaseExecutionFilter(
      nextExecution === "not-run" ||
        nextExecution === "passed" ||
        nextExecution === "failed" ||
        nextExecution === "blocked"
        ? nextExecution
        : ""
    );
    setCaseReviewFilter(
      nextReview === "draft" ||
        nextReview === "in-review" ||
        nextReview === "approved" ||
        nextReview === "changes-requested"
        ? nextReview
        : ""
    );
    setCaseSuiteFilter(nextSuite);
    setCaseComponentFilter(nextComponent);
    setCaseAutomationFilter(
      nextAutomation === "manual" ||
        nextAutomation === "candidate" ||
        nextAutomation === "automated"
        ? nextAutomation
        : ""
    );
    setCaseAutomationProviderFilter(normalizeAutomationProvider(nextAutomationProvider));
    setCaseArchivedFilter(
      nextArchived === "all" || nextArchived === "archived"
        ? nextArchived
        : "active"
    );
    setCaseReviewHealthFilter(
      nextReviewHealth === "open-notes" || nextReviewHealth === "history"
        ? nextReviewHealth
        : ""
    );
    setCaseCollaborationFilter(
      nextCollaboration === "watching" ||
        nextCollaboration === "mentioned" ||
        nextCollaboration === "attention"
        ? (nextCollaboration as "watching" | "mentioned" | "attention")
        : ""
    );
    setCaseLinkedFilter(
      nextLinked === "linked" || nextLinked === "unlinked" ? nextLinked : "all"
    );
  }, [isCasesSection, searchParams]);

  useEffect(() => {
    if (!isCasesSection || !hasLoadedProjects || didApplyCasesDefaultPresetRef.current) {
      return;
    }

    const hasExplicitCaseParams = [
      "rowIds",
      "search",
      "assignee",
      "priority",
      "testDomain",
      "riskLevel",
      "securityCategory",
      "accessibilityCategory",
      "approvalState",
      "handoffState",
      "linked",
      "execution",
      "review",
      "reviewHealth",
      "collaboration",
      "suite",
      "component",
      "automation",
      "automationProvider",
      "archived",
    ].some((key) => searchParams.has(key));

    if (hasExplicitCaseParams) {
      didApplyCasesDefaultPresetRef.current = true;
      return;
    }

    if (casesDefaultSavedViewId) {
      const defaultSavedView = casesSavedViews.find(
        (view) => view.id === casesDefaultSavedViewId
      );
      if (defaultSavedView) {
        applySavedCasesView(defaultSavedView);
        didApplyCasesDefaultPresetRef.current = true;
        return;
      }
    }

    applyCasesPreset(casesDefaultPreset);
    didApplyCasesDefaultPresetRef.current = true;
  }, [
    applySavedCasesView,
    applyCasesPreset,
    casesDefaultSavedViewId,
    casesDefaultPreset,
    casesSavedViews,
    hasLoadedProjects,
    isCasesSection,
    searchParams,
  ]);

  useEffect(() => {
    if (!isCasesSection) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (focusedRowId) {
      nextParams.set("rowId", focusedRowId);
    } else {
      nextParams.delete("rowId");
    }

    if (focusedCommentId) {
      nextParams.set("commentId", focusedCommentId);
    } else {
      nextParams.delete("commentId");
    }

    if (caseSearchQuery.trim()) {
      nextParams.set("search", caseSearchQuery.trim());
    } else {
      nextParams.delete("search");
    }

    if (caseAssigneeFilter) {
      nextParams.set("assignee", caseAssigneeFilter);
    } else {
      nextParams.delete("assignee");
    }

    if (casePriorityFilter) {
      nextParams.set("priority", casePriorityFilter);
    } else {
      nextParams.delete("priority");
    }

    if (caseTestDomainFilter) {
      nextParams.set("testDomain", caseTestDomainFilter);
    } else {
      nextParams.delete("testDomain");
    }

    if (caseRiskLevelFilter) {
      nextParams.set("riskLevel", caseRiskLevelFilter);
    } else {
      nextParams.delete("riskLevel");
    }

    if (caseSecurityCategoryFilter) {
      nextParams.set("securityCategory", caseSecurityCategoryFilter);
    } else {
      nextParams.delete("securityCategory");
    }

    if (caseAccessibilityCategoryFilter) {
      nextParams.set("accessibilityCategory", caseAccessibilityCategoryFilter);
    } else {
      nextParams.delete("accessibilityCategory");
    }

    if (caseApprovalStateFilter) {
      nextParams.set("approvalState", caseApprovalStateFilter);
    } else {
      nextParams.delete("approvalState");
    }

    if (caseHandoffStateFilter) {
      nextParams.set("handoffState", caseHandoffStateFilter);
    } else {
      nextParams.delete("handoffState");
    }

    if (caseLinkedFilter !== "all") {
      nextParams.set("linked", caseLinkedFilter);
    } else {
      nextParams.delete("linked");
    }

    if (caseExecutionFilter) {
      nextParams.set("execution", caseExecutionFilter);
    } else {
      nextParams.delete("execution");
    }

    if (caseReviewFilter) {
      nextParams.set("review", caseReviewFilter);
    } else {
      nextParams.delete("review");
    }

    if (caseReviewHealthFilter) {
      nextParams.set("reviewHealth", caseReviewHealthFilter);
    } else {
      nextParams.delete("reviewHealth");
    }

    if (caseCollaborationFilter) {
      nextParams.set("collaboration", caseCollaborationFilter);
    } else {
      nextParams.delete("collaboration");
    }

    if (caseSuiteFilter.trim()) {
      nextParams.set("suite", caseSuiteFilter.trim());
    } else {
      nextParams.delete("suite");
    }

    if (caseComponentFilter.trim()) {
      nextParams.set("component", caseComponentFilter.trim());
    } else {
      nextParams.delete("component");
    }

    if (caseAutomationFilter) {
      nextParams.set("automation", caseAutomationFilter);
    } else {
      nextParams.delete("automation");
    }

    if (caseAutomationProviderFilter.trim()) {
      nextParams.set("automationProvider", caseAutomationProviderFilter.trim());
    } else {
      nextParams.delete("automationProvider");
    }

    if (caseArchivedFilter !== "active") {
      nextParams.set("archived", caseArchivedFilter);
    } else {
      nextParams.delete("archived");
    }

    const currentQuery = searchParams.toString();
    const nextQuery = nextParams.toString();

    if (currentQuery === nextQuery) {
      return;
    }

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [
    caseAccessibilityCategoryFilter,
    caseApprovalStateFilter,
    caseAssigneeFilter,
    caseExecutionFilter,
    caseHandoffStateFilter,
    caseAutomationFilter,
    caseAutomationProviderFilter,
    caseArchivedFilter,
    caseComponentFilter,
    caseLinkedFilter,
    casePriorityFilter,
    caseRiskLevelFilter,
    caseCollaborationFilter,
    caseReviewHealthFilter,
    caseReviewFilter,
    caseSearchQuery,
    caseSecurityCategoryFilter,
      caseSuiteFilter,
      caseTestDomainFilter,
      focusedCommentId,
      focusedRowId,
    isCasesSection,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    metrics?.setCaseCount(rows.length);
  }, [metrics, rows.length]);

  useEffect(() => {
    setSelectedRowIds((currentIds) =>
      currentIds.filter((rowId) => rows.some((row) => row.id === rowId))
    );
  }, [rows]);

  useEffect(() => {
    const validRowIds = new Set(rows.map((row) => row.id));

    setCaseComments((currentComments) =>
      Object.fromEntries(
        Object.entries(currentComments).filter(([rowId]) => validRowIds.has(rowId))
      )
    );
    setCaseCommentDrafts((currentDrafts) =>
      Object.fromEntries(
        Object.entries(currentDrafts).filter(([rowId]) => validRowIds.has(rowId))
      )
    );
    setCaseVersionHistory((currentHistory) =>
      Object.fromEntries(
        Object.entries(currentHistory).filter(([rowId]) => validRowIds.has(rowId))
      )
    );
    setCaseReviewHistory((currentHistory) =>
      Object.fromEntries(
        Object.entries(currentHistory).filter(([rowId]) => validRowIds.has(rowId))
      )
    );
  }, [rows]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  useEffect(() => {
    didApplyCasesDefaultPresetRef.current = false;
  }, [currentProjectId, isCasesSection]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      try {
        const response = await fetchWithRetry("/api/projects", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load stored projects.");
        }

        const data = (await response.json()) as { projects?: Project[] };
        const serverProjects = Array.isArray(data.projects)
          ? data.projects.map(hydrateProject)
          : [];

        if (!cancelled && serverProjects.length > 0) {
          setProjects(serverProjects);
          return;
        }

        const legacyProjectsRaw = window.localStorage.getItem(STORAGE_KEY);
        if (!legacyProjectsRaw) {
          return;
        }

        const parsedLegacyProjects = JSON.parse(legacyProjectsRaw) as Project[];
        if (!Array.isArray(parsedLegacyProjects) || parsedLegacyProjects.length === 0) {
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }

        const migratedProjects = parsedLegacyProjects.map(hydrateProject);
        const migrateResponse = await fetch("/api/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ projects: migratedProjects }),
        });

        if (!migrateResponse.ok) {
          throw new Error("Failed to migrate browser-saved projects.");
        }

        const migratedData = (await migrateResponse.json()) as {
          projects?: Project[];
        };
        const savedProjects = Array.isArray(migratedData.projects)
          ? migratedData.projects.map(hydrateProject)
          : migratedProjects;

        if (!cancelled) {
          setProjects(savedProjects);
          showWorkspaceNotice(
            "success",
            "Moved saved projects from browser storage into the project store."
          );
        }

        window.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error("Failed to load projects:", error);
        if (!cancelled) {
          setSaveStatus("error");
        }
      } finally {
        if (!cancelled) {
          didLoadProjectsRef.current = true;
          setHasLoadedProjects(true);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistProjects = useCallback(
    async (updatedProjects: Project[]) => {
      const readProjectsResponse = async (response: Response) => {
        const contentType = response.headers.get("content-type") ?? "";
        const responseText = await response.text();

        if (!contentType.includes("application/json")) {
          const isHtml = responseText.trimStart().startsWith("<");
          throw new Error(
            isHtml
              ? "Project autosave received a sign-in or error page instead of JSON. Check Clerk access for /api/projects and redeploy."
              : "Project autosave received an unexpected server response."
          );
        }

        try {
          return JSON.parse(responseText) as {
            projects?: Project[];
            error?: string;
          };
        } catch {
          throw new Error("Project autosave returned invalid JSON.");
        }
      };

      const runPersist = async () => {
        const persistStartedAt = Date.now();
        const payloadSize = JSON.stringify({ projects: updatedProjects }).length;
        const activeProjectName =
          updatedProjects.find(
            (project) => project.id === currentProjectIdRef.current
          )?.name || "Untitled Project";

        if (process.env.NODE_ENV !== "production") {
          console.info("[workspace autosave] POST /api/projects start", {
            projectCount: updatedProjects.length,
            payloadSize,
            activeProjectId: currentProjectIdRef.current,
            activeProjectName,
          });
        }

        let response: Response;

        try {
          response = await fetchWithRetry(
            "/api/projects",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ projects: updatedProjects }),
            },
            2
          );
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[workspace autosave] POST /api/projects fetch failed", {
              projectCount: updatedProjects.length,
              payloadSize,
              activeProjectId: currentProjectIdRef.current,
              activeProjectName,
              durationMs: Date.now() - persistStartedAt,
              error,
            });
          }

          if (error instanceof TypeError) {
            throw new Error(
              "Unable to reach project autosave right now. Your edits are still open in the workspace."
            );
          }

          throw error;
        }

        if (!response.ok) {
          const errorPayload = await readProjectsResponse(response).catch(
            (error) => ({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to persist projects.",
            })
          );

          if (process.env.NODE_ENV !== "production") {
            console.error("[workspace autosave] POST /api/projects response failed", {
              status: response.status,
              projectCount: updatedProjects.length,
              payloadSize,
              activeProjectId: currentProjectIdRef.current,
              activeProjectName,
              durationMs: Date.now() - persistStartedAt,
              error: errorPayload?.error ?? "Unknown response error",
            });
          }

          throw new Error(
            errorPayload?.error?.trim() || "Failed to persist projects."
          );
        }

        const data = await readProjectsResponse(response);
        const savedProjects = Array.isArray(data.projects)
          ? data.projects.map(hydrateProject)
          : updatedProjects.map(hydrateProject);

        setProjects(savedProjects);
        const activeProject =
          savedProjects.find(
            (project) => project.id === currentProjectIdRef.current
          ) ?? null;
        if (activeProject) {
          projectDataState?.setProject(activeProject);
        }
        if (embedded) {
          router.refresh();
        }

        if (process.env.NODE_ENV !== "production") {
          console.info("[workspace autosave] POST /api/projects success", {
            projectCount: savedProjects.length,
            payloadSize,
            activeProjectId: currentProjectIdRef.current,
            activeProjectName,
            durationMs: Date.now() - persistStartedAt,
          });
        }

        return savedProjects;
      };

      const nextPersist = persistQueueRef.current
        .catch(() => [])
        .then(runPersist);

      persistQueueRef.current = nextPersist;
      return nextPersist;
    },
    [embedded, projectDataState, router]
  );

  const showWorkspaceNotice = (
    tone: "info" | "success" | "error",
    text: string,
    actions?: Array<{
      label: string;
      href: string;
    }>
  ) => {
    setWorkspaceNotice({ tone, text, actions });

    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
    }

    noticeTimeoutRef.current = setTimeout(() => {
      setWorkspaceNotice(null);
    }, 3500);
  };

  const addAuditEntry = useCallback((action: string, detail: string) => {
    setAuditTrail((currentEntries) => [
      {
        id: crypto.randomUUID(),
        action,
        detail,
        createdAt: Date.now(),
      },
      ...currentEntries,
    ].slice(0, 40));
  }, []);

  const appendCaseReviewHistory = useCallback(
    (rowId: string, action: string, detail: string) => {
      if (!rowId) {
        return;
      }

      setCaseReviewHistory((currentHistory) => ({
        ...currentHistory,
        [rowId]: [
          {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            action,
            detail,
            actorId: activeReviewer?.id,
            actorName: activeReviewer?.name || reviewerName.trim() || undefined,
            actorEmail: activeReviewer?.email,
          },
          ...(currentHistory[rowId] ?? []),
        ].slice(0, 16),
      }));
    },
    [activeReviewer?.email, activeReviewer?.id, activeReviewer?.name, reviewerName]
  );

  const recordCaseVersion = useCallback(
    (row: TestCaseRow, reason: string) => {
      if (!row?.id) {
        return;
      }

      const snapshot = normalizeRows([row], generationMode)[0] ?? row;

      setCaseVersionHistory((currentHistory) => ({
        ...currentHistory,
        [row.id]: [
          {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            reason,
            rowSnapshot: snapshot,
            actorId: activeReviewer?.id,
            actorName: activeReviewer?.name || reviewerName.trim() || undefined,
            actorEmail: activeReviewer?.email,
          },
          ...(currentHistory[row.id] ?? []),
        ].slice(0, 12),
      }));
    },
    [activeReviewer?.email, activeReviewer?.id, activeReviewer?.name, generationMode, reviewerName]
  );

  const updateCaseCommentDraft = (rowId: string, value: string) => {
    setCaseCommentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [rowId]: value,
    }));
  };

  const addCaseComment = (rowId: string) => {
    const draft = caseCommentDrafts[rowId]?.trim() || "";

    if (!draft) {
      showWorkspaceNotice(
        "error",
        "Write a comment before posting it to the case review thread."
      );
      return;
    }

    const authorLabel =
      activeReviewer?.name ||
      activeReviewer?.email ||
      reviewerName.trim() ||
      "Active reviewer";
    const commentId = crypto.randomUUID();
    const mentions = parseCaseCommentMentions(draft, userOptions);
    const watcherNotifications = reviewerNotificationPreferences.watchAlerts
      ? (caseWatchers[rowId] ?? [])
          .filter(
            (watcher) =>
              watcher.id !==
              (activeReviewer?.id || activeReviewer?.email || activeReviewer?.name)
          )
          .map((watcher) => ({
            id: crypto.randomUUID(),
            type: "case-watch" as const,
            createdAt: Date.now(),
            title: `New activity on ${rowId}`,
            detail: `${authorLabel} added a review note on a case you follow.`,
            rowId,
            commentId,
            recipientId: watcher.id,
            recipientLabel: watcher.name || watcher.email || watcher.id,
          }))
      : [];
    const mentionNotifications = reviewerNotificationPreferences.mentionAlerts
      ? mentions.map((mention) => ({
          id: crypto.randomUUID(),
          type: "case-mention" as const,
          createdAt: Date.now(),
          title: `You were mentioned on ${rowId}`,
          detail: `${authorLabel} mentioned ${mention.label} in a review note.`,
          rowId,
          commentId,
          recipientId: mention.matchedUserId,
          recipientLabel: mention.label.replace(/^@/, ""),
        }))
      : [];
    const nextNotifications = [...mentionNotifications, ...watcherNotifications];

    setCaseComments((currentComments) => ({
      ...currentComments,
        [rowId]: [
          {
            id: commentId,
            body: draft,
            createdAt: Date.now(),
          mentions,
          authorId: activeReviewer?.id,
          authorName: activeReviewer?.name || reviewerName.trim() || undefined,
          authorEmail: activeReviewer?.email,
        },
        ...(currentComments[rowId] ?? []),
      ].slice(0, 20),
    }));
    setCaseCommentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [rowId]: "",
    }));
    if (nextNotifications.length > 0) {
      setNotifications((currentNotifications) =>
        [...nextNotifications, ...currentNotifications].slice(0, 120)
      );
    }
    appendCaseReviewHistory(
      rowId,
      "Review note added",
      `${authorLabel} left a review note for this case.`
    );
    addAuditEntry("Case comment added", `${authorLabel} commented on ${rowId}.`);
    showWorkspaceNotice("success", `Posted a review note on ${rowId}.`);
  };

  const toggleCaseCommentResolved = (rowId: string, commentId: string) => {
    setCaseComments((currentComments) => ({
      ...currentComments,
      [rowId]: (currentComments[rowId] ?? []).map((comment) =>
        comment.id !== commentId
          ? comment
          : comment.resolvedAt
          ? {
              ...comment,
              resolvedAt: undefined,
              resolvedBy: undefined,
            }
          : {
              ...comment,
              resolvedAt: Date.now(),
              resolvedBy: {
                id: activeReviewer?.id,
                name: activeReviewer?.name || reviewerName.trim() || undefined,
                email: activeReviewer?.email,
              },
            }
      ),
    }));
    const targetComment = (caseComments[rowId] ?? []).find(
      (comment) => comment.id === commentId
    );
    appendCaseReviewHistory(
      rowId,
      targetComment?.resolvedAt ? "Review note reopened" : "Review note resolved",
      targetComment?.resolvedAt
        ? "A previously resolved review note was reopened."
        : "A review note was resolved."
    );
    addAuditEntry("Case comment updated", `Review note state changed on ${rowId}.`);
  };

  const deleteCaseComment = (rowId: string, commentId: string) => {
    setCaseComments((currentComments) => ({
      ...currentComments,
      [rowId]: (currentComments[rowId] ?? []).filter(
        (comment) => comment.id !== commentId
      ),
    }));
    appendCaseReviewHistory(
      rowId,
      "Review note removed",
      "A review note was removed from the case discussion."
    );
    addAuditEntry("Case comment removed", `A review note was removed from ${rowId}.`);
    showWorkspaceNotice("info", `Removed a review note from ${rowId}.`);
  };

  const toggleCaseWatch = (rowId: string) => {
    if (!activeReviewer?.id && !activeReviewer?.email && !activeReviewer?.name) {
      showWorkspaceNotice("error", "Set an active reviewer before following a case.");
      return;
    }

    const watcherId =
      activeReviewer?.id || activeReviewer?.email || activeReviewer?.name || "watcher";
    const watcherLabel =
      activeReviewer?.name || activeReviewer?.email || reviewerName.trim() || "Active reviewer";

    let nowWatching = false;
    setCaseWatchers((currentWatchers) => {
      const existing = currentWatchers[rowId] ?? [];
      const alreadyWatching = existing.some((watcher) => watcher.id === watcherId);
      nowWatching = !alreadyWatching;

      return {
        ...currentWatchers,
        [rowId]: alreadyWatching
          ? existing.filter((watcher) => watcher.id !== watcherId)
          : [
              {
                id: watcherId,
                name: activeReviewer?.name,
                email: activeReviewer?.email,
                addedAt: Date.now(),
              },
              ...existing,
            ].slice(0, 12),
      };
    });

    appendCaseReviewHistory(
      rowId,
      nowWatching ? "Case watcher added" : "Case watcher removed",
      nowWatching
        ? `${watcherLabel} is now following this case.`
        : `${watcherLabel} is no longer following this case.`
    );
    addAuditEntry(
      nowWatching ? "Case watcher added" : "Case watcher removed",
      `${watcherLabel} ${nowWatching ? "followed" : "unfollowed"} ${rowId}.`
    );
    showWorkspaceNotice(
      "success",
      nowWatching
        ? `${watcherLabel} is now following ${rowId}.`
        : `${watcherLabel} stopped following ${rowId}.`
    );
  };

  const markNotificationRead = (notificationId: string) => {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              readAt: notification.readAt ?? Date.now(),
            }
          : notification
      )
    );
  };

  const markAllReviewerNotificationsRead = () => {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        matchesReviewerNotification(notification, activeReviewer)
          ? {
              ...notification,
              readAt: notification.readAt ?? Date.now(),
            }
          : notification
      )
    );
    showWorkspaceNotice("success", "Marked reviewer alerts as read.");
  };

  const createTestDataSet = () => {
    const trimmedName = newDataSetName.trim();
    const trimmedContent = newDataSetContent.trim();

    if (!trimmedName || !trimmedContent) {
      showWorkspaceNotice(
        "error",
        "Add both a dataset name and reusable content before saving a test data set."
      );
      return;
    }

    setTestDataSets((currentSets) => [
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        description: newDataSetDescription.trim() || undefined,
        content: trimmedContent,
        updatedAt: Date.now(),
      },
      ...currentSets,
    ]);
    setNewDataSetName("");
    setNewDataSetDescription("");
    setNewDataSetContent("");
    addAuditEntry("Test data set saved", `${trimmedName} was added to reusable test data.`);
    showWorkspaceNotice("success", `Saved reusable test data set "${trimmedName}".`);
  };

  const saveTemplateFromRow = (row: TestCaseRow) => {
    const templateName = `${row.id} Template`;

    setCaseTemplates((currentTemplates) => [
      {
        id: crypto.randomUUID(),
        name: templateName,
        externalTemplateId: crypto.randomUUID(),
        category: "general",
        pinned: false,
        type: row.type,
        title: row.title,
        preconditions: row.preconditions,
        steps: row.steps,
        expectedResult: row.expectedResult,
        testData: row.testData,
        automationProvider: row.automationProvider?.trim() || undefined,
        automationReference: row.automationReference?.trim() || undefined,
        sourceProjectName: projectName.trim() || "Untitled Project",
        sourceExportedBy:
          activeReviewer?.name || activeReviewer?.email || reviewerName.trim() || undefined,
        updatedAt: Date.now(),
      },
      ...currentTemplates,
    ]);
    addAuditEntry("Case template saved", `${row.id} was saved as a reusable template.`);
    showWorkspaceNotice(
      "success",
      `Saved ${row.id} as a reusable case template${row.automationProvider?.trim() ? ` for ${row.automationProvider.trim()}` : ""}.`
    );
  };

  const createProviderStarterTemplate = (provider: string) => {
    const starter = providerStarterTemplates.find((item) => item.provider === provider);
    if (!starter) {
      return;
    }

    setCaseTemplates((currentTemplates) => [
      {
        id: crypto.randomUUID(),
        name: starter.name,
        externalTemplateId: crypto.randomUUID(),
        category: "provider-starter",
        pinned: true,
        type: starter.type,
        title: starter.title,
        preconditions: starter.preconditions,
        steps: starter.steps,
        expectedResult: starter.expectedResult,
        testData: "",
        automationProvider: starter.provider,
        automationReference: starter.automationReference,
        sourceProjectName: projectName.trim() || "Untitled Project",
        sourceExportedBy:
          activeReviewer?.name || activeReviewer?.email || reviewerName.trim() || undefined,
        updatedAt: Date.now(),
      },
      ...currentTemplates,
    ]);
    addAuditEntry(
      "Provider starter template created",
      `${starter.name} was added as a reusable ${provider} automation starter.`
    );
    showWorkspaceNotice("success", `Added "${starter.name}" to reusable templates.`);
  };

  const duplicateTemplate = (templateId: string) => {
    const template = caseTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const duplicateName = `${template.name} Copy`;
    setCaseTemplates((currentTemplates) => [
      {
        ...template,
        id: crypto.randomUUID(),
        name: duplicateName,
        externalTemplateId: crypto.randomUUID(),
        pinned: false,
        updatedAt: Date.now(),
      },
      ...currentTemplates,
    ]);
    addAuditEntry("Case template duplicated", `${template.name} was duplicated as ${duplicateName}.`);
    showWorkspaceNotice("success", `Duplicated template "${template.name}".`);
  };

  const startEditingTemplate = (templateId: string, currentName: string) => {
    setEditingTemplateId(templateId);
    setEditingTemplateName(currentName);
  };

  const saveTemplateRename = (templateId: string) => {
    const trimmedName = editingTemplateName.trim();
    if (!trimmedName) {
      showWorkspaceNotice("error", "Give the template a name before saving the rename.");
      return;
    }

    let previousTemplateName = "Template";
    setCaseTemplates((currentTemplates) =>
      currentTemplates.map((template) => {
        if (template.id !== templateId) {
          return template;
        }

        previousTemplateName = template.name;
        return {
          ...template,
          name: trimmedName,
          updatedAt: Date.now(),
        };
      })
    );
    setEditingTemplateId(null);
    setEditingTemplateName("");
    addAuditEntry("Case template renamed", `${previousTemplateName} was renamed to ${trimmedName}.`);
    showWorkspaceNotice("success", `Renamed template to "${trimmedName}".`);
  };

  const toggleTemplatePinned = (templateId: string) => {
    let templateName = "Template";
    let nextPinnedState = false;

    setCaseTemplates((currentTemplates) =>
      currentTemplates.map((template) => {
        if (template.id !== templateId) {
          return template;
        }

        templateName = template.name;
        nextPinnedState = !template.pinned;
        return {
          ...template,
          pinned: nextPinnedState,
          updatedAt: Date.now(),
        };
      })
    );
    addAuditEntry(
      nextPinnedState ? "Case template favorited" : "Case template unfavorited",
      `${templateName} was ${nextPinnedState ? "added to" : "removed from"} favorite templates.`
    );
    showWorkspaceNotice(
      "success",
      `${nextPinnedState ? "Favorited" : "Unfavorited"} template "${templateName}".`
    );
  };

  const deleteTemplate = (templateId: string) => {
    let deletedTemplateName = "Template";

    setCaseTemplates((currentTemplates) =>
      currentTemplates.filter((template) => {
        if (template.id === templateId) {
          deletedTemplateName = template.name;
          return false;
        }
        return true;
      })
    );
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId("");
    }
    if (editingTemplateId === templateId) {
      setEditingTemplateId(null);
      setEditingTemplateName("");
    }
    addAuditEntry(
      "Case template deleted",
      `${deletedTemplateName} was removed from reusable templates.`
    );
    showWorkspaceNotice("success", `Deleted template "${deletedTemplateName}".`);
  };

  const exportVisibleTemplates = () => {
    if (visibleCaseTemplates.length === 0) {
      showWorkspaceNotice("error", "There are no visible templates to export right now.");
      return;
    }

    downloadJsonFile("case-template-pack.json", {
      version: 1,
      packVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceProjectName: projectName.trim() || "Untitled Project",
      exportedBy:
        activeReviewer?.name || activeReviewer?.email || reviewerName.trim() || "Unknown reviewer",
      templateCount: visibleCaseTemplates.length,
      templates: visibleCaseTemplates.map((template) => ({
        name: template.name,
        externalTemplateId: template.externalTemplateId ?? crypto.randomUUID(),
        packVersion: template.packVersion ?? 1,
        category: template.category ?? "general",
        pinned: Boolean(template.pinned),
        type: template.type,
        title: template.title,
        preconditions: template.preconditions,
        steps: template.steps,
        expectedResult: template.expectedResult,
        testData: template.testData ?? "",
        automationProvider: template.automationProvider ?? "",
        automationReference: template.automationReference ?? "",
        sourceProjectName:
          template.sourceProjectName ?? (projectName.trim() || "Untitled Project"),
        sourceExportedAt: template.sourceExportedAt ?? new Date().toISOString(),
        sourceExportedBy:
          template.sourceExportedBy ||
          activeReviewer?.name ||
          activeReviewer?.email ||
          reviewerName.trim() ||
          "Unknown reviewer",
        })),
    });
    const exportProviderSummary = Array.from(
      visibleCaseTemplates.reduce((accumulator, template) => {
        const provider = template.automationProvider?.trim() || "Unspecified";
        accumulator.set(provider, (accumulator.get(provider) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>())
    )
      .map(([provider, count]) => `${provider}: ${count}`)
      .join(", ");
    showWorkspaceNotice(
      "success",
      `Exported ${visibleCaseTemplates.length} template${visibleCaseTemplates.length === 1 ? "" : "s"} as a reusable pack.`
    );
    addAuditEntry(
      "Case template pack exported",
      `${visibleCaseTemplates.length} reusable template${
        visibleCaseTemplates.length === 1 ? "" : "s"
      } were exported from this project. Providers: ${
        exportProviderSummary || "none"
      }.`
    );
    if (
      reviewerNotificationPreferences.templateAlerts &&
      (activeReviewerPreferenceId || activeReviewerLabel.trim())
    ) {
      const templateOperationSeverity = buildTemplateOperationSeverity(
        visibleCaseTemplates.length
      );
      const templateAlertDecision = evaluateTemplateAlert({
        severity: templateOperationSeverity,
        operation: "export",
        isExternalSource: false,
        sourceLabel: projectName.trim() || "Untitled Project",
        preferences: reviewerNotificationPreferences,
      });
      if (templateAlertDecision.shouldNotify) {
      setNotifications((current) => [
        {
          id: crypto.randomUUID(),
          type: "template-operation",
          operation: "export",
          createdAt: Date.now(),
          title: "Template pack exported",
          detail: `${visibleCaseTemplates.length} reusable template${
            visibleCaseTemplates.length === 1 ? "" : "s"
          } were exported. Providers: ${exportProviderSummary || "none"}.`,
          severity: templateAlertDecision.effectiveSeverity,
          baseSeverity: templateOperationSeverity,
          severityLifted: templateAlertDecision.severityLifted,
          severityLiftReason: templateAlertDecision.severityLiftReason,
          sourceLabel: projectName.trim() || "Untitled Project",
          recipientId: activeReviewerPreferenceId || undefined,
          recipientLabel: activeReviewerLabel.trim() || undefined,
        },
        ...current,
      ]);
      } else if (
        templateAlertDecision.suppressionReason === "blocked-source" ||
        templateAlertDecision.suppressionReason === "not-allowed-source"
      ) {
        addAuditEntry(
          "Template alert suppressed",
          `Template export alert from ${projectName.trim() || "Untitled Project"} was suppressed by ${
            templateAlertDecision.suppressionReason === "blocked-source"
              ? "a blocked source rule"
              : "the allowed source list"
          }.`
        );
      }
    }
  };

  const applyPendingTemplateImport = () => {
    if (!pendingTemplateImport || pendingTemplateImport.items.length === 0) {
      return;
    }

    const selectedItems = pendingTemplateImport.items.filter((item) =>
      pendingTemplateImport.selectedTemplateIds.includes(item.template.id)
    );
    const templatesToImport = selectedItems.map((item) => item.template);
    if (templatesToImport.length === 0) {
      showWorkspaceNotice("error", "Choose at least one template from the preview before importing.");
      return;
    }

    const providerSummary = Array.from(
      selectedItems.reduce((accumulator, item) => {
        const provider = item.template.automationProvider?.trim() || "Unspecified";
        accumulator.set(provider, (accumulator.get(provider) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>())
    )
      .map(([provider, count]) => `${provider}: ${count}`)
      .join(", ");
    const sourceSummary = Array.from(
      selectedItems.reduce((accumulator, item) => {
        const source =
          item.template.sourceProjectName?.trim() ||
          pendingTemplateImport.sourceProjectName?.trim() ||
          "Unknown source";
        accumulator.set(source, (accumulator.get(source) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>())
    )
      .map(([source, count]) => `${source}: ${count}`)
      .join(", ");

    setCaseTemplates((currentTemplates) => {
      const replacementNames = new Set(
        selectedItems
          .filter((item) => item.importStatus === "replace")
          .map((item) => item.matchedTemplateName?.trim().toLowerCase() || item.template.name.trim().toLowerCase())
      );

      const keptTemplates = currentTemplates.filter(
        (template) => !replacementNames.has(template.name.trim().toLowerCase())
      );

      return [...templatesToImport, ...keptTemplates];
    });
    addAuditEntry(
      "Case template pack imported",
      `${templatesToImport.length} reusable template${
        templatesToImport.length === 1 ? "" : "s"
      } were imported into this project. Providers: ${
        providerSummary || "none"
      }. Sources: ${sourceSummary || "none"}.`
    );
    if (
      reviewerNotificationPreferences.templateAlerts &&
      (activeReviewerPreferenceId || activeReviewerLabel.trim())
    ) {
      const templateOperationSeverity = buildTemplateOperationSeverity(
        templatesToImport.length
      );
      const importSourceLabel =
        pendingTemplateImport.sourceProjectName?.trim() ||
        projectName.trim() ||
        "Unknown source";
      const isExternalSource =
        Boolean(importSourceLabel) &&
        Boolean(projectName.trim()) &&
        importSourceLabel.toLowerCase() !== projectName.trim().toLowerCase();
      const templateAlertDecision = evaluateTemplateAlert({
        severity: templateOperationSeverity,
        operation: "import",
        isExternalSource,
        sourceLabel: importSourceLabel,
        preferences: reviewerNotificationPreferences,
      });
      if (templateAlertDecision.shouldNotify) {
      setNotifications((current) => [
        {
          id: crypto.randomUUID(),
          type: "template-operation",
          operation: "import",
          createdAt: Date.now(),
          title: "Template pack imported",
          detail: `${templatesToImport.length} reusable template${
            templatesToImport.length === 1 ? "" : "s"
          } were imported. Providers: ${providerSummary || "none"}. Sources: ${
            sourceSummary || "none"
          }.`,
          severity: templateAlertDecision.effectiveSeverity,
          baseSeverity: templateOperationSeverity,
          severityLifted: templateAlertDecision.severityLifted,
          severityLiftReason: templateAlertDecision.severityLiftReason,
          sourceLabel: importSourceLabel,
          recipientId: activeReviewerPreferenceId || undefined,
          recipientLabel: activeReviewerLabel.trim() || undefined,
        },
        ...current,
      ]);
      } else if (
        templateAlertDecision.suppressionReason === "blocked-source" ||
        templateAlertDecision.suppressionReason === "not-allowed-source"
      ) {
        addAuditEntry(
          "Template alert suppressed",
          `Template import alert from ${importSourceLabel} was suppressed by ${
            templateAlertDecision.suppressionReason === "blocked-source"
              ? "a blocked source rule"
              : "the allowed source list"
          }.`
        );
      }
    }
    showWorkspaceNotice(
      "success",
      `Imported ${templatesToImport.length} template${
        templatesToImport.length === 1 ? "" : "s"
      } into this project${
        selectedItems.filter((item) => item.importStatus === "replace").length > 0
          ? ` and replaced ${selectedItems.filter((item) => item.importStatus === "replace").length} older version${
              selectedItems.filter((item) => item.importStatus === "replace").length === 1 ? "" : "s"
            }`
          : ""
      }${
        selectedItems.filter((item) => item.importStatus === "rename").length > 0
          ? ` and renamed ${selectedItems.filter((item) => item.importStatus === "rename").length} duplicate${
              selectedItems.filter((item) => item.importStatus === "rename").length === 1 ? "" : "s"
            }`
          : ""
      }.`
    );
    setPendingTemplateImport(null);
    setTemplateImportFilterMode("all");
    setSelectedTemplateImportDiffId(null);
    setTemplateImportProviderFilter(null);
    setTemplateImportSourceFilter(null);
    setTemplateImportSortMode("default");
  };

  const importTemplatePack = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as
        | {
            templates?: unknown;
            packVersion?: number;
            sourceProjectName?: string;
            exportedAt?: string;
            exportedBy?: string;
          }
        | unknown[];
      const packMetadata = Array.isArray(parsed)
        ? null
        : {
            sourceProjectName:
              typeof parsed?.sourceProjectName === "string"
                ? parsed.sourceProjectName
                : undefined,
          exportedAt:
              typeof parsed?.exportedAt === "string" ? parsed.exportedAt : undefined,
            packVersion:
              typeof parsed?.packVersion === "number" ? parsed.packVersion : undefined,
            exportedBy:
              typeof parsed?.exportedBy === "string" ? parsed.exportedBy : undefined,
          };
      const importedTemplates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.templates)
        ? parsed.templates
        : [];

      const normalizedTemplates = importedTemplates.reduce<CaseTemplate[]>(
        (accumulator, item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return accumulator;
          }

          const record = item as Record<string, unknown>;
          if (
            typeof record.name !== "string" ||
            typeof record.type !== "string" ||
            typeof record.title !== "string" ||
            typeof record.preconditions !== "string" ||
            typeof record.steps !== "string" ||
            typeof record.expectedResult !== "string"
          ) {
            return accumulator;
          }

          accumulator.push({
            id: crypto.randomUUID(),
            name: record.name.trim() || "Imported Template",
            externalTemplateId:
              typeof record.externalTemplateId === "string"
                ? record.externalTemplateId
                : crypto.randomUUID(),
            packVersion:
              typeof record.packVersion === "number"
                ? record.packVersion
                : packMetadata?.packVersion ?? 1,
            category:
              record.category === "provider-starter"
                ? ("provider-starter" as const)
                : ("general" as const),
            pinned: Boolean(record.pinned),
            type: record.type,
            title: record.title,
            preconditions: record.preconditions,
            steps: record.steps,
            expectedResult: record.expectedResult,
            testData: typeof record.testData === "string" ? record.testData : "",
            automationProvider:
              normalizeAutomationProvider(
                typeof record.automationProvider === "string"
                  ? record.automationProvider
                  : ""
              ) || undefined,
            automationReference:
              typeof record.automationReference === "string"
                ? record.automationReference
                : undefined,
            sourceProjectName:
              typeof record.sourceProjectName === "string"
                ? record.sourceProjectName
                : packMetadata?.sourceProjectName,
            sourceExportedAt:
              typeof record.sourceExportedAt === "string"
                ? record.sourceExportedAt
                : packMetadata?.exportedAt,
            sourceExportedBy:
              typeof record.sourceExportedBy === "string"
                ? record.sourceExportedBy
                : packMetadata?.exportedBy,
            updatedAt: Date.now(),
          });

          return accumulator;
        },
        []
      );

      if (normalizedTemplates.length === 0) {
        showWorkspaceNotice("error", "That file did not contain any reusable templates we could import.");
        return;
      }

      const usedNames = new Set(
        caseTemplates.map((template) => template.name.trim().toLowerCase()).filter(Boolean)
      );
      let renamedOnImport = 0;
      let replacementCount = 0;
      const previewItems = normalizedTemplates.map((template) => {
        let nextName = template.name.trim() || "Imported Template";
        const existingTemplate = caseTemplates.find((current) => {
          if (
            template.externalTemplateId &&
            current.externalTemplateId &&
            current.externalTemplateId === template.externalTemplateId
          ) {
            return true;
          }

          return current.name.trim().toLowerCase() === nextName.toLowerCase();
        });

        if (
          existingTemplate &&
          (template.packVersion ?? 1) > (existingTemplate.packVersion ?? 1)
        ) {
          replacementCount += 1;
          return {
            template: {
              ...template,
              name: existingTemplate.name,
            },
            importStatus: "replace" as const,
            matchedTemplateName: existingTemplate.name,
            matchedTemplate: existingTemplate,
          };
        }

        let suffix = 2;
        let importStatus: PendingTemplateImportItem["importStatus"] = "new";

        while (usedNames.has(nextName.toLowerCase())) {
          nextName = `${template.name.trim() || "Imported Template"} (${suffix})`;
          suffix += 1;
          importStatus = "rename";
        }

        if (nextName !== template.name) {
          renamedOnImport += 1;
        }
        usedNames.add(nextName.toLowerCase());

        return {
          template: {
            ...template,
            name: nextName,
          },
          importStatus,
          matchedTemplateName: existingTemplate?.name,
          matchedTemplate: existingTemplate,
        };
      });

      setTemplateImportFilterMode("all");
      setSelectedTemplateImportDiffId(null);
      setTemplateImportProviderFilter(null);
      setTemplateImportSourceFilter(null);
      setTemplateImportSortMode("default");
      setPendingTemplateImport({
        items: previewItems,
        selectedTemplateIds: previewItems.map((item) => item.template.id),
        renamedCount: renamedOnImport,
        replacementCount,
        packVersion: packMetadata?.packVersion,
        sourceProjectName: packMetadata?.sourceProjectName,
        exportedAt: packMetadata?.exportedAt,
        exportedBy: packMetadata?.exportedBy,
      });
      showWorkspaceNotice(
        "info",
        `Template pack parsed. Review ${previewItems.length} incoming template${
          previewItems.length === 1 ? "" : "s"
        } before importing.`
      );
    } catch (error) {
      console.error("TEMPLATE PACK IMPORT ERROR:", error);
      showWorkspaceNotice("error", "We couldn't import that template pack. Check that it is valid JSON and try again.");
    }
  };

  const cloneRowById = (rowId: string) => {
    const rowToClone = rows.find((row) => row.id === rowId);
    if (!rowToClone) {
      return;
    }

    const nextIndex = rows.length;
    setRows((currentRows) => [
      ...currentRows,
      {
        ...rowToClone,
        id: formatTestCaseId(nextIndex),
        title: rowToClone.title ? `${rowToClone.title} (Clone)` : "Cloned test case",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    addAuditEntry("Case cloned", `${rowToClone.id} was cloned for reuse.`);
    showWorkspaceNotice("success", `Cloned ${rowToClone.id} into a new test case.`);
  };

  const applyTemplateById = (templateId: string) => {
    const template = caseTemplates.find((item) => item.id === templateId);
    if (!template) {
      showWorkspaceNotice("error", "Choose a saved template before creating a case from it.");
      return;
    }

    appendRows([
      {
        id: "",
        type: template.type,
        title: template.title,
        preconditions: template.preconditions,
        steps: template.steps,
        expectedResult: template.expectedResult,
        testData: template.testData ?? "",
        workflowStatus: "backlog",
        priority: "medium",
        executionResult: "not-run",
        reviewStatus: "draft",
        automationStatus: "manual",
        automationProvider: template.automationProvider ?? "",
        automationReference: template.automationReference ?? "",
        archived: false,
      },
    ]);
    addAuditEntry(
      "Template applied",
      `${template.name} created a new case draft${template.automationProvider?.trim() ? ` with ${template.automationProvider.trim()} automation metadata` : ""}.`
    );
    showWorkspaceNotice(
      "success",
      `Created a new case from template "${template.name}"${template.automationProvider?.trim() ? ` with ${template.automationProvider.trim()} metadata` : ""}.`
    );
  };

  const applySelectedTemplate = () => {
    applyTemplateById(selectedTemplateId);
  };

  const exportTraceabilityMatrix = () => {
    const csvLines = [
      ["Section", "Metric", "Value"].join(","),
      ["Summary", "Sentence coverage percent", `${traceabilityHealthSummary.coveragePercent}%`]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      ["Summary", "Total requirement sentences", traceabilityHealthSummary.totalSentences]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      ["Summary", "Covered requirement sentences", traceabilityHealthSummary.coveredSentences]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      ["Summary", "Uncovered requirement sentences", traceabilityHealthSummary.uncoveredSentences]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      ["Summary", "Multi-mapped requirement sentences", traceabilityHealthSummary.multiMappedSentences]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      ["Summary", "Cases without direct mapping", traceabilityHealthSummary.casesWithoutDirectMapping]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      ["Summary", "Linked mapped cases", traceabilityHealthSummary.linkedMappedCases]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      ["Summary", "Covered risk areas", traceabilityHealthSummary.coveredRiskAreasCount]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
      "",
      [
        "Case ID",
        "Title",
        "Component Area",
        "Suite",
        "Requirement Sentence",
        "Risk Area",
        "Linked Issue",
        "Covered",
      ].join(","),
      ...traceabilityMatrix.map((entry) =>
        [
          entry.rowId,
          entry.title,
          entry.componentArea,
          entry.suiteName,
          entry.requirementSentence,
          entry.riskArea,
          entry.issueKey ?? "",
          entry.covered ? "Yes" : "No",
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      ),
      "",
      ["Risk Area", "Mapped Cases", "Linked Cases", "Areas"].join(","),
      ...Array.from(
        traceabilityMatrix.reduce(
          (accumulator, entry) => {
            const current = accumulator.get(entry.riskArea) ?? {
              mappedCases: 0,
              linkedCases: 0,
              areas: new Set<string>(),
            };
            current.mappedCases += entry.covered ? 1 : 0;
            current.linkedCases += entry.issueKey ? 1 : 0;
            current.areas.add(entry.componentArea);
            accumulator.set(entry.riskArea, current);
            return accumulator;
          },
          new Map<
            string,
            { mappedCases: number; linkedCases: number; areas: Set<string> }
          >()
        )
      ).map(([riskArea, value]) =>
        [
          riskArea,
          value.mappedCases,
          value.linkedCases,
          Array.from(value.areas).join(" | "),
        ]
          .map((item) => `"${String(item).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traceability_matrix.csv";
    link.click();
    URL.revokeObjectURL(url);
    addAuditEntry("Traceability exported", "The traceability matrix was exported as CSV.");
  };

  const exportTraceabilityCoverageReport = () => {
    const csvLines = [
      [
        "Section",
        "Requirement Sentence",
        "Covered",
        "Gap Severity",
        "Mapped Case IDs",
        "Mapped Case Titles",
        "Mapped Areas",
        "Mapped Issues",
      ].join(","),
      ...traceabilityAnalysis.sentenceCoverage.map((entry) =>
        [
          "Requirement Coverage",
          entry.sentence,
          entry.covered ? "Yes" : "No",
          entry.covered
            ? ""
            : uncoveredRequirementInsights.find((item) => item.sentence === entry.sentence)
                ?.severity ?? "",
          entry.rowIds.join(" | "),
          entry.rowIds
            .map((rowId) => rows.find((row) => row.id === rowId)?.title || rowId)
            .join(" | "),
          entry.rowIds
            .map(
              (rowId) =>
                rows.find((row) => row.id === rowId)?.componentArea || "General"
            )
            .join(" | "),
          entry.rowIds
            .map((rowId) => rows.find((row) => row.id === rowId)?.issueKey || "")
            .filter(Boolean)
            .join(" | "),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      ),
      ...traceabilityAnalysis.uncoveredSentences.map((sentence) =>
        [
          "Uncovered Requirement",
          sentence,
          "No",
          uncoveredRequirementInsights.find((item) => item.sentence === sentence)?.severity ?? "",
          "",
          "",
          "",
          "",
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traceability_coverage_report.csv";
    link.click();
    URL.revokeObjectURL(url);
    addAuditEntry(
      "Traceability coverage exported",
      "The requirement coverage report was exported as CSV."
    );
  };

  const createDraftFromUncoveredSentence = (
    sentence: string,
    options?: { suggestedPriority?: "low" | "medium" | "high"; severity?: "low" | "medium" | "high" }
  ) => {
    appendRows([
      {
        id: "",
        type: modePrimaryType[generationMode],
        title: `Cover requirement: ${sentence.slice(0, 72)}`,
        preconditions: "",
        steps: sentence,
        expectedResult: "Validate the uncovered requirement sentence is fully covered.",
        testData: suggestTestData({
          type: modePrimaryType[generationMode],
          title: sentence,
          preconditions: "",
          steps: sentence,
          expectedResult: "Validate the uncovered requirement sentence is fully covered.",
        }),
        workflowStatus: "backlog",
        priority: options?.suggestedPriority ?? "high",
        executionResult: "not-run",
        reviewStatus: "draft",
        suiteName: "Traceability Gaps",
        componentArea:
          traceabilityAnalysis.sentenceCoverage.find(
            (item) => item.sentence === sentence
          )?.sentence.slice(0, 32) || "Requirement Gap",
        automationStatus: "candidate",
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    addAuditEntry(
      options?.severity === "high" ? "Critical gap draft created" : "Gap draft created",
      "A case draft was created from an uncovered requirement sentence."
    );
    showWorkspaceNotice(
      "success",
      "Created a draft case from the uncovered requirement sentence."
    );
  };

  const focusWorkspaceRow = useCallback((
    rowId: string,
    label = "Focused in workspace",
    commentId?: string | null
  ) => {
    setHighlightedRowId(rowId);
    setHighlightedRowLabel(label);
    setHighlightedCommentId(commentId ?? null);

    window.setTimeout(() => {
      const target = commentId
        ? document.getElementById(`test-case-comment-${commentId}`)
        : document.getElementById(`test-case-row-${rowId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
  }, []);

  const focusRequirementEditor = () => {
    window.setTimeout(() => {
      requirementTextareaRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      requirementTextareaRef.current?.focus();
    }, 80);
  };

  const setResolvedProjectId = (projectId: string) => {
    currentProjectIdRef.current = projectId;
    setCurrentProjectId(projectId);
  };

  const buildUpdatedProject = useCallback(
    (currentProjects: Project[], trimmedName: string) => {
      const activeProjectId = currentProjectIdRef.current;
      const existingIndex = currentProjects.findIndex(
        (project) => project.id === activeProjectId
      );
      const existingProject =
        existingIndex >= 0 ? currentProjects[existingIndex] : null;
      const now = Date.now();
      const resolvedProjectId =
        existingProject?.id ?? activeProjectId ?? crypto.randomUUID();
      const latestChangeEntries = analyzeChangeImpact(
        oldRequirement,
        input,
        rows,
        analyzeTraceability(
          input,
          rows,
          generationMode,
          analyzeRequirementRisk(input, persona).risks,
          persona
        ).links,
        persona
      ).changes;

      const updatedProject: Project = {
        id: resolvedProjectId,
        name: trimmedName,
        projectKey,
        sprintName,
        releaseName,
        teamName,
        input,
        oldRequirement,
        rows: normalizeRows(rows, generationMode),
        generationMode,
        coverageDepth,
        persona,
        autosaveEnabled,
        sourceArtifacts,
        reviewerName,
        reviewerNotes,
      signoffStatus,
      auditTrail,
      caseComments,
      caseWatchers,
      notifications,
      caseVersionHistory,
        caseReviewHistory,
        testDataSets,
        caseTemplates,
        automationScripts,
        automationSteps,
        automationBindings,
        automationExecutions,
        automationArtifacts,
        automationReusableBlocks,
        automationSelectorPresets,
        automationEnvironmentBindings,
        activeAutomationEnvironmentId,
        generationFeedbackLog,
        viewPreferences: {
          ...(existingProject?.viewPreferences ?? {}),
          casesDefaultPreset,
          casesDefaultSavedViewId: casesDefaultSavedViewId ?? undefined,
        },
        savedViews: {
          cases: casesSavedViews,
          runs: existingProject?.savedViews?.runs ?? [],
        },
        runs: existingProject?.runs ?? [],
        activeRunId: existingProject?.activeRunId ?? "",
        lastGeneratedChangeImpactSignature,
        latestChangeEntries,
        createdAt: existingProject?.createdAt ?? now,
        updatedAt: now,
      };

      return { existingIndex, updatedProject };
    },
    [
      auditTrail,
      autosaveEnabled,
      caseComments,
      caseWatchers,
      notifications,
      caseReviewHistory,
      casesDefaultPreset,
      casesDefaultSavedViewId,
      casesSavedViews,
      caseVersionHistory,
      testDataSets,
      caseTemplates,
      automationScripts,
      automationSteps,
      automationBindings,
      automationExecutions,
      automationArtifacts,
      automationReusableBlocks,
      automationSelectorPresets,
      automationEnvironmentBindings,
      activeAutomationEnvironmentId,
      coverageDepth,
      generationFeedbackLog,
      generationMode,
      input,
      projectKey,
      sprintName,
      releaseName,
      teamName,
      persona,
      reviewerName,
      reviewerNotes,
      rows,
      signoffStatus,
      sourceArtifacts,
      oldRequirement,
      lastGeneratedChangeImpactSignature,
    ]
  );

  const upsertProject = useCallback(
    (currentProjects: Project[], trimmedName: string) => {
      const { existingIndex, updatedProject } = buildUpdatedProject(
        currentProjects,
        trimmedName
      );
      const updatedProjects = [...currentProjects];

      if (existingIndex >= 0) {
        updatedProjects[existingIndex] = updatedProject;
      } else {
        updatedProjects.unshift(updatedProject);
      }

      return { updatedProject, updatedProjects };
    },
    [buildUpdatedProject]
  );

  const saveProjectsToBrowserFallback = useCallback(
    (updatedProjects: Project[]) => {
      const savedProjects = updatedProjects.map(hydrateProject);

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProjects));
      setProjects(savedProjects);

      const activeProject =
        savedProjects.find(
          (project) => project.id === currentProjectIdRef.current
        ) ?? savedProjects[0] ?? null;

      if (activeProject) {
        projectDataState?.setProject(activeProject);
      }

      return savedProjects;
    },
    [projectDataState]
  );

  useEffect(() => {
    if (!didLoadProjectsRef.current) {
      return;
    }

    if (!projectName.trim()) {
      setSaveStatus("idle");
      return;
    }

    if (!autosaveEnabled) {
      setSaveStatus("idle");
      return;
    }

    setSaveStatus("saving");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const persistAutosave = async () => {
        try {
          const { updatedProject, updatedProjects } = upsertProject(
            projectsRef.current,
            projectName.trim()
          );

          if (process.env.NODE_ENV !== "production") {
            console.info("[workspace autosave] queued save", {
              projectId: updatedProject.id,
              projectName: updatedProject.name,
              rowCount: updatedProject.rows.length,
              sourceArtifactCount: updatedProject.sourceArtifacts.length,
              autosaveEnabled: updatedProject.autosaveEnabled,
            });
          }

          const savedProjects = await persistProjects(updatedProjects);
          const resolvedProject =
            savedProjects.find((project) => project.id === updatedProject.id) ??
            updatedProject;

          setResolvedProjectId(resolvedProject.id);
          projectDataState?.setProject(resolvedProject);
          setLastSavedAt(resolvedProject.updatedAt);
          setSaveStatus("saved");
        } catch (error) {
          console.error("Autosave project error:", error);
          try {
            const { updatedProject, updatedProjects } = upsertProject(
              projectsRef.current,
              projectName.trim()
            );
            const savedProjects = saveProjectsToBrowserFallback(updatedProjects);
            const resolvedProject =
              savedProjects.find((project) => project.id === updatedProject.id) ??
              updatedProject;

            setResolvedProjectId(resolvedProject.id);
            projectDataState?.setProject(resolvedProject);
            setLastSavedAt(resolvedProject.updatedAt);
            setSaveStatus("saved");

            if (!didShowBrowserFallbackNoticeRef.current) {
              didShowBrowserFallbackNoticeRef.current = true;
              showWorkspaceNotice(
                "info",
                "Autosave is using browser storage because the project API is blocked by Clerk. Your edits are still saved on this browser."
              );
            }
          } catch (fallbackError) {
            console.error("Browser autosave fallback error:", fallbackError);
            setSaveStatus("error");
            showWorkspaceNotice(
              "error",
              fallbackError instanceof Error && fallbackError.message.trim()
                ? `Autosave failed: ${fallbackError.message}`
                : "Autosave failed. Your current edits are still open in the workspace."
            );
          }
        }
      };

      void persistAutosave();
    }, 700);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    projectName,
    input,
    rows,
    currentProjectId,
    generationMode,
    coverageDepth,
    persona,
    autosaveEnabled,
    sourceArtifacts,
    reviewerName,
    reviewerNotes,
    signoffStatus,
    auditTrail,
    oldRequirement,
    lastGeneratedChangeImpactSignature,
    projectDataState,
    persistProjects,
    saveProjectsToBrowserFallback,
    upsertProject,
  ]);

  const saveProjectNow = async () => {
    const trimmedName = projectName.trim();

    if (!trimmedName) {
      showWorkspaceNotice("error", "Enter a project name before saving.");
      return;
    }

    try {
      setSaveStatus("saving");

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const { updatedProject, updatedProjects } = upsertProject(
        projectsRef.current,
        trimmedName
      );

      const savedProjects = await persistProjects(updatedProjects);
      const resolvedProject =
        savedProjects.find((project) => project.id === updatedProject.id) ??
        updatedProject;

      setResolvedProjectId(resolvedProject.id);
      projectDataState?.setProject(resolvedProject);
      setLastSavedAt(resolvedProject.updatedAt);
      setSaveStatus("saved");
      showWorkspaceNotice(
        "success",
        `"${resolvedProject.name}" was saved to the project library.`
      );
    } catch (error) {
      console.error("Save project error:", error);
      try {
        const { updatedProject, updatedProjects } = upsertProject(
          projectsRef.current,
          trimmedName
        );
        const savedProjects = saveProjectsToBrowserFallback(updatedProjects);
        const resolvedProject =
          savedProjects.find((project) => project.id === updatedProject.id) ??
          updatedProject;

        setResolvedProjectId(resolvedProject.id);
        projectDataState?.setProject(resolvedProject);
        setLastSavedAt(resolvedProject.updatedAt);
        setSaveStatus("saved");
        showWorkspaceNotice(
          "info",
          `"${resolvedProject.name}" was saved in this browser because the project API is blocked by Clerk.`
        );
      } catch (fallbackError) {
        console.error("Browser save fallback error:", fallbackError);
        setSaveStatus("error");
        showWorkspaceNotice(
          "error",
          fallbackError instanceof Error && fallbackError.message.trim()
            ? `Project save failed: ${fallbackError.message}`
            : "Project save failed. Your current edits are still open in the workspace."
        );
      }
    }
  };

  const loadProject = useCallback(async (projectId: string) => {
    try {
      const response = await fetchWithRetry(
        `/api/projects/${encodeURIComponent(projectId)}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load project details.");
      }

      const data = (await response.json()) as { project?: Project };
      const project = data.project ? hydrateProject(data.project) : null;

      if (!project) {
        throw new Error("Project details are missing.");
      }

      setResolvedProjectId(project.id);
      setProjectName(project.name);
      setProjectKey(project.projectKey ?? "");
      setSprintName(project.sprintName ?? "");
      setReleaseName(project.releaseName ?? "");
      setTeamName(project.teamName ?? "");
      setOldRequirement(project.oldRequirement ?? "");
      setInput(project.input);
      setRows(normalizeRows(project.rows ?? [], project.generationMode ?? "functional"));
      setGenerationMode(project.generationMode ?? "functional");
      setCoverageDepth(project.coverageDepth ?? "standard");
      setPersona(project.persona ?? "all");
      setAutosaveEnabled(project.autosaveEnabled ?? true);
      setSourceArtifacts(project.sourceArtifacts ?? []);
      setReviewerName(project.reviewerName ?? "");
      setReviewerNotes(project.reviewerNotes ?? "");
      setSignoffStatus(project.signoffStatus ?? "draft");
      setAuditTrail(project.auditTrail ?? []);
      setCaseComments(project.caseComments ?? {});
      setCaseWatchers(project.caseWatchers ?? {});
      setNotifications(project.notifications ?? []);
      setCaseVersionHistory(project.caseVersionHistory ?? {});
      setCaseReviewHistory(project.caseReviewHistory ?? {});
      setTestDataSets(project.testDataSets ?? []);
      setCaseTemplates(project.caseTemplates ?? []);
      setAutomationScripts(project.automationScripts ?? []);
      setAutomationSteps(project.automationSteps ?? {});
      setAutomationBindings(project.automationBindings ?? []);
      setAutomationExecutions(project.automationExecutions ?? []);
      setAutomationArtifacts(project.automationArtifacts ?? []);
      const reuseLibrary = ensureAutomationReuseDefaults(project.id, project);
      setAutomationReusableBlocks(reuseLibrary.blocks);
      setAutomationSelectorPresets(reuseLibrary.selectorPresets);
      setAutomationEnvironmentBindings(reuseLibrary.environments);
      setActiveAutomationEnvironmentId(reuseLibrary.activeEnvironmentId);
      setGenerationFeedbackLog(project.generationFeedbackLog ?? []);
      setCasesSavedViews(project.savedViews?.cases ?? []);
      setCasesDefaultPreset(project.viewPreferences?.casesDefaultPreset ?? "default");
      setCasesDefaultSavedViewId(project.viewPreferences?.casesDefaultSavedViewId ?? null);
      setCaseCommentDrafts({});
      setDraggedIndex(null);
      setDragOverIndex(null);
      setRegeneratingIndex(null);
      setFillingGapId(null);
      setIsFillingAllCriticalGaps(false);
      setSeenGapIds([]);
      setIgnoredQualityFindingIds([]);
      setIgnoredPredictionIds([]);
      setFillingPredictionId(null);
        setHighlightedRowId(null);
        setHighlightedRowLabel(null);
        setHighlightedCommentId(null);
        setIsGeneratingChangeImpactCases(false);
      setLastGeneratedChangeImpactSignature(
        project.lastGeneratedChangeImpactSignature ?? null
      );
      setLastSavedAt(project.updatedAt);
      setSaveStatus("saved");
      projectDataState?.setProject(project);
      showWorkspaceNotice(
        "success",
        `"${project.name}" was loaded into the workspace.`
      );
    } catch (error) {
      console.error("Load project error:", error);
      showWorkspaceNotice("error", "Failed to load project details.");
    }
  }, [projectDataState]);

  const deleteProject = async (projectId: string) => {
    const projectToDelete =
      projectsRef.current.find((item) => item.id === projectId) ?? null;

    if (!projectToDelete) {
      showWorkspaceNotice("error", "The selected project could not be found.");
      return;
    }

    const shouldDelete = window.confirm(
      `Delete "${projectToDelete.name}" from the saved project library?`
    );

    if (!shouldDelete) {
      return;
    }

    try {
      const updatedProjects = projectsRef.current.filter(
        (item) => item.id !== projectId
      );
      await persistProjects(updatedProjects);
    } catch (error) {
      console.error("Delete project error:", error);
      showWorkspaceNotice("error", "Failed to delete project.");
      return;
    }

    showWorkspaceNotice(
      "success",
      `"${projectToDelete.name}" was removed from the saved project library.`
    );

    if (projectId !== currentProjectId) {
      return;
    }

    currentProjectIdRef.current = null;
    setCurrentProjectId(null);
    setProjectName("");
    setProjectKey("");
    setSprintName("");
    setReleaseName("");
    setTeamName("");
    setOldRequirement("");
    setInput("");
    setRows([]);
    setGenerationMode("functional");
    setCoverageDepth("standard");
    setPersona("all");
    setAutosaveEnabled(true);
    setSourceArtifacts([]);
    setReviewerName("");
    setReviewerNotes("");
    setSignoffStatus("draft");
    setAuditTrail([]);
    setCaseComments({});
    setCaseVersionHistory({});
    setCaseReviewHistory({});
    setTestDataSets([]);
    setCaseTemplates([]);
    setAutomationScripts([]);
    setAutomationSteps({});
    setAutomationBindings([]);
    setAutomationExecutions([]);
    setAutomationArtifacts([]);
    setCasesSavedViews([]);
    setCasesDefaultPreset("default");
    setCaseCommentDrafts({});
    setDraggedIndex(null);
    setDragOverIndex(null);
    setRegeneratingIndex(null);
    setFillingGapId(null);
    setIsFillingAllCriticalGaps(false);
    setSeenGapIds([]);
    setIgnoredQualityFindingIds([]);
    setIgnoredPredictionIds([]);
    setFillingPredictionId(null);
    setHighlightedRowId(null);
    setHighlightedRowLabel(null);
    setHighlightedCommentId(null);
    setIsGeneratingChangeImpactCases(false);
    setLastGeneratedChangeImpactSignature(null);
    setLastSavedAt(null);
    setSaveStatus("idle");
    projectDataState?.setProject(null);
  };

  useEffect(() => {
    if (!initialProjectRef || !hasLoadedProjects || didResolveInitialProjectRef.current) {
      return;
    }

    didResolveInitialProjectRef.current = true;

    const normalizedRef = initialProjectRef.trim().toLowerCase();
    const matchedProject = projects.find((project) => {
      const projectKeyRef = project.projectKey?.trim().toLowerCase();
      return project.id.toLowerCase() === normalizedRef || projectKeyRef === normalizedRef;
    });

    if (!matchedProject) {
      showWorkspaceNotice(
        "error",
        `No saved project matched "${initialProjectRef}".`
      );
      return;
    }

    void loadProject(matchedProject.id);
  }, [hasLoadedProjects, initialProjectRef, projects, loadProject]);

  useEffect(() => {
    const projectRef = projectKey.trim() || currentProjectId;

    if (!projectRef) {
      setProjectIssues([]);
      setLoadingProjectIssues(false);
      return;
    }

    let cancelled = false;

    const loadProjectIssues = async () => {
      setLoadingProjectIssues(true);

      try {
        const response = await fetchWithRetry(
          `/api/projects/${encodeURIComponent(projectRef)}/issues`,
          {
            cache: "no-store",
          }
        );

        const data = (await response.json()) as {
          issues?: IssueRecord[];
          status?: string;
        };

        if (cancelled) {
          return;
        }

        if (response.status === 501 || data.status === "scaffolded") {
          setProjectIssues([]);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load project issues.");
        }

        setProjectIssues(Array.isArray(data.issues) ? data.issues : []);
      } catch (error) {
        console.error("Load project issues error:", error);
        if (!cancelled) {
          setProjectIssues([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingProjectIssues(false);
        }
      }
    };

    void loadProjectIssues();

    return () => {
      cancelled = true;
    };
  }, [currentProjectId, projectKey]);

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      try {
        const response = await fetchWithRetry("/api/users", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          users?: UserOption[];
          status?: string;
        };

        if (cancelled) {
          return;
        }

        if (response.status === 501 || data.status === "scaffolded") {
          setUserOptions([]);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load users.");
        }

        setUserOptions(
          Array.isArray(data.users)
            ? data.users.filter((user) => user.isActive)
            : []
        );
      } catch {
        if (!cancelled) {
          setUserOptions([]);
        }
      }
    };

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  const generate = async () => {
    await generateForRequirement(input);
  };

  const focusRequirementComposer = () => {
    requirementTextareaRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    requirementTextareaRef.current?.focus();
  };

  const focusGeneratedCasesSection = () => {
    generatedCasesSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const focusCoverageHandoffSection = () => {
    uncoveredRequirementSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const parseGeneratedResult = (result: string) => {
    const parsedRows = parseResultToRows(result || "");
    const enrichedRows = enrichGeneratedRowsWithDomainMetadata(
      prepareGeneratedRows(parsedRows, generationMode),
      generationMode
    );
    const preparedRows = enrichedRows.map((row) => {
      const generatedBy = activeReviewer
        ? {
            id: activeReviewer.id,
            name: activeReviewer.name,
            email: activeReviewer.email,
            at: Date.now(),
          }
        : undefined;
      return {
        ...row,
        generationSource: "ai-generated" as const,
        approvalState: row.approvalState ?? "pending",
        generatedBy,
        generationFeedback: buildGenerationFeedbackRecord({
          row: {
            ...row,
            generationSource: "ai-generated",
          },
          sourceRequirement: input.trim(),
          generationMode,
          disposition: "accepted",
        }),
      };
    });

    return {
      parsedRows,
      preparedRows,
      duplicateCount: Math.max(parsedRows.length - preparedRows.length, 0),
    };
  };

  const buildLocalFallbackResult = (requirement: string) => {
    const cleanCell = (value: string) =>
      value
        .replace(/\|/g, "/")
        .replace(/\s+/g, " ")
        .trim();
    const extractSectionValue = (label: string) => {
      const lines = requirement.split(/\r?\n/).map((line) => line.trim());
      const index = lines.findIndex((line) =>
        new RegExp(`^#{0,6}\\s*${label}\\s*$`, "i").test(line)
      );

      if (index >= 0) {
        return (
          lines
            .slice(index + 1)
            .find((line) => line && !line.startsWith("#")) || ""
        );
      }

      const inlineMatch = requirement.match(
        new RegExp(`${label}\\s*:?\\s*([^\\n#]+)`, "i")
      );

      return inlineMatch?.[1]?.trim() || "";
    };
    const context = cleanCell(
      extractSectionValue("Story Title") ||
        requirement.match(/^#\s*Epic:\s*(.+)$/im)?.[1]?.trim() ||
        requirement.match(/^#+\s*(.+)$/m)?.[1]?.trim() ||
        "the requirement"
    )
      .replace(/^Epic:\s*/i, "")
      .slice(0, 90);
    const targetCaseCount = (() => {
      const normalized = requirement.toLowerCase();
      const signalCount = [
        /acceptance criteria/.test(normalized),
        /functional requirements/.test(normalized),
        /required fields/.test(normalized),
        /sales csv/.test(normalized),
        /inventory csv/.test(normalized),
        /product master csv/.test(normalized),
        /api/.test(normalized),
        /database|persist|stored/.test(normalized),
        /preview/.test(normalized),
        /performance|50k|non-functional/.test(normalized),
      ].filter(Boolean).length;
      const base =
        coverageDepth === "basic" ? 6 : coverageDepth === "thorough" ? 14 : 10;

      return Math.min(
        coverageDepth === "thorough" ? 18 : 14,
        base + Math.floor(signalCount / 2)
      );
    })();
    const modeType =
      generationMode === "api"
        ? "API"
        : generationMode === "ui" || generationMode === "accessibility"
        ? "UI"
        : generationMode === "security"
        ? "Security"
        : generationMode === "edge"
        ? "Edge"
        : generationMode === "negative"
        ? "Negative"
        : "Functional";
    const isCsvUploadStory =
      requirement.toLowerCase().includes("csv") &&
      (requirement.toLowerCase().includes("upload") ||
        requirement.toLowerCase().includes("inventory"));

    if (isCsvUploadStory) {
      const rows = [
        [
          "TC001",
          "Functional",
          "Sales CSV upload creates validated preview",
          "User is authenticated; CSV upload workspace is available",
          "Open the CSV upload screen; Select Sales CSV as the upload type; Upload a sales file with all required columns; Review the generated preview",
          "The first 20 normalized sales rows are shown with no validation errors.",
          "date=2026-05-01; sku=SKU-001; units_sold=12; selling_price=1299.50; discount_percent=10; city=Mumbai",
        ],
        [
          "TC002",
          "Functional",
          "Inventory CSV upload accepts required stock fields",
          "User is authenticated; CSV upload workspace is available",
          "Open the CSV upload screen; Select Inventory CSV as the upload type; Upload an inventory file with required stock fields; Review the preview",
          "Inventory records are normalized and previewed with sku, current_stock, warehouse, and stock_age_days.",
          "sku=SKU-001; current_stock=45; warehouse=BLR-01; stock_age_days=32",
        ],
        [
          "TC003",
          "Functional",
          "Product master upload validates catalogue attributes",
          "User is authenticated; CSV upload workspace is available",
          "Open the CSV upload screen; Select Product Master CSV as the upload type; Upload a product master file; Review the preview",
          "Product records are accepted with catalogue, pricing, color, size, and gender attributes.",
          "sku=SKU-001; product_name=Linen Shirt; category=Apparel; subcategory=Shirts; color=Blue; size=M; gender=Women; mrp=1999; cost_price=850",
        ],
        [
          "TC004",
          "Negative",
          "Missing required columns block submission",
          "User is authenticated; CSV upload workspace is available",
          "Select Sales CSV as the upload type; Upload a file without units_sold; Review the validation result; Try to submit the upload",
          "Submission is blocked and the error clearly identifies the missing units_sold column.",
          "Missing column=units_sold",
        ],
        [
          "TC005",
          "Negative",
          "Invalid data types return field-level errors",
          "User is authenticated; CSV upload workspace is available",
          "Select Inventory CSV as the upload type; Upload a file with current_stock as text; Review the validation result",
          "The system rejects the file and shows a user-friendly type error for current_stock.",
          "current_stock=forty-five; stock_age_days=12",
        ],
        [
          "TC006",
          "Negative",
          "Malformed CSV is rejected safely",
          "User is authenticated; CSV upload workspace is available",
          "Open the CSV upload screen; Upload a malformed CSV file; Review the upload response",
          "The system rejects the malformed file without saving partial records and shows a clear correction message.",
          "Broken quote; Uneven column count",
        ],
        [
          "TC007",
          "Edge",
          "Oversized file respects configured limit",
          "Upload size limit is configured; User is authenticated",
          "Open the CSV upload screen; Select a CSV file larger than the configured limit; Start the upload",
          "The upload is rejected before processing and the user sees the allowed size limit.",
          "File size greater than configured limit",
        ],
        [
          "TC008",
          "Functional",
          "Duplicate records are normalized before persistence",
          "Database connection is available; User is authenticated",
          "Upload a CSV containing duplicate sku and date records; Review duplicate handling feedback; Confirm final submission",
          "Duplicate rows are handled according to the product rule and only normalized records are persisted.",
          "Duplicate sku=SKU-001; Duplicate date=2026-05-01",
        ],
        [
          "TC009",
          "API",
          "Upload endpoint returns documented validation schema",
          "Backend upload endpoint is available; User has a valid session",
          "Submit a CSV upload request to the backend endpoint; Include an invalid row; Inspect the API response",
          "The response includes success status, upload type, preview rows, and structured validation errors.",
          "uploadType=sales; invalid row=2",
        ],
        [
          "TC010",
          "Performance",
          "Large CSV processes within expected time",
          "Performance-like test environment is available; Database is reachable",
          "Prepare a valid 50000 row CSV; Upload the file; Measure total processing time",
          "The file is validated, normalized, and prepared for persistence within 10 seconds.",
          "50000 rows; Valid sales CSV",
        ],
        [
          "TC011",
          "UI",
          "Upload flow remains keyboard accessible",
          "CSV upload screen is available; User can navigate with keyboard only",
          "Open the upload screen; Move through controls using the keyboard; Select upload type; Trigger file upload and preview",
          "Focus order is visible and logical, controls have accessible names, and the flow can be completed without a mouse.",
          "Keyboard only; WCAG 2.2 AA focus check",
        ],
      ];

      return rows
        .slice(0, targetCaseCount)
        .map((row) => row.map(cleanCell).join(" | "))
        .join("\n");
    }

    const rows = [
      [
        "TC001",
        modeType,
        "Primary user completes required flow successfully",
        `User is authenticated; ${context} workspace is available`,
        "Open the relevant workflow; Enter the required information; Submit or complete the main action",
        "The system completes the flow and shows the expected successful outcome.",
        "Valid user inputs; Standard browser session",
      ],
      [
        "TC002",
        "Negative",
        "Required validation prevents incomplete submission",
        `User is authenticated; ${context} validation rules are configured`,
        "Open the relevant workflow; Leave required information missing; Submit the action",
        "The system blocks completion and shows clear validation guidance.",
        "Missing required values; Invalid or incomplete input",
      ],
      [
        "TC003",
        "Edge",
        "Boundary input remains stable and understandable",
        `User is authenticated; ${context} workflow is available`,
        "Open the relevant workflow; Enter boundary or unusually long input; Complete the main action",
        "The system handles the boundary input without data loss, layout breakage, or unclear feedback.",
        "Long text value; Minimum or maximum allowed value",
      ],
      [
        "TC004",
        "UI",
        "Keyboard and focus flow supports completion",
        `User-facing interface exists; ${context} screen is available`,
        "Open the relevant screen; Navigate using keyboard only; Complete the main action",
        "Focus order is visible and logical, and the user can complete the flow without a mouse.",
        "Keyboard only; WCAG 2.2 AA focus visibility check",
      ],
    ];

    return rows.map((row) => row.map(cleanCell).join(" | ")).join("\n");
  };

  const generateForRequirement = async (requirementOverride?: string) => {
    const requirementToGenerate = (requirementOverride ?? input).trim();
    if (!requirementToGenerate) {
      showWorkspaceNotice("error", "Add a requirement before generating test cases.");
      return;
    }

    const generatedWorkspaceName = !projectName.trim()
      ? deriveWorkspaceNameFromRequirement(requirementToGenerate)
      : "";

    try {
      setLoading(true);

      if (generatedWorkspaceName) {
        setProjectName(generatedWorkspaceName);
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requirement: requirementToGenerate,
          mode: generationMode,
          coverage: coverageDepth,
          persona,
          orchestration: cognitiveOrchestrationPlan.promptDirective,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const message =
          typeof data?.result === "string" && data.result.trim()
            ? data.result.trim()
            : "Error generating test cases.";
        showWorkspaceNotice("error", message);
        return;
      }

      const { preparedRows, duplicateCount } = parseGeneratedResult(data.result || "");

      if (preparedRows.length === 0) {
        showWorkspaceNotice(
          "error",
          "The generator returned a weak draft. Try clarifying the requirement with the key user action, validations, and expected outcome."
        );
        return;
      }

      setRows(preparedRows);
      setGenerationFeedbackLog(
        preparedRows
          .map((row) => row.generationFeedback)
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      );
      setSeenGapIds([]);
      setIgnoredQualityFindingIds([]);
      setIgnoredPredictionIds([]);
      setFillingPredictionId(null);
        setHighlightedRowId(null);
        setHighlightedRowLabel(null);
        setHighlightedCommentId(null);
        setIsGeneratingChangeImpactCases(false);
      setLastGeneratedChangeImpactSignature(null);
      addAuditEntry(
        "Suite generated",
        `Generated ${generationMode} coverage for ${personaLabels[persona]}.`
      );
      window.setTimeout(() => {
        focusGeneratedCasesSection();
      }, 120);
      showWorkspaceNotice(
        data.warning ? "info" : "success",
        typeof data.warning === "string" && data.warning.trim()
          ? `Generated ${preparedRows.length} fallback cases because AI generation is unavailable. ${data.warning.trim()}`
          : duplicateCount > 0
          ? `Generated ${preparedRows.length} structured cases. Removed ${duplicateCount} duplicate draft${duplicateCount === 1 ? "" : "s"} and moved you straight into review${generatedWorkspaceName ? ` under "${generatedWorkspaceName}".` : "."}`
          : `Generated ${preparedRows.length} structured cases. Review the draft below, tighten anything weak, then export or open the full cases route${generatedWorkspaceName ? ` under "${generatedWorkspaceName}".` : "."}`
      );
    } catch {
      const { preparedRows } = parseGeneratedResult(
        buildLocalFallbackResult(requirementToGenerate)
      );

      if (preparedRows.length === 0) {
        showWorkspaceNotice("error", "Error generating test cases.");
        return;
      }

      if (generatedWorkspaceName) {
        setProjectName(generatedWorkspaceName);
      }

      setRows(preparedRows);
      setGenerationFeedbackLog(
        preparedRows
          .map((row) => row.generationFeedback)
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      );
      setSeenGapIds([]);
      setIgnoredQualityFindingIds([]);
      setIgnoredPredictionIds([]);
      setFillingPredictionId(null);
      setHighlightedRowId(null);
      setHighlightedRowLabel(null);
      setHighlightedCommentId(null);
      setIsGeneratingChangeImpactCases(false);
      setLastGeneratedChangeImpactSignature(null);
      addAuditEntry(
        "Suite generated",
        `Generated local fallback coverage for ${personaLabels[persona]}.`
      );
      window.setTimeout(() => {
        focusGeneratedCasesSection();
      }, 120);
      showWorkspaceNotice(
        "info",
        `Generated ${preparedRows.length} fallback cases locally because the AI request failed. Check Vercel env for GROQ_API_KEY, then regenerate for richer coverage.`
      );
    } finally {
      setLoading(false);
    }
  };

  const regenerateRow = async (index: number) => {
    try {
      const currentRow = rows[index];
      if (!currentRow) return;
      const openNotes = (caseComments[currentRow.id] ?? []).filter(
        (comment) => !comment.resolvedAt
      ).length;
      const stepCount = currentRow.steps
        .split(";")
        .map((step) => step.trim())
        .filter(Boolean).length;
      const rewriteFocus = [
        currentRow.title.trim().split(/\s+/).length < 4
          ? {
              title: "Title is weak",
              summary: "The title is too short or generic.",
              suggestion: "Rewrite it as a specific scenario and outcome.",
            }
          : null,
        stepCount < 3
          ? {
              title: "Steps are thin",
              summary: "The draft does not have enough concrete actions.",
              suggestion: "Expand it into a clearer execution flow with 3 to 6 action steps.",
            }
          : null,
        currentRow.expectedResult.trim().length < 24
          ? {
              title: "Expected result is thin",
              summary: "The final outcome is too short to guide execution or review.",
              suggestion: "Rewrite it as one clear observable outcome sentence.",
            }
          : null,
        !currentRow.preconditions.trim()
          ? {
              title: "Preconditions are missing",
              summary: "The draft lacks setup or starting-state guidance.",
              suggestion: "Add only the minimal setup needed before execution begins.",
            }
          : null,
        !currentRow.testData?.trim() || currentRow.testData.trim().toLowerCase() === "none"
          ? {
              title: "Test data is thin",
              summary: "The draft would be easier to execute with sample values.",
              suggestion: "Include realistic example data when it helps execution.",
            }
          : null,
        openNotes > 0
          ? {
              title: "Keep reviewer context in mind",
              summary: "The row still has open review notes after the rewrite.",
              suggestion: "Tighten the draft wording so the notes are easier to resolve manually.",
            }
          : null,
      ].filter(Boolean);

      setRegeneratingIndex(index);

      const res = await fetch("/api/regenerate-row", {
        method: "POST",
        body: JSON.stringify({
          row: currentRow,
          requirement: input,
          mode: generationMode,
          coverage: coverageDepth,
          persona,
          rewriteFocus,
        }),
      });

      const data = await res.json();
      const { preparedRows } = parseGeneratedResult(data.result || "");
      if (preparedRows.length === 0) {
        showWorkspaceNotice(
          "error",
          `The AI rewrite for ${currentRow.id} was too weak to apply.`
        );
        return;
      }
      const updated = [...rows];
      recordCaseVersion(currentRow, "Row regenerated from AI");
      updated[index] = {
        ...preparedRows[0],
        id: currentRow.id,
      };
      setRows(updated);
      showWorkspaceNotice(
        "success",
        rewriteFocus.length > 0
          ? `Refined ${currentRow.id} with a more targeted AI pass for the weak parts of the draft.`
          : `Refined ${currentRow.id} with a cleaner title, tighter steps, and a clearer expected result.`
      );
    } catch {
      showWorkspaceNotice("error", "Error regenerating row.");
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const updateCell = (
    index: number,
    field: keyof TestCaseRow,
    value: string
  ) => {
    const updated = [...rows];
    const previousRow = updated[index];
    if (!previousRow) {
      return;
    }
    const rowId = previousRow.id;
    const unresolvedComments =
      (caseComments[rowId] ?? []).filter((comment) => !comment.resolvedAt).length;

    if (
      field === "reviewStatus" &&
      value === "approved" &&
      (!(previousRow.reviewOwner?.trim()) || unresolvedComments > 0)
    ) {
      showWorkspaceNotice(
        "error",
        !previousRow.reviewOwner?.trim()
          ? `Assign a review owner before approving ${rowId}.`
          : `Resolve review notes before approving ${rowId}.`
      );
      return;
    }
    if (field === "automationProvider" && value && !normalizeAutomationProvider(value)) {
      showWorkspaceNotice("error", `Use a supported automation provider for ${rowId}.`);
      return;
    }
    const linkedIssue =
      field === "issueId"
        ? projectIssues.find((issue) => issue.id === value) ?? null
        : null;
    const nextRow = {
      ...updated[index],
      [field]: value,
    };
    const matchedDataSet =
      field === "testDataSetId"
        ? testDataSets.find((set) => set.id === value) ?? null
        : null;
    const previousComparableValue =
      field === "labels"
        ? (previousRow.labels ?? []).join(",")
        : String(previousRow[field] ?? "");
    const nextComparableValue =
      field === "labels" ? parseLabels(value).join(",") : String(value ?? "");

    updated[index] = {
      ...nextRow,
      issueId:
        field === "issueId"
          ? value || undefined
          : nextRow.issueId?.trim() || undefined,
      issueKey:
        field === "issueId"
          ? linkedIssue?.issueKey
          : nextRow.issueKey?.trim() || undefined,
      workflowStatus:
        field === "workflowStatus"
          ? (value as TestCaseRow["workflowStatus"])
          : nextRow.workflowStatus ?? "backlog",
      priority:
        field === "priority"
          ? (value as TestCaseRow["priority"])
          : nextRow.priority ?? "medium",
      executionResult:
        field === "executionResult"
          ? (value as TestCaseRow["executionResult"])
          : nextRow.executionResult ?? "not-run",
      reviewStatus:
        field === "reviewStatus"
          ? (value as TestCaseRow["reviewStatus"])
          : nextRow.reviewStatus ?? "draft",
      reviewOwner:
        field === "reviewOwner" ? value : (nextRow.reviewOwner ?? ""),
      suiteName: field === "suiteName" ? value : (nextRow.suiteName ?? ""),
      componentArea:
        field === "componentArea" ? value : (nextRow.componentArea ?? ""),
      testDataSetId:
        field === "testDataSetId"
          ? value || undefined
          : nextRow.testDataSetId?.trim() || undefined,
      automationStatus:
        field === "automationStatus"
          ? (value as TestCaseRow["automationStatus"])
          : nextRow.automationStatus ?? "manual",
      automationProvider:
        field === "automationProvider"
          ? normalizeAutomationProvider(value)
          : (nextRow.automationProvider ?? ""),
      automationReference:
        field === "automationReference"
          ? value
          : (nextRow.automationReference ?? ""),
      generationSource:
        field === "generationSource"
          ? (value as TestCaseRow["generationSource"])
          : nextRow.generationSource ?? "manual",
      approvalState:
        field === "approvalState"
          ? (value as TestCaseRow["approvalState"])
          : nextRow.approvalState ?? "pending",
      handoffState:
        field === "handoffState"
          ? (value as TestCaseRow["handoffState"])
          : nextRow.handoffState,
      archived:
        field === "archived"
          ? value === "true"
          : nextRow.archived ?? false,
      assignee:
        field === "assignee" ? value : (nextRow.assignee ?? ""),
      labels: field === "labels" ? parseLabels(value) : parseLabels(nextRow.labels),
      type: resolveTypeForMode(generationMode, nextRow, nextRow.type),
      testData:
        field === "testData"
          ? value
          : field === "testDataSetId" && matchedDataSet
          ? matchedDataSet.content
          : suggestTestData({
              ...nextRow,
              type: resolveTypeForMode(generationMode, nextRow, nextRow.type),
            }),
      generationFeedback:
        previousRow.generationFeedback || nextRow.generationSource === "ai-generated"
          ? buildGenerationFeedbackRecord({
              row: {
                ...nextRow,
                type: resolveTypeForMode(generationMode, nextRow, nextRow.type),
                executionResult:
                  field === "executionResult"
                    ? (value as TestCaseRow["executionResult"])
                    : nextRow.executionResult,
              } as TestCaseRow,
              existing: previousRow.generationFeedback,
              sourceRequirement: input.trim(),
              generationMode,
            })
          : undefined,
      editedBy:
        previousComparableValue !== nextComparableValue
          ? {
              id: activeReviewer?.id,
              name: activeReviewer?.name,
              email: activeReviewer?.email,
              at: Date.now(),
            }
          : nextRow.editedBy,
      approvedBy:
        field === "approvalState" && value === "approved"
          ? {
              id: activeReviewer?.id,
              name: activeReviewer?.name,
              email: activeReviewer?.email,
              at: Date.now(),
            }
          : field === "approvalState"
          ? undefined
          : nextRow.approvedBy,
      rejectedBy:
        field === "approvalState" && value === "rejected"
          ? {
              id: activeReviewer?.id,
              name: activeReviewer?.name,
              email: activeReviewer?.email,
              at: Date.now(),
            }
          : field === "approvalState"
          ? undefined
          : nextRow.rejectedBy,
      updatedAt: Date.now(),
      createdAt: nextRow.createdAt ?? Date.now(),
    };

    const trackedFields: Array<keyof TestCaseRow> = [
      "title",
      "preconditions",
      "steps",
      "expectedResult",
      "testData",
      "workflowStatus",
      "priority",
      "executionResult",
      "reviewStatus",
      "reviewOwner",
      "suiteName",
      "componentArea",
      "testDataSetId",
      "automationStatus",
      "automationProvider",
      "automationReference",
      "generationSource",
      "approvalState",
      "handoffState",
      "archived",
      "assignee",
      "labels",
      "issueId",
      "id",
    ];
    if (
      trackedFields.includes(field) &&
      previousComparableValue !== nextComparableValue
    ) {
      recordCaseVersion(
        previousRow,
        field === "reviewStatus"
          ? `Review changed to ${value}`
          : `${field} updated`
      );
    }

    setRows(updated);
    setGenerationFeedbackLog(
      updated
        .map((row) => row.generationFeedback)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    );

    if (
      field === "reviewOwner" &&
      previousComparableValue !== nextComparableValue
    ) {
      appendCaseReviewHistory(
        updated[index]?.id || rowId,
        "Review owner changed",
        value.trim()
          ? `Review ownership moved to ${value.trim()}.`
          : "Review ownership was cleared."
      );
    }

    if (field === "reviewStatus") {
      appendCaseReviewHistory(
        updated[index]?.id || rowId,
        "Review status changed",
        `${updated[index]?.id || "Case"} moved to ${
          reviewStatusLabels[
            (value as TestCaseRow["reviewStatus"] | undefined) ?? "draft"
          ] || value
        }.`
      );
      addAuditEntry(
        "Case review updated",
        `${updated[index]?.id || "Case"} review moved to ${value}.`
      );
    }

    if (field === "approvalState") {
      appendCaseReviewHistory(
        updated[index]?.id || rowId,
        "Approval state changed",
        `${updated[index]?.id || "Case"} moved to ${
          approvalStateLabels[(value as TestCaseRow["approvalState"]) || "pending"]
        }.`
      );
      addAuditEntry(
        "Case approval updated",
        `${updated[index]?.id || "Case"} approval moved to ${value}.`
      );
    }

    if (field === "handoffState") {
      appendCaseReviewHistory(
        updated[index]?.id || rowId,
        "Handoff state changed",
        value
          ? `${updated[index]?.id || "Case"} moved to ${
              handoffStateLabels[
                value as NonNullable<TestCaseRow["handoffState"]>
              ]
            }.`
          : `${updated[index]?.id || "Case"} handoff was cleared.`
      );
      addAuditEntry(
        "Case handoff updated",
        `${updated[index]?.id || "Case"} handoff moved to ${value || "cleared"}.`
      );
    }
  };

  const applyGenerationFeedback = useCallback(
    (
      rowId: string,
      signal:
        | "useful"
        | "needed-edits"
        | "low-quality"
        | "duplicate"
        | "missing-important-scenario"
    ) => {
      const targetRow = rows.find((row) => row.id === rowId);
      if (!targetRow) {
        showWorkspaceNotice("error", "That generated case could not be found.");
        return;
      }

      if (
        targetRow.generationSource !== "ai-generated" &&
        !targetRow.generationFeedback
      ) {
        showWorkspaceNotice(
          "info",
          "Generation feedback is only tracked for AI-generated draft cases."
        );
        return;
      }

      const nextDisposition =
        signal === "duplicate"
          ? "rejected"
          : signal === "low-quality"
          ? "regenerated"
          : "accepted";

      setRows((currentRows) => {
        const updatedRows = currentRows.map((row) =>
          row.id !== rowId
            ? row
            : {
                ...row,
                generationFeedback: buildGenerationFeedbackRecord({
                  row,
                  existing: row.generationFeedback,
                  sourceRequirement: input.trim(),
                  generationMode,
                  signal,
                  disposition: nextDisposition,
                }),
                updatedAt: Date.now(),
              }
        );

        setGenerationFeedbackLog(
          updatedRows
            .map((row) => row.generationFeedback)
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        );

        return updatedRows;
      });

      appendCaseReviewHistory(
        rowId,
        "Generation feedback updated",
        `${rowId} was marked as ${signal.replaceAll("-", " ")}.`
      );
      addAuditEntry(
        "Generation feedback captured",
        `${rowId} was marked as ${signal.replaceAll("-", " ")} for prompt learning and review analytics.`
      );
      showWorkspaceNotice(
        signal === "duplicate" || signal === "low-quality" ? "info" : "success",
        `Captured generation feedback for ${rowId}: ${signal.replaceAll("-", " ")}.`
      );
    },
    [addAuditEntry, appendCaseReviewHistory, generationMode, input, rows]
  );

  const generateAutomationForRow = useCallback(
    async (rowId: string) => {
      const row = rows.find((entry) => entry.id === rowId);
      if (!row) {
        showWorkspaceNotice("error", "That case could not be found for automation generation.");
        return;
      }

      setGeneratingAutomationRowIds((current) => [...current, rowId]);
      try {
        const provider =
          inferAutomationGenerationDomain(row) === "api"
            ? "api"
            : normalizeAutomationRuntimeProvider(row.automationProvider);
        setRows((currentRows) =>
          currentRows.map((entry) =>
            entry.id === rowId
              ? {
                  ...entry,
                  automationStatus:
                    entry.automationStatus === "automated" ? entry.automationStatus : "candidate",
                  automationProvider: provider,
                  automationBindingMode: entry.automationBindingMode ?? "automated",
                  updatedAt: Date.now(),
                }
              : entry
          )
        );
        showWorkspaceNotice(
          "info",
          `Automation authoring has moved to the Automation workspace. Open ${rowId} there to generate, record, edit, and run the flow.`,
          currentProjectId || projectKey.trim()
            ? [
                {
                  label: "Open Automation",
                  href: `/projects/${encodeURIComponent(
                    projectKey.trim() || currentProjectId || "workspace"
                  )}/automation/scripts?caseId=${encodeURIComponent(rowId)}`,
                },
              ]
            : undefined
        );
        router.push(
          `/projects/${encodeURIComponent(
            projectKey.trim() || currentProjectId || "workspace"
          )}/automation/scripts?caseId=${encodeURIComponent(rowId)}`
        );
      } catch (error) {
        showWorkspaceNotice(
          "error",
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to generate automation."
        );
      } finally {
        setGeneratingAutomationRowIds((current) => current.filter((entry) => entry !== rowId));
      }
    },
    [currentProjectId, projectKey, router, rows]
  );

  const generateAutomationForSelectedRows = useCallback(async () => {
    if (selectedRowIds.length === 0) {
      showWorkspaceNotice("error", "Select at least one case before generating automation.");
      return;
    }

    if (selectedRowIds.length > 1) {
      showWorkspaceNotice(
        "info",
        "Bulk automation authoring now happens in the Automation workspace. Open one case there at a time to generate or record structured flows."
      );
      router.push(
        `/projects/${encodeURIComponent(
          projectKey.trim() || currentProjectId || "workspace"
        )}/automation/scripts`
      );
      return;
    }

    await generateAutomationForRow(selectedRowIds[0]);
  }, [currentProjectId, generateAutomationForRow, projectKey, router, selectedRowIds]);

  const runAutomationForRow = useCallback(
    async (
      rowId: string,
      options?: {
        scriptId?: string;
        executionMode?: "headless" | "headed";
      }
    ) => {
      let activeProjectRef = currentProjectIdRef.current ?? currentProjectId;
      let activeProject =
        projectsRef.current.find((project) => project.id === activeProjectRef) ?? null;

      if (!activeProject) {
        const trimmedName = projectName.trim();
        if (!trimmedName) {
          const text = "Name and save the workspace before running automation.";
          showWorkspaceNotice("error", text);
          return { tone: "error" as const, text };
        }

        const { updatedProject, updatedProjects } = upsertProject(
          projectsRef.current,
          trimmedName
        );
        const savedProjects = await persistProjects(updatedProjects);
        activeProject =
          savedProjects.find((project) => project.id === updatedProject.id) ??
          updatedProject;
        activeProjectRef = activeProject.id;
        setResolvedProjectId(activeProject.id);
      }

      let activeRun =
        activeProject.runs?.find((run) => run.id === activeProject?.activeRunId) ?? null;

      if (!activeRun) {
        const now = Date.now();
        const defaultRun = {
          id: crypto.randomUUID(),
          name: "Automation Run",
          status: "active" as const,
          rowResults: {},
          rowActualResults: {},
          rowNotes: {},
          rowStepResults: {},
          rowStepNotes: {},
          rowStepActualResults: {},
          rowStepEvidence: {},
          linkedDefectIds: {},
          createdAt: now,
          updatedAt: now,
        };

        const nextProject: Project = {
          ...activeProject,
          runs: [...(activeProject.runs ?? []), defaultRun],
          activeRunId: defaultRun.id,
          updatedAt: now,
        };
        const currentActiveProjectId = activeProject.id;
        const nextProjects = projectsRef.current.map((project) =>
          project.id === currentActiveProjectId ? nextProject : project
        );
        const savedProjects = await persistProjects(nextProjects);
        const ensuredProject =
          savedProjects.find((project) => project.id === nextProject.id) ?? nextProject;
        activeProject = ensuredProject;
        activeRun =
          ensuredProject.runs?.find((run) => run.id === ensuredProject.activeRunId) ??
          defaultRun;
        activeProjectRef = ensuredProject.id;
        setResolvedProjectId(ensuredProject.id);
        showWorkspaceNotice(
          "info",
          'Created an "Automation Run" so this script can execute right away.'
        );
      }

      const response = await fetch("/api/automation/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: activeProjectRef,
          runId: activeRun.id,
          caseId: rowId,
          scriptId: options?.scriptId,
          executionMode: options?.executionMode,
        }),
      });

      const data = await parseAutomationApiResponse<{
        error?: string;
        execution?: AutomationExecution;
        artifacts?: AutomationExecutionArtifact[];
      }>(response);

      if (!response.ok || !data.execution) {
        const text = data.error || "Failed to execute automation.";
        showWorkspaceNotice("error", text);
        return { tone: "error" as const, text };
      }

      setAutomationExecutions((currentExecutions) => [
        ...currentExecutions.filter((execution) => execution.id !== data.execution?.id),
        data.execution as AutomationExecution,
      ]);
      setAutomationArtifacts((currentArtifacts) => [
        ...currentArtifacts,
        ...((data.artifacts ?? []) as AutomationExecutionArtifact[]),
      ]);
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                executionResult: data.execution?.status ?? row.executionResult,
              }
            : row
        )
      );

      const tone: "success" | "error" =
        data.execution.status === "passed" ? "success" : "error";
      const text =
        data.execution.status === "passed"
          ? `Automation passed for ${rowId}. Open Runs for case detail or Reports for the project summary.`
          : `Automation ${data.execution.status} for ${rowId}. Open Runs for details or Reports for the summary.`;

      showWorkspaceNotice(
        tone,
        text,
        activeProjectRef
          ? [
              {
                label: "View Run",
                href: `/projects/${encodeURIComponent(
                  (activeProject.projectKey?.trim() || projectKey.trim() || activeProjectRef)
                )}/runs?${new URLSearchParams({
                  runId: activeRun.id,
                  rowId,
                }).toString()}`,
              },
              {
                label: "View Report",
                href: `/projects/${encodeURIComponent(
                  (activeProject.projectKey?.trim() || projectKey.trim() || activeProjectRef)
                )}/reports`,
              },
            ]
          : undefined
      );

      return { tone, text };
    },
    [currentProjectId, persistProjects, projectKey, projectName, upsertProject]
  );

  const createAutomationIssueForRow = useCallback(
    async (rowId: string) => {
      const activeProjectRef = currentProjectIdRef.current ?? currentProjectId;
      if (!activeProjectRef) {
        showWorkspaceNotice("error", "Save the workspace as a project first.");
        return;
      }

      const row = rows.find((entry) => entry.id === rowId);
      const latestExecution = [...automationExecutions]
        .filter((execution) => execution.caseId === rowId)
        .sort((left, right) => right.startedAt - left.startedAt)[0];
      const relatedArtifacts = latestExecution
        ? automationArtifacts.filter((artifact) => artifact.executionId === latestExecution.id)
        : [];

      if (!row || !latestExecution || (latestExecution.status !== "failed" && latestExecution.status !== "blocked")) {
        showWorkspaceNotice(
          "error",
          "Run a failed or blocked automation execution before creating an issue."
        );
        return;
      }

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectKey.trim() || activeProjectRef)}/issues`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "bug",
              summary: `[Automation] ${row.title || row.id} failed in ${latestExecution.provider}`,
              description: [
                `Case: ${row.id}`,
                `Provider: ${latestExecution.provider}`,
                `Status: ${latestExecution.status}`,
                latestExecution.failureMessage
                  ? `Failure: ${latestExecution.failureMessage}`
                  : "",
                latestExecution.logSummary ? `Logs:\n${latestExecution.logSummary}` : "",
                relatedArtifacts.length > 0
                  ? `Artifacts:\n${relatedArtifacts
                      .map((artifact) => `- ${artifact.type}: ${artifact.path}`)
                      .join("\n")}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
              priority: "high",
              status: "backlog",
            }),
          }
        );

        const payload = (await response.json()) as {
          issue?: { id: string; issueKey: string; summary: string };
          error?: string;
        };

        if (!response.ok || !payload.issue) {
          throw new Error(payload.error || "Failed to create issue.");
        }
        const createdIssue = payload.issue;

        setRows((currentRows) =>
          currentRows.map((entry) =>
            entry.id === rowId
              ? {
                  ...entry,
                  issueId: createdIssue.id,
                  issueKey: createdIssue.issueKey,
                }
              : entry
          )
        );
        setAutomationExecutions((currentExecutions) =>
          currentExecutions.map((execution) =>
            execution.id === latestExecution.id
              ? {
                  ...execution,
                  linkedIssueId: createdIssue.id,
                  linkedIssueKey: createdIssue.issueKey,
                }
              : execution
          )
        );
        setProjectIssues((currentIssues) => [
          {
            id: createdIssue.id,
            issueKey: createdIssue.issueKey,
            summary: createdIssue.summary,
          },
          ...currentIssues,
        ]);
        showWorkspaceNotice(
          "success",
          `Created issue ${createdIssue.issueKey} from automation failure on ${rowId}.`
        );
      } catch (error) {
        showWorkspaceNotice(
          "error",
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to create issue."
        );
      }
    },
    [
      automationArtifacts,
      automationExecutions,
      currentProjectId,
      projectKey,
      rows,
    ]
  );

  const deleteRow = (index: number) => {
    const rowToDelete = rows[index];
    if (rowToDelete) {
      recordCaseVersion(rowToDelete, "Case deleted from active suite");
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  const replaceRowsById = (rowIds: string[], replacementRows: TestCaseRow[]) => {
    setRows((currentRows) => {
      currentRows
        .filter((row) => rowIds.includes(row.id))
        .forEach((row) => recordCaseVersion(row, "Case replaced by workspace merge"));
      const keptRows = currentRows.filter((row) => !rowIds.includes(row.id));
      return mergeRows(keptRows, replacementRows, generationMode);
    });
  };

  const addNewRow = () => {
    setRows([
      ...rows,
      {
        id: formatTestCaseId(rows.length),
        type: modePrimaryType[generationMode],
        title: "",
        preconditions: "",
        steps: "",
        expectedResult: "",
        testData: suggestTestData({
          type: modePrimaryType[generationMode],
          title: "",
          preconditions: "",
          steps: "",
          expectedResult: "",
        }),
        workflowStatus: "backlog",
        priority: "medium",
        executionResult: "not-run",
        reviewStatus: "draft",
        suiteName: "",
        componentArea: "",
        testDataSetId: undefined,
        automationStatus: "manual",
        automationReference: "",
        archived: false,
        assignee: "",
        labels: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
  };

  const appendRows = (incomingRows: TestCaseRow[]) => {
    setRows((currentRows) => mergeRows(currentRows, incomingRows, generationMode));
  };

  const addManualGapDraft = (gapId: string) => {
    if (rows.some((row) => row.gapSourceId === gapId)) {
      alert("This gap already has linked coverage rows in the workspace.");
      return;
    }

    const draft = createManualGapDraft(gapId);
    const gapLabel = getCoverageGapTitle(gapId);
    appendRows([
      {
        id: "",
        ...draft,
        gapSourceId: gapId,
        gapSourceLabel: gapLabel,
        gapSourceMethod: "manual",
      },
    ]);
  };

  const addManualPredictionDraft = (predictionId: string) => {
    if (rows.some((row) => row.predictionSourceId === predictionId)) {
      alert("This likely defect zone already has linked coverage rows in the workspace.");
      return;
    }

    const draft = createManualPredictionDraft(predictionId, persona);
    const predictionLabel = getBugPredictionTitle(predictionId);
    const targetRowId = formatTestCaseId(rows.length);
    appendRows([
      {
        id: targetRowId,
        ...draft,
        predictionSourceId: predictionId,
        predictionSourceLabel: predictionLabel,
        predictionSourceMethod: "manual",
      },
    ]);
    showWorkspaceNotice(
      "success",
      `Added a manual draft for ${predictionLabel.toLowerCase()}.`
    );
    focusWorkspaceRow(targetRowId, "Manual defect draft");
  };

  const requestGapFill = async (gapId: string, existingRows: TestCaseRow[]) => {
    const res = await fetch("/api/fill-coverage-gap", {
      method: "POST",
      body: JSON.stringify({
        requirement: input,
        mode: generationMode,
        coverage: coverageDepth,
        persona,
        gapId,
        existingRows,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.result || "Failed to fill coverage gap.");
    }

    const { preparedRows } = parseGeneratedResult(data.result || "");

    if (preparedRows.length === 0) {
      throw new Error("No additional test cases were returned.");
    }

    const gapLabel = getCoverageGapTitle(gapId);

    return preparedRows.map((row) => ({
      ...row,
      gapSourceId: gapId,
      gapSourceLabel: gapLabel,
      gapSourceMethod: "auto" as const,
    }));
  };

  const autoFillGap = async (gapId: string) => {
    if (!input.trim()) {
      alert("Please add a requirement before filling a coverage gap.");
      return;
    }

    if (rows.some((row) => row.gapSourceId === gapId)) {
      alert("This gap already has linked coverage rows in the workspace.");
      return;
    }

    try {
      setFillingGapId(gapId);
      const generatedRows = await requestGapFill(gapId, rows);
      appendRows(generatedRows);
    } catch (error) {
      console.error("Fill coverage gap error:", error);
      alert("Unable to generate missing cases for this gap.");
    } finally {
      setFillingGapId(null);
    }
  };

  const requestPredictionCover = async (
    predictionId: string,
    existingRows: TestCaseRow[]
  ) => {
    const res = await fetch("/api/fill-bug-prediction", {
      method: "POST",
      body: JSON.stringify({
        requirement: input,
        mode: generationMode,
        coverage: coverageDepth,
        persona,
        predictionId,
        existingRows,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.result || "Failed to cover likely defect zone.");
    }

    const { preparedRows } = parseGeneratedResult(data.result || "");

    if (preparedRows.length === 0) {
      throw new Error("No additional test cases were returned.");
    }

    const predictionLabel = getBugPredictionTitle(predictionId);

    return preparedRows.map((row) => ({
      ...row,
      predictionSourceId: predictionId,
      predictionSourceLabel: predictionLabel,
      predictionSourceMethod: "auto" as const,
    }));
  };

  const autoCoverPrediction = async (predictionId: string) => {
    if (!input.trim()) {
      alert("Please add a requirement before covering a likely defect zone.");
      return;
    }

    if (rows.some((row) => row.predictionSourceId === predictionId)) {
      alert("This likely defect zone already has linked coverage rows in the workspace.");
      return;
    }

    try {
      setFillingPredictionId(predictionId);
      showWorkspaceNotice(
        "info",
        `Auto-covering ${getBugPredictionTitle(predictionId).toLowerCase()}...`
      );
      const targetRowId = formatTestCaseId(rows.length);
      const generatedRows = await requestPredictionCover(predictionId, rows);
      appendRows(generatedRows);
      showWorkspaceNotice(
        "success",
        `Added targeted cases for ${getBugPredictionTitle(predictionId).toLowerCase()}.`
      );
      focusWorkspaceRow(targetRowId, "Added from defect zone");
    } catch (error) {
      console.error("Fill bug prediction error:", error);
      showWorkspaceNotice(
        "error",
        "Unable to generate targeted cases for this likely defect zone."
      );
      alert("Unable to generate targeted cases for this likely defect zone.");
    } finally {
      setFillingPredictionId(null);
    }
  };

  const autoFillCriticalGaps = async () => {
    if (!input.trim()) {
      alert("Please add a requirement before filling coverage gaps.");
      return;
    }

    const criticalGaps = coverageGapAnalysis.gaps.filter(
      (gap) =>
        (gap.severity === "high" || gap.severity === "medium") &&
        !rows.some((row) => row.gapSourceId === gap.id)
    );

    if (criticalGaps.length === 0) {
      alert("No unfilled critical gaps are currently available.");
      return;
    }

    try {
      setIsFillingAllCriticalGaps(true);
      let workingRows = [...rows];

      for (const gap of criticalGaps) {
        const generatedRows = await requestGapFill(gap.id, workingRows);
        workingRows = mergeRows(workingRows, generatedRows, generationMode);
      }

      setRows(workingRows);
    } catch (error) {
      console.error("Fill all critical gaps error:", error);
      alert("Unable to fill all critical gaps right now.");
    } finally {
      setIsFillingAllCriticalGaps(false);
      setFillingGapId(null);
    }
  };

  const getFindingById = (findingId: string) =>
    caseQualityAnalysis.findings.find((finding) => finding.id === findingId);

  const getRowStrengthScore = (row: TestCaseRow) => {
    const stepCount = row.steps
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean).length;
    const expectedScore = Math.min(row.expectedResult.trim().length, 120);
    const titleScore = Math.min(row.title.trim().split(/\s+/).length * 10, 60);
    const preconditionScore = Math.min(
      row.preconditions.trim().split(";").filter(Boolean).length * 8,
      32
    );

    return stepCount * 15 + expectedScore + titleScore + preconditionScore;
  };

  const mergeQualityFinding = async (findingId: string) => {
    const finding = getFindingById(findingId);
    if (!finding || finding.rowIds.length < 2) {
      return;
    }

    if (!input.trim()) {
      alert("Please add a requirement before merging similar cases.");
      return;
    }

    const sourceRows = rows.filter((row) => finding.rowIds.includes(row.id));
    if (sourceRows.length < 2) {
      alert("The selected rows are no longer available.");
      return;
    }

    try {
      setActiveQualityFindingId(findingId);
      const res = await fetch("/api/merge-similar-cases", {
        method: "POST",
        body: JSON.stringify({
          requirement: input,
          mode: generationMode,
          persona,
          rows: sourceRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.result || "Failed to merge similar cases.");
      }

      const { preparedRows: mergedRows } = parseGeneratedResult(data.result || "");

      if (mergedRows.length === 0) {
        throw new Error("No merged test case was returned.");
      }

      replaceRowsById(finding.rowIds, mergedRows);
    } catch (error) {
      console.error("Merge similar cases error:", error);
      alert("Unable to merge the selected similar cases.");
    } finally {
      setActiveQualityFindingId(null);
    }
  };

  const keepBestQualityFinding = (findingId: string) => {
    const finding = getFindingById(findingId);
    if (!finding || finding.rowIds.length < 2) {
      return;
    }

    const candidateRows = rows.filter((row) => finding.rowIds.includes(row.id));
    if (candidateRows.length < 2) {
      alert("The selected rows are no longer available.");
      return;
    }

    const bestRow = candidateRows.reduce((best, row) =>
      getRowStrengthScore(row) > getRowStrengthScore(best) ? row : best
    );
    const rowsToRemove = candidateRows
      .filter((row) => row.id !== bestRow.id)
      .map((row) => row.id);

    setRows((currentRows) =>
      currentRows
        .filter((row) => !rowsToRemove.includes(row.id))
        .map((row, index) => ({
          ...row,
          id: formatTestCaseId(index),
        }))
    );
  };

  const rewriteQualityFinding = async (findingId: string) => {
    const finding = getFindingById(findingId);
    if (!finding || finding.rowIds.length === 0) {
      return;
    }

    if (!input.trim()) {
      showWorkspaceNotice("error", "Add a requirement before rewriting a weak case.");
      return;
    }

    const targetRowId = finding.rowIds[0];
    const targetIndex = rows.findIndex((row) => row.id === targetRowId);
    const targetRow = targetIndex >= 0 ? rows[targetIndex] : null;
    const relatedWeakFindings = caseQualityAnalysis.findings.filter(
      (item) =>
        (item.type === "vague" ||
          item.type === "low-value" ||
          item.type === "weak") &&
        item.rowIds.includes(targetRowId)
    );

    if (!targetRow) {
      showWorkspaceNotice("error", "The selected weak case is no longer available.");
      return;
    }

    try {
      setActiveQualityFindingId(findingId);
      showWorkspaceNotice(
        "info",
        `Rewriting ${targetRowId} for ${personaLabels[persona].toLowerCase()}...`
      );
      const res = await fetch("/api/regenerate-row", {
        method: "POST",
        body: JSON.stringify({
          row: targetRow,
          requirement: input,
          mode: generationMode,
          coverage: coverageDepth,
          persona,
          rewriteFocus: relatedWeakFindings.map((item) => ({
            title: item.title,
            summary: item.summary,
            suggestion: item.suggestion,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.result || "Failed to rewrite weak case.");
      }

      const { preparedRows } = parseGeneratedResult(data.result || "");
      const rewrittenRow = preparedRows[0];

      if (!rewrittenRow) {
        throw new Error("No rewritten row was returned.");
      }

      setRows((currentRows) => {
        const updatedRows = [...currentRows];
        recordCaseVersion(updatedRows[targetIndex], "Weak case rewritten from cleanup guide");
        updatedRows[targetIndex] = {
          ...updatedRows[targetIndex],
          ...rewrittenRow,
          id: targetRowId,
        };
        return updatedRows;
      });
      focusWorkspaceRow(targetRowId, "Recently rewritten");
      showWorkspaceNotice(
        "success",
        `${targetRowId} was rewritten and updated in the workspace.`
      );
    } catch (error) {
      console.error("Rewrite weak case error:", error);
      showWorkspaceNotice(
        "error",
        "Unable to rewrite the selected weak case right now."
      );
    } finally {
      setActiveQualityFindingId(null);
    }
  };

  const ignoreQualityFinding = (findingId: string) => {
    setIgnoredQualityFindingIds((currentIds) =>
      currentIds.includes(findingId)
        ? currentIds
        : [...currentIds, findingId]
    );
  };

  const ignorePrediction = (predictionId: string) => {
    setIgnoredPredictionIds((currentIds) =>
      currentIds.includes(predictionId)
        ? currentIds
        : [...currentIds, predictionId]
    );
  };

  const setRowLifecycleStatus = (
    rowId: string,
    status: "obsolete" | "needs-review" | "needs-update"
  ) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              lifecycleStatus: status,
            }
          : row
      )
    );
  };

  const applyRecommendedLifecycleStatuses = () => {
    if (changeImpactAnalysis.changes.length === 0) {
      alert("No requirement changes were detected.");
      return;
    }

    if (rows.length === 0) {
      alert("Generate or add test cases before applying lifecycle statuses.");
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) => {
        const impactedRow = changeImpactAnalysis.impactedRows.find(
          (item) => item.id === row.id
        );

        if (row.changeSourceType === "new") {
          return {
            ...row,
            lifecycleStatus: "new",
          };
        }

        return impactedRow
          ? {
              ...row,
              lifecycleStatus: impactedRow.recommendedAction,
            }
          : {
              ...row,
              lifecycleStatus: "keep",
            };
      })
    );
    addAuditEntry(
      "Workflow statuses applied",
      "Cases were marked as keep, new, obsolete, needs review, or needs update from the latest requirement comparison."
    );
  };

  const generateChangeImpactCases = async () => {
    if (!oldRequirement.trim() || !input.trim()) {
      alert("Please provide both old and current requirements first.");
      return;
    }

    if (changeImpactAnalysis.changes.length === 0) {
      alert("No requirement changes were detected.");
      return;
    }

    if (hasGeneratedCurrentChangeImpactCases) {
      alert(
        "Change-impact cases were already generated for this requirement comparison. Update the old or current requirement first to generate a new batch."
      );
      return;
    }

    try {
      setIsGeneratingChangeImpactCases(true);

      const res = await fetch("/api/generate-change-impact-cases", {
        method: "POST",
        body: JSON.stringify({
          oldRequirement,
          newRequirement: input,
          mode: generationMode,
          persona,
          changes: changeImpactAnalysis.changes,
          existingRows: rows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.result || "Failed to generate impact cases.");
      }

      const { preparedRows } = parseGeneratedResult(data.result || "");
      const generatedRows = preparedRows.map((row) => ({
        ...row,
        changeSourceLabel: "Added from change impact",
        changeSourceType: "new" as const,
        lifecycleStatus: "new" as const,
      }));

      if (generatedRows.length === 0) {
        throw new Error("No change-impact cases were returned.");
      }

      appendRows(generatedRows);
      setLastGeneratedChangeImpactSignature(changeImpactSignature);
      addAuditEntry(
        "Change cases generated",
        `${generatedRows.length} new cases were added from the detected requirement changes.`
      );
    } catch (error) {
      console.error("Generate change impact cases error:", error);
      alert("Unable to generate new cases from the requirement changes.");
    } finally {
      setIsGeneratingChangeImpactCases(false);
    }
  };

  const moveRow = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= rows.length ||
      toIndex >= rows.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const updated = [...rows];
    const [movedRow] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedRow);

    setRows(
      updated.map((row, index) => ({
        ...row,
        id: formatTestCaseId(index),
      }))
    );
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(rowsToText(rows));
    alert("Copied!");
  };

  const summaryText = useMemo(
    () => `${rows.length} test case${rows.length !== 1 ? "s" : ""}`,
    [rows]
  );
  const linkedIssueCount = useMemo(
    () => rows.filter((row) => Boolean(row.issueId)).length,
    [rows]
  );
  const unlinkedCaseCount = rows.length - linkedIssueCount;
  const rowTitles = useMemo(
    () =>
      rows.reduce<Record<string, string>>((accumulator, row) => {
        accumulator[row.id] = row.title.trim() || "Untitled test case";
        return accumulator;
      }, {}),
    [rows]
  );
  const predictionLinkedRows = useMemo(
    () =>
      rows.reduce<Record<string, string[]>>((accumulator, row) => {
        if (!row.predictionSourceId) {
          return accumulator;
        }

        if (!accumulator[row.predictionSourceId]) {
          accumulator[row.predictionSourceId] = [];
        }

        accumulator[row.predictionSourceId].push(row.id);
        return accumulator;
      }, {}),
    [rows]
  );
  const typeSummaryText = useMemo(() => {
    const uniqueTypes = new Set(
      rows.map((row) => row.type.trim()).filter(Boolean)
    ).size;

    return `${uniqueTypes} type${uniqueTypes === 1 ? "" : "s"} in use`;
  }, [rows]);
  const planningSummaryText = useMemo(() => {
    const parts = [
      projectKey.trim() || "NO-KEY",
      sprintName.trim() || "No sprint",
      releaseName.trim() || "No release",
      teamName.trim() || "No team",
    ];

    return parts.join(" | ");
  }, [projectKey, sprintName, releaseName, teamName]);
  const isDraftWorkspaceRoute = !currentProjectId && !initialProjectRef;
  const activeProjectRouteRef = useMemo(() => {
    if (isDraftWorkspaceRoute) {
      return "new";
    }

    const normalizedKey = projectKey.trim() || currentProjectId || initialProjectRef || "new";
    return encodeURIComponent(normalizedKey);
  }, [currentProjectId, initialProjectRef, isDraftWorkspaceRoute, projectKey]);
  const activeReviewerLabel = useMemo(
    () =>
      activeReviewer?.name ||
      activeReviewer?.email ||
      reviewerName.trim() ||
      "active reviewer",
    [activeReviewer?.email, activeReviewer?.name, reviewerName]
  );
  const activeProjectWorkspaceHref =
    activeProjectRouteRef === "new"
      ? "/projects/new"
      : `/projects/${activeProjectRouteRef}/workspace`;
  const activeProjectBoardHref =
    activeProjectRouteRef === "new"
      ? "/projects/new"
      : `/projects/${activeProjectRouteRef}/board`;
  const activeProjectCasesHref =
    activeProjectRouteRef === "new"
      ? "/projects/new"
      : `/projects/${activeProjectRouteRef}/cases`;
  const activeProjectIssuesHref =
    activeProjectRouteRef === "new"
      ? "/projects/new"
      : `/projects/${activeProjectRouteRef}/issues`;
  const handleProjectRouteClick = (
    event: MouseEvent<HTMLAnchorElement>,
    routeLabel: "Cases" | "Board" | "Issues"
  ) => {
    if (!isDraftWorkspaceRoute) {
      return;
    }

    event.preventDefault();

    if (routeLabel === "Cases" && rows.length === 0) {
      setRouteNotice("Generate test cases first, then save the workspace before opening Cases.");
      showWorkspaceNotice(
        "info",
        "Generate test cases first, then save the workspace before opening the Cases route."
      );
      return;
    }

    setRouteNotice(`Save this workspace as a project before opening ${routeLabel}.`);
    showWorkspaceNotice(
      "info",
      `Save this workspace as a project before opening ${routeLabel}. CaseForge needs a project key to build that route.`
    );
  };
  const requirementRiskAnalysis = useMemo(
    () => analyzeRequirementRisk(input, persona),
    [input, persona]
  );
  const acceptanceCriteriaAnalysis = useMemo(
    () => analyzeAcceptanceCriteria(input, persona),
    [input, persona]
  );
  const ambiguityQuestionAnalysis = useMemo(
    () => analyzeAmbiguityQuestions(input, persona),
    [input, persona]
  );
  const bugPredictionAnalysis = useMemo(
    () => analyzeBugPredictions(input, rows, persona),
    [input, rows, persona]
  );
  const coverageGapAnalysis = useMemo(
    () => analyzeCoverageGaps(rows, generationMode, persona),
    [rows, generationMode, persona]
  );
  const cognitiveOrchestrationPlan = useMemo(
    () =>
      buildCognitiveOrchestrationPlan({
        requirement: input,
        rows,
        generationMode,
        coverageDepth,
        persona,
        requirementRiskAnalysis,
        ambiguityQuestionAnalysis,
        coverageGapAnalysis,
      }),
    [
      input,
      rows,
      generationMode,
      coverageDepth,
      persona,
      requirementRiskAnalysis,
      ambiguityQuestionAnalysis,
      coverageGapAnalysis,
    ]
  );
  const applyCognitiveOrchestrationPlan = () => {
    setGenerationMode(cognitiveOrchestrationPlan.recommendedMode);
    setCoverageDepth(cognitiveOrchestrationPlan.recommendedCoverage);
    setPersona(cognitiveOrchestrationPlan.recommendedPersona);
    showWorkspaceNotice(
      "info",
      "Applied cognitive orchestration recommendations to generation settings."
    );
  };
  const traceabilityAnalysis = useMemo(
    () =>
      analyzeTraceability(
        input,
        rows,
        generationMode,
        requirementRiskAnalysis.risks,
        persona
      ),
    [input, rows, generationMode, requirementRiskAnalysis.risks, persona]
  );
  const caseQualityAnalysis = useMemo(
    () => analyzeCaseQuality(rows, ignoredQualityFindingIds),
    [rows, ignoredQualityFindingIds]
  );
  const executionReadinessAnalysis = useMemo(
    () => analyzeExecutionReadiness(rows, generationMode, persona),
    [rows, generationMode, persona]
  );
  const changeImpactAnalysis = useMemo(
    () =>
      analyzeChangeImpact(
        oldRequirement,
        input,
        rows,
        traceabilityAnalysis.links,
        persona
      ),
    [oldRequirement, input, rows, traceabilityAnalysis.links, persona]
  );
  const changeImpactSignature = useMemo(
    () =>
      JSON.stringify({
        oldRequirement: oldRequirement.trim(),
        newRequirement: input.trim(),
        changes: changeImpactAnalysis.changes.map((change) => ({
          type: change.type,
          oldSentence: change.oldSentence ?? "",
          newSentence: change.newSentence ?? "",
          summary: change.summary,
        })),
      }),
    [oldRequirement, input, changeImpactAnalysis.changes]
  );
  const hasGeneratedCurrentChangeImpactCases =
    lastGeneratedChangeImpactSignature !== null &&
    lastGeneratedChangeImpactSignature === changeImpactSignature;
  const duplicateGapIds = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.gapSourceId).filter(Boolean))
      ) as string[],
    [rows]
  );
  const resolvedGaps = useMemo(() => {
    const activeGapIds = new Set(coverageGapAnalysis.gaps.map((gap) => gap.id));

    return seenGapIds
      .filter((gapId) => !activeGapIds.has(gapId))
      .map((gapId) => getCoverageGapTitle(gapId));
  }, [coverageGapAnalysis.gaps, seenGapIds]);
  const reviewInsights = useMemo(
    () =>
      buildReviewInsights(
        rows,
        traceabilityAnalysis.links,
        requirementRiskAnalysis.risks
      ),
    [rows, traceabilityAnalysis.links, requirementRiskAnalysis.risks]
  );
  const trustCenterAnalysis = useMemo(
    () =>
      buildTrustCenterAnalysis(
        requirementRiskAnalysis,
        coverageGapAnalysis,
        auditTrail
      ),
    [requirementRiskAnalysis, coverageGapAnalysis, auditTrail]
  );
  const duplicateRowIds = useMemo(
    () =>
      Array.from(
        new Set(
          caseQualityAnalysis.findings
            .filter(
              (finding) =>
                finding.type === "duplicate" || finding.type === "overlap"
            )
            .flatMap((finding) => finding.rowIds)
        )
      ),
    [caseQualityAnalysis.findings]
  );
  const impactedRowIdSet = useMemo(
    () => new Set(changeImpactAnalysis.impactedRowIds),
    [changeImpactAnalysis.impactedRowIds]
  );
  const caseAssigneeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => row.assignee?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [rows]
  );
  const caseSuiteOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => row.suiteName?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [rows]
  );
  const caseComponentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => row.componentArea?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [rows]
  );
  const draftCleanupRowIdSet = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => {
            const openNotes = (caseComments[row.id] ?? []).filter(
              (comment) => !comment.resolvedAt
            ).length;
            const stepCount = row.steps
              .split(";")
              .map((step) => step.trim())
              .filter(Boolean).length;

            return (
              row.title.trim().split(/\s+/).length < 4 ||
              stepCount < 3 ||
              row.expectedResult.trim().length < 24 ||
              !row.reviewOwner?.trim() ||
              openNotes > 0
            );
          })
          .map((row) => row.id)
      ),
    [caseComments, rows]
  );
  const rowsNeedingDraftCleanupCount = useMemo(
    () => draftCleanupRowIdSet.size,
    [draftCleanupRowIdSet]
  );
  const approvalReadyRowIdSet = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => {
            const openNotes = (caseComments[row.id] ?? []).filter(
              (comment) => !comment.resolvedAt
            ).length;
            const stepCount = row.steps
              .split(";")
              .map((step) => step.trim())
              .filter(Boolean).length;
            return (
              Boolean(row.reviewOwner?.trim()) &&
              openNotes === 0 &&
              row.title.trim().split(/\s+/).length >= 4 &&
              stepCount >= 3 &&
              row.expectedResult.trim().length >= 24
            );
          })
          .map((row) => row.id)
      ),
    [caseComments, rows]
  );
  const readyForApprovalCount = useMemo(
    () => approvalReadyRowIdSet.size,
    [approvalReadyRowIdSet]
  );
  const reviewHandoffReadyRowIdSet = useMemo(
    () =>
      new Set(
        rows
          .filter(
            (row) =>
              approvalReadyRowIdSet.has(row.id) &&
              (row.reviewStatus ?? "draft") !== "in-review" &&
              (row.reviewStatus ?? "draft") !== "approved"
          )
          .map((row) => row.id)
      ),
    [approvalReadyRowIdSet, rows]
  );
  const reviewHandoffReadyCount = useMemo(
    () => reviewHandoffReadyRowIdSet.size,
    [reviewHandoffReadyRowIdSet]
  );
  const filterCounts = useMemo(
    () => ({
      all: rows.length,
      keep: rows.filter((row) => row.lifecycleStatus === "keep").length,
      new: rows.filter((row) => row.lifecycleStatus === "new").length,
      "needs-update": rows.filter((row) => row.lifecycleStatus === "needs-update")
        .length,
      "needs-review": rows.filter((row) => row.lifecycleStatus === "needs-review")
        .length,
      obsolete: rows.filter((row) => row.lifecycleStatus === "obsolete").length,
      "draft-cleanup": rowsNeedingDraftCleanupCount,
      "approval-ready": readyForApprovalCount,
      duplicate: rows.filter((row) => duplicateRowIds.includes(row.id)).length,
      impacted: rows.filter((row) => impactedRowIdSet.has(row.id)).length,
      manual: rows.filter(
        (row) =>
          row.gapSourceMethod === "manual" ||
          row.predictionSourceMethod === "manual"
      ).length,
      gap: rows.filter((row) => Boolean(row.gapSourceId)).length,
      defect: rows.filter((row) => Boolean(row.predictionSourceId)).length,
    }),
    [rows, rowsNeedingDraftCleanupCount, readyForApprovalCount, duplicateRowIds, impactedRowIdSet]
  );
  const filteredRows = useMemo(
    () => {
      const normalizedSearch = caseSearchQuery.trim().toLowerCase();

      return rows.filter((row) => {
        const matchesWorkspaceFilter = (() => {
          switch (workspaceFilter) {
          case "keep":
          case "new":
          case "needs-update":
          case "needs-review":
          case "obsolete":
              return row.lifecycleStatus === workspaceFilter;
          case "draft-cleanup":
              return draftCleanupRowIdSet.has(row.id);
          case "approval-ready":
              return approvalReadyRowIdSet.has(row.id);
          case "duplicate":
              return duplicateRowIds.includes(row.id);
          case "impacted":
              return impactedRowIdSet.has(row.id);
          case "manual":
              return (
                row.gapSourceMethod === "manual" ||
                row.predictionSourceMethod === "manual"
              );
          case "gap":
              return Boolean(row.gapSourceId);
          case "defect":
              return Boolean(row.predictionSourceId);
          default:
              return true;
          }
        })();

        if (!matchesWorkspaceFilter) {
          return false;
        }

        if (
          focusedRowIds.length > 0 &&
          !focusedRowIds.includes(row.id)
        ) {
          return false;
        }

        if (
          caseAssigneeFilter &&
          (row.assignee?.trim() || "") !== caseAssigneeFilter
        ) {
          return false;
        }

        if (casePriorityFilter && (row.priority ?? "medium") !== casePriorityFilter) {
          return false;
        }

        if (caseTestDomainFilter && (row.testDomain ?? "") !== caseTestDomainFilter) {
          return false;
        }

        if (caseRiskLevelFilter && (row.riskLevel ?? "") !== caseRiskLevelFilter) {
          return false;
        }

        if (
          caseSecurityCategoryFilter &&
          (row.securityCategory ?? "") !== caseSecurityCategoryFilter
        ) {
          return false;
        }

        if (
          caseAccessibilityCategoryFilter &&
          (row.accessibilityCategory ?? "") !== caseAccessibilityCategoryFilter
        ) {
          return false;
        }

        if (
          caseApprovalStateFilter &&
          (row.approvalState ?? "pending") !== caseApprovalStateFilter
        ) {
          return false;
        }

        if (
          caseHandoffStateFilter &&
          (row.handoffState ?? "") !== caseHandoffStateFilter
        ) {
          return false;
        }

        if (caseLinkedFilter === "linked" && !row.issueId && !row.issueKey) {
          return false;
        }

        if (caseLinkedFilter === "unlinked" && (row.issueId || row.issueKey)) {
          return false;
        }

        if (
          caseExecutionFilter &&
          (row.executionResult ?? "not-run") !== caseExecutionFilter
        ) {
          return false;
        }

        if (caseReviewFilter && (row.reviewStatus ?? "draft") !== caseReviewFilter) {
          return false;
        }

        if (caseReviewHealthFilter === "open-notes") {
          const unresolvedComments = (caseComments[row.id] ?? []).filter(
            (comment) => !comment.resolvedAt
          ).length;
          if (unresolvedComments === 0) {
            return false;
          }
        }

        if (
          caseReviewHealthFilter === "history" &&
          (caseReviewHistory[row.id] ?? []).length === 0
        ) {
          return false;
        }

        const watcherId =
          activeReviewer?.id || activeReviewer?.email || activeReviewer?.name || "";
        const isWatching = Boolean(
          watcherId &&
            (caseWatchers[row.id] ?? []).some((watcher) => watcher.id === watcherId)
        );
        const isMentioned = (caseComments[row.id] ?? []).some((comment) =>
          (comment.mentions ?? []).some(
            (mention) =>
              mention.matchedUserId === activeReviewer?.id ||
              mention.label.toLowerCase() ===
                `@${(activeReviewer?.name || "").toLowerCase()}` ||
              mention.label.toLowerCase() ===
                `@${(activeReviewer?.email || "").toLowerCase()}`
          )
        );

        if (caseCollaborationFilter === "watching") {
          if (!isWatching) {
            return false;
          }
        }

        if (caseCollaborationFilter === "mentioned") {
          if (!isMentioned) {
            return false;
          }
        }

        if (caseCollaborationFilter === "attention") {
          const hasUnreadAttention = notifications.some(
            (notification) =>
              notification.rowId === row.id &&
              matchesReviewerNotification(notification, activeReviewer) &&
              !notification.archivedAt &&
              !notification.readAt
          );

          if (!hasUnreadAttention && !isWatching && !isMentioned) {
            return false;
          }
        }

        if (caseSuiteFilter && (row.suiteName?.trim() || "") !== caseSuiteFilter) {
          return false;
        }

        if (
          caseComponentFilter &&
          (row.componentArea?.trim() || "") !== caseComponentFilter
        ) {
          return false;
        }

        if (
          caseAutomationFilter &&
          (row.automationStatus ?? "manual") !== caseAutomationFilter
        ) {
          return false;
        }

        if (
          caseAutomationProviderFilter &&
          (row.automationProvider?.trim() || "") !== caseAutomationProviderFilter
        ) {
          return false;
        }

        if (caseArchivedFilter === "active" && row.archived) {
          return false;
        }

        if (caseArchivedFilter === "archived" && !row.archived) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const haystack = [
          row.id,
          row.title,
          row.type,
          row.issueKey,
          row.assignee,
          row.reviewStatus,
          row.testDomain,
          row.securityCategory,
          row.accessibilityCategory,
          row.complianceReference,
          row.riskLevel,
          row.suiteName,
          row.componentArea,
          row.automationStatus,
          row.automationProvider,
          row.automationReference,
          row.labels?.join(" "),
          row.steps,
          row.expectedResult,
          caseComments[row.id]?.map((comment) => comment.body).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      });
    },
    [
      rows,
      workspaceFilter,
      focusedRowIds,
      draftCleanupRowIdSet,
      approvalReadyRowIdSet,
      duplicateRowIds,
      impactedRowIdSet,
      caseSearchQuery,
      caseAssigneeFilter,
      casePriorityFilter,
      caseTestDomainFilter,
      caseRiskLevelFilter,
      caseSecurityCategoryFilter,
      caseAccessibilityCategoryFilter,
      caseApprovalStateFilter,
      caseHandoffStateFilter,
      caseLinkedFilter,
      caseExecutionFilter,
      caseCollaborationFilter,
      caseReviewHealthFilter,
      caseReviewFilter,
      caseSuiteFilter,
      caseComponentFilter,
      caseAutomationFilter,
      caseAutomationProviderFilter,
      caseArchivedFilter,
      caseComments,
      caseWatchers,
      notifications,
      caseReviewHistory,
      activeReviewer,
    ]
  );
  const visibleSelectedCount = useMemo(
    () => filteredRows.filter((row) => selectedRowIds.includes(row.id)).length,
    [filteredRows, selectedRowIds]
  );
  const hasFilteredRows = filteredRows.length > 0;
  const reportData = useMemo(
    () =>
      buildWorkspaceReportData({
        projectName,
        requirement: input,
        generationMode,
        coverageDepth,
        persona,
        rows,
        sourceArtifacts,
        reviewerName,
        reviewerNotes,
        signoffStatus,
        auditTrail,
        requirementRiskAnalysis,
        ambiguityQuestionAnalysis,
        coverageGapAnalysis,
        executionReadinessAnalysis,
        caseQualityAnalysis,
        changeImpactAnalysis,
        traceabilityAnalysis,
        reviewInsights,
        trustCenterAnalysis,
      }),
    [
      projectName,
      input,
      generationMode,
      coverageDepth,
      persona,
      rows,
      sourceArtifacts,
      reviewerName,
      reviewerNotes,
      signoffStatus,
      auditTrail,
      requirementRiskAnalysis,
      ambiguityQuestionAnalysis,
      coverageGapAnalysis,
      executionReadinessAnalysis,
      caseQualityAnalysis,
      changeImpactAnalysis,
      traceabilityAnalysis,
      reviewInsights,
      trustCenterAnalysis,
    ]
  );
  const traceabilityMatrix = useMemo(
    () => buildTraceabilityMatrix(rows, traceabilityAnalysis),
    [rows, traceabilityAnalysis]
  );
  const traceabilityHealthSummary = useMemo(
    () => buildTraceabilityHealthSummary(rows, traceabilityAnalysis),
    [rows, traceabilityAnalysis]
  );
  const uncoveredRequirementInsights = useMemo(
    () =>
      buildUncoveredRequirementInsights(
        traceabilityAnalysis.uncoveredSentences,
        requirementRiskAnalysis
      ),
    [traceabilityAnalysis.uncoveredSentences, requirementRiskAnalysis]
  );
  const coverageHotspots = useMemo(() => buildCoverageHotspots(rows), [rows]);
  const caseReviewSummary = useMemo(() => {
    const reviewHistoryEntries = Object.values(caseReviewHistory).flat();
    const approvalEvents = reviewHistoryEntries.filter(
      (entry) => entry.action === "Review status changed" && entry.detail.includes("Approved")
    ).length;
    const ownershipChanges = reviewHistoryEntries.filter(
      (entry) => entry.action === "Review owner changed"
    ).length;
    const openReviewNotes = Object.values(caseComments).reduce(
      (count, comments) =>
        count + comments.filter((comment) => !comment.resolvedAt).length,
      0
    );

    return {
      eventCount: reviewHistoryEntries.length,
      approvalEvents,
      ownershipChanges,
      openReviewNotes,
    };
  }, [caseComments, caseReviewHistory]);
  const reviewerWorkload = useMemo(
    () =>
      Object.entries(
        rows.reduce<Record<string, { assignedCases: number; openNotes: number; approvedCases: number }>>(
          (accumulator, row) => {
            const owner = row.reviewOwner?.trim();
            if (!owner) {
              return accumulator;
            }

            const currentEntry = accumulator[owner] ?? {
              assignedCases: 0,
              openNotes: 0,
              approvedCases: 0,
            };
            currentEntry.assignedCases += 1;
            currentEntry.openNotes += (caseComments[row.id] ?? []).filter(
              (comment) => !comment.resolvedAt
            ).length;
            if ((row.reviewStatus ?? "draft") === "approved") {
              currentEntry.approvedCases += 1;
            }
            accumulator[owner] = currentEntry;
            return accumulator;
          },
          {}
        )
      )
        .map(([owner, stats]) => ({ owner, ...stats }))
        .sort((left, right) => right.assignedCases - left.assignedCases)
        .slice(0, 5),
    [caseComments, rows]
  );
  const approvalTimelineRollup = useMemo(() => {
    const entries = Object.values(caseReviewHistory)
      .flat()
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 8);

    return entries;
  }, [caseReviewHistory]);
  const casesWithOpenReviewNotesCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          (caseComments[row.id] ?? []).filter((comment) => !comment.resolvedAt).length > 0
      ).length,
    [caseComments, rows]
  );
  const casesWithReviewHistoryCount = useMemo(
    () => rows.filter((row) => (caseReviewHistory[row.id] ?? []).length > 0).length,
    [caseReviewHistory, rows]
  );
  const nextStepGuidance = useMemo(() => {
    if (rowsNeedingDraftCleanupCount > 0) {
      return {
        heading: "Fix the weak draft cases first",
        detail:
          "Start with the rows that still need stronger titles, fuller steps, or clearer expected results so the draft becomes easier to trust.",
      };
    }

    if (traceabilityAnalysis.uncoveredSentences.length > 0) {
      return {
        heading: "Check the remaining uncovered requirement statements",
        detail:
          "The main draft is in better shape. Before you move on, scan the statements that still do not have mapped coverage and turn any important gaps into cases.",
      };
    }

    if (reviewHandoffReadyCount > 0) {
      return {
        heading: "Send the ready cases into review",
        detail:
          "These drafts are clean enough to hand off. Move them to In Review so the suite keeps moving without extra manual status changes.",
      };
    }

    return {
      heading: "The draft is in a healthy state",
      detail:
        "You have cleaned the weak rows, checked coverage, and moved review-ready work forward. You can keep reviewing, export, or continue in the full cases route.",
    };
  }, [
    reviewHandoffReadyCount,
    rowsNeedingDraftCleanupCount,
    traceabilityAnalysis.uncoveredSentences.length,
  ]);
  const activeReviewerWatcherId =
    activeReviewer?.id || activeReviewer?.email || activeReviewer?.name || "";
  const watchedCasesCount = useMemo(
    () =>
      rows.filter((row) =>
        (caseWatchers[row.id] ?? []).some((watcher) => watcher.id === activeReviewerWatcherId)
      ).length,
    [activeReviewerWatcherId, caseWatchers, rows]
  );
  const mentionedCasesCount = useMemo(
    () =>
      rows.filter((row) =>
        (caseComments[row.id] ?? []).some((comment) =>
          (comment.mentions ?? []).some(
            (mention) =>
              mention.matchedUserId === activeReviewer?.id ||
              mention.label.toLowerCase() === `@${(activeReviewer?.name || "").toLowerCase()}` ||
              mention.label.toLowerCase() === `@${(activeReviewer?.email || "").toLowerCase()}`
          )
        )
      ).length,
    [activeReviewer?.email, activeReviewer?.id, activeReviewer?.name, caseComments, rows]
  );
  const myReviewAttentionCount = useMemo(
    () =>
      rows.filter((row) => {
        const hasOpenNotes = (caseComments[row.id] ?? []).some(
          (comment) => !comment.resolvedAt
        );
        if (!hasOpenNotes) {
          return false;
        }

        const isWatching = (caseWatchers[row.id] ?? []).some(
          (watcher) => watcher.id === activeReviewerWatcherId
        );
        const isMentioned = (caseComments[row.id] ?? []).some((comment) =>
          (comment.mentions ?? []).some(
            (mention) =>
              mention.matchedUserId === activeReviewer?.id ||
              mention.label.toLowerCase() === `@${(activeReviewer?.name || "").toLowerCase()}` ||
              mention.label.toLowerCase() === `@${(activeReviewer?.email || "").toLowerCase()}`
          )
        );

        return isWatching || isMentioned;
      }).length,
    [
      activeReviewer?.email,
      activeReviewer?.id,
      activeReviewer?.name,
      activeReviewerWatcherId,
      caseComments,
      caseWatchers,
      rows,
    ]
  );
  const reviewerNotifications = useMemo(
    () =>
      notifications
        .filter(
          (notification) =>
            matchesReviewerNotification(notification, activeReviewer) &&
            !notification.archivedAt
        )
        .sort((left, right) => right.createdAt - left.createdAt),
    [activeReviewer, notifications]
  );
  const unreadReviewerNotificationsCount = useMemo(
    () => reviewerNotifications.filter((notification) => !notification.readAt).length,
    [reviewerNotifications]
  );
  const reviewerAttentionByRowId = useMemo(
    () =>
      reviewerNotifications.reduce<
        Record<
          string,
          {
            unreadCount: number;
            mentionCount: number;
            watchCount: number;
            latestNotification?: ReviewerNotification;
          }
        >
      >((accumulator, notification) => {
        if (!notification.rowId) {
          return accumulator;
        }

        const current = accumulator[notification.rowId] ?? {
          unreadCount: 0,
          mentionCount: 0,
          watchCount: 0,
          latestNotification: undefined,
        };
        const nextLatest =
          !current.latestNotification ||
          notification.createdAt > current.latestNotification.createdAt
            ? notification
            : current.latestNotification;

        accumulator[notification.rowId] = {
          unreadCount: current.unreadCount + (notification.readAt ? 0 : 1),
          mentionCount:
            current.mentionCount + (notification.type === "case-mention" ? 1 : 0),
          watchCount:
            current.watchCount + (notification.type === "case-watch" ? 1 : 0),
          latestNotification: nextLatest,
        };

        return accumulator;
      }, {}),
    [reviewerNotifications]
  );
  const reviewerAttentionOnlyCount = useMemo(
    () =>
      rows.filter((row) => Boolean(reviewerAttentionByRowId[row.id]?.unreadCount))
        .length,
    [reviewerAttentionByRowId, rows]
  );
  const currentCasesViewFilters = useMemo(
    () => ({
      searchQuery: caseSearchQuery,
      assignee: caseAssigneeFilter,
      priority: casePriorityFilter,
      testDomain: caseTestDomainFilter,
      riskLevel: caseRiskLevelFilter,
      securityCategory: caseSecurityCategoryFilter,
      accessibilityCategory: caseAccessibilityCategoryFilter,
      approvalState: caseApprovalStateFilter,
      handoffState: caseHandoffStateFilter,
      linked: caseLinkedFilter,
      execution: caseExecutionFilter,
      review: caseReviewFilter,
      reviewHealth: caseReviewHealthFilter,
      collaboration: caseCollaborationFilter,
      suite: caseSuiteFilter,
      component: caseComponentFilter,
      automation: caseAutomationFilter,
      automationProvider: caseAutomationProviderFilter,
      archived: caseArchivedFilter,
    }),
    [
      caseArchivedFilter,
      caseAssigneeFilter,
      caseAccessibilityCategoryFilter,
      caseAutomationFilter,
      caseAutomationProviderFilter,
      caseComponentFilter,
      caseExecutionFilter,
      caseLinkedFilter,
      casePriorityFilter,
      caseRiskLevelFilter,
      caseCollaborationFilter,
      caseReviewFilter,
      caseReviewHealthFilter,
      caseSearchQuery,
      caseSecurityCategoryFilter,
      caseSuiteFilter,
      caseTestDomainFilter,
      caseApprovalStateFilter,
      caseHandoffStateFilter,
    ]
  );
  const activeCasesPreset = useMemo(() => {
    if (
      !caseSearchQuery &&
      !caseAssigneeFilter &&
      !casePriorityFilter &&
      !caseTestDomainFilter &&
      !caseRiskLevelFilter &&
      !caseSecurityCategoryFilter &&
      !caseAccessibilityCategoryFilter &&
      !caseApprovalStateFilter &&
      !caseHandoffStateFilter &&
      caseLinkedFilter === "all" &&
      !caseExecutionFilter &&
      !caseReviewFilter &&
      !caseReviewHealthFilter &&
      !caseCollaborationFilter &&
      !caseSuiteFilter &&
      !caseComponentFilter &&
      !caseAutomationFilter &&
      !caseAutomationProviderFilter &&
      caseArchivedFilter === "active"
    ) {
      return "default";
    }

    if (
      !caseSearchQuery &&
      !caseAssigneeFilter &&
      !casePriorityFilter &&
      !caseTestDomainFilter &&
      !caseRiskLevelFilter &&
      !caseSecurityCategoryFilter &&
      !caseAccessibilityCategoryFilter &&
      !caseApprovalStateFilter &&
      !caseHandoffStateFilter &&
      caseLinkedFilter === "all" &&
      !caseExecutionFilter &&
      !caseReviewFilter &&
      caseReviewHealthFilter === "open-notes" &&
      !caseCollaborationFilter &&
      !caseSuiteFilter &&
      !caseComponentFilter &&
      !caseAutomationFilter &&
      !caseAutomationProviderFilter &&
      caseArchivedFilter === "active"
    ) {
      return "review-queue";
    }

    if (
      !caseSearchQuery &&
      !caseAssigneeFilter &&
      !casePriorityFilter &&
      !caseTestDomainFilter &&
      !caseRiskLevelFilter &&
      !caseSecurityCategoryFilter &&
      !caseAccessibilityCategoryFilter &&
      !caseApprovalStateFilter &&
      !caseHandoffStateFilter &&
      caseLinkedFilter === "linked" &&
      caseExecutionFilter === "failed" &&
      !caseReviewFilter &&
      !caseReviewHealthFilter &&
      !caseCollaborationFilter &&
      !caseSuiteFilter &&
      !caseComponentFilter &&
      !caseAutomationFilter &&
      !caseAutomationProviderFilter &&
      caseArchivedFilter === "active"
    ) {
      return "failed-linked";
    }

    return "custom";
  }, [
    caseArchivedFilter,
    caseAssigneeFilter,
    caseAccessibilityCategoryFilter,
    caseAutomationFilter,
    caseAutomationProviderFilter,
    caseComponentFilter,
    caseExecutionFilter,
    caseLinkedFilter,
    casePriorityFilter,
    caseRiskLevelFilter,
    caseCollaborationFilter,
    caseReviewFilter,
    caseReviewHealthFilter,
    caseSearchQuery,
    caseSecurityCategoryFilter,
    caseSuiteFilter,
    caseTestDomainFilter,
    caseApprovalStateFilter,
    caseHandoffStateFilter,
  ]);
  const activeSavedCasesView = useMemo(
    () =>
      casesSavedViews.find(
        (view) => JSON.stringify(view.filters) === JSON.stringify(currentCasesViewFilters)
      ) ?? null,
    [casesSavedViews, currentCasesViewFilters]
  );
  const orderedCasesSavedViews = useMemo(
    () =>
      [...casesSavedViews].sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) {
          return left.pinned ? -1 : 1;
        }
        return right.updatedAt - left.updatedAt;
      }),
    [casesSavedViews]
  );
  const hasCaseMetadataFiltersApplied = useMemo(
    () =>
      Boolean(
        caseTestDomainFilter ||
          caseRiskLevelFilter ||
          caseSecurityCategoryFilter ||
          caseAccessibilityCategoryFilter
      ),
    [
      caseAccessibilityCategoryFilter,
      caseRiskLevelFilter,
      caseSecurityCategoryFilter,
      caseTestDomainFilter,
    ]
  );
  const activeCaseQuickFilterCount = useMemo(
    () =>
      [
        caseAssigneeFilter,
        caseLinkedFilter !== "all" ? caseLinkedFilter : "",
        caseReviewHealthFilter,
        caseCollaborationFilter,
      ].filter(Boolean).length,
    [
      caseAssigneeFilter,
      caseCollaborationFilter,
      caseLinkedFilter,
      caseReviewHealthFilter,
    ]
  );
  const activeCaseAdvancedFilterCount = useMemo(
    () =>
      [
        casePriorityFilter,
        caseTestDomainFilter,
        caseRiskLevelFilter,
        caseExecutionFilter,
        caseSuiteFilter,
        caseComponentFilter,
        caseAutomationFilter,
        caseAutomationProviderFilter,
        caseSecurityCategoryFilter,
        caseAccessibilityCategoryFilter,
        caseApprovalStateFilter,
        caseHandoffStateFilter,
        caseArchivedFilter !== "active" ? caseArchivedFilter : "",
        caseReviewFilter,
      ].filter((value) => String(value).trim().length > 0).length,
    [
      caseAccessibilityCategoryFilter,
      caseApprovalStateFilter,
      caseArchivedFilter,
      caseAutomationFilter,
      caseAutomationProviderFilter,
      caseComponentFilter,
      caseExecutionFilter,
      caseHandoffStateFilter,
      casePriorityFilter,
      caseReviewFilter,
      caseRiskLevelFilter,
      caseSecurityCategoryFilter,
      caseSuiteFilter,
      caseTestDomainFilter,
    ]
  );
  const orderedCaseTemplates = useMemo(
    () =>
      [...caseTemplates].sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) {
          return left.pinned ? -1 : 1;
        }
        return right.updatedAt - left.updatedAt;
      }),
    [caseTemplates]
  );
  const visibleCaseTemplates = useMemo(() => {
    const normalizedQuery = templateSearchQuery.trim().toLowerCase();

    return orderedCaseTemplates.filter((template) => {
      if (templateFilterMode === "favorites" && !template.pinned) {
        return false;
      }
      if (templateFilterMode === "starters" && template.category !== "provider-starter") {
        return false;
      }
      if (templateFilterMode === "provider" && !template.automationProvider?.trim()) {
        return false;
      }
      if (
        templateFilterMode === "imported" &&
        (!template.sourceProjectName?.trim() ||
          template.sourceProjectName.trim() === (projectName.trim() || "Untitled Project"))
      ) {
        return false;
      }
      if (
        templateFilterMode === "local" &&
        template.sourceProjectName?.trim() &&
        template.sourceProjectName.trim() !== (projectName.trim() || "Untitled Project")
      ) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        template.name,
        template.automationProvider,
        template.automationReference,
        template.title,
        template.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [orderedCaseTemplates, projectName, templateFilterMode, templateSearchQuery]);

  const visiblePendingTemplateImportItems = useMemo(() => {
    if (!pendingTemplateImport) {
      return [];
    }

    return pendingTemplateImport.items.filter((item) => {
      if (
        templateImportFilterMode !== "all" &&
        item.importStatus !== templateImportFilterMode
      ) {
        return false;
      }

      const provider = item.template.automationProvider?.trim() || "Unspecified";
      if (templateImportProviderFilter && provider !== templateImportProviderFilter) {
        return false;
      }

      const source =
        item.template.sourceProjectName?.trim() ||
        pendingTemplateImport.sourceProjectName?.trim() ||
        "Unknown source";
      if (templateImportSourceFilter && source !== templateImportSourceFilter) {
        return false;
      }

      return true;
    });
  }, [
    pendingTemplateImport,
    templateImportFilterMode,
    templateImportProviderFilter,
    templateImportSourceFilter,
  ]);

  const orderedPendingTemplateImportItems = useMemo(() => {
    const items = [...visiblePendingTemplateImportItems];
    const rankForMode = (item: PendingTemplateImportItem) => {
      if (templateImportSortMode === "replace-first") {
        return item.importStatus === "replace"
          ? 0
          : item.importStatus === "rename"
          ? 1
          : 2;
      }

      if (templateImportSortMode === "new-first") {
        return item.importStatus === "new"
          ? 0
          : item.importStatus === "rename"
          ? 1
          : 2;
      }

      return 0;
    };

    return items.sort((left, right) => {
      const leftRank = rankForMode(left);
      const rightRank = rankForMode(right);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.template.name.localeCompare(right.template.name);
    });
  }, [templateImportSortMode, visiblePendingTemplateImportItems]);

  const latestTemplateImportAuditEntry = useMemo(
    () =>
      [...auditTrail]
        .filter((entry) => entry.action === "Case template pack imported")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null,
    [auditTrail]
  );
  const recentTemplateImportAuditEntries = useMemo(
    () =>
      [...auditTrail]
        .filter((entry) => entry.action === "Case template pack imported")
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 4),
    [auditTrail]
  );
  const templateHistoryProviderOptions = useMemo(
    () =>
      Array.from(
        new Set(
          recentTemplateImportAuditEntries.flatMap((entry) =>
            parseTemplateOperationAuditSegments(entry.detail, "Providers")
          )
        )
      ).sort((left, right) => left.localeCompare(right)),
    [recentTemplateImportAuditEntries]
  );
  const templateHistorySourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          recentTemplateImportAuditEntries.flatMap((entry) =>
            parseTemplateOperationAuditSegments(entry.detail, "Sources")
          )
        )
      ).sort((left, right) => left.localeCompare(right)),
    [recentTemplateImportAuditEntries]
  );
  const filteredRecentTemplateImportAuditEntries = useMemo(
    () =>
      recentTemplateImportAuditEntries.filter((entry) => {
        const providerMatches = templateHistoryProviderFilter
          ? parseTemplateOperationAuditSegments(entry.detail, "Providers").some((segment) =>
              segment.startsWith(templateHistoryProviderFilter)
            )
          : true;
        const sourceMatches = templateHistorySourceFilter
          ? parseTemplateOperationAuditSegments(entry.detail, "Sources").some((segment) =>
              segment.startsWith(templateHistorySourceFilter)
            )
          : true;

        return providerMatches && sourceMatches;
      }),
    [
      recentTemplateImportAuditEntries,
      templateHistoryProviderFilter,
      templateHistorySourceFilter,
    ]
  );

  const selectedTemplateImportDiffItem = useMemo(() => {
    if (!pendingTemplateImport || !selectedTemplateImportDiffId) {
      return null;
    }

    return (
      pendingTemplateImport.items.find(
        (item) => item.template.id === selectedTemplateImportDiffId
      ) ?? null
    );
  }, [pendingTemplateImport, selectedTemplateImportDiffId]);

  const pendingTemplateImportSummary = useMemo(() => {
    if (!pendingTemplateImport) {
      return {
        providerCounts: [] as Array<{ provider: string; count: number }>,
        sourceCounts: [] as Array<{ source: string; count: number }>,
      };
    }

    const providerMap = new Map<string, number>();
    const sourceMap = new Map<string, number>();

    for (const item of pendingTemplateImport.items) {
      const provider = item.template.automationProvider?.trim() || "Unspecified";
      providerMap.set(provider, (providerMap.get(provider) ?? 0) + 1);

      const source =
        item.template.sourceProjectName?.trim() ||
        pendingTemplateImport.sourceProjectName?.trim() ||
        "Unknown source";
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    }

    return {
      providerCounts: Array.from(providerMap.entries())
        .map(([provider, count]) => ({ provider, count }))
        .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider)),
      sourceCounts: Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source)),
    };
  }, [pendingTemplateImport]);
  const importedTemplateCount = useMemo(
    () =>
      orderedCaseTemplates.filter(
        (template) =>
          template.sourceProjectName?.trim() &&
          template.sourceProjectName.trim() !== (projectName.trim() || "Untitled Project")
      ).length,
    [orderedCaseTemplates, projectName]
  );
  const myReviewQueueFilters = useMemo<CasesSavedView["filters"]>(
    () => ({
      searchQuery: "",
      assignee: "",
      priority: "",
      testDomain: "",
      riskLevel: "",
      securityCategory: "",
      accessibilityCategory: "",
      approvalState: "",
      handoffState: "needs-qa-review" as const,
      linked: "all" as const,
      execution: "",
      review: "",
      reviewHealth: "open-notes" as const,
      collaboration: "mentioned" as const,
      suite: "",
      component: "",
      automation: "",
      automationProvider: "",
      archived: "active" as const,
    }),
    []
  );
  const reviewQueueFilters = useMemo<CasesSavedView["filters"]>(
    () => ({
      searchQuery: "",
      assignee: "",
      priority: "",
      testDomain: "",
      riskLevel: "",
      securityCategory: "",
      accessibilityCategory: "",
      approvalState: "pending" as const,
      handoffState: "needs-qa-review" as const,
      linked: "all" as const,
      execution: "",
      review: "in-review" as const,
      reviewHealth: "open-notes" as const,
      collaboration: "",
      suite: "",
      component: "",
      automation: "",
      automationProvider: "",
      archived: "active" as const,
    }),
    []
  );
  const strongCandidateFilters = useMemo<CasesSavedView["filters"]>(
    () => ({
      searchQuery: "",
      assignee: "",
      priority: "",
      testDomain: "",
      riskLevel: "",
      securityCategory: "",
      accessibilityCategory: "",
      approvalState: "",
      handoffState: "needs-automation" as const,
      linked: "all" as const,
      execution: "",
      review: "",
      reviewHealth: "",
      collaboration: "",
      suite: "",
      component: "",
      automation: "candidate" as const,
      automationProvider: "",
      archived: "active" as const,
    }),
    []
  );
  const releaseBlockingFilters = useMemo<CasesSavedView["filters"]>(
    () => ({
      searchQuery: "",
      assignee: "",
      priority: "",
      testDomain: "",
      riskLevel: "",
      securityCategory: "",
      accessibilityCategory: "",
      approvalState: "",
      handoffState: "release-blocking" as const,
      linked: "all" as const,
      execution: "",
      review: "",
      reviewHealth: "",
      collaboration: "",
      suite: "",
      component: "",
      automation: "",
      automationProvider: "",
      archived: "active" as const,
    }),
    []
  );
  const caseManagementSummary = useMemo(
    () =>
      buildCaseManagementSummary(
        {
          id: currentProjectId ?? "workspace-draft",
          name: projectName || "Untitled Project",
          input,
          rows,
          generationMode,
          coverageDepth,
          persona,
          autosaveEnabled,
          sourceArtifacts,
          reviewerName,
        reviewerNotes,
        signoffStatus,
        auditTrail,
        caseComments,
        caseWatchers,
        caseVersionHistory,
          caseReviewHistory,
          testDataSets,
          caseTemplates,
          createdAt: lastSavedAt ?? Date.now(),
          updatedAt: Date.now(),
        } as Project,
        caseQualityAnalysis
      ),
    [
      auditTrail,
      autosaveEnabled,
      caseComments,
      caseWatchers,
      caseReviewHistory,
      caseQualityAnalysis,
      caseTemplates,
      caseVersionHistory,
      coverageDepth,
      currentProjectId,
      generationMode,
      input,
      lastSavedAt,
      persona,
      projectName,
      reviewerName,
      reviewerNotes,
      rows,
      signoffStatus,
      sourceArtifacts,
      testDataSets,
    ]
  );
  const generationQualitySignals = useMemo(
    () =>
      buildGenerationQualitySignals({
        id: currentProjectId ?? "workspace-draft",
        name: projectName || "Untitled Project",
        input,
        rows,
        generationMode,
        coverageDepth,
        persona,
        autosaveEnabled,
        sourceArtifacts,
        reviewerName,
        reviewerNotes,
        signoffStatus,
        auditTrail,
        caseComments,
        caseWatchers,
        notifications,
        caseVersionHistory,
        caseReviewHistory,
        testDataSets,
        caseTemplates,
        automationScripts,
        automationSteps,
        automationBindings,
        automationExecutions,
        automationArtifacts,
        automationReusableBlocks,
        automationSelectorPresets,
        automationEnvironmentBindings,
        activeAutomationEnvironmentId,
        generationFeedbackLog,
        createdAt: lastSavedAt ?? Date.now(),
        updatedAt: Date.now(),
      } as Project),
    [
      activeAutomationEnvironmentId,
      auditTrail,
      autosaveEnabled,
      automationArtifacts,
      automationBindings,
      automationEnvironmentBindings,
      automationExecutions,
      automationReusableBlocks,
      automationScripts,
      automationSelectorPresets,
      automationSteps,
      caseComments,
      caseReviewHistory,
      caseTemplates,
      caseVersionHistory,
      caseWatchers,
      coverageDepth,
      currentProjectId,
      generationFeedbackLog,
      generationMode,
      input,
      lastSavedAt,
      notifications,
      persona,
      projectName,
      reviewerName,
      reviewerNotes,
      rows,
      signoffStatus,
      sourceArtifacts,
      testDataSets,
    ]
  );
  const workflowValuePath = useMemo(() => {
    const automatedCases = rows.filter((row) => row.automationStatus === "automated").length;
    const activeRun =
      (projectsRef.current
        .find((project) => project.id === currentProjectId)
        ?.runs?.find((run) => run.id === projectsRef.current.find((project) => project.id === currentProjectId)?.activeRunId)) ??
      null;
    const runResults = activeRun ? Object.values(activeRun.rowResults) : [];
    const failedRuns = runResults.filter((item) => item === "failed" || item === "blocked").length;
    const runHealthLabel =
      runResults.length === 0
        ? "No runs yet"
        : failedRuns === 0
        ? "Runs are healthy"
        : `${failedRuns} failing or blocked`;
    const releaseReadinessLabel =
      failedRuns === 0 && rows.length > 0
        ? "Ready with current evidence"
        : failedRuns > 0
        ? "Risk needs review"
        : "Not assessed yet";

    return {
      requirementReady: Boolean(input.trim()),
      generatedCases: rows.length,
      automatedCases,
      runHealthLabel,
      releaseReadinessLabel,
    };
  }, [currentProjectId, input, rows]);
  const caseAutomationProviderOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...automationProviderOptions,
          ...(caseManagementSummary.automationProviderSummary ?? []).map(
            (entry) => entry.provider
          ),
          ...rows
            .map((row) => row.automationProvider?.trim() || "")
            .filter(Boolean),
        ])
      ).sort((left, right) => left.localeCompare(right)),
    [caseManagementSummary.automationProviderSummary, rows]
  );
  const providerFocusedCandidateViews = useMemo(
    () =>
      (caseManagementSummary.automationProviderSummary ?? [])
        .filter((entry) => entry.provider && entry.provider !== "Unspecified")
        .slice(0, 3),
    [caseManagementSummary.automationProviderSummary]
  );
  const providerStarterTemplates = useMemo(
    () => [
      {
        provider: "Playwright",
        name: "Playwright UI Flow Starter",
        type: "UI",
        title: "Validate core browser flow with Playwright",
        preconditions: "Playwright project setup is available and target selectors are stable.",
        steps:
          "1. Open the application in a browser context.\n2. Execute the main user flow.\n3. Assert the expected UI state after each major action.",
        expectedResult:
          "The browser flow is repeatable and can be implemented as a Playwright scenario.",
        automationReference: "playwright/e2e/",
      },
      {
        provider: "Cypress",
        name: "Cypress Smoke Path Starter",
        type: "UI",
        title: "Validate smoke path with Cypress",
        preconditions: "Cypress environment variables and base URL are configured.",
        steps:
          "1. Launch the app in Cypress.\n2. Execute the primary smoke path.\n3. Assert visible success and error states as needed.",
        expectedResult:
          "The smoke journey is stable and suited for Cypress regression coverage.",
        automationReference: "cypress/e2e/",
      },
      {
        provider: "Postman",
        name: "Postman API Regression Starter",
        type: "API",
        title: "Validate API regression path with Postman",
        preconditions: "API environment values and auth tokens are available.",
        steps:
          "1. Prepare the request payload and variables.\n2. Send the API request.\n3. Assert status, schema, and key response fields.",
        expectedResult:
          "The API behavior is stable and can be captured in a Postman collection.",
        automationReference: "postman/collection.json",
      },
      {
        provider: "Jest/Vitest",
        name: "Jest/Vitest Service Logic Starter",
        type: "Functional",
        title: "Validate service logic with Jest/Vitest",
        preconditions: "Test runner and dependency mocks are configured.",
        steps:
          "1. Arrange inputs and mocks.\n2. Execute the service or helper.\n3. Assert returned values and side effects.",
        expectedResult:
          "The service logic can be covered in a Jest/Vitest automation suite.",
        automationReference: "tests/unit/",
      },
    ],
    []
  );

  const handleImportSource = (
    type: SourceArtifactType,
    title: string,
    content: string,
    mode: "replace" | "append"
  ) => {
    const result = importSourceArtifact({
      type,
      title,
      content,
      existingRequirement: input,
      mode,
    });

    setInput(result.requirementText);
    setSourceArtifacts((currentSources) => [result.artifact, ...currentSources]);
    showWorkspaceNotice("success", result.summary);
    addAuditEntry(
      "Source imported",
      `${result.artifact.title} was imported from ${result.artifact.type}.`
    );
    focusRequirementEditor();
  };

  const handleSignoffStatusChange = (value: SignoffStatus) => {
    setSignoffStatus(value);
    addAuditEntry("Signoff updated", `Workspace signoff moved to ${value}.`);
  };

  const downloadReviewSummaryMarkdown = () => {
    downloadCollaborationMarkdown(reportData);
    addAuditEntry(
      "Review markdown exported",
      "The current collaboration summary was exported as markdown."
    );
  };

  const appendAcceptanceCriteriaToRequirement = () => {
    if (!input.trim()) {
      alert("Please add a requirement before building acceptance criteria.");
      return;
    }

    const enrichedRequirement = buildRequirementWithAcceptanceCriteria(
      input,
      acceptanceCriteriaAnalysis
    );
    setInput(enrichedRequirement);
    showWorkspaceNotice(
      "success",
      acceptanceCriteriaAnalysis.hasAppliedCriteria
        ? "Applied acceptance criteria were refreshed in the requirement."
        : "Acceptance criteria were added to the requirement."
    );
    addAuditEntry(
      acceptanceCriteriaAnalysis.hasAppliedCriteria
        ? "Acceptance criteria refreshed"
        : "Acceptance criteria appended",
      "The current requirement was updated with the builder output."
    );
    focusRequirementEditor();
  };

  const replaceRequirementWithCriteria = () => {
    if (acceptanceCriteriaAnalysis.criteria.length === 0) {
      alert("No acceptance criteria are available yet.");
      return;
    }

    const criteriaOnlyRequirement = [
      "Acceptance Criteria:",
      ...acceptanceCriteriaAnalysis.criteria.map((criterion) => `- ${criterion.text}`),
    ].join("\n");
    setInput(criteriaOnlyRequirement);
    showWorkspaceNotice(
      "success",
      acceptanceCriteriaAnalysis.hasAppliedCriteria
        ? "The applied acceptance criteria were replaced with the latest structured draft."
        : "The requirement was replaced with a structured acceptance criteria draft."
    );
    addAuditEntry(
      "Acceptance criteria replaced",
      "The requirement editor was replaced with the current criteria draft."
    );
    focusRequirementEditor();
  };

  const generateFromAcceptanceCriteria = async () => {
    if (!input.trim()) {
      alert("Please add a requirement before generating from acceptance criteria.");
      return;
    }

    const enrichedRequirement = buildRequirementWithAcceptanceCriteria(
      input,
      acceptanceCriteriaAnalysis
    );
    setInput(enrichedRequirement);
    showWorkspaceNotice(
      "info",
      "Generating from the current requirement with structured acceptance criteria."
    );
    addAuditEntry(
      "Generated from criteria",
      "Generation was started from the acceptance-criteria-enriched requirement."
    );
    focusRequirementEditor();
    await generateForRequirement(enrichedRequirement);
  };

  const previewBusinessReport = () => {
    openReportWindow(reportData, "business", false);
  };

  const focusRowInWorkspace = (rowId: string) => {
    focusWorkspaceRow(rowId);
  };

  const updateFilteredCell = (
    filteredIndex: number,
    field: keyof TestCaseRow,
    value: string
  ) => {
    const rowId = filteredRows[filteredIndex]?.id;
    if (!rowId) {
      return;
    }

    const actualIndex = rows.findIndex((row) => row.id === rowId);
    if (actualIndex >= 0) {
      updateCell(actualIndex, field, value);
    }
  };

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((currentIds) =>
      currentIds.includes(rowId)
        ? currentIds.filter((currentId) => currentId !== rowId)
        : [...currentIds, rowId]
    );
  };

  const toggleSelectAllFilteredRows = () => {
    if (!hasFilteredRows) {
      return;
    }

    const filteredRowIds = filteredRows.map((row) => row.id);
    const areAllFilteredRowsSelected = filteredRowIds.every((rowId) =>
      selectedRowIds.includes(rowId)
    );

    setSelectedRowIds((currentIds) =>
      areAllFilteredRowsSelected
        ? currentIds.filter((rowId) => !filteredRowIds.includes(rowId))
        : Array.from(new Set([...currentIds, ...filteredRowIds]))
    );
  };

  const clearSelectedRows = () => {
    setSelectedRowIds([]);
  };

  const applyBulkUpdates = () => {
    if (selectedRowIds.length === 0) {
      showWorkspaceNotice(
        "error",
        "Select at least one case before applying a bulk action."
      );
      return;
    }

    const hasWorkflowUpdate = Boolean(bulkWorkflowStatus);
    const hasPriorityUpdate = Boolean(bulkPriority);
    const hasExecutionUpdate = Boolean(bulkExecutionResult);
    const hasReviewUpdate = Boolean(bulkReviewStatus);
    const hasAssigneeUpdate = bulkAssigneeValue.trim().length > 0;
    const hasSuiteUpdate = bulkSuiteName.trim().length > 0;
    const hasComponentUpdate = bulkComponentArea.trim().length > 0;
    const hasAutomationUpdate = Boolean(bulkAutomationStatus);
    const hasDataSetUpdate = Boolean(bulkTestDataSetId);

    if (
      !hasWorkflowUpdate &&
      !hasPriorityUpdate &&
      !hasExecutionUpdate &&
      !hasReviewUpdate &&
      !hasAssigneeUpdate &&
      !hasSuiteUpdate &&
      !hasComponentUpdate &&
      !hasAutomationUpdate &&
      !hasDataSetUpdate
    ) {
      showWorkspaceNotice(
        "error",
        "Choose at least one bulk change before applying it."
      );
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) => {
        if (!selectedRowIds.includes(row.id)) {
          return row;
        }

        const nextRow = {
          ...row,
          workflowStatus: hasWorkflowUpdate
            ? bulkWorkflowStatus || row.workflowStatus || "backlog"
            : row.workflowStatus ?? "backlog",
          priority: hasPriorityUpdate
            ? bulkPriority || row.priority || "medium"
            : row.priority ?? "medium",
          executionResult: hasExecutionUpdate
            ? bulkExecutionResult || row.executionResult || "not-run"
            : row.executionResult ?? "not-run",
          reviewStatus: hasReviewUpdate
            ? bulkReviewStatus || row.reviewStatus || "draft"
            : row.reviewStatus ?? "draft",
          suiteName: hasSuiteUpdate ? bulkSuiteName.trim() : row.suiteName ?? "",
          componentArea: hasComponentUpdate
            ? bulkComponentArea.trim()
            : row.componentArea ?? "",
          automationStatus: hasAutomationUpdate
            ? bulkAutomationStatus || row.automationStatus || "manual"
            : row.automationStatus ?? "manual",
          testDataSetId: hasDataSetUpdate
            ? bulkTestDataSetId || undefined
            : row.testDataSetId,
          testData:
            hasDataSetUpdate
              ? testDataSets.find((set) => set.id === bulkTestDataSetId)?.content ||
                row.testData ||
                ""
              : row.testData ?? "",
          assignee: hasAssigneeUpdate
            ? bulkAssigneeValue.trim()
            : row.assignee ?? "",
          updatedAt: Date.now(),
        };

        const changed =
          nextRow.workflowStatus !== (row.workflowStatus ?? "backlog") ||
          nextRow.priority !== (row.priority ?? "medium") ||
          nextRow.executionResult !== (row.executionResult ?? "not-run") ||
          nextRow.reviewStatus !== (row.reviewStatus ?? "draft") ||
          nextRow.assignee !== (row.assignee ?? "") ||
          nextRow.suiteName !== (row.suiteName ?? "") ||
          nextRow.componentArea !== (row.componentArea ?? "") ||
          nextRow.automationStatus !== (row.automationStatus ?? "manual") ||
          nextRow.testDataSetId !== row.testDataSetId;

        if (changed) {
          recordCaseVersion(row, "Bulk management update applied");
        }

        return nextRow;
      })
    );

    showWorkspaceNotice(
      "success",
      `Applied bulk updates to ${selectedRowIds.length} case${
        selectedRowIds.length === 1 ? "" : "s"
      }.`
    );
    if (hasReviewUpdate) {
      selectedRowIds.forEach((rowId) => {
        appendCaseReviewHistory(
          rowId,
          "Review status changed",
          `Bulk update moved this case to ${reviewStatusLabels[bulkReviewStatus || "draft"]}.`
        );
      });
      addAuditEntry(
        "Bulk case review updated",
        `${selectedRowIds.length} case review state${
          selectedRowIds.length === 1 ? "" : "s"
        } moved to ${bulkReviewStatus}.`
      );
    }
  };

  const deleteFilteredRow = (filteredIndex: number) => {
    const rowId = filteredRows[filteredIndex]?.id;
    if (!rowId) {
      return;
    }

    const actualIndex = rows.findIndex((row) => row.id === rowId);
    if (actualIndex >= 0) {
      deleteRow(actualIndex);
    }
  };

  const regenerateFilteredRow = (filteredIndex: number) => {
    const rowId = filteredRows[filteredIndex]?.id;
    if (!rowId) {
      return;
    }

    const actualIndex = rows.findIndex((row) => row.id === rowId);
    if (actualIndex >= 0) {
      regenerateRow(actualIndex);
    }
  };

  const sendReadyCasesToReview = () => {
    const readyRowIds = Array.from(reviewHandoffReadyRowIdSet);
    if (readyRowIds.length === 0) {
      showWorkspaceNotice(
        "info",
        "There are no approval-ready draft cases left to hand off right now."
      );
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) => {
        if (!reviewHandoffReadyRowIdSet.has(row.id)) {
          return row;
        }

        recordCaseVersion(row, "Moved to in review");
        return {
          ...row,
          reviewStatus: "in-review",
          updatedAt: Date.now(),
        };
      })
    );

    readyRowIds.forEach((rowId) => {
      appendCaseReviewHistory(
        rowId,
        "Review status changed",
        `${rowId} moved to In Review for handoff.`
      );
    });

    addAuditEntry(
      "Cases sent to review",
      `${readyRowIds.length} approval-ready case${readyRowIds.length === 1 ? "" : "s"} moved to in-review.`
    );
    setWorkspaceFilter("approval-ready");
    setDraggedIndex(null);
    setDragOverIndex(null);
    showWorkspaceNotice(
      "success",
      `Moved ${readyRowIds.length} approval-ready case${readyRowIds.length === 1 ? "" : "s"} into review.`
    );
  };

  const previewQaReport = () => {
    openReportWindow(reportData, "qa", false);
  };

  const saveCurrentCasesView = () => {
    const trimmedName = newCasesViewName.trim();
    if (!trimmedName) {
      showWorkspaceNotice("error", "Name the case view before saving it.");
      return;
    }

    setCasesSavedViews((currentViews) => {
      const nextViews = [
        {
          id: crypto.randomUUID(),
          name: trimmedName,
          filters: currentCasesViewFilters,
          updatedAt: Date.now(),
        },
        ...currentViews.filter(
          (view) => view.name.trim().toLowerCase() !== trimmedName.toLowerCase()
        ),
      ].slice(0, 12);

      return nextViews;
    });
    setNewCasesViewName("");
    showWorkspaceNotice("success", `Saved case view "${trimmedName}".`);
  };

  const saveNamedCasesView = (
    name: string,
    filters: CasesSavedView["filters"],
    options?: { pinned?: boolean; setAsDefault?: boolean }
  ) => {
    let nextDefaultSavedViewId = casesDefaultSavedViewId;

    setCasesSavedViews((currentViews) => {
      const existingView = currentViews.find(
        (view) => view.name.trim().toLowerCase() === name.trim().toLowerCase()
      );
      const nextView: CasesSavedView = {
        id: existingView?.id ?? crypto.randomUUID(),
        name,
        pinned: options?.pinned ?? existingView?.pinned ?? false,
        filters,
        updatedAt: Date.now(),
      };

      if (options?.setAsDefault) {
        nextDefaultSavedViewId = nextView.id;
      }

      return [
        nextView,
        ...currentViews.filter((view) => view.id !== nextView.id),
      ].slice(0, 12);
    });

    if (options?.setAsDefault) {
      setCasesDefaultSavedViewId(nextDefaultSavedViewId);
    }

    showWorkspaceNotice(
      "success",
      options?.setAsDefault
        ? `Saved "${name}" and set it as the default case view.`
        : `Saved "${name}" as a reusable case view.`
    );
  };

  const deleteCasesView = (viewId: string) => {
    const matchedView = casesSavedViews.find((view) => view.id === viewId);
    setCasesSavedViews((currentViews) =>
      currentViews.filter((view) => view.id !== viewId)
    );
    if (matchedView) {
      showWorkspaceNotice("info", `Deleted case view "${matchedView.name}".`);
    }
    if (casesDefaultSavedViewId === viewId) {
      setCasesDefaultSavedViewId(null);
    }
    if (editingCasesViewId === viewId) {
      setEditingCasesViewId(null);
      setEditingCasesViewName("");
    }
  };

  const startEditingCasesView = (viewId: string, currentName: string) => {
    setEditingCasesViewId(viewId);
    setEditingCasesViewName(currentName);
  };

  const cancelEditingCasesView = () => {
    setEditingCasesViewId(null);
    setEditingCasesViewName("");
  };

  const renameCasesView = () => {
    if (!editingCasesViewId) {
      return;
    }

    const trimmedName = editingCasesViewName.trim();
    if (!trimmedName) {
      showWorkspaceNotice("error", "Enter a name before renaming the saved case view.");
      return;
    }

    setCasesSavedViews((currentViews) =>
      currentViews.map((view) =>
        view.id === editingCasesViewId
          ? {
              ...view,
              name: trimmedName,
              updatedAt: Date.now(),
            }
          : view
      )
    );
    showWorkspaceNotice("success", `Renamed saved case view to "${trimmedName}".`);
    cancelEditingCasesView();
  };

  const togglePinCasesView = (viewId: string) => {
    setCasesSavedViews((currentViews) =>
      currentViews.map((view) =>
        view.id === viewId
          ? {
              ...view,
              pinned: !view.pinned,
              updatedAt: Date.now(),
            }
          : view
      )
    );
    const view = casesSavedViews.find((entry) => entry.id === viewId);
    if (view) {
      showWorkspaceNotice(
        "success",
        view.pinned
          ? `Unpinned saved case view "${view.name}".`
          : `Pinned saved case view "${view.name}".`
      );
    }
  };

  const setDefaultCasesSavedView = (viewId: string) => {
    setCasesDefaultSavedViewId(viewId);
    const view = casesSavedViews.find((entry) => entry.id === viewId);
    if (view) {
      showWorkspaceNotice("success", `Set "${view.name}" as the default case view.`);
    }
  };

  const exportBusinessReportPdf = () => {
    downloadReportPdf(reportData, "business");
  };

  const exportQaReportPdf = () => {
    downloadReportPdf(reportData, "qa");
  };

  useEffect(() => {
    setRows((currentRows) => normalizeRows(currentRows, generationMode));
  }, [generationMode]);

  useEffect(() => {
    const currentGapIds = coverageGapAnalysis.gaps.map((gap) => gap.id);
    if (currentGapIds.length === 0) {
      return;
    }

    setSeenGapIds((currentSeen) =>
      Array.from(new Set([...currentSeen, ...currentGapIds]))
    );
  }, [coverageGapAnalysis.gaps]);

  useEffect(() => {
    if (!highlightedRowId) {
      return;
    }

    const timeout = setTimeout(() => {
      setHighlightedRowId(null);
      setHighlightedRowLabel(null);
      setHighlightedCommentId(null);
    }, 30000);

    return () => clearTimeout(timeout);
  }, [highlightedRowId]);

  useEffect(() => {
    if (!focusedRowId || didApplyFocusedRowRef.current || rows.length === 0) {
      return;
    }

    const hasFocusedRow = rows.some((row) => row.id === focusedRowId);
    if (!hasFocusedRow) {
      return;
    }

    didApplyFocusedRowRef.current = true;
    focusWorkspaceRow(focusedRowId, "Linked from issue", focusedCommentId);
  }, [focusWorkspaceRow, focusedCommentId, focusedRowId, rows]);

  const autosaveStatusText = !projectName.trim()
    ? "Disabled until project is named"
    : !autosaveEnabled
    ? "Autosave turned off"
    : saveStatus === "saving"
    ? "Autosaving changes"
    : saveStatus === "saved"
    ? "Synced to local workspace"
    : saveStatus === "error"
    ? "Save failed"
    : "Monitoring changes";
  const lastSavedText = lastSavedAt
    ? hasMounted
      ? formatUtcDateTime(lastSavedAt)
      : "Saved recently"
    : "Not saved yet";

  const workspaceStatus = loading
    ? "Generating test cases"
    : regeneratingIndex !== null
    ? "Refreshing selected test case"
    : saveStatus === "saving"
    ? "Autosaving workspace"
    : saveStatus === "error"
    ? "Save error"
    : !projectName.trim()
    ? "Name this workspace to enable autosave"
    : !autosaveEnabled
    ? "Manual save mode"
    : hasRows
    ? "Ready for review"
    : input.trim()
    ? "Requirement captured"
    : "Waiting for requirement";

  const workspaceStatusDetail = loading
    ? "The generator is building a fresh set of cases from the current requirement."
    : regeneratingIndex !== null
    ? "One row is being refreshed while the rest of the workspace stays editable."
    : saveStatus === "saving"
    ? "Recent edits are being persisted automatically to this project."
    : saveStatus === "error"
    ? "The last save attempt did not complete. Try Save Project again."
    : !projectName.trim()
    ? "Add a project name so the workspace can save automatically."
    : !autosaveEnabled
    ? "Autosave is disabled. Use Save Project whenever you want to persist changes."
    : hasRows
    ? "You can edit, reorder, save, and export the current suite."
    : input.trim()
    ? "Your requirement is ready. Generate cases when you want a first draft."
    : "Paste a requirement or create a manual case to begin.";
  const hasRequirementInput = Boolean(input.trim());
  const advancedRequirementSignalCount =
    requirementRiskAnalysis.risks.length +
    acceptanceCriteriaAnalysis.criteria.length +
    ambiguityQuestionAnalysis.questions.length;
  const advancedToolSignalCount =
    coverageGapAnalysis.gaps.length +
    bugPredictionAnalysis.predictions.length +
    caseQualityAnalysis.findings.length +
    changeImpactAnalysis.changes.length;

  if (!hasMounted) {
    return (
      <div
        className={
          embedded
            ? "flex flex-col gap-6"
            : "min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.15),_transparent_24%),radial-gradient(circle_at_center,_rgba(14,165,233,0.08),_transparent_36%),linear-gradient(180deg,_#f6f8f7_0%,_#ecf2ef_48%,_#f8faf9_100%)] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
        }
      >
        {!embedded && (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:120px_120px] [mask-image:radial-gradient(circle_at_top,black,transparent_75%)] dark:hidden" />
        )}
        <main
          className={
            embedded
              ? "flex flex-col gap-6"
              : "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          }
        >
          <section className="overflow-hidden rounded-[36px] border border-white/70 bg-white/85 p-8 shadow-[0_40px_120px_-48px_rgba(15,23,42,0.45)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85">
            <div className="space-y-4">
              <div className="h-5 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-12 w-full max-w-3xl rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-5 w-full max-w-2xl rounded-xl bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-5 w-2/3 max-w-xl rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white/90 p-8 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
            <div className="space-y-4">
              <div className="h-6 w-48 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-40 w-full rounded-[24px] bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex gap-3">
                <div className="h-12 w-40 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-12 w-40 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-12 w-32 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "flex flex-col gap-6"
          : "min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.15),_transparent_24%),radial-gradient(circle_at_center,_rgba(14,165,233,0.08),_transparent_36%),linear-gradient(180deg,_#f6f8f7_0%,_#ecf2ef_48%,_#f8faf9_100%)] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      {!embedded && (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:120px_120px] [mask-image:radial-gradient(circle_at_top,black,transparent_75%)] dark:hidden" />
      )}
      <main
        className={
          embedded
            ? "flex flex-col gap-6"
            : "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        }
      >
        {!embedded && (
          <section className="flex flex-col gap-3 rounded-[28px] border border-white/80 bg-white/85 px-5 py-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Project Route
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {(projectName.trim() || "Unsaved workspace").trim()} | {planningSummaryText}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={activeProjectWorkspaceHref}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                initialSection === "workspace"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-100 dark:ring-emerald-400/20"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Workspace
            </Link>
            <Link
              href={activeProjectCasesHref}
              onClick={(event) => handleProjectRouteClick(event, "Cases")}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                initialSection === "cases"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-100 dark:ring-emerald-400/20"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Cases
            </Link>
            <Link
              href={activeProjectBoardHref}
              onClick={(event) => handleProjectRouteClick(event, "Board")}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Board
            </Link>
            <Link
              href={activeProjectIssuesHref}
              onClick={(event) => handleProjectRouteClick(event, "Issues")}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Issues
            </Link>
            {routeNotice ? (
              <p className="basis-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                {routeNotice}
              </p>
            ) : null}
          </div>
        </section>
        )}

        <section className="relative overflow-hidden rounded-[36px] border border-white/80 bg-white/85 shadow-[0_44px_120px_-52px_rgba(15,23,42,0.45)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_22%)]" />
          <div className="absolute right-0 top-0 h-56 w-56 translate-x-16 -translate-y-16 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-500/10" />
          <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-20 translate-y-16 rounded-full bg-emerald-200/50 blur-3xl dark:bg-emerald-500/10" />
          <div className="relative grid gap-6 px-6 py-7 lg:grid-cols-[minmax(0,1.45fr)_340px] lg:px-8 lg:py-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/70 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-800 shadow-sm backdrop-blur dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                CaseForge
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl xl:text-[3.45rem] dark:text-white">
                Turn each requirement into coverage, automation, and release confidence.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 sm:text-base dark:text-zinc-300">
                Generate review-ready cases, capture quality signals from edits, scale reusable automation, and keep ship risk visible in one QA workflow workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/75 dark:text-zinc-300">
                  Requirement intelligence
                </span>
                <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/75 dark:text-zinc-300">
                  Coverage actions
                </span>
                <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/75 dark:text-zinc-300">
                  Change-aware QA
                </span>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/80 bg-white/80 px-4 py-4 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/70">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Workspace Status
                  </p>
                  <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {workspaceStatus}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {workspaceStatusDetail}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/80 bg-white/80 px-4 py-4 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/70">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Autosave
                  </p>
                  <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {autosaveStatusText}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    Last saved: {lastSavedText}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/80 bg-white/80 px-4 py-4 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/70">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Saved Projects
                  </p>
                  <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {projects.length} active
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {typeSummaryText}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {planningSummaryText}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 p-5 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.2)] dark:border-zinc-800 dark:bg-zinc-950/72">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Workflow
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-[18px] border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                    1. Capture requirement
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Paste the story, user flow, or acceptance criteria.
                  </p>
                </div>
                <div className="rounded-[18px] border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                    2. Refine output
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Edit cells inline and drag rows to the right testing order.
                  </p>
                </div>
                <div className="rounded-[18px] border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                    3. Save and export
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Keep projects locally and hand off CSV or Excel instantly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <WorkflowValuePath {...workflowValuePath} />

        <details className="group overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/94 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/92">
          <summary className="flex cursor-pointer list-none flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Secondary Telemetry
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Learning loop metrics
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Open only when you need model feedback, edit intensity, or automation conversion telemetry.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                Acceptance rate {generationQualitySignals.acceptanceRate}%
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                Automation conversion {generationQualitySignals.automationConversionRate}%
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                Downstream failures {generationQualitySignals.downstreamFailureCorrelation}%
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition group-open:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                Expand
              </span>
            </div>
          </summary>

          <div className="grid gap-3 border-t border-zinc-200/80 px-5 py-5 sm:grid-cols-2 2xl:grid-cols-6 dark:border-zinc-800">
            <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                AI Drafts
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {generationQualitySignals.totalGenerated}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                generated cases tracked for feedback
              </p>
            </div>
            <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Edit Intensity
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {generationQualitySignals.editIntensity}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                average changed fields per edited draft
              </p>
            </div>
            <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Duplicate Removal
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {generationQualitySignals.duplicateRemovalRate}%
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                drafts marked duplicate or removed
              </p>
            </div>
            <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Regenerated
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {generationQualitySignals.regeneratedCount}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                drafts needing stronger generation
              </p>
            </div>
            <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Rejected
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {generationQualitySignals.rejectedCount}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                low-value or duplicate drafts filtered out
              </p>
            </div>
            <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Shared Blocks
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {automationReusableBlocks.length}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                reusable automation flows ready for scaling
              </p>
            </div>
          </div>
        </details>

        <details className="group overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/94 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/92">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Secondary Setup
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Project settings and source imports
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Open this only when you need project naming, autosave controls, or imported source artifacts.
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 transition group-open:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:group-open:bg-zinc-800">
              Expand
            </span>
          </summary>
          <div className="space-y-6 border-t border-zinc-200/80 px-6 py-6 dark:border-zinc-800">
            <ProjectManager
              currentProjectId={currentProjectId}
              projectName={projectName}
              projectKey={projectKey}
              setProjectKey={setProjectKey}
              sprintName={sprintName}
              setSprintName={setSprintName}
              releaseName={releaseName}
              setReleaseName={setReleaseName}
              teamName={teamName}
              setTeamName={setTeamName}
              setProjectName={setProjectName}
              saveProjectNow={saveProjectNow}
              saveStatus={saveStatus}
              lastSavedText={lastSavedText}
              autosaveEnabled={autosaveEnabled}
              setAutosaveEnabled={setAutosaveEnabled}
              hasMounted={hasMounted}
              projects={projects}
              loadProject={loadProject}
              deleteProject={deleteProject}
            />

            <SourceImportPanel
              sources={sourceArtifacts}
              onImportSource={handleImportSource}
            />
          </div>
        </details>

        <section className="overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_26px_58px_-40px_rgba(15,23,42,0.24)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
          <div className="border-b border-zinc-200/80 bg-zinc-50/85 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Requirement Studio
                </p>
                <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  Generate test cases from one requirement
                </h2>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Paste the feature behavior, validations, and expected outcome. We will turn it into a draft you can review inline.
                </p>
              </div>
              <div className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                {autosaveStatusText}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-5 rounded-[22px] border border-cyan-200/80 bg-cyan-50/80 px-5 py-5 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                    Cognitive Orchestration
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-cyan-950 dark:text-cyan-50">
                    {cognitiveOrchestrationPlan.headline}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-cyan-900/85 dark:text-cyan-100/85">
                    {cognitiveOrchestrationPlan.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-900 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100">
                      {generationModeLabels[cognitiveOrchestrationPlan.recommendedMode]}
                    </span>
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-900 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100">
                      {cognitiveOrchestrationPlan.recommendedCoverage} coverage
                    </span>
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-900 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100">
                      {personaLabels[cognitiveOrchestrationPlan.recommendedPersona]}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyCognitiveOrchestrationPlan}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-cyan-300 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-900 shadow-sm transition hover:bg-cyan-50 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100 dark:hover:bg-cyan-500/20"
                >
                  Apply Plan
                </button>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-[18px] border border-white/80 bg-white/80 px-4 py-3 dark:border-cyan-500/20 dark:bg-zinc-950/40">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                    Focus
                  </p>
                  <p className="mt-2 text-sm leading-6 text-cyan-900/85 dark:text-cyan-100/85">
                    {cognitiveOrchestrationPlan.focusAreas.length
                      ? cognitiveOrchestrationPlan.focusAreas.join("; ")
                      : "Main flow, validations, observable outcome, and review-ready test data."}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/80 bg-white/80 px-4 py-3 dark:border-cyan-500/20 dark:bg-zinc-950/40">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                    Next Action
                  </p>
                  <p className="mt-2 text-sm leading-6 text-cyan-900/85 dark:text-cyan-100/85">
                    {cognitiveOrchestrationPlan.nextActions[0]}
                  </p>
                </div>
              </div>
            </div>
            <textarea
              ref={requirementTextareaRef}
              className="min-h-[190px] w-full rounded-[20px] border border-zinc-200/80 bg-white px-5 py-4 text-sm leading-7 text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_18px_36px_-34px_rgba(15,23,42,0.2)] outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              rows={7}
              placeholder="Example: Returning customer applies a valid coupon at checkout and sees the total update before placing the order."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Best results come from one clear flow with validations, user role, and expected outcome.
            </p>
            {!hasRequirementInput ? (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Try a sample requirement
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {starterRequirementExamples.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      onClick={() => {
                        setInput(example.requirement);
                        window.setTimeout(() => {
                          requirementTextareaRef.current?.focus();
                        }, 30);
                      }}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 md:grid-cols-3 xl:flex-1">
                <label className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/75 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Mode
                  </span>
                  <select
                    value={generationMode}
                    onChange={(e) =>
                      setGenerationMode(e.target.value as GenerationMode)
                    }
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="functional">Functional Cases</option>
                    <option value="regression">Regression Cases</option>
                    <option value="api">API Cases</option>
                    <option value="ui">UI Cases</option>
                    <option value="negative">Negative Cases</option>
                    <option value="edge">Edge Cases</option>
                    <option value="security">Security Cases</option>
                    <option value="accessibility">Accessibility / WCAG Cases</option>
                  </select>
                </label>

                <label className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/75 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Coverage
                  </span>
                  <select
                    value={coverageDepth}
                    onChange={(e) =>
                      setCoverageDepth(e.target.value as CoverageDepth)
                    }
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="basic">Basic Coverage</option>
                    <option value="standard">Standard Coverage</option>
                    <option value="thorough">Thorough Coverage</option>
                  </select>
                </label>

                <label className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/75 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    Persona
                  </span>
                  <select
                    value={persona}
                    onChange={(e) => setPersona(e.target.value as Persona)}
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="all">All Users</option>
                    <option value="admin">Admin</option>
                    <option value="guest">Guest</option>
                    <option value="first-time-user">First-Time User</option>
                    <option value="returning-user">Returning User</option>
                    <option value="blocked-user">Blocked User</option>
                  </select>
                </label>
              </div>

                <div className="flex flex-wrap items-center gap-3 xl:max-w-[34rem] xl:justify-end">
                  <button
                    onClick={generate}
                    disabled={loading}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.52)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Generating..." : "Generate Test Cases"}
                  </button>

                  <button
                    onClick={addNewRow}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Create Manually
                  </button>
                </div>
              </div>

              <div className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-xs leading-5 text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400 xl:ml-auto xl:max-w-[34rem]">
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {generationModeLabels[generationMode]}:
                </span>{" "}
                {generationModeHelperText}
              </div>
            </div>
          </div>
        </section>

        <details className="group overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/94 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/92">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Secondary Navigation
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Planning shortcuts
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Open board, cases, or issues after you finish generating and reviewing the first draft.
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 transition group-open:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:group-open:bg-zinc-800">
              Expand
            </span>
          </summary>
          <div className="border-t border-zinc-200/80 p-6 dark:border-zinc-800">
        <section className="rounded-[24px] border border-transparent bg-transparent">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Planning Surface
              </p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                Open planning tools after the draft is ready
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Use the live board for sprint flow and the cases route for detailed linking only after the AI draft is in good shape.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Cases
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {rows.length}
                </p>
              </div>
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Linked Issues
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {linkedIssueCount}
                </p>
              </div>
              <div className="rounded-[22px] border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Unlinked Cases
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {unlinkedCaseCount}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={activeProjectBoardHref}
              className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
            >
              Open Live Board
            </Link>
            <Link
              href={activeProjectCasesHref}
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Open Cases Route
            </Link>
            <Link
              href={activeProjectIssuesHref}
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Open Issues
            </Link>
          </div>
        </section>
          </div>
        </details>

        {isCasesSection ? (
          <section className="rounded-[28px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Cases Route
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Manage manual and generated cases in one place
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              This route is now the dedicated home for case editing. Link cases to issues here so execution work
              and planning work stay connected.
            </p>
          </section>
        ) : (
          <>
            <details className="group overflow-hidden rounded-[28px] border border-white/80 bg-white/88 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                    Secondary Guidance
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    Improve the requirement before generating
                  </h2>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Open risk, criteria, and ambiguity helpers only when the requirement needs refinement.
                  </p>
                </div>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition group-open:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:group-open:bg-zinc-800">
                  {advancedRequirementSignalCount} signal{advancedRequirementSignalCount === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="space-y-6 border-t border-zinc-200/80 px-6 py-6 dark:border-zinc-800">
                <RequirementRiskHeatmap
                  analysis={requirementRiskAnalysis}
                  hasRequirement={hasRequirementInput}
                />

                <AcceptanceCriteriaPanel
                  analysis={acceptanceCriteriaAnalysis}
                  hasRequirement={hasRequirementInput}
                  onAppendCriteria={appendAcceptanceCriteriaToRequirement}
                  onReplaceWithCriteria={replaceRequirementWithCriteria}
                  onGenerateFromCriteria={generateFromAcceptanceCriteria}
                  loading={loading}
                />

                <AmbiguityQuestionsPanel
                  analysis={ambiguityQuestionAnalysis}
                  hasRequirement={hasRequirementInput}
                />
              </div>
            </details>

            <details className="group overflow-hidden rounded-[28px] border border-white/80 bg-white/88 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                    Advanced QA Tools
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    Coverage, quality, change impact, and reporting
                  </h2>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    These tools are still available, but they are secondary to generating and reviewing the first draft.
                  </p>
                </div>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition group-open:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:group-open:bg-zinc-800">
                  {advancedToolSignalCount} signal{advancedToolSignalCount === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="space-y-6 border-t border-zinc-200/80 px-6 py-6 dark:border-zinc-800">
                <BugPredictionPanel
                  analysis={bugPredictionAnalysis}
                  hasRequirement={hasRequirementInput}
                  rowTitles={rowTitles}
                  predictionLinkedRows={predictionLinkedRows}
                  onFocusRow={focusRowInWorkspace}
                  fillingPredictionId={fillingPredictionId}
                  ignoredPredictionIds={ignoredPredictionIds}
                  onAutoCoverPrediction={autoCoverPrediction}
                  onAddManualPredictionDraft={addManualPredictionDraft}
                  onIgnorePrediction={ignorePrediction}
                />

                <CoverageGapDetector
                  analysis={coverageGapAnalysis}
                  hasRows={hasRows}
                  fillingGapId={fillingGapId}
                  isFillingAllCriticalGaps={isFillingAllCriticalGaps}
                  duplicateGapIds={duplicateGapIds}
                  resolvedGaps={resolvedGaps}
                  onAutoFillGap={autoFillGap}
                  onAutoFillCriticalGaps={autoFillCriticalGaps}
                  onAddManualGapDraft={addManualGapDraft}
                />

                <TraceabilityMap
                  analysis={traceabilityAnalysis}
                  hasRequirement={hasRequirementInput}
                  hasRows={hasRows}
                />

                <CaseQualityDetector
                  analysis={caseQualityAnalysis}
                  hasRows={hasRows}
                  activeFindingId={activeQualityFindingId}
                  ignoredFindingIds={ignoredQualityFindingIds}
                  rowTitles={rowTitles}
                  onMergeFinding={mergeQualityFinding}
                  onKeepBestFinding={keepBestQualityFinding}
                  onRewriteFinding={rewriteQualityFinding}
                  onIgnoreFinding={ignoreQualityFinding}
                  onFocusRow={focusRowInWorkspace}
                />

                <ExecutionReadinessPanel
                  analysis={executionReadinessAnalysis}
                  hasRows={hasRows}
                />

                <BusinessReportPanel
                  projectName={projectName.trim()}
                  totalCases={rows.length}
                  readinessScore={executionReadinessAnalysis.score}
                  coverageScore={coverageGapAnalysis.score}
                  riskScore={requirementRiskAnalysis.score}
                  openGapCount={coverageGapAnalysis.gaps.length}
                  impactedCaseCount={changeImpactAnalysis.impactedRows.length}
                  onPreviewBusiness={previewBusinessReport}
                  onPreviewQa={previewQaReport}
                  onExportBusinessPdf={exportBusinessReportPdf}
                  onExportQaPdf={exportQaReportPdf}
                />

                <CollaborationPanel
                  reviewerName={reviewerName}
                  reviewerNotes={reviewerNotes}
                  signoffStatus={signoffStatus}
                  onReviewerNameChange={setReviewerName}
                  onReviewerNotesChange={setReviewerNotes}
                  onSignoffStatusChange={handleSignoffStatusChange}
                  onDownloadReviewMarkdown={downloadReviewSummaryMarkdown}
                />

                <TrustCenterPanel analysis={trustCenterAnalysis} />

                <ChangeImpactPanel
                  oldRequirement={oldRequirement}
                  setOldRequirement={setOldRequirement}
                  analysis={changeImpactAnalysis}
                  hasNewRequirement={hasRequirementInput}
                  hasRows={hasRows}
                  isGeneratingCases={isGeneratingChangeImpactCases}
                  hasGeneratedCurrentCases={hasGeneratedCurrentChangeImpactCases}
                  onGenerateCases={generateChangeImpactCases}
                  onApplyRecommendedStatuses={applyRecommendedLifecycleStatuses}
                  onSetRowLifecycleStatus={setRowLifecycleStatus}
                />
              </div>
            </details>
          </>
        )}

        {hasRows && (
          <>
          <section
            ref={generatedCasesSectionRef}
            className="rounded-[22px] border border-emerald-200/80 bg-emerald-50/75 px-5 py-5 shadow-[0_18px_42px_-34px_rgba(5,150,105,0.18)] dark:border-emerald-500/20 dark:bg-emerald-500/10"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Next Best Step
                </p>
                <h2 className="mt-1 text-lg font-semibold text-emerald-950 dark:text-emerald-50">
                  {nextStepGuidance.heading}
                </h2>
                <p className="mt-2 text-sm leading-6 text-emerald-900/80 dark:text-emerald-100/80">
                  {nextStepGuidance.detail}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {rowsNeedingDraftCleanupCount} need cleanup
                  </span>
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {readyForApprovalCount} ready to approve
                  </span>
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {reviewHandoffReadyCount} ready to hand off
                  </span>
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {casesWithOpenReviewNotesCount} with open notes
                  </span>
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {traceabilityHealthSummary.coveragePercent}% requirement coverage
                  </span>
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {traceabilityAnalysis.uncoveredSentences.length} uncovered statements
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-emerald-900/75 dark:text-emerald-100/75">
                  {traceabilityAnalysis.uncoveredSentences.length > 0
                    ? "Before you leave the draft behind, scan the remaining uncovered requirement statements and turn any important gaps into cases."
                    : "The current draft maps cleanly to the requirement, so you can move into review with more confidence."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceFilter("draft-cleanup");
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100/70 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  >
                    Focus Cleanup Cases
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceFilter("approval-ready");
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100/70 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  >
                    Focus Approval-Ready
                  </button>
                  <button
                    type="button"
                    onClick={sendReadyCasesToReview}
                    disabled={reviewHandoffReadyCount === 0}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  >
                    Send Ready Cases To Review
                  </button>
                  <button
                    type="button"
                    onClick={focusCoverageHandoffSection}
                    disabled={traceabilityAnalysis.uncoveredSentences.length === 0}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  >
                    Review Missing Coverage
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={focusGeneratedCasesSection}
                  className="rounded-xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.52)] transition hover:brightness-110"
                >
                  Review Generated Cases
                </button>
                <Link
                  href={activeProjectCasesHref}
                  className="rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100/60 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                >
                  Open Full Cases Route
                </Link>
              </div>
            </div>
          </section>
          <section
            className={`rounded-[20px] border border-zinc-200/80 bg-white/94 px-4 py-3 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94 dark:shadow-black/20 ${
              embedded && isCasesSection ? "" : "sticky top-4 z-10"
            }`}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1 xl:max-w-2xl">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {summaryText}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  Review the AI draft first, tighten anything weak inline, then export or move into the full cases workflow.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
                <button
                  onClick={copyToClipboard}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Copy
                </button>
                <button
                  onClick={() => downloadCSV(rows)}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => downloadExcel(rows)}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-900 bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-20px_rgba(15,23,42,0.45)] transition hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
                >
                  Export Excel
                </button>
                <button
                  onClick={exportBusinessReportPdf}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_30px_-20px_rgba(5,150,105,0.52)] transition hover:brightness-110"
                >
                  Business PDF
                </button>
                <button
                  onClick={exportQaReportPdf}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  QA PDF
                </button>
              </div>
            </div>
          </section>
          </>
        )}

        {workspaceNotice && (
          <section
            className={`rounded-[24px] border px-4 py-3 text-sm shadow-sm ${
              workspaceNotice.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                : workspaceNotice.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <span>{workspaceNotice.text}</span>
              {workspaceNotice.actions && workspaceNotice.actions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {workspaceNotice.actions.map((action) => (
                    <Link
                      key={`${action.label}-${action.href}`}
                      href={action.href}
                      className="inline-flex items-center justify-center rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-current shadow-sm transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-950/80 dark:hover:bg-zinc-900"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        )}

        {isCasesSection && cameFromRelease && (
          <section className="rounded-[24px] border border-sky-200 bg-sky-50/90 px-4 py-4 text-sm text-sky-900 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">Viewing a case slice opened from Release</p>
                <p className="mt-1 text-sky-800/80 dark:text-sky-200/80">
                  This cases view is carrying release context so you can inspect gaps, unlinked coverage, or critical-area test inventory without losing the release trail.
                </p>
              </div>
              <Link
                href={`/projects/${encodeURIComponent(initialProjectRef || projectKey || currentProjectId || "")}/release`}
                className="inline-flex items-center justify-center rounded-2xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 dark:border-sky-400/30 dark:bg-zinc-950 dark:text-sky-200 dark:hover:bg-zinc-900"
              >
                Back to Release
              </Link>
            </div>
          </section>
        )}

        {hasRows ? (
          <>
            <section className="rounded-[20px] border border-zinc-200/80 bg-white/90 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Workflow Filters
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Focus the workspace on the cases that need action right now.
                  </p>
                </div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  Showing {filteredRows.length} of {rows.length} cases
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["draft-cleanup", "Needs Cleanup"],
                    ["approval-ready", "Approval Ready"],
                    ["new", "New"],
                    ["needs-update", "Needs Update"],
                    ["needs-review", "Needs Review"],
                    ["obsolete", "Obsolete"],
                    ["keep", "Keep"],
                    ["impacted", "Impacted"],
                    ["duplicate", "Duplicate / Overlap"],
                    ["manual", "Manual Drafts"],
                    ["gap", "Gap Cases"],
                    ["defect", "Defect Cases"],
                  ] as Array<[WorkspaceFilter, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setWorkspaceFilter(value);
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      workspaceFilter === value
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/10"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {label} ({filterCounts[value]})
                  </button>
                ))}
              </div>
              {workspaceFilter !== "all" && (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Reordering is disabled while a subset filter is active so hidden rows do not shift unexpectedly.
                </p>
              )}
            </section>

            {isCasesSection && (
              <section className="rounded-[28px] border border-zinc-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(244,247,246,0.98)_100%)] px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-[linear-gradient(180deg,_rgba(24,24,27,0.96)_0%,_rgba(12,12,14,0.98)_100%)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                      Cases Command Center
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                      Keep review, coverage, and collaboration in one calmer flow.
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      Use the cards for fast triage, the filters for precision, and the expandable sections for deeper QA management when you need it.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Visible Cases
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {filteredRows.length}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {rows.length} total in this project
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Review Focus
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {caseReviewSummary.openReviewNotes}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        unresolved review notes
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Reviewer Attention
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {reviewerAttentionOnlyCount}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        cases with unread reviewer alerts
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {isCasesSection && (
              <section className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      Reviewer Alerts
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      In-app alerts for case mentions and activity on cases you follow.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      {unreadReviewerNotificationsCount} unread
                    </span>
                    <button
                      type="button"
                      onClick={markAllReviewerNotificationsRead}
                      disabled={unreadReviewerNotificationsCount === 0}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Mark All Read
                    </button>
                  </div>
                </div>
                {reviewerNotifications.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {reviewerNotifications.slice(0, 5).map((notification) => (
                      <div
                        key={notification.id}
                        className={`rounded-2xl border px-4 py-3 ${
                          notification.readAt
                            ? "border-zinc-200/80 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-950"
                            : "border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {notification.title}
                            </p>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                              {notification.detail}
                            </p>
                            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                              {formatUtcDateTime(notification.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {notification.rowId ? (
                              <button
                                type="button"
                                  onClick={() =>
                                    focusWorkspaceRow(
                                      notification.rowId!,
                                      "Reviewer alert focus",
                                      notification.commentId
                                    )
                                  }
                                className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                              >
                                Open Case
                              </button>
                            ) : null}
                            {!notification.readAt ? (
                              <button
                                type="button"
                                onClick={() => markNotificationRead(notification.id)}
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                              >
                                Mark Read
                              </button>
                            ) : (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                Read
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                    No reviewer alerts yet. Mentions and followed-case activity will appear here.
                  </p>
                )}
              </section>
            )}

            {isCasesSection && (
              <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
                {[
                  {
                    label: "Linked Coverage",
                    value: `${caseManagementSummary.linkedCoveragePercent}%`,
                    detail: `${caseManagementSummary.totalCases} total cases`,
                    onClick: () => setCaseLinkedFilter("linked"),
                  },
                  {
                    label: "Unreviewed Cases",
                    value: String(caseManagementSummary.unreviewedCount),
                    detail: "Draft or changes requested",
                    onClick: () => setCaseReviewFilter("draft"),
                  },
                  {
                    label: "Aging Cases",
                    value: String(caseManagementSummary.agingCount),
                    detail: "Not updated in the last 14 days",
                    onClick: () => setCaseArchivedFilter("all"),
                  },
                  {
                    label: "Automation Coverage",
                    value: `${caseManagementSummary.automationCoveragePercent}%`,
                    detail: `${caseManagementSummary.automationCounts.automated} automated cases in library`,
                    onClick: () => setCaseAutomationFilter("candidate"),
                  },
                  {
                    label: "Automation Ready",
                    value: String(caseManagementSummary.automationReadyCount),
                    detail: `${caseManagementSummary.automationCounts.candidate} current candidates already flagged`,
                    onClick: () => setCaseAutomationFilter("candidate"),
                  },
                  {
                    label: "Review Events",
                    value: String(caseReviewSummary.eventCount),
                    detail: `${caseReviewSummary.approvalEvents} approval milestone${
                      caseReviewSummary.approvalEvents === 1 ? "" : "s"
                    } recorded`,
                    onClick: () => setCaseReviewHealthFilter("history"),
                  },
                  {
                    label: "Open Review Notes",
                    value: String(caseReviewSummary.openReviewNotes),
                    detail: `${caseReviewSummary.ownershipChanges} owner change${
                      caseReviewSummary.ownershipChanges === 1 ? "" : "s"
                    } tracked`,
                    onClick: () => setCaseReviewHealthFilter("open-notes"),
                  },
                  {
                    label: "Cases I Follow",
                    value: String(watchedCasesCount),
                    detail: "Cases you are explicitly following",
                    onClick: () => setCaseCollaborationFilter("watching"),
                  },
                    {
                      label: "Mentioned In Notes",
                      value: String(mentionedCasesCount),
                      detail: "Cases where review notes call you in directly",
                      onClick: () => setCaseCollaborationFilter("mentioned"),
                    },
                    {
                      label: "Reviewer Attention Only",
                      value: String(reviewerAttentionOnlyCount),
                      detail: "Cases with unread reviewer alerts",
                      onClick: () => setCaseCollaborationFilter("attention"),
                    },
                    {
                      label: "My Review Attention",
                      value: String(myReviewAttentionCount),
                      detail: "Open-note cases you follow or were mentioned on",
                      onClick: () => {
                        setCaseReviewHealthFilter("open-notes");
                        setCaseCollaborationFilter("attention");
                      },
                    },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.onClick}
                    className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/88 dark:hover:bg-zinc-900"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      {item.label}
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                      {item.value}
                    </p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {item.detail}
                    </p>
                  </button>
                ))}
              </section>
            )}

            {isCasesSection && (
              <CasesFilterToolbar
                filteredRowCount={filteredRows.length}
                onResetCaseFilters={resetCaseFilters}
                activeCaseQuickFilterCount={activeCaseQuickFilterCount}
                caseSearchQuery={caseSearchQuery}
                onCaseSearchQueryChange={setCaseSearchQuery}
                caseAssigneeFilter={caseAssigneeFilter}
                onCaseAssigneeFilterChange={setCaseAssigneeFilter}
                caseAssigneeOptions={caseAssigneeOptions}
                caseLinkedFilter={caseLinkedFilter}
                onCaseLinkedFilterChange={setCaseLinkedFilter}
                caseReviewHealthFilter={caseReviewHealthFilter}
                onCaseReviewHealthFilterChange={setCaseReviewHealthFilter}
                caseCollaborationFilter={caseCollaborationFilter}
                onCaseCollaborationFilterChange={setCaseCollaborationFilter}
                onOpenMyReviewQueue={() =>
                  applyCaseFilters({ ...myReviewQueueFilters, archived: "active" })
                }
                onApplyFailedLinkedPreset={() => applyCasesPreset("failed-linked")}
                onApplyReviewQueue={() => applyCaseFilters(reviewQueueFilters)}
                onApplyStrongCandidates={() => applyCaseFilters(strongCandidateFilters)}
                onApplyReleaseBlocking={() => applyCaseFilters(releaseBlockingFilters)}
                myReviewAttentionCount={myReviewAttentionCount}
                reviewerAttentionOnlyCount={reviewerAttentionOnlyCount}
                mentionedCasesCount={mentionedCasesCount}
                watchedCasesCount={watchedCasesCount}
                casesWithOpenReviewNotesCount={casesWithOpenReviewNotesCount}
                casesWithReviewHistoryCount={casesWithReviewHistoryCount}
              />
            )}

            {isCasesSection && (
              <div ref={savedViewsSectionRef}>
                <CasesSavedViewsSection
                  newCasesViewName={newCasesViewName}
                  onNewCasesViewNameChange={setNewCasesViewName}
                  onSaveCurrentCasesView={saveCurrentCasesView}
                  onApplyDefaultView={() => applyCasesPreset("default")}
                  onSetCurrentAsDefault={() =>
                    setCasesDefaultPreset(
                      activeCasesPreset === "custom" ? "default" : activeCasesPreset
                    )
                  }
                  activePresetLabel={
                    activeCasesPreset === "review-queue"
                      ? "Review Queue"
                      : activeCasesPreset === "failed-linked"
                        ? "Failed Linked Cases"
                        : activeCasesPreset === "default"
                          ? "Default View"
                          : "Custom"
                  }
                  defaultPresetLabel={
                    casesDefaultPreset === "review-queue"
                      ? "Review Queue"
                      : casesDefaultPreset === "failed-linked"
                        ? "Failed Linked Cases"
                        : "Default View"
                  }
                  defaultSavedViewName={
                    casesDefaultSavedViewId
                      ? casesSavedViews.find((view) => view.id === casesDefaultSavedViewId)
                          ?.name ?? "Missing view"
                      : null
                  }
                  activeSavedViewName={activeSavedCasesView?.name ?? null}
                  providerFocusedCandidateViews={providerFocusedCandidateViews}
                  onSaveMyReviewQueue={() =>
                    saveNamedCasesView("My Review Queue", myReviewQueueFilters, {
                      pinned: true,
                    })
                  }
                  onSetMyReviewQueueAsDefault={() =>
                    saveNamedCasesView("My Review Queue", myReviewQueueFilters, {
                      pinned: true,
                      setAsDefault: true,
                    })
                  }
                  onSaveStrongCandidates={() =>
                    saveNamedCasesView("Strong Candidates", strongCandidateFilters, {
                      pinned: true,
                    })
                  }
                  onSetStrongCandidatesAsDefault={() =>
                    saveNamedCasesView("Strong Candidates", strongCandidateFilters, {
                      pinned: true,
                      setAsDefault: true,
                    })
                  }
                  onSaveSecurityHighRisk={() =>
                    saveNamedCasesView(
                      "Security High Risk",
                      {
                        searchQuery: "",
                        assignee: "",
                        priority: "",
                        testDomain: "security",
                        riskLevel: "high",
                        securityCategory: "",
                        accessibilityCategory: "",
                        approvalState: "",
                        handoffState: "",
                        linked: "all",
                        execution: "",
                        review: "",
                        reviewHealth: "",
                        collaboration: "",
                        suite: "",
                        component: "",
                        automation: "",
                        automationProvider: "",
                        archived: "active",
                      },
                      { pinned: true }
                    )
                  }
                  onSaveAccessibilityReviewQueue={() =>
                    saveNamedCasesView(
                      "Accessibility Review Queue",
                      {
                        searchQuery: "",
                        assignee: "",
                        priority: "",
                        testDomain: "accessibility",
                        riskLevel: "",
                        securityCategory: "",
                        accessibilityCategory: "",
                        approvalState: "pending",
                        handoffState: "needs-qa-review",
                        linked: "all",
                        execution: "",
                        review: "",
                        reviewHealth: "open-notes",
                        collaboration: "",
                        suite: "",
                        component: "",
                        automation: "",
                        automationProvider: "",
                        archived: "active",
                      },
                      { pinned: true }
                    )
                  }
                  onSaveProviderCandidates={(provider) =>
                    saveNamedCasesView(
                      `${provider} Candidates`,
                      {
                        searchQuery: "",
                        assignee: "",
                        priority: "",
                        testDomain: "",
                        riskLevel: "",
                        securityCategory: "",
                        accessibilityCategory: "",
                        approvalState: "",
                        handoffState: "",
                        linked: "all",
                        execution: "",
                        review: "",
                        reviewHealth: "",
                        collaboration: "",
                        suite: "",
                        component: "",
                        automation: "candidate",
                        automationProvider: provider,
                        archived: "active",
                      },
                      { pinned: true }
                    )
                  }
                  onSetProviderCandidatesAsDefault={(provider) =>
                    saveNamedCasesView(
                      `${provider} Candidates`,
                      {
                        searchQuery: "",
                        assignee: "",
                        priority: "",
                        testDomain: "",
                        riskLevel: "",
                        securityCategory: "",
                        accessibilityCategory: "",
                        approvalState: "",
                        handoffState: "",
                        linked: "all",
                        execution: "",
                        review: "",
                        reviewHealth: "",
                        collaboration: "",
                        suite: "",
                        component: "",
                        automation: "candidate",
                        automationProvider: provider,
                        archived: "active",
                      },
                      {
                        pinned: true,
                        setAsDefault: true,
                      }
                    )
                  }
                  casesSavedViews={casesSavedViews}
                  orderedCasesSavedViews={orderedCasesSavedViews}
                  activeSavedCasesView={activeSavedCasesView}
                  editingCasesViewId={editingCasesViewId}
                  editingCasesViewName={editingCasesViewName}
                  onEditingCasesViewNameChange={setEditingCasesViewName}
                  onRenameCasesView={renameCasesView}
                  onCancelEditingCasesView={cancelEditingCasesView}
                  onApplySavedCasesView={applySavedCasesView}
                  onTogglePinCasesView={togglePinCasesView}
                  onSetDefaultCasesSavedView={setDefaultCasesSavedView}
                  onStartEditingCasesView={startEditingCasesView}
                  onDeleteCasesView={deleteCasesView}
                />
              </div>
            )}

            {isCasesSection && (
              <SecondaryMetadataPanel
                title="Domain and risk metadata"
                description="Metadata-heavy filters are demoted from the main scan path. Use the expanded filter surface below for the full domain, risk, security, and accessibility controls."
              >
                <div className="flex flex-wrap gap-2">
                  {caseTestDomainFilter ? (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                      Domain: {caseTestDomainFilter}
                    </span>
                  ) : null}
                  {caseRiskLevelFilter ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      Risk: {caseRiskLevelFilter}
                    </span>
                  ) : null}
                  {caseSecurityCategoryFilter ? (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                      Security: {caseSecurityCategoryFilter}
                    </span>
                  ) : null}
                  {caseAccessibilityCategoryFilter ? (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                      Accessibility: {caseAccessibilityCategoryFilter}
                    </span>
                  ) : null}
                  {!hasCaseMetadataFiltersApplied ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                      No metadata filters active
                    </span>
                  ) : null}
                </div>
              </SecondaryMetadataPanel>
            )}

            {isCasesSection && (
              <AdvancedFiltersPanel
                title="Full case filters"
                description="Lower-frequency filters stay available without forcing every control into the main scan row."
                summary={
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    {activeCaseAdvancedFilterCount} advanced active
                  </span>
                }
                defaultOpen={activeCaseAdvancedFilterCount > 0}
              >
                <div className="grid gap-3 xl:grid-cols-4">
                  <select
                    value={casePriorityFilter}
                    onChange={(event) =>
                      setCasePriorityFilter(
                        (event.target.value || "") as TestCaseRow["priority"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All priorities</option>
                    <option value="highest">Highest</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={caseTestDomainFilter}
                    onChange={(event) =>
                      setCaseTestDomainFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["testDomain"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All domains</option>
                    <option value="functional">Functional</option>
                    <option value="regression">Regression</option>
                    <option value="api">API</option>
                    <option value="ui">UI</option>
                    <option value="negative">Negative</option>
                    <option value="edge">Edge</option>
                    <option value="security">Security</option>
                    <option value="accessibility">Accessibility</option>
                  </select>
                  <select
                    value={caseRiskLevelFilter}
                    onChange={(event) =>
                      setCaseRiskLevelFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["riskLevel"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All risk levels</option>
                    <option value="low">Low risk</option>
                    <option value="medium">Medium risk</option>
                    <option value="high">High risk</option>
                  </select>
                  <select
                    value={caseExecutionFilter}
                    onChange={(event) =>
                      setCaseExecutionFilter(
                        (event.target.value || "") as TestCaseRow["executionResult"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All execution states</option>
                    <option value="not-run">Not Run</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <select
                    value={caseSuiteFilter}
                    onChange={(event) => setCaseSuiteFilter(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All suites</option>
                    {caseSuiteOptions.map((suite) => (
                      <option key={suite} value={suite}>
                        {suite}
                      </option>
                    ))}
                  </select>
                  <select
                    value={caseComponentFilter}
                    onChange={(event) => setCaseComponentFilter(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All components</option>
                    {caseComponentOptions.map((component) => (
                      <option key={component} value={component}>
                        {component}
                      </option>
                    ))}
                  </select>
                  <select
                    value={caseAutomationFilter}
                    onChange={(event) =>
                      setCaseAutomationFilter(
                        (event.target.value || "") as TestCaseRow["automationStatus"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All automation states</option>
                    <option value="manual">Manual only</option>
                    <option value="candidate">Strong candidates</option>
                    <option value="automated">Automated</option>
                  </select>
                  <select
                    value={caseAutomationProviderFilter}
                    onChange={(event) => setCaseAutomationProviderFilter(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All automation providers</option>
                    {automationProviderOptions.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                  <select
                    value={caseSecurityCategoryFilter}
                    onChange={(event) =>
                      setCaseSecurityCategoryFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["securityCategory"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All security focus</option>
                    <option value="auth">Authentication</option>
                    <option value="authorization">Authorization</option>
                    <option value="session">Session</option>
                    <option value="validation">Validation</option>
                    <option value="data-protection">Data Protection</option>
                    <option value="api-security">API Security</option>
                    <option value="upload-safety">Upload Safety</option>
                    <option value="business-logic">Business Logic</option>
                    <option value="abuse-resistance">Abuse Resistance</option>
                  </select>
                  <select
                    value={caseAccessibilityCategoryFilter}
                    onChange={(event) =>
                      setCaseAccessibilityCategoryFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["accessibilityCategory"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All accessibility focus</option>
                    <option value="keyboard-navigation">Keyboard Navigation</option>
                    <option value="focus-management">Focus Management</option>
                    <option value="screen-reader">Screen Reader</option>
                    <option value="forms">Forms</option>
                    <option value="semantics">Semantics</option>
                    <option value="contrast">Contrast</option>
                    <option value="zoom-reflow">Zoom & Reflow</option>
                    <option value="error-handling">Error Handling</option>
                    <option value="media-content">Media Content</option>
                  </select>
                  <select
                    value={caseApprovalStateFilter}
                    onChange={(event) =>
                      setCaseApprovalStateFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["approvalState"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All approval states</option>
                    <option value="pending">{approvalStateLabels.pending}</option>
                    <option value="approved">{approvalStateLabels.approved}</option>
                    <option value="rejected">{approvalStateLabels.rejected}</option>
                  </select>
                  <select
                    value={caseHandoffStateFilter}
                    onChange={(event) =>
                      setCaseHandoffStateFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["handoffState"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All handoff states</option>
                    <option value="needs-qa-review">{handoffStateLabels["needs-qa-review"]}</option>
                    <option value="needs-automation">{handoffStateLabels["needs-automation"]}</option>
                    <option value="needs-product-signoff">{handoffStateLabels["needs-product-signoff"]}</option>
                    <option value="release-blocking">{handoffStateLabels["release-blocking"]}</option>
                  </select>
                  <select
                    value={caseArchivedFilter}
                    onChange={(event) =>
                      setCaseArchivedFilter(
                        (event.target.value || "active") as "active" | "archived" | "all"
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="active">Active only</option>
                    <option value="archived">Archived only</option>
                    <option value="all">All cases</option>
                  </select>
                  <select
                    value={caseReviewFilter}
                    onChange={(event) =>
                      setCaseReviewFilter(
                        (event.target.value || "") as TestCaseRow["reviewStatus"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All review states</option>
                    <option value="draft">Draft</option>
                    <option value="in-review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="changes-requested">Changes Requested</option>
                  </select>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeCaseAdvancedFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCasePriorityFilter("");
                        setCaseTestDomainFilter("");
                        setCaseRiskLevelFilter("");
                        setCaseExecutionFilter("");
                        setCaseSuiteFilter("");
                        setCaseComponentFilter("");
                        setCaseAutomationFilter("");
                        setCaseAutomationProviderFilter("");
                        setCaseSecurityCategoryFilter("");
                        setCaseAccessibilityCategoryFilter("");
                        setCaseApprovalStateFilter("");
                        setCaseHandoffStateFilter("");
                        setCaseArchivedFilter("active");
                        setCaseReviewFilter("");
                      }}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Clear advanced filters
                    </button>
                  ) : (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                      No advanced filters active
                    </span>
                  )}
                </div>
              </AdvancedFiltersPanel>
            )}

            {false && isCasesSection && (
              <section className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      Case Search
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Narrow the visible set by title, case id, linked issue, assignee, priority, or execution state.
                    </p>
                  </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCaseSearchQuery("");
                        setCaseAssigneeFilter("");
                        setCasePriorityFilter("");
                        setCaseTestDomainFilter("");
                        setCaseRiskLevelFilter("");
                        setCaseSecurityCategoryFilter("");
                        setCaseAccessibilityCategoryFilter("");
                        setCaseApprovalStateFilter("");
                        setCaseHandoffStateFilter("");
                        setCaseLinkedFilter("all");
                        setCaseExecutionFilter("");
                        setCaseReviewFilter("");
                        setCaseReviewHealthFilter("");
                        setCaseCollaborationFilter("");
                        setCaseSuiteFilter("");
                        setCaseComponentFilter("");
                        setCaseAutomationFilter("");
                        setCaseAutomationProviderFilter("");
                        setCaseArchivedFilter("active");
                      }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Reset Case Filters
                  </button>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[1.35fr_repeat(14,minmax(0,1fr))]">
                  <input
                    type="text"
                    value={caseSearchQuery}
                    onChange={(event) => setCaseSearchQuery(event.target.value)}
                    placeholder="Search case id, title, issue key, assignee, labels..."
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  />
                  <select
                    value={caseAssigneeFilter}
                    onChange={(event) => setCaseAssigneeFilter(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All assignees</option>
                    {caseAssigneeOptions.map((assignee) => (
                      <option key={assignee} value={assignee}>
                        {assignee}
                      </option>
                    ))}
                  </select>
                  <select
                    value={casePriorityFilter}
                    onChange={(event) =>
                      setCasePriorityFilter(
                        (event.target.value || "") as TestCaseRow["priority"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All priorities</option>
                    <option value="highest">Highest</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={caseTestDomainFilter}
                    onChange={(event) =>
                      setCaseTestDomainFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["testDomain"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All domains</option>
                    <option value="functional">Functional</option>
                    <option value="regression">Regression</option>
                    <option value="api">API</option>
                    <option value="ui">UI</option>
                    <option value="negative">Negative</option>
                    <option value="edge">Edge</option>
                    <option value="security">Security</option>
                    <option value="accessibility">Accessibility</option>
                  </select>
                  <select
                    value={caseRiskLevelFilter}
                    onChange={(event) =>
                      setCaseRiskLevelFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["riskLevel"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All risk levels</option>
                    <option value="low">Low risk</option>
                    <option value="medium">Medium risk</option>
                    <option value="high">High risk</option>
                  </select>
                  <select
                    value={caseLinkedFilter}
                    onChange={(event) =>
                      setCaseLinkedFilter(
                        (event.target.value || "all") as
                          | "all"
                          | "linked"
                          | "unlinked"
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="all">All linkage</option>
                    <option value="linked">Linked cases</option>
                    <option value="unlinked">Unlinked cases</option>
                  </select>
                  <select
                    value={caseExecutionFilter}
                    onChange={(event) =>
                      setCaseExecutionFilter(
                        (event.target.value || "") as TestCaseRow["executionResult"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All execution states</option>
                    <option value="not-run">Not Run</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <select
                    value={caseSuiteFilter}
                    onChange={(event) => setCaseSuiteFilter(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All suites</option>
                    {caseSuiteOptions.map((suite) => (
                      <option key={suite} value={suite}>
                        {suite}
                      </option>
                    ))}
                  </select>
                  <select
                    value={caseComponentFilter}
                    onChange={(event) => setCaseComponentFilter(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All components</option>
                    {caseComponentOptions.map((component) => (
                      <option key={component} value={component}>
                        {component}
                      </option>
                    ))}
                  </select>
                  <select
                    value={caseAutomationFilter}
                    onChange={(event) =>
                      setCaseAutomationFilter(
                        (event.target.value || "") as TestCaseRow["automationStatus"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All automation states</option>
                    <option value="manual">Manual</option>
                    <option value="candidate">Candidate</option>
                    <option value="automated">Automated</option>
                  </select>
                  <select
                    value={caseAutomationProviderFilter}
                    onChange={(event) => setCaseAutomationProviderFilter(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All automation providers</option>
                    {caseAutomationProviderOptions.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                  <select
                    value={caseSecurityCategoryFilter}
                    onChange={(event) =>
                      setCaseSecurityCategoryFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["securityCategory"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All security categories</option>
                    <option value="auth">Auth</option>
                    <option value="authorization">Authorization</option>
                    <option value="session">Session</option>
                    <option value="validation">Validation</option>
                    <option value="data-protection">Data protection</option>
                    <option value="api-security">API security</option>
                    <option value="upload-safety">Upload safety</option>
                    <option value="business-logic">Business logic</option>
                    <option value="abuse-resistance">Abuse resistance</option>
                  </select>
                  <select
                    value={caseAccessibilityCategoryFilter}
                    onChange={(event) =>
                      setCaseAccessibilityCategoryFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["accessibilityCategory"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All accessibility categories</option>
                    <option value="keyboard-navigation">Keyboard navigation</option>
                    <option value="focus-management">Focus management</option>
                    <option value="screen-reader">Screen reader</option>
                    <option value="forms">Forms</option>
                    <option value="semantics">Semantics</option>
                    <option value="contrast">Contrast</option>
                    <option value="zoom-reflow">Zoom / reflow</option>
                    <option value="error-handling">Error handling</option>
                    <option value="media-content">Media / content</option>
                  </select>
                  <select
                    value={caseApprovalStateFilter}
                    onChange={(event) =>
                      setCaseApprovalStateFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["approvalState"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All approval states</option>
                    <option value="pending">{approvalStateLabels.pending}</option>
                    <option value="approved">{approvalStateLabels.approved}</option>
                    <option value="rejected">{approvalStateLabels.rejected}</option>
                  </select>
                  <select
                    value={caseHandoffStateFilter}
                    onChange={(event) =>
                      setCaseHandoffStateFilter(
                        (event.target.value || "") as NonNullable<TestCaseRow["handoffState"]> | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All handoff states</option>
                    <option value="needs-qa-review">{handoffStateLabels["needs-qa-review"]}</option>
                    <option value="needs-automation">{handoffStateLabels["needs-automation"]}</option>
                    <option value="needs-product-signoff">{handoffStateLabels["needs-product-signoff"]}</option>
                    <option value="release-blocking">{handoffStateLabels["release-blocking"]}</option>
                  </select>
                  <select
                    value={caseArchivedFilter}
                    onChange={(event) =>
                      setCaseArchivedFilter(
                        (event.target.value || "active") as "active" | "archived" | "all"
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="active">Active only</option>
                    <option value="archived">Archived only</option>
                    <option value="all">All cases</option>
                  </select>
                  <select
                    value={caseReviewFilter}
                    onChange={(event) =>
                      setCaseReviewFilter(
                        (event.target.value || "") as TestCaseRow["reviewStatus"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All review states</option>
                    <option value="draft">Draft</option>
                    <option value="in-review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="changes-requested">Changes Requested</option>
                  </select>
                  <select
                    value={caseReviewHealthFilter}
                    onChange={(event) =>
                      setCaseReviewHealthFilter(
                        (event.target.value || "") as "" | "open-notes" | "history"
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">All review health</option>
                    <option value="open-notes">Has open review notes</option>
                    <option value="history">Has approval history</option>
                  </select>
                    <select
                      value={caseCollaborationFilter}
                      onChange={(event) =>
                        setCaseCollaborationFilter(
                          (event.target.value || "") as
                            | ""
                            | "watching"
                            | "mentioned"
                            | "attention"
                        )
                      }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                      <option value="">All collaboration</option>
                      <option value="watching">Cases I follow</option>
                      <option value="mentioned">Mentioned in notes</option>
                      <option value="attention">Reviewer attention only</option>
                    </select>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {caseTestDomainFilter ? (
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                        Domain: {caseTestDomainFilter}
                      </span>
                    ) : null}
                    {caseRiskLevelFilter ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                        Risk: {caseRiskLevelFilter}
                      </span>
                    ) : null}
                    {caseSecurityCategoryFilter ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                        Security: {caseSecurityCategoryFilter}
                      </span>
                    ) : null}
                    {caseAccessibilityCategoryFilter ? (
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                        Accessibility: {caseAccessibilityCategoryFilter}
                      </span>
                    ) : null}
                    {caseApprovalStateFilter ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Approval: {approvalStateLabels[caseApprovalStateFilter as keyof typeof approvalStateLabels]}
                      </span>
                    ) : null}
                    {caseHandoffStateFilter ? (
                      <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-semibold text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                        Handoff: {handoffStateLabels[caseHandoffStateFilter as keyof typeof handoffStateLabels]}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setCaseReviewHealthFilter("open-notes");
                        setCaseCollaborationFilter("attention");
                      }}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        caseReviewHealthFilter === "open-notes" &&
                        caseCollaborationFilter === "attention"
                          ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      }`}
                    >
                      My Review Queue ({myReviewAttentionCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaseCollaborationFilter("attention")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        caseCollaborationFilter === "attention"
                          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      }`}
                    >
                      Reviewer attention only (
                      {reviewerAttentionOnlyCount}
                      )
                    </button>
                  <button
                    type="button"
                    onClick={() => setCaseCollaborationFilter("watching")}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      caseCollaborationFilter === "watching"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    }`}
                  >
                    Cases I follow ({watchedCasesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaseCollaborationFilter("mentioned")}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      caseCollaborationFilter === "mentioned"
                        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    }`}
                  >
                    Mentioned in notes ({mentionedCasesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCaseSearchQuery("");
                      setCaseAssigneeFilter("");
                      setCasePriorityFilter("");
                      setCaseTestDomainFilter("");
                      setCaseRiskLevelFilter("");
                      setCaseSecurityCategoryFilter("");
                      setCaseAccessibilityCategoryFilter("");
                      setCaseApprovalStateFilter("pending");
                      setCaseHandoffStateFilter("needs-qa-review");
                      setCaseLinkedFilter("all");
                      setCaseExecutionFilter("");
                      setCaseReviewFilter("in-review");
                      setCaseReviewHealthFilter("open-notes");
                      setCaseCollaborationFilter("");
                      setCaseSuiteFilter("");
                      setCaseComponentFilter("");
                      setCaseAutomationFilter("");
                      setCaseAutomationProviderFilter("");
                      setCaseArchivedFilter("active");
                    }}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    Review Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCaseSearchQuery("");
                      setCaseAssigneeFilter("");
                      setCasePriorityFilter("");
                      setCaseTestDomainFilter("");
                      setCaseRiskLevelFilter("");
                      setCaseSecurityCategoryFilter("");
                      setCaseAccessibilityCategoryFilter("");
                      setCaseApprovalStateFilter("");
                      setCaseHandoffStateFilter("");
                      setCaseLinkedFilter("linked");
                      setCaseExecutionFilter("failed");
                      setCaseReviewFilter("");
                      setCaseReviewHealthFilter("");
                      setCaseCollaborationFilter("");
                      setCaseSuiteFilter("");
                      setCaseComponentFilter("");
                      setCaseAutomationFilter("");
                      setCaseAutomationProviderFilter("");
                      setCaseArchivedFilter("active");
                    }}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                  >
                    Failed Linked Cases
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCaseSearchQuery("");
                      setCaseAssigneeFilter("");
                      setCasePriorityFilter("");
                      setCaseTestDomainFilter("");
                      setCaseRiskLevelFilter("");
                      setCaseSecurityCategoryFilter("");
                      setCaseAccessibilityCategoryFilter("");
                      setCaseApprovalStateFilter("");
                      setCaseHandoffStateFilter("needs-automation");
                      setCaseLinkedFilter("all");
                      setCaseExecutionFilter("");
                      setCaseReviewFilter("");
                      setCaseReviewHealthFilter("");
                      setCaseCollaborationFilter("");
                      setCaseSuiteFilter("");
                      setCaseComponentFilter("");
                      setCaseAutomationFilter("candidate");
                      setCaseAutomationProviderFilter("");
                      setCaseArchivedFilter("active");
                    }}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                  >
                    Strong Candidates
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCaseSearchQuery("");
                      setCaseAssigneeFilter("");
                      setCasePriorityFilter("");
                      setCaseTestDomainFilter("");
                      setCaseRiskLevelFilter("");
                      setCaseSecurityCategoryFilter("");
                      setCaseAccessibilityCategoryFilter("");
                      setCaseApprovalStateFilter("");
                      setCaseHandoffStateFilter("release-blocking");
                      setCaseLinkedFilter("all");
                      setCaseExecutionFilter("");
                      setCaseReviewFilter("");
                      setCaseReviewHealthFilter("");
                      setCaseCollaborationFilter("");
                      setCaseSuiteFilter("");
                      setCaseComponentFilter("");
                      setCaseAutomationFilter("");
                      setCaseAutomationProviderFilter("");
                      setCaseArchivedFilter("active");
                    }}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    Release Blocking
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCaseSearchQuery("");
                      setCaseAssigneeFilter("");
                      setCasePriorityFilter("");
                      setCaseTestDomainFilter("");
                      setCaseRiskLevelFilter("");
                      setCaseSecurityCategoryFilter("");
                      setCaseAccessibilityCategoryFilter("");
                      setCaseApprovalStateFilter("");
                      setCaseHandoffStateFilter("");
                      setCaseLinkedFilter("all");
                      setCaseExecutionFilter("");
                      setCaseReviewFilter("");
                      setCaseReviewHealthFilter("");
                      setCaseCollaborationFilter("");
                      setCaseSuiteFilter("");
                      setCaseComponentFilter("");
                      setCaseAutomationFilter("");
                      setCaseAutomationProviderFilter("");
                      setCaseArchivedFilter("active");
                    }}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Default View
                  </button>
                  <button
                    type="button"
                    onClick={() => setCasesDefaultPreset(
                      activeCasesPreset === "custom" ? "default" : activeCasesPreset
                    )}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  >
                    Set Current As Default
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaseReviewHealthFilter("open-notes")}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      caseReviewHealthFilter === "open-notes"
                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    }`}
                  >
                    Needs review attention ({casesWithOpenReviewNotesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaseReviewHealthFilter("history")}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      caseReviewHealthFilter === "history"
                        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    }`}
                  >
                    Reviewed cases ({casesWithReviewHistoryCount})
                  </button>
                  {caseReviewHealthFilter && (
                    <button
                      type="button"
                      onClick={() => setCaseReviewHealthFilter("")}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Clear review-health focus
                    </button>
                  )}
                  {caseCollaborationFilter && (
                    <button
                      type="button"
                      onClick={() => setCaseCollaborationFilter("")}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Clear collaboration focus
                    </button>
                  )}
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    Active preset:{" "}
                    {activeCasesPreset === "review-queue"
                      ? "Review Queue"
                      : activeCasesPreset === "failed-linked"
                      ? "Failed Linked Cases"
                      : activeCasesPreset === "default"
                      ? "Default View"
                      : "Custom"}
                  </span>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    Default preset:{" "}
                    {casesDefaultPreset === "review-queue"
                      ? "Review Queue"
                      : casesDefaultPreset === "failed-linked"
                      ? "Failed Linked Cases"
                      : "Default View"}
                  </span>
                  {casesDefaultSavedViewId && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      Default saved view:{" "}
                      {casesSavedViews.find((view) => view.id === casesDefaultSavedViewId)?.name ??
                        "Missing view"}
                    </span>
                  )}
                  {activeSavedCasesView && (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                      Active saved view: {activeSavedCasesView?.name}
                    </span>
                  )}
                </div>

                <div className="mt-4 rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-950/70">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        Saved Views
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Save reusable case slices for review, defect follow-up, or audit prep.
                      </p>
                    </div>
                    <div className="flex w-full gap-2 lg:w-auto">
                      <input
                        type="text"
                        value={newCasesViewName}
                        onChange={(event) => setNewCasesViewName(event.target.value)}
                        placeholder="Save current case view as..."
                        className="min-h-[40px] flex-1 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                      <button
                        type="button"
                        onClick={saveCurrentCasesView}
                        className="rounded-2xl bg-[linear-gradient(135deg,_#1d4ed8_0%,_#0f766e_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                      >
                        Save View
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveNamedCasesView("My Review Queue", myReviewQueueFilters, {
                            pinned: true,
                          })
                        }
                        className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                      >
                        Save My Review Queue
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveNamedCasesView("My Review Queue", myReviewQueueFilters, {
                            pinned: true,
                            setAsDefault: true,
                          })
                        }
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                      >
                        Set My Review Queue As Default
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveNamedCasesView(
                            "Strong Candidates",
                            {
                              searchQuery: "",
                              assignee: "",
                              priority: "",
                              testDomain: "",
                              riskLevel: "",
                              securityCategory: "",
                              accessibilityCategory: "",
                              approvalState: "",
                              handoffState: "needs-qa-review",
                              linked: "all",
                              execution: "",
                              review: "",
                              reviewHealth: "",
                              collaboration: "",
                              suite: "",
                              component: "",
                              automation: "candidate",
                              automationProvider: "",
                              archived: "active",
                            },
                            {
                              pinned: true,
                            }
                          )
                        }
                        className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                      >
                        Save Strong Candidates
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveNamedCasesView(
                            "Strong Candidates",
                            {
                              searchQuery: "",
                              assignee: "",
                              priority: "",
                              testDomain: "",
                              riskLevel: "",
                              securityCategory: "",
                              accessibilityCategory: "",
                              approvalState: "",
                              handoffState: "",
                              linked: "all",
                              execution: "",
                              review: "",
                              reviewHealth: "",
                              collaboration: "",
                              suite: "",
                              component: "",
                              automation: "candidate",
                              automationProvider: "",
                              archived: "active",
                            },
                            {
                              pinned: true,
                              setAsDefault: true,
                            }
                          )
                        }
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                      >
                        Set Strong Candidates As Default
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveNamedCasesView(
                            "Security High Risk",
                            {
                              searchQuery: "",
                              assignee: "",
                              priority: "",
                              testDomain: "security",
                              riskLevel: "high",
                              securityCategory: "",
                              accessibilityCategory: "",
                              approvalState: "",
                              handoffState: "",
                              linked: "all",
                              execution: "",
                              review: "",
                              reviewHealth: "",
                              collaboration: "",
                              suite: "",
                              component: "",
                              automation: "",
                              automationProvider: "",
                              archived: "active",
                            },
                            {
                              pinned: true,
                            }
                          )
                        }
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                      >
                        Save Security High Risk
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveNamedCasesView(
                            "Accessibility Review Queue",
                            {
                              searchQuery: "",
                              assignee: "",
                              priority: "",
                              testDomain: "accessibility",
                              riskLevel: "",
                              securityCategory: "",
                              accessibilityCategory: "",
                              approvalState: "pending",
                              handoffState: "needs-qa-review",
                              linked: "all",
                              execution: "",
                              review: "",
                              reviewHealth: "open-notes",
                              collaboration: "",
                              suite: "",
                              component: "",
                              automation: "",
                              automationProvider: "",
                              archived: "active",
                            },
                            {
                              pinned: true,
                            }
                          )
                        }
                        className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                      >
                        Save Accessibility Review Queue
                      </button>
                      {providerFocusedCandidateViews.map((entry) => (
                        <button
                          key={`save-provider-${entry.provider}`}
                          type="button"
                          onClick={() =>
                            saveNamedCasesView(
                              `${entry.provider} Candidates`,
                              {
                                searchQuery: "",
                                assignee: "",
                              priority: "",
                              testDomain: "",
                              riskLevel: "",
                              securityCategory: "",
                              accessibilityCategory: "",
                              approvalState: "",
                              handoffState: "",
                              linked: "all",
                                execution: "",
                                review: "",
                                reviewHealth: "",
                                collaboration: "",
                                suite: "",
                                component: "",
                                automation: "candidate",
                                automationProvider: entry.provider,
                                archived: "active",
                              },
                              {
                                pinned: true,
                              }
                            )
                          }
                          className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                        >
                          Save {entry.provider} Candidates
                        </button>
                      ))}
                      {providerFocusedCandidateViews[0] ? (
                        <button
                          type="button"
                          onClick={() =>
                            saveNamedCasesView(
                              `${providerFocusedCandidateViews[0].provider} Candidates`,
                              {
                                searchQuery: "",
                                assignee: "",
                              priority: "",
                              testDomain: "",
                              riskLevel: "",
                              securityCategory: "",
                              accessibilityCategory: "",
                              approvalState: "",
                              handoffState: "",
                              linked: "all",
                                execution: "",
                                review: "",
                                reviewHealth: "",
                                collaboration: "",
                                suite: "",
                                component: "",
                                automation: "candidate",
                                automationProvider: providerFocusedCandidateViews[0].provider,
                                archived: "active",
                              },
                              {
                                pinned: true,
                                setAsDefault: true,
                              }
                            )
                          }
                          className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20"
                        >
                          Set {providerFocusedCandidateViews[0].provider} Candidates As Default
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {casesSavedViews.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {orderedCasesSavedViews.map((view) => (
                        <div
                          key={view.id}
                          className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                            activeSavedCasesView?.id === view.id
                              ? "border-violet-300 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10"
                              : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                          }`}
                        >
                          {editingCasesViewId === view.id ? (
                            <>
                              <input
                                type="text"
                                value={editingCasesViewName}
                                onChange={(event) => setEditingCasesViewName(event.target.value)}
                                className="min-h-[34px] min-w-[180px] rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                              />
                              <button
                                type="button"
                                onClick={renameCasesView}
                                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingCasesView}
                                className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => applySavedCasesView(view)}
                                className="font-semibold text-zinc-800 transition hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-300"
                              >
                                {view.name}
                              </button>
                              {view.pinned && (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                  Pinned
                                </span>
                              )}
                              {activeSavedCasesView?.id === view.id && (
                                <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-200">
                                  Active
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => togglePinCasesView(view.id)}
                                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                              >
                                {view.pinned ? "Unpin" : "Pin"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDefaultCasesSavedView(view.id)}
                                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                              >
                                Default
                              </button>
                              <button
                                type="button"
                                onClick={() => startEditingCasesView(view.id, view.name)}
                                className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCasesView(view.id)}
                                className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                      No custom case views saved yet.
                    </p>
                  )}
                </div>
              </section>
            )}

            {isCasesSection && (
              <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Reusable Assets
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Save common test data and reusable case templates so the suite scales faster.
                      </p>
                    </div>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      {testDataSets.length} data set{testDataSets.length === 1 ? "" : "s"} | {caseTemplates.length} template{caseTemplates.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_1.2fr_auto]">
                    <input
                      type="text"
                      value={newDataSetName}
                      onChange={(event) => setNewDataSetName(event.target.value)}
                      placeholder="Reusable data set name"
                      className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                    />
                    <input
                      type="text"
                      value={newDataSetDescription}
                      onChange={(event) => setNewDataSetDescription(event.target.value)}
                      placeholder="Short description"
                      className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                    />
                    <input
                      type="text"
                      value={newDataSetContent}
                      onChange={(event) => setNewDataSetContent(event.target.value)}
                      placeholder="Shared credentials / payload / boundary values"
                      className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                    />
                    <button
                      type="button"
                      onClick={createTestDataSet}
                      className="min-h-[44px] rounded-2xl bg-[linear-gradient(135deg,_#1d4ed8_0%,_#0f766e_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                    >
                      Save Data Set
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto]">
                    <select
                      value={selectedTemplateId}
                      onChange={(event) => setSelectedTemplateId(event.target.value)}
                      className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                    >
                      <option value="">Select a saved case template</option>
                      {orderedCaseTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                          {template.automationProvider?.trim()
                            ? ` | ${template.automationProvider.trim()}`
                            : ""}
                          {template.category === "provider-starter" ? " | Starter" : ""}
                          {template.sourceProjectName?.trim()
                            ? ` | ${template.sourceProjectName.trim()}`
                            : ""}
                          {template.packVersion ? ` | v${template.packVersion}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={applySelectedTemplate}
                      disabled={!selectedTemplateId}
                      className="min-h-[44px] rounded-2xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Create From Template
                    </button>
                  </div>
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Provider Starter Templates
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {providerStarterTemplates.map((starter) => (
                        <button
                          key={starter.provider}
                          type="button"
                          onClick={() => createProviderStarterTemplate(starter.provider)}
                          className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                        >
                          Add {starter.provider} Starter
                        </button>
                      ))}
                    </div>
                  </div>
                  {pendingTemplateImport ? (
                    <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/90 px-4 py-4 dark:border-sky-500/30 dark:bg-sky-500/10">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                            Template Import Preview
                          </p>
                          <p className="mt-1 text-sm text-sky-900 dark:text-sky-100">
                            {pendingTemplateImport.items.length} template
                            {pendingTemplateImport.items.length === 1 ? "" : "s"} ready to import
                            {pendingTemplateImport.sourceProjectName
                              ? ` from ${pendingTemplateImport.sourceProjectName}`
                              : ""}.
                          </p>
                          <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-200/80">
                            {pendingTemplateImport.renamedCount > 0
                              ? `${pendingTemplateImport.renamedCount} duplicate name${
                                  pendingTemplateImport.renamedCount === 1 ? " was" : "s were"
                                } renamed safely during preview.`
                              : "No name conflicts detected."}
                            {pendingTemplateImport.replacementCount > 0
                              ? ` ${pendingTemplateImport.replacementCount} incoming template${
                                  pendingTemplateImport.replacementCount === 1 ? "" : "s"
                                } will replace older local versions.`
                              : ""}
                            {typeof pendingTemplateImport.packVersion === "number"
                              ? ` Pack version ${pendingTemplateImport.packVersion}.`
                              : ""}
                            {pendingTemplateImport.exportedBy
                              ? ` Exported by ${pendingTemplateImport.exportedBy}.`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPendingTemplateImport((current) =>
                                current
                                  ? {
                                      ...current,
                                      selectedTemplateIds: current.items.map(
                                        (item) => item.template.id
                                      ),
                                    }
                                  : current
                              )
                            }
                            className="rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-300 dark:hover:bg-sky-500/20"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingTemplateImport((current) =>
                                current
                                  ? {
                                      ...current,
                                      selectedTemplateIds: [],
                                    }
                                  : current
                              )
                            }
                            className="rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-300 dark:hover:bg-sky-500/20"
                          >
                            Clear Selection
                          </button>
                          <button
                            type="button"
                            onClick={applyPendingTemplateImport}
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                          >
                            Import Now
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingTemplateImport(null);
                              setTemplateImportFilterMode("all");
                              setSelectedTemplateImportDiffId(null);
                              setTemplateImportProviderFilter(null);
                              setTemplateImportSourceFilter(null);
                              setTemplateImportSortMode("default");
                            }}
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            Discard Preview
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          [
                            "all",
                            `All (${pendingTemplateImport.items.length})`,
                          ],
                          [
                            "new",
                            `New (${pendingTemplateImport.items.filter((item) => item.importStatus === "new").length})`,
                          ],
                          [
                            "rename",
                            `Rename (${pendingTemplateImport.items.filter((item) => item.importStatus === "rename").length})`,
                          ],
                          [
                            "replace",
                            `Replace (${pendingTemplateImport.items.filter((item) => item.importStatus === "replace").length})`,
                          ],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setTemplateImportFilterMode(
                                value as "all" | "new" | "rename" | "replace"
                              )
                            }
                            className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                              templateImportFilterMode === value
                                ? "border-sky-700 bg-sky-700 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-zinc-950"
                                : "border-sky-200 bg-white text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-300 dark:hover:bg-sky-500/20"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setPendingTemplateImport((current) =>
                              current
                                ? {
                                    ...current,
                                    selectedTemplateIds: current.items
                                      .filter((item) => item.importStatus === "replace")
                                      .map((item) => item.template.id),
                                  }
                                : current
                            )
                          }
                          className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                        >
                          Select Replacements
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingTemplateImport((current) =>
                              current
                                ? {
                                    ...current,
                                    selectedTemplateIds: current.items
                                      .filter((item) => item.importStatus === "new")
                                      .map((item) => item.template.id),
                                  }
                                : current
                            )
                          }
                          className="rounded-2xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-300 dark:hover:bg-sky-500/20"
                        >
                          Select New Only
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingTemplateImport((current) =>
                              current
                                ? {
                                    ...current,
                                    selectedTemplateIds: current.items
                                      .filter((item) => item.importStatus === "rename")
                                      .map((item) => item.template.id),
                                  }
                                : current
                            )
                          }
                          className="rounded-2xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-300 dark:hover:bg-amber-500/20"
                        >
                          Select Renames
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingTemplateImport((current) =>
                              current
                                ? {
                                    ...current,
                                    selectedTemplateIds: current.items
                                      .filter(
                                        (item) =>
                                          item.template.automationProvider?.trim() &&
                                          item.matchedTemplate &&
                                          templateFieldChanged(
                                            item.template,
                                            item.matchedTemplate,
                                            "automationProvider"
                                          )
                                      )
                                      .map((item) => item.template.id),
                                  }
                                : current
                            )
                          }
                          className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-zinc-950 dark:text-violet-300 dark:hover:bg-violet-500/20"
                        >
                          Select Changed Provider
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const providerToSelect =
                              templateImportProviderFilter ||
                              selectedTemplateImportDiffItem?.template.automationProvider?.trim() ||
                              null;
                            if (!providerToSelect) {
                              return;
                            }
                            setPendingTemplateImport((current) =>
                              current
                                ? {
                                    ...current,
                                    selectedTemplateIds: current.items
                                      .filter(
                                        (item) =>
                                          (item.template.automationProvider?.trim() ||
                                            "Unspecified") === providerToSelect
                                      )
                                      .map((item) => item.template.id),
                                  }
                                : current
                            );
                          }}
                          disabled={
                            !templateImportProviderFilter &&
                            !selectedTemplateImportDiffItem?.template.automationProvider?.trim()
                          }
                          className="rounded-2xl border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-500/30 dark:bg-zinc-950 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                        >
                          Select Same Provider
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const sourceToSelect =
                              templateImportSourceFilter ||
                              selectedTemplateImportDiffItem?.template.sourceProjectName?.trim() ||
                              pendingTemplateImport.sourceProjectName?.trim() ||
                              null;
                            if (!sourceToSelect) {
                              return;
                            }
                            setPendingTemplateImport((current) =>
                              current
                                ? {
                                    ...current,
                                    selectedTemplateIds: current.items
                                      .filter(
                                        (item) =>
                                          (item.template.sourceProjectName?.trim() ||
                                            current.sourceProjectName?.trim() ||
                                            "Unknown source") === sourceToSelect
                                      )
                                      .map((item) => item.template.id),
                                  }
                                : current
                            );
                          }}
                          disabled={
                            !templateImportSourceFilter &&
                            !selectedTemplateImportDiffItem?.template.sourceProjectName?.trim() &&
                            !pendingTemplateImport.sourceProjectName?.trim()
                          }
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          Select Same Source
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-2xl border border-sky-200/70 bg-white/70 px-3 py-3 dark:border-sky-500/20 dark:bg-zinc-950/50">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                            Provider Mix
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {pendingTemplateImportSummary.providerCounts.map((entry) => (
                              <button
                                key={`import-provider-${entry.provider}`}
                                type="button"
                                onClick={() =>
                                  setTemplateImportProviderFilter((current) =>
                                    current === entry.provider ? null : entry.provider
                                  )
                                }
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                  templateImportProviderFilter === entry.provider
                                    ? "border-sky-700 bg-sky-700 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-zinc-950"
                                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                                }`}
                              >
                                {entry.provider}: {entry.count}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200/80 bg-white/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                            Source Mix
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {pendingTemplateImportSummary.sourceCounts.map((entry) => (
                              <button
                                key={`import-source-${entry.source}`}
                                type="button"
                                onClick={() =>
                                  setTemplateImportSourceFilter((current) =>
                                    current === entry.source ? null : entry.source
                                  )
                                }
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                  templateImportSourceFilter === entry.source
                                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                }`}
                              >
                                {entry.source}: {entry.count}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {templateImportProviderFilter || templateImportSourceFilter ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {templateImportProviderFilter ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                              Provider: {templateImportProviderFilter}
                            </span>
                          ) : null}
                          {templateImportSourceFilter ? (
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              Source: {templateImportSourceFilter}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateImportProviderFilter(null);
                              setTemplateImportSourceFilter(null);
                            }}
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            Clear Mix Filters
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          ["default", "Default Order"],
                          ["replace-first", "Replacements First"],
                          ["new-first", "New First"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setTemplateImportSortMode(
                                value as "default" | "replace-first" | "new-first"
                              )
                            }
                            className={`rounded-2xl border px-3 py-1.5 text-[11px] font-semibold transition ${
                              templateImportSortMode === value
                                ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {selectedTemplateImportDiffItem?.matchedTemplate ? (
                        <div className="mt-4 rounded-2xl border border-violet-200 bg-white/90 px-4 py-4 dark:border-violet-500/30 dark:bg-zinc-950/70">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                                Side-By-Side Diff
                              </p>
                              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                {selectedTemplateImportDiffItem.template.name}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedTemplateImportDiffId(null)}
                              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              Close Diff
                            </button>
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                Existing Local Template
                              </p>
                              <div className="mt-2 space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "title") ? "rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}><span className="font-semibold text-zinc-800 dark:text-zinc-100">Title:</span> {selectedTemplateImportDiffItem.matchedTemplate.title.trim() || "Untitled"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "preconditions") ? "rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}><span className="font-semibold text-zinc-800 dark:text-zinc-100">Preconditions:</span> {selectedTemplateImportDiffItem.matchedTemplate.preconditions.trim() || "No preconditions"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "automationProvider") ? "rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}><span className="font-semibold text-zinc-800 dark:text-zinc-100">Provider:</span> {selectedTemplateImportDiffItem.matchedTemplate.automationProvider?.trim() || "Unspecified"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "packVersion") ? "rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}><span className="font-semibold text-zinc-800 dark:text-zinc-100">Pack:</span> v{selectedTemplateImportDiffItem.matchedTemplate.packVersion ?? 1}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "expectedResult") ? "rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}><span className="font-semibold text-zinc-800 dark:text-zinc-100">Expected:</span> {selectedTemplateImportDiffItem.matchedTemplate.expectedResult.trim() || "No expected result"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "testData") ? "rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}><span className="font-semibold text-zinc-800 dark:text-zinc-100">Test Data:</span> {selectedTemplateImportDiffItem.matchedTemplate.testData?.trim() || "No test data"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "steps") ? "rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}><span className="font-semibold text-zinc-800 dark:text-zinc-100">Steps:</span> {selectedTemplateImportDiffItem.matchedTemplate.steps.trim() || "No steps"}</p>
                              </div>
                            </div>
                            <div className="rounded-2xl border border-violet-200/80 bg-violet-50/70 px-3 py-3 dark:border-violet-500/20 dark:bg-violet-500/10">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
                                Incoming Template
                              </p>
                              <div className="mt-2 space-y-2 text-xs text-zinc-700 dark:text-zinc-200">
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "title") ? "rounded-xl border border-violet-300 bg-white/80 px-2 py-1 dark:border-violet-400/30 dark:bg-zinc-950/40" : ""}><span className="font-semibold">Title:</span> {selectedTemplateImportDiffItem.template.title.trim() || "Untitled"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "preconditions") ? "rounded-xl border border-violet-300 bg-white/80 px-2 py-1 dark:border-violet-400/30 dark:bg-zinc-950/40" : ""}><span className="font-semibold">Preconditions:</span> {selectedTemplateImportDiffItem.template.preconditions.trim() || "No preconditions"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "automationProvider") ? "rounded-xl border border-violet-300 bg-white/80 px-2 py-1 dark:border-violet-400/30 dark:bg-zinc-950/40" : ""}><span className="font-semibold">Provider:</span> {selectedTemplateImportDiffItem.template.automationProvider?.trim() || "Unspecified"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "packVersion") ? "rounded-xl border border-violet-300 bg-white/80 px-2 py-1 dark:border-violet-400/30 dark:bg-zinc-950/40" : ""}><span className="font-semibold">Pack:</span> v{selectedTemplateImportDiffItem.template.packVersion ?? 1}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "expectedResult") ? "rounded-xl border border-violet-300 bg-white/80 px-2 py-1 dark:border-violet-400/30 dark:bg-zinc-950/40" : ""}><span className="font-semibold">Expected:</span> {selectedTemplateImportDiffItem.template.expectedResult.trim() || "No expected result"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "testData") ? "rounded-xl border border-violet-300 bg-white/80 px-2 py-1 dark:border-violet-400/30 dark:bg-zinc-950/40" : ""}><span className="font-semibold">Test Data:</span> {selectedTemplateImportDiffItem.template.testData?.trim() || "No test data"}</p>
                                <p className={templateFieldChanged(selectedTemplateImportDiffItem.template, selectedTemplateImportDiffItem.matchedTemplate, "steps") ? "rounded-xl border border-violet-300 bg-white/80 px-2 py-1 dark:border-violet-400/30 dark:bg-zinc-950/40" : ""}><span className="font-semibold">Steps:</span> {selectedTemplateImportDiffItem.template.steps.trim() || "No steps"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-4 max-h-[36rem] overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                        <div className="grid gap-2 md:grid-cols-2">
                        {orderedPendingTemplateImportItems.map((item) => {
                          const template = item.template;
                          const fieldChanges = summarizeTemplateFieldChanges(
                            template,
                            item.matchedTemplate
                          );
                          return (
                          <div
                            key={`preview-${template.id}`}
                            className="rounded-2xl border border-sky-200/70 bg-white/80 px-3 py-3 text-xs dark:border-sky-500/20 dark:bg-zinc-950/60"
                          >
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={pendingTemplateImport.selectedTemplateIds.includes(
                                  template.id
                                )}
                                onChange={(event) =>
                                  setPendingTemplateImport((current) => {
                                    if (!current) {
                                      return current;
                                    }

                                    return {
                                      ...current,
                                      selectedTemplateIds: event.target.checked
                                        ? [...current.selectedTemplateIds, template.id]
                                        : current.selectedTemplateIds.filter(
                                            (id) => id !== template.id
                                          ),
                                    };
                                  })
                                }
                                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {template.name}
                                  </p>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                      item.importStatus === "replace"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                                        : item.importStatus === "rename"
                                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                                        : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                                    }`}
                                  >
                                    {item.importStatus}
                                  </span>
                                </div>
                                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                                  {template.automationProvider?.trim() || "No provider"}{" "}
                                  {template.category === "provider-starter" ? "| Starter" : ""}
                                  {template.packVersion ? ` | v${template.packVersion}` : ""}
                                </p>
                                {item.matchedTemplateName ? (
                                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                                    {item.importStatus === "replace"
                                      ? `Will replace ${item.matchedTemplateName}`
                                      : item.importStatus === "rename"
                                      ? `Name conflict with ${item.matchedTemplateName}`
                                      : `Matched ${item.matchedTemplateName}`}
                                  </p>
                                ) : null}
                                {item.matchedTemplate ? (
                                  <div className="mt-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                      Change Preview
                                    </p>
                                    <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                                      {fieldChanges.length > 0
                                        ? `${fieldChanges.length} field${
                                            fieldChanges.length === 1 ? "" : "s"
                                          } will change: ${fieldChanges.join(", ")}.`
                                        : "No tracked field differences detected."}
                                    </p>
                                    <div className="mt-2 space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                      <p>
                                        Title: {item.matchedTemplate.title.trim() || "Untitled"} {"->"}{" "}
                                        {template.title.trim() || "Untitled"}
                                      </p>
                                      <p>
                                        Provider:{" "}
                                        {item.matchedTemplate.automationProvider?.trim() ||
                                          "Unspecified"}{" "}
                                        {"->"} {template.automationProvider?.trim() || "Unspecified"}
                                      </p>
                                      <p>
                                        Pack: v{item.matchedTemplate.packVersion ?? 1} {"->"} v
                                        {template.packVersion ?? 1}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTemplateImportDiffId(template.id)}
                                      className="mt-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                                    >
                                      Inspect Full Diff
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </label>
                          </div>
                        )})}
                        </div>
                      </div>
                      {orderedPendingTemplateImportItems.length === 0 ? (
                        <p className="mt-3 text-xs text-sky-800/80 dark:text-sky-200/80">
                          No import preview items match the current status filter.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    ref={templateLibrarySectionRef}
                    className="mt-5 border-t border-zinc-200/80 pt-4 dark:border-zinc-800"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                          Template Library
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Manage reusable templates directly here so provider starters and favorites stay easy to maintain.
                        </p>
                      </div>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                        {visibleCaseTemplates.length} visible | {importedTemplateCount} imported
                      </span>
                    </div>
                    {latestTemplateImportAuditEntry ? (
                      <div className="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                          Latest Import Summary
                        </p>
                        <p className="mt-1 text-xs text-emerald-900 dark:text-emerald-100">
                          {latestTemplateImportAuditEntry.detail}
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-800/80 dark:text-emerald-200/80">
                          Recorded {formatUtcDateTime(latestTemplateImportAuditEntry.createdAt)}
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                          Template Provider Counts
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Array.from(
                            visibleCaseTemplates.reduce((accumulator, template) => {
                              const provider =
                                template.automationProvider?.trim() || "Unspecified";
                              accumulator.set(
                                provider,
                                (accumulator.get(provider) ?? 0) + 1
                              );
                              return accumulator;
                            }, new Map<string, number>())
                          )
                            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
                            .map(([provider, count]) => (
                              <span
                                key={`library-provider-${provider}`}
                                className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                              >
                                {provider}: {count}
                              </span>
                            ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                          Template Source Counts
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Array.from(
                            visibleCaseTemplates.reduce((accumulator, template) => {
                              const source =
                                template.sourceProjectName?.trim() ||
                                (projectName.trim() || "This project");
                              accumulator.set(source, (accumulator.get(source) ?? 0) + 1);
                              return accumulator;
                            }, new Map<string, number>())
                          )
                            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
                            .map(([source, count]) => (
                              <span
                                key={`library-source-${source}`}
                                className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                              >
                                {source}: {count}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                    {recentTemplateImportAuditEntries.length > 0 ? (
                      <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                          Recent Import History
                        </p>
                        {(templateHistoryProviderOptions.length > 0 ||
                          templateHistorySourceOptions.length > 0) ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {templateHistoryProviderOptions.map((provider) => (
                              <button
                                key={`template-history-provider-${provider}`}
                                type="button"
                                onClick={() =>
                                  setTemplateHistoryProviderFilter((current) =>
                                    current === provider ? null : provider
                                  )
                                }
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                  templateHistoryProviderFilter === provider
                                    ? "border-sky-700 bg-sky-700 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-zinc-950"
                                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                                }`}
                              >
                                {provider}
                              </button>
                            ))}
                            {templateHistorySourceOptions.map((source) => (
                              <button
                                key={`template-history-source-${source}`}
                                type="button"
                                onClick={() =>
                                  setTemplateHistorySourceFilter((current) =>
                                    current === source ? null : source
                                  )
                                }
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                  templateHistorySourceFilter === source
                                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                              >
                                Clear History Filters
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-2 space-y-2">
                          {filteredRecentTemplateImportAuditEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/60"
                            >
                              <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                                {formatUtcDateTime(entry.createdAt)}
                              </p>
                              <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                                {entry.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                        {filteredRecentTemplateImportAuditEntries.length === 0 ? (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            No recent import history matches the current provider/source filters.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <input
                      ref={templateImportInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={importTemplatePack}
                      className="hidden"
                    />
                    <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto]">
                      <input
                        type="text"
                        value={templateSearchQuery}
                        onChange={(event) => setTemplateSearchQuery(event.target.value)}
                        placeholder="Search template name, provider, or reference"
                        className="min-h-[40px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={exportVisibleTemplates}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                        >
                          Export Visible
                        </button>
                        <button
                          type="button"
                          onClick={() => templateImportInputRef.current?.click()}
                          className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                        >
                          Import Pack
                        </button>
                        {[
                          ["all", "All"],
                          ["favorites", "Favorites"],
                          ["starters", "Starters"],
                          ["provider", "Provider Tagged"],
                          ["imported", "Imported Packs"],
                          ["local", "This Project"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setTemplateFilterMode(
                                value as
                                  | "all"
                                  | "favorites"
                                  | "starters"
                                  | "provider"
                                  | "imported"
                                  | "local"
                              )
                            }
                            className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                              templateFilterMode === value
                                ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {visibleCaseTemplates.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {visibleCaseTemplates.slice(0, 8).map((template) => (
                          <div
                            key={template.id}
                            className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                {editingTemplateId === template.id ? (
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                      type="text"
                                      value={editingTemplateName}
                                      onChange={(event) => setEditingTemplateName(event.target.value)}
                                      className="min-h-[40px] flex-1 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => saveTemplateRename(template.id)}
                                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingTemplateId(null);
                                          setEditingTemplateName("");
                                        }}
                                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        {template.name}
                                      </p>
                                      {template.pinned ? (
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                          Favorite
                                        </span>
                                      ) : null}
                                      {template.category === "provider-starter" ? (
                                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300">
                                          Starter
                                        </span>
                                      ) : null}
                                      {template.automationProvider?.trim() ? (
                                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                          {template.automationProvider.trim()}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                      Updated {formatUtcDateTime(template.updatedAt)}
                                      {template.automationReference?.trim()
                                        ? ` | Ref ${template.automationReference.trim()}`
                                        : ""}
                                    </p>
                                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                      External Id: {formatTemplateExternalId(template.externalTemplateId)}
                                      {template.packVersion ? ` | v${template.packVersion}` : ""}
                                    </p>
                                    {template.sourceProjectName || template.sourceExportedBy ? (
                                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                        Source: {template.sourceProjectName || "Unknown project"}
                                        {template.sourceExportedBy
                                          ? ` | By ${template.sourceExportedBy}`
                                          : ""}
                                        {template.sourceExportedAt
                                          ? ` | ${formatUtcDateTime(template.sourceExportedAt)}`
                                          : ""}
                                      </p>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              {editingTemplateId !== template.id ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => applyTemplateById(template.id)}
                                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                  >
                                    Use
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditingTemplate(template.id, template.name)}
                                    className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                                  >
                                    Rename
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => duplicateTemplate(template.id)}
                                    className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                                  >
                                    Duplicate
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleTemplatePinned(template.id)}
                                    className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                                  >
                                    {template.pinned ? "Unfavorite" : "Favorite"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteTemplate(template.id)}
                                    className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                        {orderedCaseTemplates.length === 0
                          ? "No reusable templates saved yet."
                          : "No templates match the current search or filter."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Quality & Coverage
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Duplicate candidates
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {caseManagementSummary.duplicateCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Weak or thin cases
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {caseManagementSummary.weakCaseCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Archived inventory
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {caseManagementSummary.archivedCount}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {caseQualityAnalysis.findings.slice(0, 3).map((finding) => (
                      <div
                        key={finding.id}
                        className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {finding.title}
                        </p>
                        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                          {finding.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {isCasesSection && (
              <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Reviewer Workload
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Who owns the most case reviews right now
                      </p>
                    </div>
                  </div>

                  {reviewerWorkload.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {reviewerWorkload.map((entry) => (
                        <button
                          key={entry.owner}
                          type="button"
                          onClick={() => setCaseAssigneeFilter(entry.owner)}
                          className="w-full rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-left transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {entry.owner}
                            </p>
                            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              {entry.assignedCases} assigned
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                            {entry.openNotes} open note{entry.openNotes === 1 ? "" : "s"} |{" "}
                            {entry.approvedCases} approved
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                      No review owners assigned yet.
                    </p>
                  )}
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Review Timeline Rollup
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Recent approval activity across the current project
                      </p>
                    </div>
                  </div>

                  {approvalTimelineRollup.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {approvalTimelineRollup.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {entry.action}
                            </p>
                            <span className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                              {formatUtcDate(entry.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                            {entry.detail}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {entry.actorName || entry.actorEmail || "Reviewer"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                      Review activity will appear here once approvals, notes, and ownership changes start happening.
                    </p>
                  )}
                </div>
              </section>
            )}

            {isCasesSection && (
              <details className="group rounded-[24px] border border-zinc-200 bg-white/88 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      Traceability And Coverage
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Requirement mapping, coverage health, and hotspot risk stay here when you need deeper QA analysis.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      {traceabilityHealthSummary.coveragePercent}% covered
                    </span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      {traceabilityAnalysis.uncoveredSentences.length} uncovered
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                      Deep Dive
                    </span>
                  </div>
                </summary>
                <div className="border-t border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
              <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Requirement Traceability Matrix
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Requirement sentence mapping, linked issue coverage, and area ownership for every case.
                      </p>
                    </div>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      {traceabilityMatrix.filter((entry) => entry.covered).length}/{traceabilityMatrix.length} mapped
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={exportTraceabilityMatrix}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Export Matrix CSV
                    </button>
                    <button
                      type="button"
                      onClick={exportTraceabilityCoverageReport}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Export Coverage Report
                    </button>
                    <span className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      {traceabilityAnalysis.uncoveredSentences.length} uncovered sentence{traceabilityAnalysis.uncoveredSentences.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    {[
                      {
                        label: "Sentence Coverage",
                        value: `${traceabilityHealthSummary.coveragePercent}%`,
                        detail: `${traceabilityHealthSummary.coveredSentences}/${traceabilityHealthSummary.totalSentences} requirement sentences mapped`,
                      },
                      {
                        label: "Uncovered Requirements",
                        value: String(traceabilityHealthSummary.uncoveredSentences),
                        detail:
                          uncoveredRequirementInsights.filter((item) => item.severity === "high")
                            .length > 0
                            ? `${uncoveredRequirementInsights.filter((item) => item.severity === "high").length} high-severity gap${uncoveredRequirementInsights.filter((item) => item.severity === "high").length === 1 ? "" : "s"} need early follow-up`
                            : "Statements still missing direct case coverage",
                      },
                      {
                        label: "Multi-mapped Sentences",
                        value: String(traceabilityHealthSummary.multiMappedSentences),
                        detail: "Requirement sentences currently covered by multiple cases",
                      },
                      {
                        label: "Cases Without Mapping",
                        value: String(traceabilityHealthSummary.casesWithoutDirectMapping),
                        detail: `${traceabilityHealthSummary.linkedMappedCases} mapped cases are already linked to issues`,
                      },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                          {card.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                          {card.value}
                        </p>
                        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {card.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        <tr>
                          <th className="pb-3">Case</th>
                          <th className="pb-3">Area</th>
                          <th className="pb-3">Requirement</th>
                          <th className="pb-3">Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {traceabilityMatrix.slice(0, 8).map((entry) => (
                          <tr key={entry.rowId} className="border-t border-zinc-200/70 dark:border-zinc-800">
                            <td className="py-3">
                              <button
                                type="button"
                                onClick={() => focusWorkspaceRow(entry.rowId, "Traceability focus")}
                                className="font-semibold text-zinc-900 transition hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-300"
                              >
                                {entry.rowId}
                              </button>
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {entry.title}
                              </p>
                            </td>
                            <td className="py-3 text-zinc-700 dark:text-zinc-300">
                              {entry.componentArea}
                            </td>
                            <td className="py-3 text-zinc-700 dark:text-zinc-300">
                              {entry.requirementSentence}
                            </td>
                            <td className="py-3 text-zinc-700 dark:text-zinc-300">
                              {entry.issueKey && activeProjectRouteRef ? (
                                <Link
                                  href={`/projects/${encodeURIComponent(activeProjectRouteRef)}/issues?search=${encodeURIComponent(entry.issueKey)}`}
                                  className="text-violet-700 transition hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-200"
                                >
                                  {entry.issueKey}
                                </Link>
                              ) : (
                                entry.issueKey || "Unlinked"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    Coverage Hotspots
                  </p>
                  <div className="mt-4 space-y-3">
                    {coverageHotspots.slice(0, 5).map((hotspot) => (
                      <div
                        key={hotspot.area}
                        className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {hotspot.area}
                          </p>
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                            {hotspot.riskPercent}% risk
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${Math.max(hotspot.riskPercent, 6)}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                          <span>{hotspot.total} total</span>
                          <span>{hotspot.notRun} not run</span>
                          <span>{hotspot.failed} failed</span>
                          <span>{hotspot.automated} automated</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-white/88 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        Automation Intelligence
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Strong next candidates based on case quality, repeatability, approval state, and execution signals.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCaseAutomationFilter("candidate")}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Focus candidates
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Automated
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {caseManagementSummary.automationCounts.automated}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Candidate
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {caseManagementSummary.automationCounts.candidate}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Strong ready
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                        {caseManagementSummary.automationReadyCount}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Provider-aware thresholding applied
                      </p>
                    </div>
                  </div>

                  {caseManagementSummary.automationProviderSummary.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        Integration Mix
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {caseManagementSummary.automationProviderSummary.map((entry) => (
                          <button
                            key={entry.provider}
                            type="button"
                            onClick={() => setCaseAutomationProviderFilter(entry.provider)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                              caseAutomationProviderFilter === entry.provider
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            }`}
                          >
                            {entry.provider}: {entry.count} | {getAutomationStrongThreshold(entry.provider)}+
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {caseManagementSummary.automationCandidateInsights.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        No automation candidates detected yet.
                      </div>
                    ) : (
                      caseManagementSummary.automationCandidateInsights.map((insight) => (
                        <div
                          key={insight.rowId}
                          className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => focusWorkspaceRow(insight.rowId, "Automation candidate focus")}
                                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                >
                                  {insight.rowId}
                                </button>
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  {insight.score}/100
                                </span>
                                <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                                  Strong at {insight.strongThreshold}+
                                </span>
                                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                  {insight.automationStatus}
                                </span>
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                  {insight.area}
                                </span>
                              </div>
                              <p className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">
                                {insight.title}
                              </p>
                              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                {insight.recommendation}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {insight.reasons.map((reason) => (
                                  <span
                                    key={`${insight.rowId}-${reason}`}
                                    className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                                  >
                                    {reason}
                                  </span>
                                ))}
                              </div>
                              {insight.automationReference ? (
                                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                  Ref: {insight.automationReference}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const actualIndex = rows.findIndex((row) => row.id === insight.rowId);
                                  if (actualIndex >= 0) {
                                    updateCell(actualIndex, "automationStatus", "candidate");
                                  }
                                }}
                                className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                              >
                                Mark Candidate
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const actualIndex = rows.findIndex((row) => row.id === insight.rowId);
                                  if (actualIndex >= 0) {
                                    updateCell(actualIndex, "automationStatus", "automated");
                                  }
                                }}
                                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                              >
                                Mark Automated
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
                </div>
              </details>
            )}

            {isCasesSection && traceabilityAnalysis.uncoveredSentences.length > 0 && (
              <details
                ref={uncoveredRequirementSectionRef}
                className="group rounded-[24px] border border-amber-200 bg-amber-50/88 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10"
              >
                <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                      Uncovered Requirement Sentences
                    </p>
                    <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                      Review these before you leave the draft. They mark requirement statements that still do not have clear mapped case coverage.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                      {uncoveredRequirementInsights.filter((item) => item.severity === "high").length} high severity
                    </span>
                    <span className="rounded-full border border-amber-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 transition group-open:-translate-y-0.5 dark:border-amber-500/20 dark:bg-zinc-950/70 dark:text-amber-300">
                      Draft Queue
                    </span>
                  </div>
                </summary>
                <div className="border-t border-amber-200/80 px-5 py-4 dark:border-amber-500/20">
              <section className="rounded-[24px] border border-amber-200/0 bg-transparent px-0 py-0 shadow-none">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                      Uncovered Requirement Sentences
                    </p>
                    <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                      These requirement statements do not yet have clear mapped case coverage. Turn them into drafts directly from here.
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {uncoveredRequirementInsights.slice(0, 6).map((insight) => (
                    <div
                      key={insight.id}
                      className="rounded-2xl border border-amber-200/70 bg-white/90 px-4 py-3 dark:border-amber-500/20 dark:bg-zinc-950/80"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                            insight.severity === "high"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                              : insight.severity === "medium"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          }`}
                        >
                          {insight.severity} gap
                        </span>
                        <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                          Suggested priority {insight.suggestedPriority}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-zinc-800 dark:text-zinc-100">
                        {insight.sentence}
                      </p>
                      <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
                        {insight.actionHint}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            createDraftFromUncoveredSentence(insight.sentence, {
                              suggestedPriority: insight.suggestedPriority,
                              severity: insight.severity,
                            })
                          }
                          className="rounded-2xl bg-[linear-gradient(135deg,_#d97706_0%,_#f59e0b_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                        >
                          Create Draft Case
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
                </div>
              </details>
            )}

            {isCasesSection && (
              <details className="group rounded-[24px] border border-zinc-200 bg-white/88 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88">
                <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      Bulk Actions
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Select filtered cases and update ownership, workflow, priority, or execution status in one move.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-950">
                      {selectedRowIds.length} selected
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-950">
                      {visibleSelectedCount} in current view
                    </span>
                    <button
                      type="button"
                      onClick={toggleSelectAllFilteredRows}
                      disabled={!hasFilteredRows}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Select Visible
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedRows}
                      disabled={selectedRowIds.length === 0}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Clear
                    </button>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                      Batch Tools
                    </span>
                  </div>
                </summary>
                <div className="border-t border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
              <section className="rounded-[24px] border border-zinc-200/0 bg-transparent px-0 py-0 shadow-none">
                <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
                  <input
                    type="text"
                    value={bulkAssigneeValue}
                    onChange={(event) => setBulkAssigneeValue(event.target.value)}
                    placeholder="Bulk assignee"
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  />
                  <select
                    value={bulkWorkflowStatus}
                    onChange={(event) =>
                      setBulkWorkflowStatus(
                        (event.target.value || "") as TestCaseRow["workflowStatus"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">Leave workflow unchanged</option>
                    <option value="backlog">Backlog</option>
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                  <select
                    value={bulkPriority}
                    onChange={(event) =>
                      setBulkPriority(
                        (event.target.value || "") as TestCaseRow["priority"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">Leave priority unchanged</option>
                    <option value="highest">Highest Priority</option>
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                  <select
                    value={bulkExecutionResult}
                    onChange={(event) =>
                      setBulkExecutionResult(
                        (event.target.value || "") as TestCaseRow["executionResult"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">Leave execution unchanged</option>
                    <option value="not-run">Not Run</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <select
                    value={bulkReviewStatus}
                    onChange={(event) =>
                      setBulkReviewStatus(
                        (event.target.value || "") as TestCaseRow["reviewStatus"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">Leave review unchanged</option>
                    <option value="draft">Draft</option>
                    <option value="in-review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="changes-requested">Changes Requested</option>
                  </select>
                  <input
                    type="text"
                    value={bulkSuiteName}
                    onChange={(event) => setBulkSuiteName(event.target.value)}
                    placeholder="Bulk suite"
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  />
                  <input
                    type="text"
                    value={bulkComponentArea}
                    onChange={(event) => setBulkComponentArea(event.target.value)}
                    placeholder="Bulk component"
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  />
                  <select
                    value={bulkAutomationStatus}
                    onChange={(event) =>
                      setBulkAutomationStatus(
                        (event.target.value || "") as TestCaseRow["automationStatus"] | ""
                      )
                    }
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">Leave automation unchanged</option>
                    <option value="manual">Manual</option>
                    <option value="candidate">Candidate</option>
                    <option value="automated">Automated</option>
                  </select>
                  <select
                    value={bulkTestDataSetId}
                    onChange={(event) => setBulkTestDataSetId(event.target.value)}
                    className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  >
                    <option value="">Leave data set unchanged</option>
                    {testDataSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyBulkUpdates}
                    disabled={selectedRowIds.length === 0}
                    className="min-h-[44px] rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Apply Bulk Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateAutomationForSelectedRows()}
                    disabled={selectedRowIds.length === 0}
                    className="min-h-[44px] rounded-2xl border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
                  >
                    Generate Automation
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                    {filteredRows.length} visible
                  </span>
                  {caseSearchQuery ? (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      Search active
                    </span>
                  ) : null}
                  {caseReviewHealthFilter ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      Review health focused
                    </span>
                  ) : null}
                  {caseCollaborationFilter ? (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                      Collaboration slice active
                    </span>
                  ) : null}
                  {caseLinkedFilter !== "all" ? (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                      Linkage filtered
                    </span>
                  ) : null}
                </div>
              </section>
                </div>
              </details>
            )}

            <TestCaseTable
              rows={filteredRows}
              traceabilityLinks={traceabilityAnalysis.links}
              reviewInsights={reviewInsights}
              issueOptions={projectIssues}
              loadingIssueOptions={loadingProjectIssues}
                projectRouteRef={activeProjectRouteRef}
                caseCommentsByRowId={caseComments}
                caseWatchersByRowId={caseWatchers}
                caseVersionHistoryByRowId={caseVersionHistory}
                caseReviewHistoryByRowId={caseReviewHistory}
                caseCommentDrafts={caseCommentDrafts}
                activeReviewerLabel={activeReviewerLabel}
                reviewerAttentionByRowId={reviewerAttentionByRowId}
                testDataSets={testDataSets}
              caseTemplates={caseTemplates}
              automationScripts={automationScripts}
              automationBindings={automationBindings}
              automationExecutions={automationExecutions}
              automationEnvironmentBindings={automationEnvironmentBindings}
              activeAutomationEnvironmentId={activeAutomationEnvironmentId}
              userOptions={userOptions}
              updateCell={updateFilteredCell}
              onCaseCommentDraftChange={updateCaseCommentDraft}
              onAddCaseComment={addCaseComment}
              onToggleCaseCommentResolved={toggleCaseCommentResolved}
              onDeleteCaseComment={deleteCaseComment}
              onToggleCaseWatch={toggleCaseWatch}
              onCloneRow={cloneRowById}
              onSaveTemplateFromRow={saveTemplateFromRow}
              onApplyGenerationFeedback={applyGenerationFeedback}
              onRunAutomation={runAutomationForRow}
              onCreateAutomationIssue={createAutomationIssueForRow}
              onGenerateAutomation={generateAutomationForRow}
              generatingAutomationRowIds={generatingAutomationRowIds}
              deleteRow={deleteFilteredRow}
              regenerateRow={regenerateFilteredRow}
              regeneratingIndex={
                regeneratingIndex !== null &&
                filteredRows.some((row) => row.id === rows[regeneratingIndex]?.id)
                  ? filteredRows.findIndex(
                      (row) => row.id === rows[regeneratingIndex]?.id
                    )
                  : null
              }
              loading={loading}
                input={input}
                highlightedRowId={highlightedRowId}
                highlightedRowLabel={highlightedRowLabel}
                highlightedCommentId={highlightedCommentId}
                onFocusRow={focusWorkspaceRow}
                draggedIndex={workspaceFilter === "all" ? draggedIndex : null}
              dragOverIndex={workspaceFilter === "all" ? dragOverIndex : null}
              onDragStart={
                workspaceFilter === "all" ? setDraggedIndex : () => undefined
              }
              onDragOver={
                workspaceFilter === "all" ? setDragOverIndex : () => undefined
              }
              onDrop={workspaceFilter === "all" ? moveRow : () => undefined}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              enableSelection={isCasesSection}
              selectedRowIds={selectedRowIds}
              onToggleRowSelection={toggleRowSelection}
              onToggleSelectAll={toggleSelectAllFilteredRows}
              stickyHeader={!(embedded && isCasesSection)}
            />
          </>
        ) : (
          <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white/70 px-6 py-16 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <div className="mx-auto max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Workspace Empty
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                Start with one requirement.
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Paste one user story, feature flow, or validation path above, then generate a first draft you can review inline in a few minutes.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={focusRequirementComposer}
                  className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
                >
                  Start with Requirement
                </button>
                <button
                  type="button"
                  onClick={addNewRow}
                  className="rounded-2xl border border-amber-200/80 bg-white px-5 py-3 text-sm font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-300 dark:hover:bg-amber-500/10"
                >
                  Create Manually
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}


