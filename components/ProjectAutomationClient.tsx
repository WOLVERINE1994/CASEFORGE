"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AutomationArtifactViewer from "./AutomationArtifactViewer";
import AutomationStepForm from "./AutomationStepForm";
import CaseAutomationPanel from "./CaseAutomationPanel";
import { OverlayFormShell } from "./FilterWorkspaceSections";
import { useProjectDataState } from "./ProjectDataStateContext";
import {
  buildAutomationTemplateSteps,
  type AutomationStepTemplateId,
} from "../utils/automation-step-templates";
import {
  applyDataSetToSteps,
  getAutomationActions,
  buildAutomationScenarioRow,
  getAutomationScenarios,
  getAutomationSuites,
  getDefaultScenarioDataSet,
  getLinkedManualRowsForScenario,
  getScenarioRuntimeScript,
  getScenarioSearchText,
  getScenarioSteps,
  getScenarioTestDataSets,
  summarizeScenarioDataSet,
  syncAutomationActions,
  syncScenarioCollections,
} from "../utils/automation-domain";
import {
  automationProviderLabels,
  getAutomationArtifactsForExecution,
} from "../utils/automation";
import { formatUtcDateTime } from "../utils/date-format";
import type {
  AutomationAction,
  AutomationBindingMode,
  AutomationEnvironmentBinding,
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationExecutionMode,
  AutomationProvider,
  AutomationScenario,
  AutomationScenarioPriority,
  AutomationScenarioParameterizationMode,
  AutomationSchedule,
  AutomationScheduleFrequency,
  AutomationStep,
  AutomationSuite,
  Project,
  ScenarioTestDataSet,
  TestCaseRow,
} from "../utils/workspace";

type AutomationSection =
  | "overview"
  | "recorder"
  | "suites"
  | "scenarios"
  | "actions"
  | "runs"
  | "playback"
  | "reports"
  | "test-data"
  | "environments"
  | "blocks"
  | "schedules"
  | "failures"
  | "links"
  | "scripts"
  | "cases"
  | "flows"
  | "mappings";

type ResolvedSection =
  | "overview"
  | "recorder"
  | "suites"
  | "scenarios"
  | "actions"
  | "runs"
  | "playback"
  | "reports"
  | "test-data"
  | "environments"
  | "schedules"
  | "failures"
  | "links";

type ScenarioEntry = {
  scenario: AutomationScenario;
  suite: AutomationSuite | null;
  scriptId: string;
  row: TestCaseRow;
  steps: AutomationStep[];
  dataSets: ScenarioTestDataSet[];
  linkedRows: TestCaseRow[];
  latestExecution: AutomationExecution | null;
  latestArtifacts: AutomationExecutionArtifact[];
  executionCount: number;
};

export type ProjectAutomationClientProps = {
  projectKey: string;
  initialProject: Project | null;
  initialSection: AutomationSection;
  initialSuiteId?: string | null;
  initialScenarioId?: string | null;
  initialActionId?: string | null;
  initialExecutionId?: string | null;
};

const aliases = {
  scripts: "scenarios",
  cases: "scenarios",
  flows: "actions",
  blocks: "actions",
  mappings: "links",
} as const;

const navItems: Array<{ key: ResolvedSection; label: string; href: string }> = [
  { key: "overview", label: "Overview", href: "" },
  { key: "recorder", label: "Recorder", href: "/recorder" },
  { key: "suites", label: "Suites", href: "/suites" },
  { key: "scenarios", label: "Scenarios", href: "/scenarios" },
  { key: "actions", label: "Actions", href: "/actions" },
  { key: "runs", label: "Runs", href: "/runs" },
  { key: "playback", label: "Playback", href: "/playback" },
  { key: "reports", label: "Reports", href: "/reports" },
  { key: "test-data", label: "Test Data", href: "/test-data" },
  { key: "environments", label: "Environments", href: "/environments" },
  { key: "schedules", label: "Schedules", href: "/schedules" },
  { key: "failures", label: "Failures", href: "/failures" },
  { key: "links", label: "Links", href: "/links" },
];

const navGlyph = (label: string) =>
  label
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

const panel =
  "cf-panel min-w-0 rounded-[28px] p-5";
const card =
  "cf-card min-w-0 rounded-[24px] px-4 py-4";
const inputClass =
  "cf-input min-h-[44px] rounded-2xl px-3 py-2 text-sm";
const badge = "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";
const tableClassName =
  "min-w-full border-separate border-spacing-0 text-left text-sm";
const tableHeaderCellClassName =
  "border-b border-slate-700/80 bg-slate-900/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400";
const tableBodyCellClassName =
  "border-b border-slate-800/80 px-4 py-3 align-top text-slate-200";
const statusTone = {
  passed:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  failed:
    "border-rose-500/30 bg-rose-500/10 text-rose-200",
  blocked:
    "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "not-run":
    "border-slate-700 bg-slate-900/80 text-slate-300",
} as const;

const parseAutomationApiResponse = async <T,>(response: Response): Promise<T> => {
  const raw = await response.text();
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw new Error(
      /^<!doctype html>|^<html/i.test(raw.trim())
        ? "The automation API returned an HTML error page instead of JSON."
        : "The automation API returned an invalid response."
    );
  }
};

const getTimestamp = () => Date.now();

const toVariableText = (variables: Record<string, string>) =>
  Object.entries(variables)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

const parseVariableText = (value: string) =>
  Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return index === -1
          ? [line, ""]
          : [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );

const toActionParameterText = (parameters: AutomationAction["parameters"] = []) =>
  parameters
    .map((parameter) => {
      const requiredSuffix = parameter.required === false ? "?" : "";
      const defaultSuffix = parameter.defaultValue?.trim()
        ? `=${parameter.defaultValue}`
        : "";
      return `${parameter.name}${requiredSuffix}${defaultSuffix}`;
    })
    .join("\n");

const parseActionParameterText = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [namePart, ...defaultParts] = line.split("=");
      const normalizedName = namePart.trim();
      const optional = normalizedName.endsWith("?");
      const name = optional ? normalizedName.slice(0, -1).trim() : normalizedName;
      return {
        id: `param:${name || index}`,
        name: name || `param${index + 1}`,
        required: !optional,
        defaultValue: defaultParts.length ? defaultParts.join("=").trim() : undefined,
      };
    });

const computeScheduleNextRun = (
  frequency: AutomationScheduleFrequency,
  scheduledFor?: number,
  existingNextRunAt?: number,
  enabled = true,
  fromTime = Date.now()
) => {
  if (!enabled) {
    return undefined;
  }

  if (frequency === "once") {
    return scheduledFor && scheduledFor > fromTime ? scheduledFor : undefined;
  }

  if (frequency === "custom") {
    return existingNextRunAt && existingNextRunAt > fromTime
      ? existingNextRunAt
      : scheduledFor;
  }

  const interval = frequency === "daily" ? 86400000 : 604800000;
  let next = existingNextRunAt ?? scheduledFor ?? fromTime;
  while (next <= fromTime) {
    next += interval;
  }
  return next;
};

const formatExecutionDuration = (execution: AutomationExecution) => {
  if (!execution.finishedAt) {
    return "Running";
  }

  const durationMs = Math.max(0, execution.finishedAt - execution.startedAt);
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

export default function ProjectAutomationClient({
  projectKey,
  initialProject,
  initialSection,
  initialSuiteId = null,
  initialScenarioId = null,
  initialActionId = null,
  initialExecutionId = null,
}: ProjectAutomationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectState = useProjectDataState();
  const setSharedProject = projectState?.setProject;
  const [localProject, setLocalProject] = useState<Project | null>(initialProject);
  const [isProjectLoading, setIsProjectLoading] = useState(!initialProject);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(
    searchParams.get("suiteId") ?? initialSuiteId
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    searchParams.get("scenarioId") ?? searchParams.get("scriptId") ?? initialScenarioId
  );
  const [selectedActionId, setSelectedActionId] = useState<string | null>(
    searchParams.get("actionId") ?? initialActionId
  );
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    searchParams.get("executionId") ?? initialExecutionId
  );
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
    searchParams.get("scheduleId")
  );
  const [selectedDataSetId, setSelectedDataSetId] = useState<string | null>(searchParams.get("dataSetId"));
  const [message, setMessage] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [suiteSearch, setSuiteSearch] = useState("");
  const [suiteStatusFilter, setSuiteStatusFilter] = useState<"all" | NonNullable<AutomationSuite["status"]>>("all");
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [scenarioStatusFilter, setScenarioStatusFilter] = useState<"all" | AutomationScenario["status"]>("all");
  const [scenarioPriorityFilter, setScenarioPriorityFilter] = useState<"all" | AutomationScenarioPriority>("all");
  const [scenarioSortKey, setScenarioSortKey] = useState<"updated" | "name" | "priority" | "status" | "recent-run">("updated");
  const [executionSearch, setExecutionSearch] = useState("");
  const [executionStatusFilter, setExecutionStatusFilter] = useState<"all" | "passed" | "failed" | "blocked">("all");
  const [bulkSuiteTargetId, setBulkSuiteTargetId] = useState<string>("");
  const [actionSearch, setActionSearch] = useState("");
  const [actionName, setActionName] = useState("Login");
  const [actionDescription, setActionDescription] = useState("");
  const [actionTags, setActionTags] = useState("auth, reusable");
  const [actionParameters, setActionParameters] = useState("username\npassword");
  const [actionDraftSteps, setActionDraftSteps] = useState<AutomationStep[]>([]);
  const [selectedActionStepId, setSelectedActionStepId] = useState<string | null>(null);
  const [suiteName, setSuiteName] = useState("Regression Suite");
  const [suiteDescription, setSuiteDescription] = useState("");
  const [suiteTags, setSuiteTags] = useState("regression");
  const [suiteStatus, setSuiteStatus] = useState<NonNullable<AutomationSuite["status"]>>("draft");
  const [suiteEnvironmentId, setSuiteEnvironmentId] = useState("");
  const [dataSetName, setDataSetName] = useState("Default data set");
  const [dataSetDescription, setDataSetDescription] = useState("");
  const [dataSetVariables, setDataSetVariables] = useState("username=valid_user\npassword=valid_password");
  const [isEnvironmentEditorOpen, setIsEnvironmentEditorOpen] = useState(false);
  const [environmentName, setEnvironmentName] = useState("Default Environment");
  const [environmentBaseUrl, setEnvironmentBaseUrl] = useState("");
  const [environmentLoginRoute, setEnvironmentLoginRoute] = useState("/login");
  const [environmentDashboardRoute, setEnvironmentDashboardRoute] = useState("/dashboard");
  const [environmentCredentialAliases, setEnvironmentCredentialAliases] = useState("");
  const [scheduleName, setScheduleName] = useState("Nightly Run");
  const [scheduleFrequency, setScheduleFrequency] = useState<AutomationScheduleFrequency>("daily");
  const [scheduleExecutionMode, setScheduleExecutionMode] = useState<AutomationExecutionMode>("headless");
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleCronExpression, setScheduleCronExpression] = useState("");
  const [scheduleTargetType, setScheduleTargetType] = useState<"scenario" | "suite">("scenario");

  const project = projectState?.project ?? localProject ?? initialProject;
  const section = (aliases[initialSection as keyof typeof aliases] ?? initialSection) as ResolvedSection;
  const encodedProjectKey = encodeURIComponent(projectKey);
  const actions = project ? getAutomationActions(project) : [];
  const filteredActions = actions.filter((action) => {
    const search = actionSearch.trim().toLowerCase();
    if (!search) {
      return true;
    }
    return [
      action.name,
      action.description,
      ...(action.tags ?? []),
      ...(action.parameters ?? []).map((parameter) => parameter.name),
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  const selectedAction =
    filteredActions.find((action) => action.id === selectedActionId) ??
    actions.find((action) => action.id === selectedActionId) ??
    filteredActions[0] ??
    actions[0] ??
    null;

  useEffect(() => {
    queueMicrotask(() => {
      if (!selectedAction) {
        setActionName("Login");
        setActionDescription("");
        setActionTags("auth, reusable");
        setActionParameters("username\npassword");
        setActionDraftSteps([]);
        setSelectedActionStepId(null);
        return;
      }

      setSelectedActionId(selectedAction.id);
      setActionName(selectedAction.name);
      setActionDescription(selectedAction.description ?? "");
      setActionTags((selectedAction.tags ?? []).join(", "));
      setActionParameters(toActionParameterText(selectedAction.parameters));
      const normalizedDraftSteps = selectedAction.steps.map((step, index) => ({
        ...step,
        id: step.id || crypto.randomUUID(),
        scriptId: selectedAction.backingBlockId ?? selectedAction.id,
        order: index,
        metaJson: step.metaJson ? { ...step.metaJson } : undefined,
      }));
      setActionDraftSteps(normalizedDraftSteps);
      setSelectedActionStepId(normalizedDraftSteps[0]?.id ?? null);
    });
  }, [selectedAction]);

  const loadProjects = async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const payload = (await response.json()) as { projects?: Project[]; error?: string };
    if (!response.ok || !Array.isArray(payload.projects)) {
      throw new Error(payload.error || "Failed to load projects.");
    }
    return payload.projects;
  };

  const loadProjectByRef = useCallback(async () => {
    const response = await fetch(`/api/projects/ref/${encodeURIComponent(projectKey)}`, {
      cache: "no-store",
    });
    const payload = (await parseAutomationApiResponse<{
      project?: Project;
      error?: string;
    }>(response));
    if (!response.ok || !payload.project) {
      throw new Error(payload.error || "Failed to load automation project.");
    }
    return payload.project;
  }, [projectKey]);

  useEffect(() => {
    let cancelled = false;

    const syncProject = async () => {
      if (initialProject) {
        setLocalProject(initialProject);
        setSharedProject?.(initialProject);
        setIsProjectLoading(false);
        return;
      }

      setIsProjectLoading(true);
      try {
        const loadedProject = await loadProjectByRef();
        if (cancelled) {
          return;
        }
        setLocalProject(loadedProject);
        setSharedProject?.(loadedProject);
      } catch (error) {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Failed to load automation project.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsProjectLoading(false);
        }
      }
    };

    void syncProject();

    return () => {
      cancelled = true;
    };
  }, [initialProject, loadProjectByRef, setSharedProject]);

  const persistProject = async (nextProject: Project) => {
    const projects = await loadProjects();
    const nextProjects = projects.map((entry) =>
      entry.id === nextProject.id ||
      entry.projectKey?.trim().toLowerCase() === projectKey.trim().toLowerCase()
        ? nextProject
        : entry
    );
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: nextProjects }),
    });
    const payload = (await response.json()) as { projects?: Project[]; error?: string };
    if (!response.ok || !Array.isArray(payload.projects)) {
      throw new Error(payload.error || "Failed to save project.");
    }
    const saved = payload.projects.find((entry) => entry.id === nextProject.id) ?? nextProject;
    setLocalProject(saved);
    projectState?.setProject(saved);
    router.refresh();
    return saved;
  };

  const reloadProject = async () => {
    const refreshed = await loadProjectByRef();
    if (refreshed) {
      setLocalProject(refreshed);
      setSharedProject?.(refreshed);
    }
    router.refresh();
  };

  const rows = project?.rows ?? [];
  const bindings = project?.automationBindings ?? [];
  const executions = project?.automationExecutions ?? [];
  const artifacts = project?.automationArtifacts ?? [];
  const reusableBlocks = project?.automationReusableBlocks ?? [];
  const selectorPresets = project?.automationSelectorPresets ?? [];
  const environments = project?.automationEnvironmentBindings ?? [];
  const environmentNameById = Object.fromEntries(
    environments.map((environment) => [environment.id, environment.name])
  );
  const schedules = project?.automationSchedules ?? [];
  const sortedSchedules = [...schedules].sort(
    (left, right) =>
      (right.nextRunAt ?? right.updatedAt ?? 0) - (left.nextRunAt ?? left.updatedAt ?? 0)
  );
  const selectedSchedule =
    sortedSchedules.find((item) => item.id === selectedScheduleId) ?? null;
  const activeEnvironmentId = project?.activeAutomationEnvironmentId ?? "";
  const scenarios = project ? getAutomationScenarios(project) : [];
  const suites = project ? getAutomationSuites(project, scenarios) : [];
  const suiteById = Object.fromEntries(suites.map((suite) => [suite.id, suite]));
  const filteredSuites = suites.filter((suite) => {
    const statusMatch =
      suiteStatusFilter === "all" || (suite.status ?? "draft") === suiteStatusFilter;
    const search = suiteSearch.trim().toLowerCase();
    const searchMatch =
      !search ||
      [
        suite.name,
        suite.description,
        ...(suite.tags ?? []),
        suite.status ?? "draft",
      ]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(" ")
        .toLowerCase()
        .includes(search);
    return statusMatch && searchMatch;
  });
  const entries: ScenarioEntry[] = scenarios
    .map((scenario) => {
      const script = getScenarioRuntimeScript(project as Project, scenario);
      const linkedRows = getLinkedManualRowsForScenario(scenario, rows);
      const row = buildAutomationScenarioRow(scenario, project as Project);
      const scenarioExecutions = executions
        .filter((execution) => execution.scenarioId === scenario.id || execution.scriptId === script.id)
        .sort((a, b) => b.startedAt - a.startedAt);
      const latestExecution = scenarioExecutions[0] ?? null;
      return {
        scenario,
        suite: suiteById[scenario.suiteId ?? ""] ?? null,
        scriptId: script.id,
        row,
        steps: getScenarioSteps((project as Project).automationSteps, scenario),
        dataSets: getScenarioTestDataSets(project as Project, scenario.id),
        linkedRows,
        latestExecution,
        latestArtifacts: latestExecution ? getAutomationArtifactsForExecution(artifacts, latestExecution.id) : [],
        executionCount: scenarioExecutions.length,
      };
    })
    .sort((a, b) => b.scenario.updatedAt - a.scenario.updatedAt);
  const selectedEntry =
    entries.find((entry) => entry.scenario.id === selectedScenarioId) ??
    entries.find((entry) => entry.scenario.id === searchParams.get("scenarioId") || entry.scriptId === searchParams.get("scriptId")) ??
    entries.find((entry) => entry.linkedRows.some((row) => row.id === searchParams.get("caseId"))) ??
    entries[0] ??
    null;
  const selectedSuite =
    suites.find((suite) => suite.id === selectedSuiteId) ??
    (section === "suites"
      ? filteredSuites[0] ?? null
      : suites.find((suite) => suite.id === selectedEntry?.scenario.suiteId) ?? null) ??
    suites[0] ??
    null;
  const selectedSuiteEntries = selectedSuite
    ? entries.filter(
        (entry) =>
          entry.scenario.suiteId === selectedSuite.id ||
          selectedSuite.scenarioIds?.includes(entry.scenario.id)
      )
    : [];
  const filteredEntries = entries.filter((entry) => {
    const suiteMatch =
      !selectedSuite ||
      entry.scenario.suiteId === selectedSuite.id ||
      selectedSuite.scenarioIds?.includes(entry.scenario.id);
    const statusMatch =
      scenarioStatusFilter === "all" ||
      (entry.scenario.status ?? "draft") === scenarioStatusFilter;
    const priorityMatch =
      scenarioPriorityFilter === "all" ||
      (entry.scenario.priority ?? "medium") === scenarioPriorityFilter;
    const searchMatch =
      !scenarioSearch.trim() ||
      getScenarioSearchText(entry.scenario, entry.suite?.name).includes(
        scenarioSearch.trim().toLowerCase()
      );
    return suiteMatch && statusMatch && priorityMatch && searchMatch;
  });
  const visibleEntries = [...filteredEntries].sort((left, right) => {
    if (scenarioSortKey === "name") {
      return left.scenario.name.localeCompare(right.scenario.name);
    }
    if (scenarioSortKey === "priority") {
      const priorityRank: Record<AutomationScenarioPriority, number> = {
        highest: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return (
        priorityRank[left.scenario.priority ?? "medium"] -
        priorityRank[right.scenario.priority ?? "medium"]
      );
    }
    if (scenarioSortKey === "status") {
      const statusRank: Record<NonNullable<AutomationScenario["status"]>, number> = {
        active: 0,
        ready: 1,
        draft: 2,
        paused: 3,
      };
      return (
        statusRank[left.scenario.status ?? "draft"] -
        statusRank[right.scenario.status ?? "draft"]
      );
    }
    if (scenarioSortKey === "recent-run") {
      return (
        (right.latestExecution?.startedAt ?? 0) -
        (left.latestExecution?.startedAt ?? 0)
      );
    }
    return right.scenario.updatedAt - left.scenario.updatedAt;
  });
  const filteredScenarioCount = filteredEntries.length;
  const visibleStatusSummary = visibleEntries.reduce<Record<string, number>>((acc, entry) => {
    const status = entry.scenario.status ?? "draft";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const visiblePrioritySummary = visibleEntries.reduce<Record<string, number>>((acc, entry) => {
    const priority = entry.scenario.priority ?? "medium";
    acc[priority] = (acc[priority] ?? 0) + 1;
    return acc;
  }, {});
  const selectedScenarioHiddenByFilters = Boolean(
    selectedEntry &&
      !visibleEntries.some((entry) => entry.scenario.id === selectedEntry.scenario.id)
  );
  const playbackExecutions = [...executions]
    .filter((entry) =>
      section === "failures"
        ? entry.status === "failed" || entry.status === "blocked"
        : true
    )
    .filter((entry) => {
      const statusMatch =
        executionStatusFilter === "all" || entry.status === executionStatusFilter;
      const search = executionSearch.trim().toLowerCase();
      const entryScenario = entries.find(
        (scenarioEntry) =>
          scenarioEntry.scenario.id === entry.scenarioId ||
          scenarioEntry.scriptId === entry.scriptId
      );
      const searchMatch =
        !search ||
        [
          entry.scenarioName,
          entry.suiteName,
          entry.dataSetName,
          entry.environmentName,
          entry.runId,
          entry.status,
          entryScenario?.scenario.name,
        ]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join(" ")
          .toLowerCase()
          .includes(search);
      return statusMatch && searchMatch;
    })
    .sort((a, b) => b.startedAt - a.startedAt);
  const selectedExecution =
    playbackExecutions.find((entry) => entry.id === selectedExecutionId) ??
    executions.find((entry) => entry.id === selectedExecutionId) ??
    playbackExecutions[0] ??
    null;
  const selectedExecutionArtifacts = selectedExecution
    ? getAutomationArtifactsForExecution(artifacts, selectedExecution.id)
    : [];
  const selectedExecutionEntry =
    selectedExecution
      ? entries.find(
          (entry) =>
            entry.scenario.id === selectedExecution.scenarioId ||
            entry.scriptId === selectedExecution.scriptId
        ) ?? null
      : null;
  const selectedExecutionEnvironmentName =
    selectedExecution?.environmentName ||
    (selectedExecution?.environmentBindingId
      ? environmentNameById[selectedExecution.environmentBindingId] ?? "Unknown"
      : selectedExecutionEntry?.scenario.environmentBindingId
        ? environmentNameById[selectedExecutionEntry.scenario.environmentBindingId] ?? "Unknown"
        : "Default Environment");
  const selectedExecutionStepResults =
    [...(selectedExecution?.stepResults ?? [])].sort(
      (left, right) => left.stepIndex - right.stepIndex
    );
  const selectedExecutionFailureStepId =
    selectedExecutionStepResults.find(
      (result) => result.status === "failed" || result.status === "blocked"
    )?.sourceStepId ??
    selectedExecutionStepResults.find(
      (result) => result.status === "failed" || result.status === "blocked"
    )?.stepId ??
    null;
  const selectedDataSets = selectedEntry?.dataSets ?? [];
  const defaultDataSet =
    selectedDataSets.find((entry) => entry.id === selectedDataSetId) ??
    getDefaultScenarioDataSet(selectedEntry?.scenario ?? { defaultDataSetId: undefined }, selectedDataSets);
  if (!project) {
    return <div className={panel}>Automation data is not available for this project yet.</div>;
  }
  const actionUsageCounts = Object.fromEntries(
    actions.map((action) => {
      const blockId = action.backingBlockId ?? action.id;
      const count = entries.reduce((total, entry) => {
        const matchingSteps = entry.steps.filter((step) => {
          const actionCall =
            step.metaJson?.actionCall &&
            typeof step.metaJson.actionCall === "object" &&
            !Array.isArray(step.metaJson.actionCall)
              ? (step.metaJson.actionCall as Record<string, unknown>)
              : null;
          return (
            step.action === "run-block" &&
            ((typeof actionCall?.actionId === "string" &&
              actionCall.actionId === action.id) ||
              step.sharedBlockId === blockId ||
              step.targetValue === blockId)
          );
        });
        return total + matchingSteps.length;
      }, 0);
      return [action.id, count] as const;
    })
  );
  const passRate = executions.length ? Math.round((executions.filter((entry) => entry.status === "passed").length / executions.length) * 100) : 0;
  const failureByScenario = Object.entries(
    executions.reduce<Record<string, number>>((acc, execution) => {
      const key = execution.scenarioId ?? execution.scriptId;
      acc[key] = (acc[key] ?? 0) + (execution.status === "passed" ? 0 : 1);
      return acc;
    }, {})
  )
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const scenarioEntry = entries.find(
        (entry) => entry.scenario.id === key || entry.scriptId === key
      );
      return {
        key,
        scenarioId: scenarioEntry?.scenario.id,
        count,
        name: scenarioEntry?.scenario.name ?? key,
      };
    })
    .sort((a, b) => b.count - a.count);
  const flakyScenarios = entries
    .map((entry) => {
      const scenarioRuns = executions.filter(
        (execution) =>
          execution.scenarioId === entry.scenario.id ||
          execution.scriptId === entry.scriptId
      );
      const hasPass = scenarioRuns.some((execution) => execution.status === "passed");
      const hasFail = scenarioRuns.some(
        (execution) => execution.status === "failed" || execution.status === "blocked"
      );
      return {
        id: entry.scenario.id,
        name: entry.scenario.name,
        runCount: scenarioRuns.length,
        isFlaky: hasPass && hasFail,
      };
    })
    .filter((entry) => entry.isFlaky)
    .sort((left, right) => right.runCount - left.runCount);
  const scheduledExecutions = executions
    .filter((entry) => entry.triggerType === "scheduled")
    .sort((left, right) => right.startedAt - left.startedAt);
  const statusBreakdown = entries.reduce<Record<string, number>>((acc, entry) => {
    const status = entry.scenario.status ?? "draft";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const priorityBreakdown = entries.reduce<Record<string, number>>((acc, entry) => {
    const priority = entry.scenario.priority ?? "medium";
    acc[priority] = (acc[priority] ?? 0) + 1;
    return acc;
  }, {});
  const failedExecutions = executions.filter(
    (execution) => execution.status === "failed" || execution.status === "blocked"
  );
  const reportTrendBuckets = Object.values(
    executions.reduce<
      Record<
        string,
        {
          date: string;
          passed: number;
          failed: number;
          blocked: number;
          total: number;
        }
      >
    >((acc, execution) => {
      const date = new Date(execution.startedAt).toISOString().slice(0, 10);
      const bucket =
        acc[date] ??
        {
          date,
          passed: 0,
          failed: 0,
          blocked: 0,
          total: 0,
        };
      bucket.total += 1;
      if (execution.status === "passed") {
        bucket.passed += 1;
      } else if (execution.status === "failed") {
        bucket.failed += 1;
      } else if (execution.status === "blocked") {
        bucket.blocked += 1;
      }
      acc[date] = bucket;
      return acc;
    }, {})
  )
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-8);
  const suiteHealthRows = suites
    .map((suite) => {
      const suiteEntries = entries.filter(
        (entry) =>
          entry.scenario.suiteId === suite.id ||
          Boolean(suite.scenarioIds?.includes(entry.scenario.id))
      );
      const suiteScenarioIds = new Set(suiteEntries.map((entry) => entry.scenario.id));
      const suiteScriptIds = new Set(suiteEntries.map((entry) => entry.scriptId));
      const suiteRuns = executions.filter(
        (execution) =>
          execution.suiteId === suite.id ||
          Boolean(execution.scenarioId && suiteScenarioIds.has(execution.scenarioId)) ||
          suiteScriptIds.has(execution.scriptId)
      );
      const failures = suiteRuns.filter(
        (execution) => execution.status === "failed" || execution.status === "blocked"
      ).length;
      const passed = suiteRuns.filter((execution) => execution.status === "passed").length;
      return {
        id: suite.id,
        name: suite.name,
        status: suite.status ?? "draft",
        scenarioCount: suiteEntries.length,
        runCount: suiteRuns.length,
        passed,
        failures,
        passRate: suiteRuns.length ? Math.round((passed / suiteRuns.length) * 100) : 0,
        latestRun: suiteRuns.sort((left, right) => right.startedAt - left.startedAt)[0] ?? null,
      };
    })
    .sort(
      (left, right) =>
        right.failures - left.failures ||
        (right.latestRun?.startedAt ?? 0) - (left.latestRun?.startedAt ?? 0)
    );
  const scenarioHealthRows = entries
    .map((entry) => {
      const scenarioRuns = executions.filter(
        (execution) =>
          execution.scenarioId === entry.scenario.id ||
          execution.scriptId === entry.scriptId
      );
      const failures = scenarioRuns.filter(
        (execution) => execution.status === "failed" || execution.status === "blocked"
      ).length;
      const passed = scenarioRuns.filter((execution) => execution.status === "passed").length;
      const latestRun = scenarioRuns.sort((left, right) => right.startedAt - left.startedAt)[0] ?? null;
      return {
        id: entry.scenario.id,
        name: entry.scenario.name,
        suiteName: entry.suite?.name ?? "No suite",
        priority: entry.scenario.priority ?? "medium",
        status: entry.scenario.status ?? "draft",
        datasetCount: entry.dataSets.length,
        runCount: scenarioRuns.length,
        passed,
        failures,
        passRate: scenarioRuns.length ? Math.round((passed / scenarioRuns.length) * 100) : 0,
        latestRun,
      };
    })
    .sort(
      (left, right) =>
        right.failures - left.failures ||
        (right.latestRun?.startedAt ?? 0) - (left.latestRun?.startedAt ?? 0)
    );
  const datasetFailureRows = Object.values(
    executions.reduce<
      Record<
        string,
        {
          key: string;
          scenarioId?: string;
          scenarioName: string;
          dataSetName: string;
          totalRuns: number;
          failures: number;
          latestFailure: AutomationExecution | null;
        }
      >
    >((acc, execution) => {
      if (!execution.dataSetId && !execution.dataSetName) {
        return acc;
      }
      const key = `${execution.scenarioId ?? execution.scriptId}:${execution.dataSetId ?? execution.dataSetName}`;
      const scenarioEntry = entries.find(
        (entry) =>
          entry.scenario.id === execution.scenarioId ||
          entry.scriptId === execution.scriptId
      );
      const row =
        acc[key] ??
        {
          key,
          scenarioId: scenarioEntry?.scenario.id ?? execution.scenarioId,
          scenarioName: execution.scenarioName ?? scenarioEntry?.scenario.name ?? "Unknown scenario",
          dataSetName: execution.dataSetName ?? "Unnamed dataset",
          totalRuns: 0,
          failures: 0,
          latestFailure: null,
        };
      row.totalRuns += 1;
      if (execution.status === "failed" || execution.status === "blocked") {
        row.failures += 1;
        if (!row.latestFailure || execution.startedAt > row.latestFailure.startedAt) {
          row.latestFailure = execution;
        }
      }
      acc[key] = row;
      return acc;
    }, {})
  )
    .filter((row) => row.failures > 0)
    .sort(
      (left, right) =>
        right.failures - left.failures ||
        (right.latestFailure?.startedAt ?? 0) - (left.latestFailure?.startedAt ?? 0)
    );
  const environmentRunRows = Object.values(
    executions.reduce<
      Record<
        string,
        {
          key: string;
          name: string;
          runCount: number;
          passed: number;
          failures: number;
          passRate: number;
          latestRun: AutomationExecution | null;
        }
      >
    >((acc, execution) => {
      const key = execution.environmentBindingId ?? execution.environmentName ?? "default";
      const row =
        acc[key] ??
        {
          key,
          name:
            execution.environmentName ??
            (execution.environmentBindingId
              ? environmentNameById[execution.environmentBindingId] ?? "Unknown environment"
              : "Default Environment"),
          runCount: 0,
          passed: 0,
          failures: 0,
          passRate: 0,
          latestRun: null,
        };
      row.runCount += 1;
      if (execution.status === "passed") {
        row.passed += 1;
      } else if (execution.status === "failed" || execution.status === "blocked") {
        row.failures += 1;
      }
      row.passRate = row.runCount ? Math.round((row.passed / row.runCount) * 100) : 0;
      if (!row.latestRun || execution.startedAt > row.latestRun.startedAt) {
        row.latestRun = execution;
      }
      acc[key] = row;
      return acc;
    }, {})
  ).sort((left, right) => right.runCount - left.runCount);
  const topFailingActionRows = Object.values(
    executions.reduce<
      Record<
        string,
        {
          key: string;
          name: string;
          failures: number;
          latestFailure: AutomationExecution | null;
        }
      >
    >((acc, execution) => {
      execution.stepResults?.forEach((stepResult) => {
        const isFailure = stepResult.status === "failed" || stepResult.status === "blocked";
        const isActionLike =
          stepResult.origin === "shared-block" ||
          stepResult.action === "run-block" ||
          Boolean(stepResult.referenceId || stepResult.referenceLabel);
        if (!isFailure || !isActionLike) {
          return;
        }
        const action = actions.find(
          (entry) =>
            entry.id === stepResult.referenceId ||
            entry.backingBlockId === stepResult.referenceId ||
            entry.name === stepResult.referenceLabel
        );
        const key =
          action?.id ??
          stepResult.referenceId ??
          stepResult.referenceLabel ??
          stepResult.stepId;
        const row =
          acc[key] ??
          {
            key,
            name: action?.name ?? stepResult.referenceLabel ?? stepResult.referenceId ?? "Reusable action",
            failures: 0,
            latestFailure: null,
          };
        row.failures += 1;
        if (!row.latestFailure || execution.startedAt > row.latestFailure.startedAt) {
          row.latestFailure = execution;
        }
        acc[key] = row;
      });
      return acc;
    }, {})
  )
    .sort(
      (left, right) =>
        right.failures - left.failures ||
        (right.latestFailure?.startedAt ?? 0) - (left.latestFailure?.startedAt ?? 0)
    )
    .slice(0, 6);
  const latestScheduledRuns = scheduledExecutions.slice(0, 6);

  const updateProjectWithScenarios = async (nextProject: Project, nextScenarios: AutomationScenario[]) => {
    const synced = syncScenarioCollections(nextProject, nextScenarios);
    return persistProject({
      ...nextProject,
      automationScenarios: synced.scenarios,
      automationSuites: synced.suites,
      automationScripts: synced.scripts,
    });
  };

  const persistActions = async (
    nextActions: AutomationAction[],
    overrides?: Partial<Project>
  ) => {
    const synced = syncAutomationActions(
      {
        ...project,
        ...overrides,
      },
      nextActions
    );

    return persistProject({
      ...project,
      ...overrides,
      automationActions: synced.actions,
      automationReusableBlocks: synced.reusableBlocks,
    });
  };

  const createAction = async () => {
    const now = getTimestamp();
    const id = crypto.randomUUID();
    const nextAction: AutomationAction = {
      id,
      projectId: project.id,
      name: `Action ${actions.length + 1}`,
      description: "Reusable automation action.",
      tags: ["reusable"],
      provider: selectedEntry?.scenario.provider ?? "playwright",
      parameters: [],
      steps: [],
      outputs: [],
      backingBlockId: id,
      createdAt: now,
      updatedAt: now,
    };

    await persistActions([nextAction, ...actions], { updatedAt: now });
    setSelectedActionId(id);
    setMessage({ tone: "success", text: `Created ${nextAction.name}.` });
  };

  const saveAction = async () => {
    if (!selectedAction) {
      return;
    }

    const now = getTimestamp();
    const nextAction: AutomationAction = {
      ...selectedAction,
      name: actionName.trim() || selectedAction.name,
      description: actionDescription.trim() || undefined,
      tags: actionTags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      parameters: parseActionParameterText(actionParameters),
      steps: actionDraftSteps.map((step, index) => ({
        ...step,
        id: step.id || crypto.randomUUID(),
        scriptId: selectedAction.backingBlockId ?? selectedAction.id,
        order: index,
      })),
      updatedAt: now,
    };

    await persistActions(
      actions.map((entry) => (entry.id === selectedAction.id ? nextAction : entry)),
      { updatedAt: now }
    );
    setMessage({ tone: "success", text: `Saved action "${nextAction.name}".` });
  };

  const deleteAction = async (action: AutomationAction) => {
    const usageCount = actionUsageCounts[action.id] ?? 0;
    if (usageCount > 0) {
      setMessage({
        tone: "error",
        text: `${action.name} is still used in ${usageCount} scenario step(s). Remove those action calls first.`,
      });
      return;
    }

    const now = getTimestamp();
    const nextActions = actions.filter((entry) => entry.id !== action.id);
    await persistActions(nextActions, { updatedAt: now });
    setSelectedActionId(nextActions[0]?.id ?? null);
    setMessage({ tone: "success", text: `Deleted action "${action.name}".` });
  };

  const updateScenarioMetadata = async (
    scenarioId: string,
    updates: Partial<
      Pick<AutomationScenario, "priority" | "status" | "tags">
    >
  ) => {
    const now = getTimestamp();
    await updateProjectWithScenarios(
      { ...project, updatedAt: now },
      scenarios.map((entry) =>
        entry.id === scenarioId ? { ...entry, ...updates, updatedAt: now } : entry
      )
    );
  };

  const createSuite = async () => {
    const now = getTimestamp();
    const name = suiteName.trim() || `Suite ${suites.length + 1}`;
    await persistProject({
      ...project,
      automationSuites: [
        {
          id: crypto.randomUUID(),
          projectId: project.id,
          name,
          description: suiteDescription.trim() || undefined,
          scenarioIds: [],
          tags: suiteTags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          status: suiteStatus,
          environmentBindingId: suiteEnvironmentId || undefined,
          createdAt: now,
          updatedAt: now,
        },
        ...(project.automationSuites ?? suites),
      ],
      updatedAt: now,
    });
    setMessage({ tone: "success", text: `Created suite "${name}".` });
  };

  const updateSuite = async (
    suiteId: string,
    updates: Partial<
      Pick<
        AutomationSuite,
        "name" | "description" | "tags" | "status" | "environmentBindingId"
      >
    >
  ) => {
    const now = getTimestamp();
    await persistProject({
      ...project,
      automationSuites: suites.map((suite) =>
        suite.id === suiteId ? { ...suite, ...updates, updatedAt: now } : suite
      ),
      updatedAt: now,
    });
    setMessage({ tone: "success", text: "Saved automation suite." });
  };

  const deleteSuite = async (suite: AutomationSuite) => {
    const now = getTimestamp();
    const nextSuites = suites.filter((entry) => entry.id !== suite.id);
    const nextScenarios = scenarios.map((scenario) =>
      scenario.suiteId === suite.id
        ? { ...scenario, suiteId: undefined, updatedAt: now }
        : scenario
    );
    await updateProjectWithScenarios(
      {
        ...project,
        automationSuites: nextSuites,
        updatedAt: now,
      },
      nextScenarios
    );
    setSelectedSuiteId(nextSuites[0]?.id ?? null);
    setMessage({
      tone: "success",
      text: `Deleted suite "${suite.name}" and kept its scenarios available.`,
    });
  };

  const createScenario = async (suiteId?: string) => {
    const now = getTimestamp();
    const id = crypto.randomUUID();
    await updateProjectWithScenarios(
      {
        ...project,
        automationSteps: { ...(project.automationSteps ?? {}), [id]: [] },
        updatedAt: now,
      },
      [
        ...scenarios,
        {
          id,
          projectId: project.id,
          suiteId: suiteId ?? selectedSuite?.id,
          scriptId: id,
          provider: "playwright",
          executionMode: "headed",
          environmentBindingId: activeEnvironmentId || undefined,
          name: `Scenario ${scenarios.length + 1}`,
          description: "Independent automation scenario.",
          priority: "medium",
          status: "draft",
          testDataSetIds: [],
          parameterizationMode: "default-only",
          sourceType: "standalone",
          linkedCaseIds: [],
          linkedRequirementIds: [],
          linkedReleaseIds: [],
          linkedIssueIds: [],
          createdAt: now,
          updatedAt: now,
        },
      ]
    );
    setSelectedScenarioId(id);
  };

  const saveScenario = async (scenarioId: string, payload: { mode: AutomationBindingMode; provider: AutomationProvider; executionMode: AutomationExecutionMode; environmentBindingId?: string; name: string; description?: string; steps: AutomationStep[]; }) => {
    const now = getTimestamp();
    const existing = scenarios.find((entry) => entry.id === scenarioId);
    if (!existing) return;
    await updateProjectWithScenarios(
      {
        ...project,
        automationSteps: {
          ...(project.automationSteps ?? {}),
          [existing.scriptId ?? existing.id]: payload.steps.map((step, index) => ({ ...step, id: step.id || crypto.randomUUID(), scriptId: existing.scriptId ?? existing.id, order: index })),
        },
        updatedAt: now,
      },
      scenarios.map((entry) =>
        entry.id === scenarioId
          ? {
              ...entry,
              provider: payload.provider,
              executionMode: payload.executionMode,
              environmentBindingId: payload.environmentBindingId,
              name: payload.name.trim() || entry.name,
              description: payload.description?.trim() || undefined,
              status: payload.steps.length ? "ready" : "draft",
              updatedAt: now,
            }
          : entry
      )
    );
    setMessage({ tone: "success", text: "Saved automation scenario." });
  };

  const moveScenarioToSuite = async (scenarioId: string, suiteId: string) => {
    const now = getTimestamp();
    await updateProjectWithScenarios(
      { ...project, updatedAt: now },
      scenarios.map((entry) => (entry.id === scenarioId ? { ...entry, suiteId, updatedAt: now } : entry))
    );
  };

  const duplicateScenario = async (entry: ScenarioEntry) => {
    const now = getTimestamp();
    const nextScenarioId = crypto.randomUUID();
    const nextDataSetIds: string[] = [];
    const duplicatedDataSets = entry.dataSets.map((dataSet) => {
      const id = crypto.randomUUID();
      nextDataSetIds.push(id);
      return {
        ...dataSet,
        id,
        scenarioId: nextScenarioId,
        isDefault: dataSet.id === entry.scenario.defaultDataSetId || dataSet.isDefault,
        createdAt: now,
        updatedAt: now,
      };
    });

    await updateProjectWithScenarios(
      {
        ...project,
        automationSteps: {
          ...(project.automationSteps ?? {}),
          [nextScenarioId]: entry.steps.map((step, index) => ({
            ...step,
            id: crypto.randomUUID(),
            scriptId: nextScenarioId,
            order: index,
          })),
        },
        automationScenarioTestDataSets: [
          ...(project.automationScenarioTestDataSets ?? []),
          ...duplicatedDataSets,
        ],
        updatedAt: now,
      },
      [
        ...scenarios,
        {
          ...entry.scenario,
          id: nextScenarioId,
          scriptId: nextScenarioId,
          name: `${entry.scenario.name} Copy`,
          testDataSetIds: nextDataSetIds,
          defaultDataSetId:
            duplicatedDataSets.find((dataSet) => dataSet.isDefault)?.id ??
            nextDataSetIds[0],
          linkedCaseIds: [],
          sourceType: "standalone",
          createdAt: now,
          updatedAt: now,
        },
      ]
    );
    setSelectedScenarioId(nextScenarioId);
    setMessage({ tone: "success", text: `Duplicated ${entry.scenario.name}.` });
  };

  const toggleScenarioArchive = async (entry: ScenarioEntry) => {
    const now = getTimestamp();
    const nextStatus = entry.scenario.status === "paused" ? "ready" : "paused";
    await updateProjectWithScenarios(
      { ...project, updatedAt: now },
      scenarios.map((item) =>
        item.id === entry.scenario.id
          ? { ...item, status: nextStatus, updatedAt: now }
          : item
      )
    );
    setMessage({
      tone: "success",
      text:
        nextStatus === "paused"
          ? `${entry.scenario.name} archived.`
          : `${entry.scenario.name} reactivated.`,
    });
  };

  const deleteScenario = async (entry: ScenarioEntry) => {
    const now = getTimestamp();
    const nextScenarioIds = new Set(
      scenarios.filter((item) => item.id !== entry.scenario.id).map((item) => item.id)
    );
    const runtimeId = entry.scriptId;
    await updateProjectWithScenarios(
      {
        ...project,
        automationSteps: Object.fromEntries(
          Object.entries(project.automationSteps ?? {}).filter(
            ([scriptId]) => scriptId !== runtimeId
          )
        ),
        automationScenarioTestDataSets: (project.automationScenarioTestDataSets ?? []).filter(
          (dataSet) => dataSet.scenarioId !== entry.scenario.id
        ),
        automationSchedules: schedules.filter(
          (schedule) =>
            schedule.scenarioId !== entry.scenario.id &&
            schedule.scriptId !== runtimeId
        ),
        automationBindings: bindings.filter(
          (binding) => binding.scriptId !== runtimeId
        ),
        rows: rows.map((row) =>
          row.automationScriptId === runtimeId
            ? {
                ...row,
                automationReference: undefined,
                automationScriptId: undefined,
                automationBindingMode: undefined,
                automationStatus: "manual",
                updatedAt: now,
              }
            : row
        ),
        updatedAt: now,
      },
      scenarios.filter((item) => item.id !== entry.scenario.id)
    );
    setSelectedScenarioId(nextScenarioIds.values().next().value ?? null);
    setMessage({ tone: "success", text: `${entry.scenario.name} deleted.` });
  };

  const saveDataSet = async () => {
    if (!selectedEntry) return;
    const now = getTimestamp();
    const id = selectedDataSetId ?? crypto.randomUUID();
    const nextDataSet: ScenarioTestDataSet = {
      id,
      scenarioId: selectedEntry.scenario.id,
      name: dataSetName.trim() || "Data set",
      description: dataSetDescription.trim() || undefined,
      variables: parseVariableText(dataSetVariables),
      isDefault: selectedEntry.dataSets.length === 0 || !selectedDataSetId,
      createdAt: selectedEntry.dataSets.find((entry) => entry.id === id)?.createdAt ?? now,
      updatedAt: now,
    };
    const nextDataSets = [
      ...(project.automationScenarioTestDataSets ?? []).filter((entry) => entry.id !== id),
      nextDataSet,
    ].map((entry) =>
      entry.scenarioId === selectedEntry.scenario.id && entry.id !== id && nextDataSet.isDefault
        ? { ...entry, isDefault: false, updatedAt: now }
        : entry
    );
    await updateProjectWithScenarios(
      { ...project, automationScenarioTestDataSets: nextDataSets, updatedAt: now },
      scenarios.map((entry) =>
        entry.id === selectedEntry.scenario.id
          ? {
              ...entry,
              testDataSetIds: nextDataSets.filter((item) => item.scenarioId === entry.id).map((item) => item.id),
              defaultDataSetId: nextDataSet.isDefault ? id : entry.defaultDataSetId,
              updatedAt: now,
            }
          : entry
      )
    );
    setSelectedDataSetId(id);
    setMessage({ tone: "success", text: "Saved data set." });
  };

  const clearScenarioFilters = () => {
    setScenarioSearch("");
    setScenarioStatusFilter("all");
    setScenarioPriorityFilter("all");
    setScenarioSortKey("updated");
    setSelectedSuiteId(null);
  };

  const deleteDataSet = async (dataSetId: string) => {
    if (!selectedEntry) return;
    const now = getTimestamp();
    const nextDataSets = (project.automationScenarioTestDataSets ?? []).filter((entry) => entry.id !== dataSetId);
    await updateProjectWithScenarios(
      { ...project, automationScenarioTestDataSets: nextDataSets, updatedAt: now },
      scenarios.map((entry) =>
        entry.id === selectedEntry.scenario.id
          ? {
              ...entry,
              testDataSetIds: nextDataSets.filter((item) => item.scenarioId === entry.id).map((item) => item.id),
              defaultDataSetId:
                entry.defaultDataSetId === dataSetId
                  ? nextDataSets.find((item) => item.scenarioId === entry.id)?.id
                  : entry.defaultDataSetId,
              updatedAt: now,
            }
          : entry
      )
    );
    setSelectedDataSetId(null);
    setDataSetName("Default data set");
    setDataSetDescription("");
    setDataSetVariables("");
  };

  const executeScenarioRequest = async (
    entry: ScenarioEntry,
    options?: {
      executionMode?: AutomationExecutionMode;
      dataSetId?: string;
      runAllDataSets?: boolean;
    }
  ) => {
    const response = await fetch("/api/automation/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        scenarioId: entry.scenario.id,
        dataSetId: options?.dataSetId,
        runAllDataSets: options?.runAllDataSets,
        executionMode: options?.executionMode,
      }),
    });
    return {
      response,
      payload: await parseAutomationApiResponse<{
        error?: string;
        execution?: AutomationExecution;
        executions?: AutomationExecution[];
      }>(response),
    };
  };

  const runScenario = async (entry: ScenarioEntry, options?: { executionMode?: AutomationExecutionMode; dataSetId?: string; runAllDataSets?: boolean; }) => {
    const { response, payload } = await executeScenarioRequest(entry, options);
    if (!response.ok || !payload.execution) {
      return { tone: "error" as const, text: payload.error || "Failed to execute automation scenario." };
    }
    await reloadProject();
    setSelectedScenarioId(entry.scenario.id);
    setSelectedExecutionId(payload.executions?.[payload.executions.length - 1]?.id ?? payload.execution.id);
    const failed = payload.executions?.some((item) => item.status === "failed" || item.status === "blocked") ?? payload.execution.status !== "passed";
    const tone = failed ? "error" : "success";
    const text = options?.runAllDataSets
      ? `${entry.scenario.name} ran across ${payload.executions?.length ?? 1} data set(s).`
      : `${entry.scenario.name} ${failed ? "finished with issues" : "passed"}.`;
    setMessage({ tone, text });
    return { tone, text } as const;
  };

  const runVisibleScenarios = async () => {
    if (!visibleEntries.length) {
      setMessage({ tone: "info", text: "No visible scenarios to run." });
      return;
    }

    const results: Array<{ name: string; status: "passed" | "failed" | "blocked" | "not-run" }> = [];
    let lastExecutionId: string | null = null;

    for (const entry of visibleEntries) {
      const { response, payload } = await executeScenarioRequest(entry, {
        dataSetId: getDefaultScenarioDataSet(entry.scenario, entry.dataSets)?.id,
      });
      if (!response.ok || !payload.execution) {
        results.push({ name: entry.scenario.name, status: "failed" });
        continue;
      }
      lastExecutionId =
        payload.executions?.[payload.executions.length - 1]?.id ??
        payload.execution.id;
      results.push({
        name: entry.scenario.name,
        status: payload.execution.status,
      });
    }

    await reloadProject();
    if (lastExecutionId) {
      setSelectedExecutionId(lastExecutionId);
    }
    const failedCount = results.filter(
      (entry) => entry.status === "failed" || entry.status === "blocked"
    ).length;
    setMessage({
      tone: failedCount ? "error" : "success",
      text: failedCount
        ? `Ran ${results.length} visible scenario(s); ${failedCount} finished with issues.`
        : `Ran ${results.length} visible scenario(s) successfully.`,
    });
  };

  const updateVisibleScenarioStatuses = async (
    nextStatus: NonNullable<AutomationScenario["status"]>,
    messageText: string
  ) => {
    if (!visibleEntries.length) {
      setMessage({ tone: "info", text: "No visible scenarios to update." });
      return;
    }

    const now = getTimestamp();
    const visibleIds = new Set(visibleEntries.map((entry) => entry.scenario.id));
    await updateProjectWithScenarios(
      { ...project, updatedAt: now },
      scenarios.map((entry) =>
        visibleIds.has(entry.id)
          ? { ...entry, status: nextStatus, updatedAt: now }
          : entry
      )
    );
    setMessage({
      tone: "success",
      text: messageText.replace("{count}", String(visibleEntries.length)),
    });
  };

  const updateVisibleScenarioPriorities = async (
    nextPriority: AutomationScenarioPriority,
    messageText: string
  ) => {
    if (!visibleEntries.length) {
      setMessage({ tone: "info", text: "No visible scenarios to update." });
      return;
    }

    const now = getTimestamp();
    const visibleIds = new Set(visibleEntries.map((entry) => entry.scenario.id));
    await updateProjectWithScenarios(
      { ...project, updatedAt: now },
      scenarios.map((entry) =>
        visibleIds.has(entry.id)
          ? { ...entry, priority: nextPriority, updatedAt: now }
          : entry
      )
    );
    setMessage({
      tone: "success",
      text: messageText.replace("{count}", String(visibleEntries.length)),
    });
  };

  const moveVisibleScenariosToSuite = async () => {
    if (!visibleEntries.length) {
      setMessage({ tone: "info", text: "No visible scenarios to move." });
      return;
    }
    if (!bulkSuiteTargetId) {
      setMessage({ tone: "info", text: "Choose a destination suite first." });
      return;
    }

    const targetSuite = suites.find((suite) => suite.id === bulkSuiteTargetId);
    if (!targetSuite) {
      setMessage({ tone: "error", text: "Selected destination suite was not found." });
      return;
    }

    const now = getTimestamp();
    const visibleIds = new Set(visibleEntries.map((entry) => entry.scenario.id));
    await updateProjectWithScenarios(
      { ...project, updatedAt: now },
      scenarios.map((entry) =>
        visibleIds.has(entry.id)
          ? { ...entry, suiteId: targetSuite.id, updatedAt: now }
          : entry
      )
    );
    setMessage({
      tone: "success",
      text: `Moved ${visibleEntries.length} visible scenario(s) to ${targetSuite.name}.`,
    });
  };

  const runSuite = async (suite: AutomationSuite) => {
    const response = await fetch("/api/automation/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, suiteId: suite.id }),
    });
    const payload = await parseAutomationApiResponse<{ error?: string; executions?: AutomationExecution[]; }>(response);
    if (!response.ok || !payload.executions?.length) {
      setMessage({ tone: "error", text: payload.error || "Failed to execute suite." });
      return;
    }
    await reloadProject();
    setSelectedExecutionId(payload.executions[payload.executions.length - 1].id);
    setMessage({ tone: "success", text: `Suite "${suite.name}" ran ${payload.executions.length} scenario(s).` });
  };

  const linkScenarioToCase = async (scenarioId: string, rowId: string) => {
    const now = getTimestamp();
    const scenario = scenarios.find((entry) => entry.id === scenarioId);
    if (!scenario) return;
    await updateProjectWithScenarios(
      {
        ...project,
        automationBindings: [
          ...bindings.filter((binding) => binding.testCaseId !== rowId),
          {
            id: bindings.find((binding) => binding.testCaseId === rowId)?.id ?? crypto.randomUUID(),
            testCaseId: rowId,
            scriptId: scenario.scriptId ?? scenario.id,
            mode: "automated",
          },
        ],
        rows: rows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                automationProvider: automationProviderLabels[scenario.provider],
                automationStatus: "automated",
                automationReference: scenario.name,
                automationScriptId: scenario.scriptId ?? scenario.id,
                automationBindingMode: "automated",
                updatedAt: now,
              }
            : row
        ),
        updatedAt: now,
      },
      scenarios.map((entry) =>
        entry.id === scenarioId
          ? { ...entry, linkedCaseIds: Array.from(new Set([...(entry.linkedCaseIds ?? []), rowId])), updatedAt: now }
          : entry
      )
    );
  };

  const unlinkScenarioFromCase = async (scenarioId: string, rowId: string) => {
    const now = getTimestamp();
    await updateProjectWithScenarios(
      {
        ...project,
        automationBindings: bindings.filter((binding) => binding.testCaseId !== rowId),
        rows: rows.map((row) =>
          row.id === rowId
            ? { ...row, automationReference: undefined, automationScriptId: undefined, automationBindingMode: undefined, automationStatus: "manual", updatedAt: now }
            : row
        ),
        updatedAt: now,
      },
      scenarios.map((entry) =>
        entry.id === scenarioId
          ? { ...entry, linkedCaseIds: (entry.linkedCaseIds ?? []).filter((caseId) => caseId !== rowId), updatedAt: now }
          : entry
      )
    );
  };

  const saveReuseLibrary = async (payload: { reusableBlocks: Project["automationReusableBlocks"]; environments: AutomationEnvironmentBinding[]; activeEnvironmentId: string; }) => {
    await persistProject({
      ...project,
      automationReusableBlocks: payload.reusableBlocks ?? [],
      automationEnvironmentBindings: payload.environments,
      activeAutomationEnvironmentId: payload.activeEnvironmentId,
      updatedAt: getTimestamp(),
    });
  };

  const saveEnvironment = async () => {
    const now = getTimestamp();
    const current =
      environments.find((entry) => entry.id === activeEnvironmentId) ??
      environments.find((entry) => entry.isDefault) ??
      null;
    const id = current?.id ?? crypto.randomUUID();
    await persistProject({
      ...project,
      automationEnvironmentBindings: [
        {
          id,
          name: environmentName.trim() || "Default Environment",
          baseUrl: environmentBaseUrl.trim() || undefined,
          routePresets: { login: environmentLoginRoute.trim() || "/login", dashboard: environmentDashboardRoute.trim() || "/dashboard" },
          credentialAliases: environmentCredentialAliases.split(",").map((item) => item.trim()).filter(Boolean),
          isDefault: true,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        },
        ...environments.filter((entry) => entry.id !== id).map((entry) => ({ ...entry, isDefault: false })),
      ],
      activeAutomationEnvironmentId: id,
      updatedAt: now,
    });
    setIsEnvironmentEditorOpen(false);
  };

  const saveSchedule = async () => {
    if (!selectedEntry && scheduleTargetType === "scenario") return;
    if (!selectedSuite && scheduleTargetType === "suite") return;
    const scheduledFor = scheduleAt ? new Date(scheduleAt).getTime() : undefined;
    const now = getTimestamp();
    const selectedScheduleSuite =
      scheduleTargetType === "suite" ? selectedSuite : selectedEntry?.suite;
    const selectedScheduleScenario =
      scheduleTargetType === "scenario" ? selectedEntry?.scenario : null;
    const selectedScheduleScriptId =
      scheduleTargetType === "suite"
        ? `suite:${selectedScheduleSuite?.id ?? "unknown"}`
        : selectedEntry?.scriptId ?? "";
    const existingSchedule = selectedScheduleId
      ? schedules.find((item) => item.id === selectedScheduleId) ?? null
      : null;
    const schedule: AutomationSchedule = {
      id: existingSchedule?.id ?? crypto.randomUUID(),
      scriptId: selectedScheduleScriptId,
      scenarioId: selectedScheduleScenario?.id,
      suiteId: selectedScheduleSuite?.id,
      datasetId:
        scheduleTargetType === "scenario" ? defaultDataSet?.id : undefined,
      runAllDataSets:
        scheduleTargetType === "scenario" &&
        selectedEntry?.scenario.parameterizationMode === "all-datasets",
      name:
        scheduleName.trim() ||
        `${selectedScheduleScenario?.name ?? selectedScheduleSuite?.name ?? "Automation"} schedule`,
      frequency: scheduleFrequency,
      cronExpression: scheduleFrequency === "custom" ? scheduleCronExpression.trim() || undefined : undefined,
      scheduledFor,
      nextRunAt: computeScheduleNextRun(
        scheduleFrequency,
        scheduledFor,
        existingSchedule?.nextRunAt,
        existingSchedule?.isEnabled ?? true,
        now
      ),
      environmentBindingId:
        selectedScheduleScenario?.environmentBindingId ??
        selectedScheduleSuite?.environmentBindingId ??
        activeEnvironmentId,
      executionMode: scheduleExecutionMode,
      isEnabled: existingSchedule?.isEnabled ?? true,
      status:
        existingSchedule?.isEnabled === false
          ? "paused"
          : existingSchedule?.status === "failed"
            ? "failed"
            : "scheduled",
      lastRunStatus: existingSchedule?.lastRunStatus,
      lastExecutionId: existingSchedule?.lastExecutionId,
      lastError: existingSchedule?.lastError,
      lastRunAt: existingSchedule?.lastRunAt,
      lastCheckedAt: existingSchedule?.lastCheckedAt,
      createdAt: existingSchedule?.createdAt ?? now,
      updatedAt: now,
    };
    await persistProject({
      ...project,
      automationSchedules: [
        schedule,
        ...schedules.filter((item) => item.id !== schedule.id),
      ],
      updatedAt: now,
    });
    setSelectedScheduleId(schedule.id);
    setMessage({
      tone: "success",
      text: `${existingSchedule ? "Updated" : "Saved"} schedule "${schedule.name}".`,
    });
  };

  const resetScheduleEditor = () => {
    setSelectedScheduleId(null);
    setScheduleName("Nightly Run");
    setScheduleFrequency("daily");
    setScheduleExecutionMode("headless");
    setScheduleAt("");
    setScheduleCronExpression("");
  };

  const selectScheduleForEditing = (schedule: AutomationSchedule) => {
    setSelectedScheduleId(schedule.id);
    if (schedule.scenarioId) {
      setSelectedScenarioId(schedule.scenarioId);
    }
    if (schedule.suiteId) {
      setSelectedSuiteId(schedule.suiteId);
    }
    setScheduleTargetType(schedule.suiteId ? "suite" : "scenario");
    setScheduleName(schedule.name);
    setScheduleFrequency(schedule.frequency);
    setScheduleExecutionMode(schedule.executionMode ?? "headless");
    setScheduleAt(
      schedule.scheduledFor
        ? new Date(schedule.scheduledFor).toISOString().slice(0, 16)
        : ""
    );
    setScheduleCronExpression(schedule.cronExpression ?? "");
  };

  const toggleScheduleEnabled = async (schedule: AutomationSchedule) => {
    const now = getTimestamp();
    await persistProject({
      ...project,
      automationSchedules: schedules.map((item) =>
        item.id === schedule.id
          ? {
              ...item,
              isEnabled: !item.isEnabled,
              status: item.isEnabled ? "paused" : "scheduled",
              nextRunAt: item.isEnabled
                ? item.nextRunAt
                : computeScheduleNextRun(
                    item.frequency,
                    item.scheduledFor,
                    item.nextRunAt,
                    true,
                    now
                  ),
              updatedAt: now,
            }
          : item
      ),
      updatedAt: now,
    });
    setMessage({
      tone: "success",
      text: `${schedule.name} ${schedule.isEnabled ? "paused" : "enabled"}.`,
    });
  };

  const deleteSchedule = async (scheduleId: string) => {
    const schedule = schedules.find((item) => item.id === scheduleId);
    if (!schedule) {
      return;
    }

    await persistProject({
      ...project,
      automationSchedules: schedules.filter((item) => item.id !== scheduleId),
      updatedAt: getTimestamp(),
    });
    if (selectedScheduleId === scheduleId) {
      resetScheduleEditor();
    }
    setMessage({ tone: "success", text: `Deleted schedule "${schedule.name}".` });
  };

  const runDueSchedulesNow = async () => {
    const response = await fetch("/api/automation/schedules/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    const payload = await parseAutomationApiResponse<{
      error?: string;
      processedCount?: number;
    }>(response);

    if (!response.ok) {
      setMessage({
        tone: "error",
        text: payload.error || "Failed to dispatch automation schedules.",
      });
      return;
    }

    await reloadProject();
    setMessage({
      tone: "success",
      text:
        payload.processedCount && payload.processedCount > 0
          ? `Triggered ${payload.processedCount} due schedule(s).`
          : "No schedules were due right now.",
    });
  };

  const updateParameterizationMode = async (
    scenarioId: string,
    mode: AutomationScenarioParameterizationMode
  ) => {
    const now = getTimestamp();
    await updateProjectWithScenarios(
      { ...project, updatedAt: now },
      scenarios.map((item) =>
        item.id === scenarioId
          ? { ...item, parameterizationMode: mode, updatedAt: now }
          : item
      )
    );
  };

  const updateActionSteps = (nextSteps: AutomationStep[]) => {
    if (!selectedAction) {
      return;
    }

    const normalizedSteps = nextSteps.map((step, index) => ({
        ...step,
        id: step.id || crypto.randomUUID(),
        scriptId: selectedAction.backingBlockId ?? selectedAction.id,
        order: index,
      }));
    setActionDraftSteps(normalizedSteps);
    if (!normalizedSteps.some((step) => step.id === selectedActionStepId)) {
      setSelectedActionStepId(normalizedSteps[0]?.id ?? null);
    }
  };

  const addActionStep = () => {
    if (!selectedAction) {
      return;
    }

    const id = crypto.randomUUID();
    updateActionSteps([
      ...actionDraftSteps,
      {
        id,
        scriptId: selectedAction.backingBlockId ?? selectedAction.id,
        order: actionDraftSteps.length,
        action: "goto",
        targetType: "url",
        targetValue: "",
        timeoutMs: 5000,
      },
    ]);
    setSelectedActionStepId(id);
  };

  const deleteActionStep = (stepId: string) => {
    updateActionSteps(actionDraftSteps.filter((step) => step.id !== stepId));
    if (selectedActionStepId === stepId) {
      const fallback = actionDraftSteps.find((step) => step.id !== stepId)?.id ?? null;
      setSelectedActionStepId(fallback);
    }
  };

  const moveActionStep = (stepId: string, direction: "up" | "down") => {
    const index = actionDraftSteps.findIndex((step) => step.id === stepId);
    if (index === -1) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= actionDraftSteps.length) {
      return;
    }
    const nextSteps = [...actionDraftSteps];
    const [moved] = nextSteps.splice(index, 1);
    nextSteps.splice(targetIndex, 0, moved);
    updateActionSteps(nextSteps);
  };

  const insertActionTemplate = (templateId: AutomationStepTemplateId) => {
    if (!selectedAction) {
      return;
    }

    const templateSteps = buildAutomationTemplateSteps(
      {
        templateId,
        provider: selectedAction.provider,
        scriptId: selectedAction.backingBlockId ?? selectedAction.id,
        startOrder: actionDraftSteps.length,
      }
    ).map((step) => ({
      ...step,
      id: crypto.randomUUID(),
    }));
    updateActionSteps([
      ...actionDraftSteps,
      ...templateSteps.map((step, index) => ({
        ...step,
        scriptId: selectedAction.backingBlockId ?? selectedAction.id,
        order: actionDraftSteps.length + index,
      })),
    ]);
    setSelectedActionStepId(templateSteps[0]?.id ?? selectedActionStepId);
  };

  const renderEntryButton = (entry: ScenarioEntry) => (
    <button
      key={entry.scenario.id}
      type="button"
      onClick={() => setSelectedScenarioId(entry.scenario.id)}
      className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
        selectedEntry?.scenario.id === entry.scenario.id
          ? "border-sky-400/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(79,70,229,0.14),rgba(124,58,237,0.18))]"
          : "border-slate-700/80 bg-slate-900/78 hover:bg-slate-800"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-slate-50">{entry.scenario.name}</p>
        <span className={`${badge} ${statusTone[entry.latestExecution?.status ?? "not-run"]}`}>{entry.latestExecution?.status ?? "not-run"}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {entry.suite?.name ?? "No suite"} | {entry.steps.length} step(s) | {entry.dataSets.length} data set(s) | {entry.scenario.priority ?? "medium"} | {entry.scenario.status ?? "draft"}{entry.scenario.tags?.length ? ` | ${entry.scenario.tags.join(", ")}` : ""}
      </p>
    </button>
  );

  const getSuiteHref = (suiteId: string) =>
    `/projects/${encodedProjectKey}/automation/suites/${suiteId}`;

  const getScenarioHref = (scenarioId: string) =>
    `/projects/${encodedProjectKey}/automation/scenarios/${scenarioId}`;

  const getActionHref = (actionId: string) =>
    `/projects/${encodedProjectKey}/automation/actions/${actionId}`;

  const getRunHref = (executionId: string) =>
    `/projects/${encodedProjectKey}/automation/runs/${executionId}`;

  const getPlaybackHref = (executionId: string) =>
    `/projects/${encodedProjectKey}/automation/playback/${executionId}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="cf-panel h-fit rounded-[28px] p-4 xl:sticky xl:top-6">
        <div className="rounded-[24px] border border-slate-700/80 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.18),_transparent_44%),linear-gradient(180deg,_rgba(17,24,39,0.98)_0%,_rgba(15,23,42,0.98)_100%)] p-4 shadow-[0_24px_56px_-40px_rgba(79,70,229,0.75)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Automation
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
            caseForge
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Low-code suites, scenarios, reusable actions, playback, and execution insight in one dark-first workspace.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="cf-ai-badge inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold">
              AI suggestions
            </span>
            <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              Automation-first
            </span>
          </div>
        </div>
        <nav className="mt-4 space-y-2">
          {navItems.map((item) => {
            const href = `/projects/${encodedProjectKey}/automation${item.href}`;
            const active = section === item.key;

            return (
              <Link
                key={item.key}
                href={href}
                className={`group flex items-center gap-3 rounded-[18px] border px-3.5 py-3 text-sm font-semibold transition ${
                  active
                    ? "border-sky-400/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.2),rgba(79,70,229,0.18),rgba(124,58,237,0.2))] text-white shadow-[0_18px_34px_-26px_rgba(79,70,229,0.78)]"
                    : "border-slate-700/80 bg-slate-900/75 text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl border text-[10px] font-bold tracking-[0.14em] ${
                    active
                      ? "border-white/15 bg-slate-950/40 text-cyan-200"
                      : "border-slate-700 bg-slate-950/70 text-slate-400"
                  }`}
                >
                  {navGlyph(item.label)}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex flex-col gap-6">
        <section className={`${panel} overflow-hidden bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.16),_transparent_34%),radial-gradient(circle_at_top_left,_rgba(37,99,235,0.16),_transparent_28%),linear-gradient(180deg,_rgba(17,24,39,0.98)_0%,_rgba(15,23,42,0.98)_100%)]`}>
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Automation Product</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">Modern automation command center</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                caseForge now treats automation as a first-class product with suites, scenarios, actions, datasets, runs, playback, environments, schedules, and reporting in one clean workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void createScenario()} className="cf-primary-button rounded-2xl px-4 py-2 text-sm font-semibold">
                New Scenario
              </button>
              <button type="button" onClick={() => void createAction()} className="cf-secondary-button rounded-2xl px-4 py-2 text-sm font-semibold">
                New Action
              </button>
              <Link href={`/projects/${encodedProjectKey}/automation/reports`} className="cf-secondary-button rounded-2xl px-4 py-2 text-sm font-semibold">
                Open Reports
              </Link>
            </div>
          </div>
        </section>
        {message ? (
          <div className={`${panel} py-3 text-sm ${message.tone === "error" ? "border-rose-500/30 text-rose-200" : message.tone === "success" ? "border-emerald-500/30 text-emerald-200" : "text-slate-200"}`}>
            {message.text}
          </div>
        ) : null}
      {isProjectLoading && !project ? (
        <section className={`${panel} border-slate-700/80 bg-slate-950/70 text-sm text-slate-300`}>
          Loading project automation data, suites, scenarios, actions, and recent runs.
        </section>
      ) : null}
      {section === "overview" ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Suites", suites.length],
              ["Scenarios", scenarios.length],
              ["Actions", actions.length],
              ["Data Sets", project.automationScenarioTestDataSets?.length ?? 0],
              ["Runs", executions.length],
              ["Pass Rate", `${passRate}%`],
            ].map(([label, value]) => (
              <article key={String(label)} className={card}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
              </article>
            ))}
          </section>
          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <article className={panel}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Automation Overview</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-50">Create suite, author scenario, run with data, replay</h3>
                </div>
                <button type="button" onClick={() => void createScenario()} className="cf-primary-button rounded-2xl px-4 py-2 text-sm font-semibold">New Scenario</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  {
                    label: "Suites",
                    href: `/projects/${encodedProjectKey}/automation/suites`,
                    note: `${suites.length} container${suites.length === 1 ? "" : "s"}`,
                  },
                  {
                    label: "Scenarios",
                    href: `/projects/${encodedProjectKey}/automation/scenarios`,
                    note: `${scenarios.length} executable flow${scenarios.length === 1 ? "" : "s"}`,
                  },
                  {
                    label: "Actions",
                    href: `/projects/${encodedProjectKey}/automation/actions`,
                    note: `${actions.length} reusable block${actions.length === 1 ? "" : "s"}`,
                  },
                  {
                    label: "Test Data",
                    href: `/projects/${encodedProjectKey}/automation/test-data`,
                    note: `${project.automationScenarioTestDataSets?.length ?? 0} data set${(project.automationScenarioTestDataSets?.length ?? 0) === 1 ? "" : "s"}`,
                  },
                  {
                    label: "Playback",
                    href: `/projects/${encodedProjectKey}/automation/playback`,
                    note: `${executions.length} run${executions.length === 1 ? "" : "s"} to inspect`,
                  },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="group flex min-w-0 items-center justify-between gap-3 rounded-[20px] border border-slate-700/80 bg-slate-950/55 px-4 py-3 text-left transition hover:border-slate-500 hover:bg-slate-900/80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-50">
                        {item.label}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {item.note}
                      </p>
                    </div>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-300 transition group-hover:border-sky-400/30 group-hover:text-sky-200">
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="mt-5 rounded-[24px] border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Run Trend</p>
                    <p className="mt-1 text-sm text-slate-300">Recent automation health across suites, scenarios, and datasets.</p>
                  </div>
                  <span className="cf-ai-badge inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold">
                    AI optimization hints
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {reportTrendBuckets.length ? reportTrendBuckets.map((bucket) => {
                    const passedWidth = bucket.total ? Math.round((bucket.passed / bucket.total) * 100) : 0;
                    const failedWidth = bucket.total ? Math.round(((bucket.failed + bucket.blocked) / bucket.total) * 100) : 0;
                    return (
                      <div key={bucket.date} className="grid gap-3 md:grid-cols-[110px_minmax(0,1fr)_130px] md:items-center">
                        <p className="text-sm font-semibold text-slate-200">{bucket.date}</p>
                        <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
                          <div className="bg-emerald-500" style={{ width: `${passedWidth}%` }} />
                          <div className="bg-rose-500" style={{ width: `${failedWidth}%` }} />
                        </div>
                        <p className="text-xs text-slate-400">{bucket.total} run(s)</p>
                      </div>
                    );
                  }) : (
                    <p className="text-sm text-slate-400">Run the first scenario to start the trendline.</p>
                  )}
                </div>
              </div>
            </article>
            <article className={panel}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Recent Activity</p>
                  <p className="mt-1 text-sm text-slate-300">Latest scenarios and unattended execution signals.</p>
                </div>
                <Link href={`/projects/${encodedProjectKey}/automation/runs`} className="cf-secondary-button rounded-2xl px-3 py-2 text-xs font-semibold">
                  View Runs
                </Link>
              </div>
              <div className="mt-4 space-y-3">{entries.slice(0, 4).map(renderEntryButton)}</div>
              <div className="mt-4 rounded-[24px] border border-slate-700/80 bg-slate-950/55 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Scheduled Activity</p>
                <div className="mt-3 space-y-3">
                  {latestScheduledRuns.length ? latestScheduledRuns.slice(0, 3).map((execution) => (
                    <Link key={execution.id} href={getRunHref(execution.id)} className="block rounded-[18px] border border-slate-700/80 bg-slate-900/75 px-4 py-3 transition hover:bg-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-100">{execution.scheduleName ?? execution.scenarioName ?? "Scheduled run"}</p>
                        <span className={`${badge} ${statusTone[execution.status]}`}>{execution.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{formatUtcDateTime(execution.startedAt)}</p>
                    </Link>
                  )) : (
                    <p className="text-sm text-slate-400">No scheduled activity yet.</p>
                  )}
                </div>
              </div>
            </article>
          </section>
        </>
      ) : null}
      {section === "suites" ? (
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <article className={panel}>
            <input value={suiteName} onChange={(event) => setSuiteName(event.target.value)} placeholder="Suite name" className={inputClass} />
            <textarea value={suiteDescription} onChange={(event) => setSuiteDescription(event.target.value)} placeholder="Description" className={`${inputClass} mt-3 min-h-[120px]`} />
            <input value={suiteTags} onChange={(event) => setSuiteTags(event.target.value)} placeholder="tags: regression, smoke" className={`${inputClass} mt-3`} />
            <select value={suiteStatus} onChange={(event) => setSuiteStatus(event.target.value as NonNullable<AutomationSuite["status"]>)} className={`${inputClass} mt-3`}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
            <select value={suiteEnvironmentId} onChange={(event) => setSuiteEnvironmentId(event.target.value)} className={`${inputClass} mt-3`}>
              <option value="">Default environment</option>
              {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
            </select>
            <button type="button" onClick={() => void createSuite()} className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">Create Suite</button>
            <div className="mt-6 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Filter Suites</p>
              <input value={suiteSearch} onChange={(event) => setSuiteSearch(event.target.value)} placeholder="Search suites or tags" className={`${inputClass} mt-3`} />
              <select value={suiteStatusFilter} onChange={(event) => setSuiteStatusFilter(event.target.value as "all" | NonNullable<AutomationSuite["status"]>)} className={`${inputClass} mt-3`}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </article>
          <div className="space-y-4">
            <article className={panel}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Suites</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Grouping and execution containers for automation scenarios.</p>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{filteredSuites.length} suite(s)</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className={tableClassName}>
                  <thead>
                    <tr>
                      <th className={tableHeaderCellClassName}>Suite</th>
                      <th className={tableHeaderCellClassName}>Status</th>
                      <th className={tableHeaderCellClassName}>Tags</th>
                      <th className={tableHeaderCellClassName}>Default Environment</th>
                      <th className={tableHeaderCellClassName}>Scenarios</th>
                      <th className={tableHeaderCellClassName}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuites.map((suite) => {
                      const suiteScenarioCount = entries.filter(
                        (entry) =>
                          entry.scenario.suiteId === suite.id ||
                          suite.scenarioIds?.includes(entry.scenario.id)
                      ).length;
                      const isSelected = selectedSuite?.id === suite.id;
                      return (
                        <tr
                          key={suite.id}
                          onClick={() => setSelectedSuiteId(suite.id)}
                          className={`cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${isSelected ? "bg-emerald-50/70 dark:bg-emerald-500/10" : ""}`}
                        >
                          <td className={tableBodyCellClassName}>
                            <Link href={getSuiteHref(suite.id)} className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300">
                              {suite.name}
                            </Link>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{suite.description?.trim() || "No description yet."}</p>
                          </td>
                          <td className={tableBodyCellClassName}>
                            <span className={`${badge} ${statusTone["not-run"]}`}>{suite.status ?? "draft"}</span>
                          </td>
                          <td className={tableBodyCellClassName}>{(suite.tags ?? []).join(", ") || "No tags"}</td>
                          <td className={tableBodyCellClassName}>{suite.environmentBindingId ? environmentNameById[suite.environmentBindingId] ?? "Unknown" : "Default Environment"}</td>
                          <td className={tableBodyCellClassName}>{suiteScenarioCount}</td>
                          <td className={tableBodyCellClassName}>{formatUtcDateTime(suite.updatedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
            {selectedSuite ? (
              <article className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Suite Detail</p>
                    <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{selectedSuite.name}</h3>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{selectedSuiteEntries.length} scenario(s) assigned to this suite.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setSelectedSuiteId(selectedSuite.id); void createScenario(selectedSuite.id); }} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">New Scenario</button>
                    <button type="button" onClick={() => void runSuite(selectedSuite)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Run Suite</button>
                    <button type="button" onClick={() => void deleteSuite(selectedSuite)} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">Delete</button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  <input defaultValue={selectedSuite.name} onBlur={(event) => void updateSuite(selectedSuite.id, { name: event.target.value.trim() || selectedSuite.name })} className={inputClass} />
                  <select value={selectedSuite.status ?? "draft"} onChange={(event) => void updateSuite(selectedSuite.id, { status: event.target.value as NonNullable<AutomationSuite["status"]> })} className={inputClass}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                  <textarea defaultValue={selectedSuite.description ?? ""} onBlur={(event) => void updateSuite(selectedSuite.id, { description: event.target.value.trim() || undefined })} className={`${inputClass} min-h-[110px] xl:col-span-2`} />
                  <input defaultValue={(selectedSuite.tags ?? []).join(", ")} onBlur={(event) => void updateSuite(selectedSuite.id, { tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="tags: smoke, regression" className={inputClass} />
                  <select value={selectedSuite.environmentBindingId ?? ""} onChange={(event) => void updateSuite(selectedSuite.id, { environmentBindingId: event.target.value || undefined })} className={inputClass}>
                    <option value="">Default Environment</option>
                    {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
                  </select>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <table className={tableClassName}>
                    <thead>
                      <tr>
                        <th className={tableHeaderCellClassName}>Scenario</th>
                        <th className={tableHeaderCellClassName}>Priority</th>
                        <th className={tableHeaderCellClassName}>Status</th>
                        <th className={tableHeaderCellClassName}>Environment</th>
                        <th className={tableHeaderCellClassName}>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSuiteEntries.length ? selectedSuiteEntries.map((entry) => (
                        <tr key={entry.scenario.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                          <td className={tableBodyCellClassName}>
                            <Link href={getScenarioHref(entry.scenario.id)} className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300">{entry.scenario.name}</Link>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{entry.scenario.description?.trim() || "No description yet."}</p>
                          </td>
                          <td className={tableBodyCellClassName}>{entry.scenario.priority ?? "medium"}</td>
                          <td className={tableBodyCellClassName}>{entry.scenario.status ?? "draft"}</td>
                          <td className={tableBodyCellClassName}>{entry.scenario.environmentBindingId ? environmentNameById[entry.scenario.environmentBindingId] ?? "Unknown" : "Default Environment"}</td>
                          <td className={tableBodyCellClassName}>{formatUtcDateTime(entry.scenario.updatedAt)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td className={tableBodyCellClassName} colSpan={5}>No scenarios in this suite yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}
      {section === "scenarios" || section === "recorder" ? (
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <article className={panel}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Scenario Filters</p>
              <button type="button" onClick={() => void createScenario()} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">New</button>
            </div>
            <select value={selectedSuite?.id ?? ""} onChange={(event) => setSelectedSuiteId(event.target.value || null)} className={inputClass}>
              <option value="">All suites</option>
              {suites.map((suite) => <option key={suite.id} value={suite.id}>{suite.name}</option>)}
            </select>
            <input value={scenarioSearch} onChange={(event) => setScenarioSearch(event.target.value)} placeholder="Search scenarios" className={`${inputClass} mt-3`} />
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <select value={scenarioStatusFilter ?? "all"} onChange={(event) => setScenarioStatusFilter(event.target.value as "all" | AutomationScenario["status"])} className={inputClass}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
              <select value={scenarioPriorityFilter} onChange={(event) => setScenarioPriorityFilter(event.target.value as "all" | AutomationScenarioPriority)} className={inputClass}>
                <option value="all">All priorities</option>
                <option value="highest">Highest</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={scenarioSortKey} onChange={(event) => setScenarioSortKey(event.target.value as "updated" | "name" | "priority" | "status" | "recent-run")} className={inputClass}>
                <option value="updated">Sort by updated</option>
                <option value="name">Sort by name</option>
                <option value="priority">Sort by priority</option>
                <option value="status">Sort by status</option>
                <option value="recent-run">Sort by recent run</option>
              </select>
            </div>
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">{filteredScenarioCount} of {entries.length} scenario(s) visible</p>
            {selectedScenarioHiddenByFilters ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">The currently open scenario is hidden by the active filters.</p> : null}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>{visibleStatusSummary.ready ?? 0} ready</span>
              <span>{visibleStatusSummary.active ?? 0} active</span>
              <span>{visibleStatusSummary.paused ?? 0} paused</span>
              <span>{visiblePrioritySummary.highest ?? 0} highest</span>
              <span>{visiblePrioritySummary.high ?? 0} high</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select value={bulkSuiteTargetId} onChange={(event) => setBulkSuiteTargetId(event.target.value)} className={`${inputClass} min-w-[220px]`}>
                <option value="">Move visible to suite</option>
                {suites.map((suite) => <option key={suite.id} value={suite.id}>{suite.name}</option>)}
              </select>
              <button type="button" onClick={() => void moveVisibleScenariosToSuite()} className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">Move Visible</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void runVisibleScenarios()} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Run Visible</button>
              <button type="button" onClick={() => void updateVisibleScenarioStatuses("paused", "Archived {count} visible scenario(s).")} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Archive Visible</button>
              <button type="button" onClick={() => void updateVisibleScenarioStatuses("ready", "Reactivated {count} visible scenario(s).")} className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">Activate Visible</button>
              <button type="button" onClick={() => void updateVisibleScenarioPriorities("high", "Raised {count} visible scenario(s) to high priority.")} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">High Visible</button>
              <button type="button" onClick={() => void updateVisibleScenarioPriorities("medium", "Normalized {count} visible scenario(s) to medium priority.")} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Medium Visible</button>
              <button type="button" onClick={clearScenarioFilters} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Clear Filters</button>
            </div>
          </article>
          <div className="space-y-4">
            <article className={panel}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Scenarios</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Executable automation tests, independent from manual cases.</p>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{visibleEntries.length} visible</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className={tableClassName}>
                  <thead>
                    <tr>
                      <th className={tableHeaderCellClassName}>Scenario</th>
                      <th className={tableHeaderCellClassName}>Suite</th>
                      <th className={tableHeaderCellClassName}>Priority</th>
                      <th className={tableHeaderCellClassName}>Status</th>
                      <th className={tableHeaderCellClassName}>Environment</th>
                      <th className={tableHeaderCellClassName}>Runs</th>
                      <th className={tableHeaderCellClassName}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.length ? visibleEntries.map((entry) => {
                      const isSelected = selectedEntry?.scenario.id === entry.scenario.id;
                      return (
                        <tr
                          key={entry.scenario.id}
                          onClick={() => setSelectedScenarioId(entry.scenario.id)}
                          className={`cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${isSelected ? "bg-emerald-50/70 dark:bg-emerald-500/10" : ""}`}
                        >
                          <td className={tableBodyCellClassName}>
                            <Link href={getScenarioHref(entry.scenario.id)} className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300">{entry.scenario.name}</Link>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{entry.scenario.description?.trim() || "No description yet."}</p>
                          </td>
                          <td className={tableBodyCellClassName}>{entry.suite?.name ?? "No suite"}</td>
                          <td className={tableBodyCellClassName}>{entry.scenario.priority ?? "medium"}</td>
                          <td className={tableBodyCellClassName}>{entry.scenario.status ?? "draft"}</td>
                          <td className={tableBodyCellClassName}>{entry.scenario.environmentBindingId ? environmentNameById[entry.scenario.environmentBindingId] ?? "Unknown" : "Default Environment"}</td>
                          <td className={tableBodyCellClassName}>{entry.executionCount}</td>
                          <td className={tableBodyCellClassName}>{formatUtcDateTime(entry.scenario.updatedAt)}</td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td className={tableBodyCellClassName} colSpan={7}>No scenarios match the current suite, search, status, and priority filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
            {selectedEntry ? (
              <>
                <div className={panel}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Scenario Scope</p>
                      <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{selectedEntry.scenario.name}</h3>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{selectedEntry.suite?.name ?? "No suite"} | {selectedEntry.linkedRows.length ? `${selectedEntry.linkedRows.length} optional case link(s)` : "No manual links required"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select value={selectedEntry.scenario.suiteId ?? ""} onChange={(event) => void moveScenarioToSuite(selectedEntry.scenario.id, event.target.value)} className={inputClass}>
                        {suites.map((suite) => <option key={suite.id} value={suite.id}>{suite.name}</option>)}
                      </select>
                      <button type="button" onClick={() => void duplicateScenario(selectedEntry)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Duplicate</button>
                      <button type="button" onClick={() => void toggleScenarioArchive(selectedEntry)} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{selectedEntry.scenario.status === "paused" ? "Reactivate" : "Archive"}</button>
                      <button type="button" onClick={() => void deleteScenario(selectedEntry)} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">Delete</button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <select value={selectedEntry.scenario.priority ?? "medium"} onChange={(event) => void updateScenarioMetadata(selectedEntry.scenario.id, { priority: event.target.value as AutomationScenarioPriority })} className={inputClass}>
                      <option value="highest">Highest Priority</option>
                      <option value="high">High Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>
                    <select value={selectedEntry.scenario.status ?? "draft"} onChange={(event) => void updateScenarioMetadata(selectedEntry.scenario.id, { status: event.target.value as AutomationScenario["status"] })} className={inputClass}>
                      <option value="draft">Draft</option>
                      <option value="ready">Ready</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                    <input
                      key={`${selectedEntry.scenario.id}:${selectedEntry.scenario.updatedAt}`}
                      defaultValue={(selectedEntry.scenario.tags ?? []).join(", ")}
                      onBlur={(event) =>
                        void updateScenarioMetadata(selectedEntry.scenario.id, {
                          tags: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="tags: smoke, login"
                      className={inputClass}
                    />
                  </div>
                </div>
                <CaseAutomationPanel
                  context="automation"
                  row={selectedEntry.row}
                  script={{ id: selectedEntry.scriptId, name: selectedEntry.scenario.name, description: selectedEntry.scenario.description, provider: selectedEntry.scenario.provider, executionMode: selectedEntry.scenario.executionMode, environmentBindingId: selectedEntry.scenario.environmentBindingId }}
                  steps={defaultDataSet ? applyDataSetToSteps(selectedEntry.steps, defaultDataSet) : selectedEntry.steps}
                  latestExecution={selectedEntry.latestExecution}
                  latestArtifacts={selectedEntry.latestArtifacts}
                  projectRouteRef={projectKey}
                  scheduleHref={`/projects/${encodedProjectKey}/automation/schedules?scenarioId=${encodeURIComponent(selectedEntry.scenario.id)}`}
                  actions={actions}
                  reusableBlocks={reusableBlocks}
                  selectorPresets={selectorPresets}
                  environments={environments}
                  activeEnvironmentId={activeEnvironmentId}
                  onSave={(payload) => void saveScenario(selectedEntry.scenario.id, payload)}
                  onSaveReuseLibrary={(payload) => void saveReuseLibrary(payload)}
                  onRun={() => runScenario(selectedEntry, { dataSetId: defaultDataSet?.id })}
                  onRunWithOptions={(payload) => runScenario(selectedEntry, { executionMode: payload.executionMode, dataSetId: defaultDataSet?.id })}
                  executionStreamRequest={{
                    projectId: project.id,
                    scenarioId: selectedEntry.scenario.id,
                    dataSetId: defaultDataSet?.id,
                  }}
                  onExecutionFinished={async ({ execution, executions }) => {
                    await reloadProject();
                    setSelectedScenarioId(selectedEntry.scenario.id);
                    const nextExecutionId =
                      executions[executions.length - 1]?.id ?? execution?.id ?? null;
                    if (nextExecutionId) {
                      setSelectedExecutionId(nextExecutionId);
                    }
                  }}
                />
              </>
            ) : <div className={panel}>Select a scenario.</div>}
          </div>
        </section>
      ) : null}
      {section === "test-data" ? (
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <article className={panel}><div className="space-y-3">{visibleEntries.length ? visibleEntries.map(renderEntryButton) : <div className="rounded-[18px] border border-dashed border-zinc-200/80 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">No scenarios match the current filters.</div>}</div></article>
          <div className="space-y-4">
            {selectedEntry ? (
              <>
                <article className={panel}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <input value={dataSetName} onChange={(event) => setDataSetName(event.target.value)} placeholder="Data set name" className={inputClass} />
                    <select value={selectedEntry.scenario.parameterizationMode ?? "default-only"} onChange={(event) => void updateParameterizationMode(selectedEntry.scenario.id, event.target.value as AutomationScenarioParameterizationMode)} className={inputClass}>
                      <option value="default-only">Default only</option>
                      <option value="selected-dataset">Selected data set</option>
                      <option value="all-datasets">All data sets</option>
                    </select>
                    <input value={dataSetDescription} onChange={(event) => setDataSetDescription(event.target.value)} placeholder="Description" className={`${inputClass} lg:col-span-2`} />
                    <textarea value={dataSetVariables} onChange={(event) => setDataSetVariables(event.target.value)} placeholder="username=valid_user&#10;password=valid_password" className={`${inputClass} min-h-[180px] lg:col-span-2`} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveDataSet()} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Save Data Set</button>
                    {selectedDataSetId ? <button type="button" onClick={() => void deleteDataSet(selectedDataSetId)} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">Delete Data Set</button> : null}
                    <button type="button" onClick={() => void runScenario(selectedEntry, { dataSetId: defaultDataSet?.id })} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Run Selected</button>
                    <button type="button" onClick={() => void runScenario(selectedEntry, { runAllDataSets: true })} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Run All</button>
                  </div>
                </article>
                <article className={panel}>
                  <div className="space-y-3">
                    {selectedDataSets.map((dataSet) => (
                      <div key={dataSet.id} className={card}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-zinc-950 dark:text-zinc-50">{dataSet.name}</p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{summarizeScenarioDataSet(dataSet)}</p>
                          </div>
                          <button type="button" onClick={() => { setSelectedDataSetId(dataSet.id); setDataSetName(dataSet.name); setDataSetDescription(dataSet.description ?? ""); setDataSetVariables(toVariableText(dataSet.variables)); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Edit</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </>
            ) : <div className={panel}>Select a scenario.</div>}
          </div>
        </section>
      ) : null}
      {section === "runs" || section === "playback" || section === "failures" ? (
        <section className="space-y-4">
          <article className={panel}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  {section === "playback" ? "Replay" : section === "failures" ? "Failures" : "Runs"}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Automation-first execution history for suites and scenarios, including parameterized dataset runs.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:min-w-[520px]">
                <input
                  value={executionSearch}
                  onChange={(event) => setExecutionSearch(event.target.value)}
                  placeholder="Search scenario, suite, dataset, environment, run id"
                  className={inputClass}
                />
                <select
                  value={executionStatusFilter}
                  onChange={(event) =>
                    setExecutionStatusFilter(
                      event.target.value as "all" | "passed" | "failed" | "blocked"
                    )
                  }
                  className={inputClass}
                >
                  <option value="all">All statuses</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className={tableClassName}>
                <thead>
                  <tr>
                    <th className={tableHeaderCellClassName}>Status</th>
                    <th className={tableHeaderCellClassName}>Scenario</th>
                    <th className={tableHeaderCellClassName}>Suite</th>
                    <th className={tableHeaderCellClassName}>Dataset</th>
                    <th className={tableHeaderCellClassName}>Environment</th>
                    <th className={tableHeaderCellClassName}>Started</th>
                    <th className={tableHeaderCellClassName}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {playbackExecutions.length ? (
                    playbackExecutions.map((execution) => {
                      const detailHref =
                        section === "playback"
                          ? getPlaybackHref(execution.id)
                          : getRunHref(execution.id);
                      const executionEntry =
                        entries.find(
                          (entry) =>
                            entry.scenario.id === execution.scenarioId ||
                            entry.scriptId === execution.scriptId
                        ) ?? null;
                      const environmentLabel =
                        execution.environmentName ||
                        (execution.environmentBindingId
                          ? environmentNameById[execution.environmentBindingId] ?? "Unknown"
                          : executionEntry?.scenario.environmentBindingId
                            ? environmentNameById[executionEntry.scenario.environmentBindingId] ?? "Unknown"
                            : "Default Environment");

                      return (
                        <tr
                          key={execution.id}
                          onClick={() => setSelectedExecutionId(execution.id)}
                          className={`cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${
                            selectedExecution?.id === execution.id
                              ? "bg-emerald-50/70 dark:bg-emerald-500/10"
                              : ""
                          }`}
                        >
                          <td className={tableBodyCellClassName}>
                            <span className={`${badge} ${statusTone[execution.status]}`}>
                              {execution.status}
                            </span>
                          </td>
                          <td className={tableBodyCellClassName}>
                            <Link
                              href={detailHref}
                              className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
                            >
                              {execution.scenarioName ?? executionEntry?.scenario.name ?? execution.caseId}
                            </Link>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              Run ID {execution.runId}
                            </p>
                          </td>
                          <td className={tableBodyCellClassName}>{execution.suiteName ?? executionEntry?.suite?.name ?? "No suite"}</td>
                          <td className={tableBodyCellClassName}>{execution.dataSetName ?? "Default dataset"}</td>
                          <td className={tableBodyCellClassName}>{environmentLabel}</td>
                          <td className={tableBodyCellClassName}>{formatUtcDateTime(execution.startedAt)}</td>
                          <td className={tableBodyCellClassName}>{formatExecutionDuration(execution)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className={tableBodyCellClassName} colSpan={7}>
                        No automation runs match the current filters yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {selectedExecution ? (
            <>
              <article className={panel}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Run Detail
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {selectedExecution.scenarioName ?? selectedExecutionEntry?.scenario.name ?? selectedExecution.caseId}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {formatUtcDateTime(selectedExecution.startedAt)} | Run ID {selectedExecution.runId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedExecution.scenarioId ? (
                      <Link
                        href={getScenarioHref(selectedExecution.scenarioId)}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
                      >
                        Open Scenario
                      </Link>
                    ) : null}
                    <Link
                      href={section === "playback" ? getPlaybackHref(selectedExecution.id) : getRunHref(selectedExecution.id)}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
                    >
                      Open Detail Route
                    </Link>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className={card}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Status</p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{selectedExecution.status}</p>
                  </div>
                  <div className={card}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Dataset</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{selectedExecution.dataSetName ?? "Default dataset"}</p>
                  </div>
                  <div className={card}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Environment</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{selectedExecutionEnvironmentName}</p>
                  </div>
                  <div className={card}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Execution Mode</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{selectedExecution.executionMode ?? "headless"}</p>
                  </div>
                  <div className={card}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Duration</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{formatExecutionDuration(selectedExecution)}</p>
                  </div>
                </div>
              </article>

              <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <article className={panel}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        {section === "playback" ? "Replay Timeline" : "Execution Timeline"}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        Completed step history with per-step logs, statuses, and failure-point visibility.
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {selectedExecutionStepResults.length} step result(s)
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedExecutionStepResults.length ? (
                      selectedExecutionStepResults.map((stepResult) => {
                        const failed =
                          stepResult.status === "failed" || stepResult.status === "blocked";
                        const isFailurePoint =
                          selectedExecutionFailureStepId &&
                          (stepResult.sourceStepId ?? stepResult.stepId) === selectedExecutionFailureStepId;
                        return (
                          <div
                            key={`${stepResult.stepId}-${stepResult.stepIndex}`}
                            className={`rounded-[22px] border px-4 py-4 ${
                              failed
                                ? "border-rose-200 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-500/10"
                                : stepResult.status === "passed"
                                  ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                                  : "border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950/70"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                                  Step {stepResult.stepIndex + 1}
                                  {stepResult.referenceLabel ? ` · ${stepResult.referenceLabel}` : ""}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {stepResult.targetValue || stepResult.action}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {isFailurePoint ? (
                                  <span className="rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-200">
                                    failure point
                                  </span>
                                ) : null}
                                <span
                                  className={`${badge} ${
                                    statusTone[
                                      stepResult.status === "passed"
                                        ? "passed"
                                        : stepResult.status === "blocked"
                                          ? "blocked"
                                          : stepResult.status === "failed"
                                            ? "failed"
                                            : "not-run"
                                    ]
                                  }`}
                                >
                                  {stepResult.status}
                                </span>
                              </div>
                            </div>
                            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">
                              {stepResult.failureReason || stepResult.message || "Step result captured."}
                            </p>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-300">
                                <p className="font-semibold text-zinc-500 dark:text-zinc-400">Started</p>
                                <p className="mt-1">{stepResult.startedAt ? formatUtcDateTime(stepResult.startedAt) : "n/a"}</p>
                              </div>
                              <div className="rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-300">
                                <p className="font-semibold text-zinc-500 dark:text-zinc-400">Duration</p>
                                <p className="mt-1">{stepResult.durationMs ? `${stepResult.durationMs} ms` : "n/a"}</p>
                              </div>
                              <div className="rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-300">
                                <p className="font-semibold text-zinc-500 dark:text-zinc-400">Origin</p>
                                <p className="mt-1">{stepResult.origin ?? "local-step"}</p>
                              </div>
                            </div>
                            {stepResult.logLines?.length ? (
                              <pre className="mt-3 overflow-x-auto rounded-2xl bg-zinc-950 px-3 py-3 text-[11px] leading-5 text-zinc-100">
                                {stepResult.logLines.join("\n")}
                              </pre>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-400">
                        No step replay data is available for this run.
                      </div>
                    )}
                  </div>
                </article>

                <div className="space-y-4">
                  <article className={panel}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Run Summary</p>
                    <div className="mt-4 space-y-3">
                      <div className={card}>
                        <p className="font-semibold text-zinc-950 dark:text-zinc-50">Suite</p>
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{selectedExecution.suiteName ?? selectedExecutionEntry?.suite?.name ?? "No suite"}</p>
                      </div>
                      <div className={card}>
                        <p className="font-semibold text-zinc-950 dark:text-zinc-50">Parameterized Variables</p>
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                          {selectedExecution.dataSetVariables
                            ? Object.entries(selectedExecution.dataSetVariables)
                                .map(([key, value]) => `${key}=${value}`)
                                .join(", ")
                            : "No dataset variables captured."}
                        </p>
                      </div>
                    </div>
                  </article>
                  <article className={panel}>
                    <AutomationArtifactViewer
                      execution={selectedExecution}
                      artifacts={selectedExecutionArtifacts}
                    />
                  </article>
                </div>
              </section>
            </>
          ) : (
            <div className={panel}>Select a run.</div>
          )}
        </section>
      ) : null}
      {section === "reports" ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Suites", suites.length],
              ["Scenarios", scenarios.length],
              ["Runs", executions.length],
              ["Pass Rate", `${passRate}%`],
              ["Failed Runs", failedExecutions.length],
            ].map(([label, value]) => <article key={String(label)} className={card}><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{value}</p></article>)}
          </section>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <article className={panel}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Pass / Fail Trend</p>
                  <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Recent automation run health</h3>
                </div>
                <span className={`${badge} ${statusTone[failedExecutions.length ? "failed" : "passed"]}`}>
                  {failedExecutions.length ? `${failedExecutions.length} failure(s)` : "Healthy"}
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {reportTrendBuckets.length ? reportTrendBuckets.map((bucket) => {
                  const passedWidth = bucket.total ? Math.round((bucket.passed / bucket.total) * 100) : 0;
                  const failedWidth = bucket.total ? Math.round((bucket.failed / bucket.total) * 100) : 0;
                  const blockedWidth = Math.max(0, 100 - passedWidth - failedWidth);
                  return (
                    <div key={bucket.date} className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)_160px] sm:items-center">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{bucket.date}</p>
                      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div className="bg-emerald-500" style={{ width: `${passedWidth}%` }} />
                        <div className="bg-rose-500" style={{ width: `${failedWidth}%` }} />
                        <div className="bg-amber-400" style={{ width: `${blockedWidth}%` }} />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {bucket.passed} passed / {bucket.failed + bucket.blocked} failed
                      </p>
                    </div>
                  );
                }) : <div className="text-sm text-zinc-500 dark:text-zinc-400">No automation runs recorded yet.</div>}
              </div>
            </article>
            <article className={panel}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Recent Scheduled Runs</p>
              <div className="mt-4 space-y-3">
                {latestScheduledRuns.length ? latestScheduledRuns.map((execution) => (
                  <Link key={execution.id} href={getRunHref(execution.id)} className={`${card} block transition hover:bg-white dark:hover:bg-zinc-900`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-zinc-950 dark:text-zinc-50">{execution.scheduleName ?? "Scheduled run"}</p>
                      <span className={`${badge} ${statusTone[execution.status]}`}>{execution.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {execution.scenarioName ?? execution.suiteName ?? execution.runId} | {formatUtcDateTime(execution.startedAt)}
                    </p>
                  </Link>
                )) : <div className="text-sm text-zinc-500 dark:text-zinc-400">No scheduled runs have completed yet.</div>}
              </div>
            </article>
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <article className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Suite Health</p>
                <Link href={`/projects/${encodedProjectKey}/automation/suites`} className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Open suites</Link>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className={tableClassName}>
                  <thead>
                    <tr>
                      <th className={tableHeaderCellClassName}>Suite</th>
                      <th className={tableHeaderCellClassName}>Scenarios</th>
                      <th className={tableHeaderCellClassName}>Runs</th>
                      <th className={tableHeaderCellClassName}>Pass Rate</th>
                      <th className={tableHeaderCellClassName}>Latest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suiteHealthRows.length ? suiteHealthRows.map((row) => (
                      <tr key={row.id}>
                        <td className={tableBodyCellClassName}>
                          <Link href={getSuiteHref(row.id)} className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300">{row.name}</Link>
                          <p className="mt-1 text-xs capitalize text-zinc-500 dark:text-zinc-400">{row.status}</p>
                        </td>
                        <td className={tableBodyCellClassName}>{row.scenarioCount}</td>
                        <td className={tableBodyCellClassName}>{row.runCount}</td>
                        <td className={tableBodyCellClassName}>{row.runCount ? `${row.passRate}%` : "No runs"}</td>
                        <td className={tableBodyCellClassName}>{row.latestRun ? formatUtcDateTime(row.latestRun.startedAt) : "Not run"}</td>
                      </tr>
                    )) : (
                      <tr><td className={tableBodyCellClassName} colSpan={5}>No suites created yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
            <article className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Scenario Health</p>
                <Link href={`/projects/${encodedProjectKey}/automation/scenarios`} className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Open scenarios</Link>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className={tableClassName}>
                  <thead>
                    <tr>
                      <th className={tableHeaderCellClassName}>Scenario</th>
                      <th className={tableHeaderCellClassName}>Suite</th>
                      <th className={tableHeaderCellClassName}>Datasets</th>
                      <th className={tableHeaderCellClassName}>Runs</th>
                      <th className={tableHeaderCellClassName}>Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioHealthRows.length ? scenarioHealthRows.slice(0, 8).map((row) => (
                      <tr key={row.id}>
                        <td className={tableBodyCellClassName}>
                          <Link href={getScenarioHref(row.id)} className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300">{row.name}</Link>
                          <p className="mt-1 text-xs capitalize text-zinc-500 dark:text-zinc-400">{row.priority} | {row.status}</p>
                        </td>
                        <td className={tableBodyCellClassName}>{row.suiteName}</td>
                        <td className={tableBodyCellClassName}>{row.datasetCount}</td>
                        <td className={tableBodyCellClassName}>{row.runCount}</td>
                        <td className={tableBodyCellClassName}>{row.runCount ? `${row.passRate}%` : "No runs"}</td>
                      </tr>
                    )) : (
                      <tr><td className={tableBodyCellClassName} colSpan={5}>No scenarios created yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <article className={panel}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Dataset-Specific Failures</p>
              <div className="mt-4 overflow-x-auto">
                <table className={tableClassName}>
                  <thead>
                    <tr>
                      <th className={tableHeaderCellClassName}>Dataset</th>
                      <th className={tableHeaderCellClassName}>Scenario</th>
                      <th className={tableHeaderCellClassName}>Failures</th>
                      <th className={tableHeaderCellClassName}>Latest Failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datasetFailureRows.length ? datasetFailureRows.slice(0, 8).map((row) => (
                      <tr key={row.key}>
                        <td className={tableBodyCellClassName}>
                          <p className="font-semibold text-zinc-950 dark:text-zinc-50">{row.dataSetName}</p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.totalRuns} dataset run(s)</p>
                        </td>
                        <td className={tableBodyCellClassName}>
                          {row.scenarioId ? <Link href={getScenarioHref(row.scenarioId)} className="font-semibold hover:text-emerald-700 dark:hover:text-emerald-300">{row.scenarioName}</Link> : row.scenarioName}
                        </td>
                        <td className={tableBodyCellClassName}>{row.failures}</td>
                        <td className={tableBodyCellClassName}>
                          {row.latestFailure ? <Link href={getPlaybackHref(row.latestFailure.id)} className="font-semibold text-rose-700 dark:text-rose-300">{formatUtcDateTime(row.latestFailure.startedAt)}</Link> : "None"}
                        </td>
                      </tr>
                    )) : (
                      <tr><td className={tableBodyCellClassName} colSpan={4}>No dataset failures recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
            <article className={panel}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Environment Breakdown</p>
              <div className="mt-4 overflow-x-auto">
                <table className={tableClassName}>
                  <thead>
                    <tr>
                      <th className={tableHeaderCellClassName}>Environment</th>
                      <th className={tableHeaderCellClassName}>Runs</th>
                      <th className={tableHeaderCellClassName}>Failures</th>
                      <th className={tableHeaderCellClassName}>Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {environmentRunRows.length ? environmentRunRows.map((row) => (
                      <tr key={row.key}>
                        <td className={tableBodyCellClassName}>
                          <p className="font-semibold text-zinc-950 dark:text-zinc-50">{row.name}</p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.latestRun ? `Last run ${formatUtcDateTime(row.latestRun.startedAt)}` : "No runs"}</p>
                        </td>
                        <td className={tableBodyCellClassName}>{row.runCount}</td>
                        <td className={tableBodyCellClassName}>{row.failures}</td>
                        <td className={tableBodyCellClassName}>{row.passRate}%</td>
                      </tr>
                    )) : (
                      <tr><td className={tableBodyCellClassName} colSpan={4}>No environment run data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
          <section className="grid gap-4 xl:grid-cols-3">
            <article className={panel}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Top Failing Scenarios</p>
              <div className="mt-4 space-y-3">
                {failureByScenario.length ? failureByScenario.slice(0, 6).map((entry) => (
                  <Link key={entry.key} href={entry.scenarioId ? getScenarioHref(entry.scenarioId) : `/projects/${encodedProjectKey}/automation/scenarios`} className={`${card} block transition hover:bg-white dark:hover:bg-zinc-900`}>
                    <p className="font-semibold text-zinc-950 dark:text-zinc-50">{entry.name}</p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{entry.count} failed or blocked run(s)</p>
                  </Link>
                )) : <div className="text-sm text-zinc-500 dark:text-zinc-400">No scenario failures recorded yet.</div>}
              </div>
            </article>
            <article className={panel}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Top Failing Actions</p>
              <div className="mt-4 space-y-3">
                {topFailingActionRows.length ? topFailingActionRows.map((entry) => (
                  <Link key={entry.key} href={actions.some((action) => action.id === entry.key) ? getActionHref(entry.key) : `/projects/${encodedProjectKey}/automation/actions`} className={`${card} block transition hover:bg-white dark:hover:bg-zinc-900`}>
                    <p className="font-semibold text-zinc-950 dark:text-zinc-50">{entry.name}</p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{entry.failures} failed action step(s)</p>
                  </Link>
                )) : <div className="text-sm text-zinc-500 dark:text-zinc-400">Action failure data appears when run step results include action references.</div>}
              </div>
            </article>
            <article className={panel}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Scenario Mix</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(statusBreakdown).map(([status, count]) => (
                  <div key={status} className={card}>
                    <p className="font-semibold capitalize text-zinc-950 dark:text-zinc-50">{status}</p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{count} scenario(s)</p>
                  </div>
                ))}
                {Object.entries(priorityBreakdown).map(([priority, count]) => (
                  <div key={priority} className={card}>
                    <p className="font-semibold capitalize text-zinc-950 dark:text-zinc-50">{priority}</p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{count} priority scenario(s)</p>
                  </div>
                ))}
                {flakyScenarios.length ? (
                  <div className={card}>
                    <p className="font-semibold text-zinc-950 dark:text-zinc-50">Flaky</p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{flakyScenarios.length} mixed-result scenario(s)</p>
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        </>
      ) : null}
      {section === "environments" ? (
        <section className={panel}>
          <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Environments</h3><button type="button" onClick={() => setIsEnvironmentEditorOpen(true)} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">Manage</button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{environments.map((entry) => <div key={entry.id} className={card}><p className="font-semibold text-zinc-950 dark:text-zinc-50">{entry.name}</p><p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{entry.baseUrl?.trim() || "Base URL not set"}</p></div>)}</div>
        </section>
      ) : null}
      {section === "actions" ? (
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <article className={panel}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Action Catalog</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Reusable low-code methods that scenarios can call with mapped inputs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createAction()}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
              >
                New Action
              </button>
            </div>
            <input
              value={actionSearch}
              onChange={(event) => setActionSearch(event.target.value)}
              placeholder="Search actions"
              className={`${inputClass} mt-4`}
            />
            <div className="mt-4 space-y-3">
              {filteredActions.length ? (
                filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => setSelectedActionId(action.id)}
                    className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                      selectedAction?.id === action.id
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                        : "border-zinc-200/80 bg-zinc-50/80 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={getActionHref(action.id)}
                        className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
                      >
                        {action.name}
                      </Link>
                      <span className={`${badge} ${statusTone["not-run"]}`}>
                        {actionUsageCounts[action.id] ?? 0} use(s)
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {(action.tags ?? []).join(", ") || "No tags"} |{" "}
                      {action.parameters?.length ?? 0} parameter(s) | {action.steps.length} step(s)
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-zinc-200/80 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  No actions match the current search.
                </div>
              )}
            </div>
          </article>
          <div className="space-y-4">
            {selectedAction ? (
              <>
                <article className={panel}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Action Details</p>
                      <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                        {selectedAction.name}
                      </h3>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        Action calls expand through the existing structured execution engine for backward compatibility.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveAction()}
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                      >
                        Save Action
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAction(selectedAction)}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"
                      >
                        Delete Action
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <input
                      value={actionName}
                      onChange={(event) => setActionName(event.target.value)}
                      placeholder="Action name"
                      className={inputClass}
                    />
                    <input
                      value={actionTags}
                      onChange={(event) => setActionTags(event.target.value)}
                      placeholder="tags: auth, smoke, shared"
                      className={inputClass}
                    />
                    <textarea
                      value={actionDescription}
                      onChange={(event) => setActionDescription(event.target.value)}
                      placeholder="Describe what this action does."
                      className={`${inputClass} min-h-[120px] lg:col-span-2`}
                    />
                    <textarea
                      value={actionParameters}
                      onChange={(event) => setActionParameters(event.target.value)}
                      placeholder={"username\npassword\nmoduleName=Sales"}
                      className={`${inputClass} min-h-[160px] lg:col-span-2`}
                    />
                  </div>
                </article>
                <article className={panel}>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{actionDraftSteps.length} step(s)</span>
                    <span>{selectedAction.parameters?.length ?? 0} saved parameter(s)</span>
                    <span>{actionUsageCounts[selectedAction.id] ?? 0} scenario call(s)</span>
                  </div>
                  <AutomationStepForm
                    steps={actionDraftSteps}
                    selectedStepId={selectedActionStepId}
                    onSelectStep={setSelectedActionStepId}
                    onChange={updateActionSteps}
                    onAddStep={addActionStep}
                    onDeleteStep={deleteActionStep}
                    onMoveStep={moveActionStep}
                    onInsertTemplate={insertActionTemplate}
                    onInsertSharedBlock={() => undefined}
                    actions={[]}
                    reusableBlocks={[]}
                    selectorPresets={selectorPresets}
                    provider={selectedAction.provider}
                    validationIssues={[]}
                    stepResults={[]}
                  />
                </article>
              </>
            ) : (
              <div className={panel}>Create an action to start building reusable automation methods.</div>
            )}
          </div>
        </section>
      ) : null}
      {section === "schedules" ? (
        <section className="space-y-4">
          <article className={panel}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Schedules
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Unattended automation schedules for scenarios and suites, designed for hosted worker execution.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runDueSchedulesNow()}
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800"
                >
                  Run Due Now
                </button>
                <button
                  type="button"
                  onClick={resetScheduleEditor}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700"
                >
                  New Schedule
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className={tableClassName}>
                <thead>
                  <tr>
                    <th className={tableHeaderCellClassName}>Schedule</th>
                    <th className={tableHeaderCellClassName}>Scope</th>
                    <th className={tableHeaderCellClassName}>Environment</th>
                    <th className={tableHeaderCellClassName}>Status</th>
                    <th className={tableHeaderCellClassName}>Next Run</th>
                    <th className={tableHeaderCellClassName}>Last Run</th>
                    <th className={tableHeaderCellClassName}>Last Result</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSchedules.length ? (
                    sortedSchedules.map((item) => {
                      const scheduleScenario =
                        item.scenarioId
                          ? entries.find((entry) => entry.scenario.id === item.scenarioId) ?? null
                          : null;
                      const scheduleSuite =
                        item.suiteId ? suites.find((suite) => suite.id === item.suiteId) ?? null : null;
                      const lastExecution =
                        item.lastExecutionId
                          ? executions.find((execution) => execution.id === item.lastExecutionId) ?? null
                          : null;
                      const environmentLabel = item.environmentBindingId
                        ? environmentNameById[item.environmentBindingId] ?? "Unknown"
                        : scheduleScenario?.scenario.environmentBindingId
                          ? environmentNameById[scheduleScenario.scenario.environmentBindingId] ?? "Unknown"
                          : scheduleSuite?.environmentBindingId
                            ? environmentNameById[scheduleSuite.environmentBindingId] ?? "Unknown"
                            : "Default Environment";
                      return (
                        <tr
                          key={item.id}
                          onClick={() => selectScheduleForEditing(item)}
                          className={`cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${
                            selectedSchedule?.id === item.id
                              ? "bg-emerald-50/70 dark:bg-emerald-500/10"
                              : ""
                          }`}
                        >
                          <td className={tableBodyCellClassName}>
                            <p className="font-semibold text-zinc-950 dark:text-zinc-50">{item.name}</p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.frequency}</p>
                          </td>
                          <td className={tableBodyCellClassName}>
                            {item.suiteId
                              ? `Suite · ${scheduleSuite?.name ?? item.suiteId}`
                              : `Scenario · ${scheduleScenario?.scenario.name ?? item.scenarioId ?? "Unknown"}`}
                          </td>
                          <td className={tableBodyCellClassName}>{environmentLabel}</td>
                          <td className={tableBodyCellClassName}>
                            <span className={`${badge} ${item.status === "failed" ? statusTone.failed : item.status === "completed" ? statusTone.passed : item.status === "paused" ? statusTone.blocked : statusTone["not-run"]}`}>
                              {item.status ?? (item.isEnabled ? "scheduled" : "paused")}
                            </span>
                          </td>
                          <td className={tableBodyCellClassName}>
                            {item.nextRunAt ? formatUtcDateTime(item.nextRunAt) : "Not scheduled"}
                          </td>
                          <td className={tableBodyCellClassName}>
                            {item.lastRunAt ? formatUtcDateTime(item.lastRunAt) : "Never"}
                          </td>
                          <td className={tableBodyCellClassName}>
                            {lastExecution ? (
                              <Link
                                href={getRunHref(lastExecution.id)}
                                className="font-semibold text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
                              >
                                {item.lastRunStatus ?? lastExecution.status}
                              </Link>
                            ) : (
                              item.lastRunStatus ?? "No runs yet"
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className={tableBodyCellClassName} colSpan={7}>
                        No unattended schedules have been created yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <article className={panel}>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setScheduleTargetType("scenario")} className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${scheduleTargetType === "scenario" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-700"}`}>Scenario</button>
                <button type="button" onClick={() => setScheduleTargetType("suite")} className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${scheduleTargetType === "suite" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-700"}`}>Suite</button>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} placeholder="Schedule name" className={inputClass} />
                <select value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value as AutomationScheduleFrequency)} className={inputClass}><option value="once">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom">Custom</option></select>
                <select value={scheduleExecutionMode} onChange={(event) => setScheduleExecutionMode(event.target.value as AutomationExecutionMode)} className={inputClass}><option value="headless">Headless</option><option value="headed">Headed</option></select>
                <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} className={inputClass} />
                {scheduleFrequency === "custom" ? <input value={scheduleCronExpression} onChange={(event) => setScheduleCronExpression(event.target.value)} placeholder="Cron expression (next run uses stored nextRunAt)" className={`${inputClass} lg:col-span-2`} /> : null}
              </div>
              <div className="mt-4 space-y-3">
                {scheduleTargetType === "scenario" ? (
                  <div className="space-y-3">
                    {visibleEntries.length ? visibleEntries.slice(0, 8).map(renderEntryButton) : <div className="rounded-[18px] border border-dashed border-zinc-200/80 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">No scenarios match the current filters.</div>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {suites.map((suite) => (
                      <button key={suite.id} type="button" onClick={() => setSelectedSuiteId(suite.id)} className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${selectedSuite?.id === suite.id ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-zinc-200/80 bg-zinc-50/80 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"}`}>
                        <p className="font-semibold text-zinc-950 dark:text-zinc-50">{suite.name}</p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{entries.filter((entry) => entry.scenario.suiteId === suite.id || suite.scenarioIds?.includes(entry.scenario.id)).length} scenario(s)</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(scheduleTargetType === "scenario" ? selectedEntry : selectedSuite) ? (
                <>
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
                    {scheduleTargetType === "scenario"
                      ? `Target: ${selectedEntry?.scenario.name}${defaultDataSet ? ` | dataset ${defaultDataSet.name}` : ""}`
                      : `Target suite: ${selectedSuite?.name}`}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveSchedule()} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">{selectedScheduleId ? "Update Schedule" : "Save Schedule"}</button>
                    {selectedSchedule ? (
                      <>
                        <button type="button" onClick={() => void toggleScheduleEnabled(selectedSchedule)} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700">{selectedSchedule.isEnabled ? "Pause" : "Enable"}</button>
                        <button type="button" onClick={() => void deleteSchedule(selectedSchedule.id)} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">Delete</button>
                      </>
                    ) : null}
                  </div>
                </>
              ) : <div className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Select a {scheduleTargetType} to configure unattended execution.</div>}
            </article>

            <div className="space-y-4">
              <article className={panel}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Selected Schedule</p>
                {selectedSchedule ? (
                  <div className="mt-4 space-y-3">
                    <div className={card}>
                      <p className="font-semibold text-zinc-950 dark:text-zinc-50">{selectedSchedule.name}</p>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {selectedSchedule.suiteId ? "Suite schedule" : "Scenario schedule"} · {selectedSchedule.frequency}
                      </p>
                    </div>
                    <div className={card}>
                      <p className="font-semibold text-zinc-950 dark:text-zinc-50">Status</p>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {(selectedSchedule.status ?? (selectedSchedule.isEnabled ? "scheduled" : "paused"))}
                        {selectedSchedule.lastError ? ` · ${selectedSchedule.lastError}` : ""}
                      </p>
                    </div>
                    <div className={card}>
                      <p className="font-semibold text-zinc-950 dark:text-zinc-50">Next / Last</p>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {selectedSchedule.nextRunAt ? `Next ${formatUtcDateTime(selectedSchedule.nextRunAt)}` : "No next run"}<br />
                        {selectedSchedule.lastRunAt ? `Last ${formatUtcDateTime(selectedSchedule.lastRunAt)}` : "No completed runs yet"}
                      </p>
                    </div>
                    {selectedSchedule.lastExecutionId ? (
                      <Link href={getRunHref(selectedSchedule.lastExecutionId)} className="inline-flex rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700">
                        Open Last Result
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Select a saved schedule to inspect its status and latest unattended result.</p>
                )}
              </article>

              <article className={panel}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Morning-Ready Results</p>
                <div className="mt-4 space-y-3">
                  {scheduledExecutions.length ? scheduledExecutions.slice(0, 6).map((execution) => (
                    <div key={execution.id} className={card}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-zinc-950 dark:text-zinc-50">{execution.scheduleName ?? execution.scenarioName ?? execution.caseId}</p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatUtcDateTime(execution.startedAt)}{execution.dataSetName ? ` | ${execution.dataSetName}` : ""}</p>
                        </div>
                        <span className={`${badge} ${statusTone[execution.status]}`}>{execution.status}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={getRunHref(execution.id)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Run Detail</Link>
                        <Link href={getPlaybackHref(execution.id)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">Replay</Link>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[18px] border border-dashed border-zinc-200/80 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      Scheduled results will appear here after unattended runs complete.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        </section>
      ) : null}
      {section === "links" ? (
        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <article className={panel}><div className="space-y-3">{visibleEntries.length ? visibleEntries.map(renderEntryButton) : <div className="rounded-[18px] border border-dashed border-zinc-200/80 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">No scenarios match the current filters.</div>}</div></article>
          <article className={panel}>
            {selectedEntry ? (
              <div className="space-y-3">
                {rows.map((row) => {
                  const linked = selectedEntry.linkedRows.some((entry) => entry.id === row.id);
                  return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70"><div><p className="font-semibold text-zinc-950 dark:text-zinc-50">{row.id} | {row.title || "Untitled case"}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.type}</p></div><button type="button" onClick={() => linked ? void unlinkScenarioFromCase(selectedEntry.scenario.id, row.id) : void linkScenarioToCase(selectedEntry.scenario.id, row.id)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700">{linked ? "Unlink" : "Link To Case"}</button></div>;
                })}
              </div>
            ) : <div className="text-sm text-zinc-500 dark:text-zinc-400">Select a scenario.</div>}
          </article>
        </section>
      ) : null}
      </div>
      <OverlayFormShell eyebrow="Automation Environment" title="Manage environment" description="Edit safe base URLs, route aliases, and credential aliases." open={isEnvironmentEditorOpen} onClose={() => setIsEnvironmentEditorOpen(false)} actions={<button type="button" onClick={() => void saveEnvironment()} className="min-h-[42px] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">Save Environment</button>}>
        <div className="grid gap-3 lg:grid-cols-2">
          <input value={environmentName} onChange={(event) => setEnvironmentName(event.target.value)} placeholder="Environment name" className={`${inputClass} lg:col-span-2`} />
          <input value={environmentBaseUrl} onChange={(event) => setEnvironmentBaseUrl(event.target.value)} placeholder="Base URL" className={inputClass} />
          <input value={environmentCredentialAliases} onChange={(event) => setEnvironmentCredentialAliases(event.target.value)} placeholder="Credential aliases" className={inputClass} />
          <input value={environmentLoginRoute} onChange={(event) => setEnvironmentLoginRoute(event.target.value)} placeholder="Login route" className={inputClass} />
          <input value={environmentDashboardRoute} onChange={(event) => setEnvironmentDashboardRoute(event.target.value)} placeholder="Dashboard route" className={inputClass} />
        </div>
      </OverlayFormShell>
    </div>
  );
}
