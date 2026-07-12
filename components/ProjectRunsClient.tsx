"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectIssueState } from "./ProjectIssueStateContext";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useProjectRouteMetrics } from "./ProjectRouteMetricsContext";
import { buildBugDraftFromRunCase, type BugDraft } from "../utils/bug-draft";
import { splitCaseSteps } from "../utils/parser";
import {
  PrimaryToolbar,
  QuickFilters,
  SavedViewsSection,
  WorkflowShortcutsSection,
} from "./FilterWorkspaceSections";
import type {
  AutomationExecution,
  AutomationExecutionArtifact,
  RunsSavedView,
  Project,
  TestCaseExecutionResult,
  TestRunRecord,
} from "../utils/workspace";

type Props = {
  projectKey: string;
  initialProject: Project | null;
};

type StepDraftState = {
  note: string;
  actual: string;
  evidence: string;
};

const executionTone: Record<TestCaseExecutionResult, string> = {
  "not-run":
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  passed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  failed:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  blocked:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
};

const executionBarTone: Record<TestCaseExecutionResult, string> = {
  "not-run": "bg-zinc-400",
  passed: "bg-emerald-500",
  failed: "bg-rose-500",
  blocked: "bg-amber-500",
};

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
} | null;

const normalizeRuns = (project: Project | null) => project?.runs ?? [];

export default function ProjectRunsClient({ projectKey, initialProject }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sharedIssueState = useProjectIssueState();
  const projectDataState = useProjectDataState();
  const metrics = useProjectRouteMetrics();
  const [project, setProject] = useState<Project | null>(
    projectDataState?.project ?? initialProject
  );
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [executionFilter, setExecutionFilter] = useState<
    TestCaseExecutionResult | ""
  >("");
  const [linkedFilter, setLinkedFilter] = useState<"all" | "linked" | "unlinked">(
    "all"
  );
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [runsDefaultPreset, setRunsDefaultPreset] = useState<
    "default" | "high-risk" | "failed-linked"
  >(initialProject?.viewPreferences?.runsDefaultPreset ?? "default");
  const [runsDefaultSavedViewId, setRunsDefaultSavedViewId] = useState<string | null>(
    initialProject?.viewPreferences?.runsDefaultSavedViewId ?? null
  );
  const [runsSavedViews, setRunsSavedViews] = useState<RunsSavedView[]>(
    initialProject?.savedViews?.runs ?? []
  );
  const [newRunsViewName, setNewRunsViewName] = useState("");
  const [editingRunsViewId, setEditingRunsViewId] = useState<string | null>(null);
  const [editingRunsViewName, setEditingRunsViewName] = useState("");
  const [newRunName, setNewRunName] = useState("");
  const [actualResultDraft, setActualResultDraft] = useState("");
  const [executionNotesDraft, setExecutionNotesDraft] = useState("");
  const [stepDrafts, setStepDrafts] = useState<Record<string, StepDraftState>>({});
  const [bugDraft, setBugDraft] = useState<BugDraft | null>(null);
  const [createdBug, setCreatedBug] = useState<{ id: string; issueKey: string } | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingBug, setIsCreatingBug] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const cameFromRelease = searchParams.get("from") === "release";
  const didApplyRunsDefaultPresetRef = useRef(false);

  const applyRunsPreset = useCallback(
    (preset: "default" | "high-risk" | "failed-linked") => {
      setSearchQuery("");

      if (preset === "high-risk") {
        setExecutionFilter("");
        setLinkedFilter("all");
        setHighRiskOnly(true);
        return;
      }

      if (preset === "failed-linked") {
        setExecutionFilter("failed");
        setLinkedFilter("linked");
        setHighRiskOnly(true);
        return;
      }

      setExecutionFilter("");
      setLinkedFilter("all");
      setHighRiskOnly(false);
    },
    []
  );
  const applySavedRunsView = useCallback((view: RunsSavedView) => {
    setSearchQuery(view.filters.searchQuery);
    setExecutionFilter(view.filters.execution);
    setLinkedFilter(view.filters.linked);
    setHighRiskOnly(view.filters.highRiskOnly);
  }, []);
  const resetRunsFilters = useCallback(() => {
    applyRunsPreset("default");
  }, [applyRunsPreset]);

  const rows = useMemo(() => project?.rows ?? [], [project]);
  const runs = useMemo(() => normalizeRuns(project), [project]);
  const [activeRunId, setActiveRunId] = useState<string>(
    initialProject?.activeRunId || initialProject?.runs?.[0]?.id || ""
  );

  useEffect(() => {
    const nextSearch = searchParams.get("search") ?? "";
    const nextExecution = searchParams.get("execution");
    const nextLinked = searchParams.get("linked");
    const nextFocusedRowId = searchParams.get("rowId");
    const nextRisk = searchParams.get("risk");

    setSearchQuery(nextSearch);
    setExecutionFilter(
      nextExecution === "passed" ||
        nextExecution === "failed" ||
        nextExecution === "blocked" ||
        nextExecution === "not-run"
        ? nextExecution
        : ""
    );
    setLinkedFilter(
      nextLinked === "linked" || nextLinked === "unlinked" ? nextLinked : "all"
    );
    setHighRiskOnly(nextRisk === "high");
    setFocusedRowId(nextFocusedRowId ?? null);
  }, [searchParams]);

  useEffect(() => {
    if (!projectDataState) {
      return;
    }

    setProject(projectDataState.project ?? initialProject);
  }, [initialProject, projectDataState, projectDataState?.project]);

  useEffect(() => {
    setRunsDefaultPreset(project?.viewPreferences?.runsDefaultPreset ?? "default");
    setRunsDefaultSavedViewId(project?.viewPreferences?.runsDefaultSavedViewId ?? null);
    setRunsSavedViews(project?.savedViews?.runs ?? []);
    didApplyRunsDefaultPresetRef.current = false;
  }, [
    project?.id,
    project?.savedViews?.runs,
    project?.viewPreferences?.runsDefaultPreset,
    project?.viewPreferences?.runsDefaultSavedViewId,
  ]);

  useEffect(() => {
    if (didApplyRunsDefaultPresetRef.current) {
      return;
    }

    const hasExplicitRunParams = ["search", "execution", "linked", "risk"].some((key) =>
      searchParams.has(key)
    );

    if (hasExplicitRunParams) {
      didApplyRunsDefaultPresetRef.current = true;
      return;
    }

    if (runsDefaultSavedViewId) {
      const defaultSavedView = runsSavedViews.find(
        (view) => view.id === runsDefaultSavedViewId
      );
      if (defaultSavedView) {
        applySavedRunsView(defaultSavedView);
        didApplyRunsDefaultPresetRef.current = true;
        return;
      }
    }

    applyRunsPreset(runsDefaultPreset);
    didApplyRunsDefaultPresetRef.current = true;
  }, [
    applyRunsPreset,
    applySavedRunsView,
    runsDefaultPreset,
    runsDefaultSavedViewId,
    runsSavedViews,
    searchParams,
  ]);

  useEffect(() => {
    const nextActiveRunId =
      project?.activeRunId || project?.runs?.[0]?.id || "";
    setActiveRunId(nextActiveRunId);
  }, [project]);

  useEffect(() => {
    const requestedRunId = searchParams.get("runId");
    if (!requestedRunId) {
      return;
    }

    if (!runs.some((run) => run.id === requestedRunId)) {
      return;
    }

    if (requestedRunId === activeRunId) {
      return;
    }

    setActiveRunId(requestedRunId);
  }, [activeRunId, runs, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (activeRunId) {
      nextParams.set("runId", activeRunId);
    } else {
      nextParams.delete("runId");
    }

    if (focusedRowId) {
      nextParams.set("rowId", focusedRowId);
    } else {
      nextParams.delete("rowId");
    }

    if (searchQuery.trim()) {
      nextParams.set("search", searchQuery.trim());
    } else {
      nextParams.delete("search");
    }

    if (executionFilter) {
      nextParams.set("execution", executionFilter);
    } else {
      nextParams.delete("execution");
    }

    if (linkedFilter !== "all") {
      nextParams.set("linked", linkedFilter);
    } else {
      nextParams.delete("linked");
    }

    if (highRiskOnly) {
      nextParams.set("risk", "high");
    } else {
      nextParams.delete("risk");
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
    activeRunId,
    executionFilter,
    focusedRowId,
    highRiskOnly,
    linkedFilter,
    pathname,
    router,
    searchParams,
    searchQuery,
  ]);

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? null,
    [activeRunId, runs]
  );

  const rowsForRun = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        executionResult:
          activeRun?.rowResults[row.id] ??
          row.executionResult ??
          "not-run",
      })),
    [activeRun, rows]
  );

  const totalCases = rowsForRun.length;
  const executionCounts = useMemo(
    () =>
      rowsForRun.reduce<Record<string, number>>((accumulator, row) => {
        const key = row.executionResult ?? "not-run";
        accumulator[key] = (accumulator[key] ?? 0) + 1;
        return accumulator;
      }, {}),
    [rowsForRun]
  );

  const focusedRow = useMemo(
    () => rowsForRun.find((row) => row.id === focusedRowId) ?? null,
    [focusedRowId, rowsForRun]
  );
  const latestAutomationExecutionByRowId = useMemo(() => {
    const executions = [...(project?.automationExecutions ?? [])].sort(
      (left, right) => right.startedAt - left.startedAt
    );
    return executions.reduce<Record<string, AutomationExecution>>((accumulator, execution) => {
      if (!accumulator[execution.caseId]) {
        accumulator[execution.caseId] = execution;
      }
      return accumulator;
    }, {});
  }, [project?.automationExecutions]);
  const focusedAutomationExecution = focusedRow
    ? latestAutomationExecutionByRowId[focusedRow.id] ?? null
    : null;
  const focusedAutomationArtifacts = useMemo(
    () =>
      focusedAutomationExecution
        ? (project?.automationArtifacts ?? []).filter(
            (artifact: AutomationExecutionArtifact) =>
              artifact.executionId === focusedAutomationExecution.id
          )
        : [],
    [focusedAutomationExecution, project?.automationArtifacts]
  );
  const focusedRowSteps = useMemo(
    () => (focusedRow ? splitCaseSteps(focusedRow.steps) : []),
    [focusedRow]
  );
  const rowStepSignals = useMemo(
    () =>
      Object.fromEntries(
        rowsForRun.map((row) => {
          const stepResults = activeRun?.rowStepResults[row.id] ?? {};
          const failedSteps = Object.values(stepResults).filter(
            (value) => value === "failed"
          ).length;
          const blockedSteps = Object.values(stepResults).filter(
            (value) => value === "blocked"
          ).length;
          const passedSteps = Object.values(stepResults).filter(
            (value) => value === "passed"
          ).length;

          return [
            row.id,
            {
              failedSteps,
              blockedSteps,
              passedSteps,
            },
          ];
        })
      ),
    [activeRun, rowsForRun]
  );
  const filteredRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return rowsForRun
      .filter((row) => {
        if (executionFilter && row.executionResult !== executionFilter) {
          return false;
        }

        if (linkedFilter === "linked" && !row.issueId && !row.issueKey) {
          return false;
        }

        if (linkedFilter === "unlinked" && (row.issueId || row.issueKey)) {
          return false;
        }

        if (highRiskOnly) {
          const signals = rowStepSignals[row.id];
          if (!signals || (signals.failedSteps === 0 && signals.blockedSteps === 0)) {
            return false;
          }
        }

        if (!normalizedSearch) {
          return true;
        }

        const haystack = [
          row.id,
          row.title,
          row.issueKey,
          row.assignee,
          row.labels?.join(" "),
          row.steps,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => {
        const leftSignals = rowStepSignals[left.id] ?? {
          failedSteps: 0,
          blockedSteps: 0,
          passedSteps: 0,
        };
        const rightSignals = rowStepSignals[right.id] ?? {
          failedSteps: 0,
          blockedSteps: 0,
          passedSteps: 0,
        };

        const leftRiskScore = leftSignals.failedSteps * 4 + leftSignals.blockedSteps * 3;
        const rightRiskScore =
          rightSignals.failedSteps * 4 + rightSignals.blockedSteps * 3;

        if (leftRiskScore !== rightRiskScore) {
          return rightRiskScore - leftRiskScore;
        }

        const leftExecutionWeight =
          left.executionResult === "failed"
            ? 3
            : left.executionResult === "blocked"
            ? 2
            : left.executionResult === "not-run"
            ? 1
            : 0;
        const rightExecutionWeight =
          right.executionResult === "failed"
            ? 3
            : right.executionResult === "blocked"
            ? 2
            : right.executionResult === "not-run"
            ? 1
            : 0;

        if (leftExecutionWeight !== rightExecutionWeight) {
          return rightExecutionWeight - leftExecutionWeight;
        }

        return left.id.localeCompare(right.id);
      });
  }, [executionFilter, highRiskOnly, linkedFilter, rowStepSignals, rowsForRun, searchQuery]);
  const activeRunsPreset = useMemo(() => {
    if (!searchQuery && !executionFilter && linkedFilter === "all" && !highRiskOnly) {
      return "default";
    }

    if (!searchQuery && !executionFilter && linkedFilter === "all" && highRiskOnly) {
      return "high-risk";
    }

    if (
      !searchQuery &&
      executionFilter === "failed" &&
      linkedFilter === "linked" &&
      highRiskOnly
    ) {
      return "failed-linked";
    }

    return "custom";
  }, [executionFilter, highRiskOnly, linkedFilter, searchQuery]);
  const currentRunsViewFilters = useMemo(
    () => ({
      searchQuery,
      execution: executionFilter,
      linked: linkedFilter,
      highRiskOnly,
    }),
    [executionFilter, highRiskOnly, linkedFilter, searchQuery]
  );
  const activeSavedRunsView = useMemo(
    () =>
      runsSavedViews.find(
        (view) => JSON.stringify(view.filters) === JSON.stringify(currentRunsViewFilters)
      ) ?? null,
    [currentRunsViewFilters, runsSavedViews]
  );
  const orderedRunsSavedViews = useMemo(
    () =>
      [...runsSavedViews].sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) {
          return left.pinned ? -1 : 1;
        }
        return right.updatedAt - left.updatedAt;
      }),
    [runsSavedViews]
  );
  const visibleHighRiskCount = useMemo(
    () =>
      filteredRows.filter((row) => {
        const signals = rowStepSignals[row.id];
        return Boolean(signals && (signals.failedSteps > 0 || signals.blockedSteps > 0));
      }).length,
    [filteredRows, rowStepSignals]
  );
  const visibleFailedStepCount = useMemo(
    () =>
      filteredRows.reduce(
        (count, row) => count + (rowStepSignals[row.id]?.failedSteps ?? 0),
        0
      ),
    [filteredRows, rowStepSignals]
  );
  const visibleBlockedStepCount = useMemo(
    () =>
      filteredRows.reduce(
        (count, row) => count + (rowStepSignals[row.id]?.blockedSteps ?? 0),
        0
      ),
    [filteredRows, rowStepSignals]
  );
  const visibleSelectedCount = useMemo(
    () => filteredRows.filter((row) => selectedRowIds.includes(row.id)).length,
    [filteredRows, selectedRowIds]
  );
  const activeRunHighRiskCount = useMemo(
    () =>
      rowsForRun.filter((row) => {
        const signals = rowStepSignals[row.id];
        return Boolean(signals && (signals.failedSteps > 0 || signals.blockedSteps > 0));
      }).length,
    [rowStepSignals, rowsForRun]
  );

  const passedRate =
    totalCases === 0
      ? 0
      : Math.round(((executionCounts.passed ?? 0) / totalCases) * 100);
  const executionDistribution = [
    {
      key: "passed" as const,
      label: "Passed",
      count: executionCounts.passed ?? 0,
    },
    {
      key: "failed" as const,
      label: "Failed",
      count: executionCounts.failed ?? 0,
    },
    {
      key: "blocked" as const,
      label: "Blocked",
      count: executionCounts.blocked ?? 0,
    },
    {
      key: "not-run" as const,
      label: "Not Run",
      count: executionCounts["not-run"] ?? totalCases,
    },
  ].map((entry) => ({
    ...entry,
    percent: totalCases === 0 ? 0 : Math.round((entry.count / totalCases) * 100),
  }));

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((currentIds) =>
      currentIds.includes(rowId)
        ? currentIds.filter((currentId) => currentId !== rowId)
        : [...currentIds, rowId]
    );
    setFocusedRowId(rowId);
  };

  const toggleSelectAllVisible = () => {
    const visibleRowIds = filteredRows.map((row) => row.id);
    const areAllVisibleSelected =
      visibleRowIds.length > 0 &&
      visibleRowIds.every((rowId) => selectedRowIds.includes(rowId));

    setSelectedRowIds((currentIds) =>
      areAllVisibleSelected
        ? currentIds.filter((rowId) => !visibleRowIds.includes(rowId))
        : Array.from(new Set([...currentIds, ...visibleRowIds]))
    );
  };

  const clearSelection = () => {
    setSelectedRowIds([]);
    setFocusedRowId(null);
  };

  useEffect(() => {
    if (!activeRun || !focusedRowId) {
      setActualResultDraft("");
      setExecutionNotesDraft("");
      setBugDraft(null);
      setCreatedBug(null);
      return;
    }

    setActualResultDraft(activeRun.rowActualResults[focusedRowId] ?? "");
    setExecutionNotesDraft(activeRun.rowNotes[focusedRowId] ?? "");
    const stepNotes = activeRun.rowStepNotes[focusedRowId] ?? {};
    const stepActuals = activeRun.rowStepActualResults[focusedRowId] ?? {};
    const stepEvidence = activeRun.rowStepEvidence[focusedRowId] ?? {};
    setStepDrafts(
      Object.fromEntries(
        Object.keys({
          ...stepNotes,
          ...stepActuals,
          ...stepEvidence,
        }).map((stepKey) => [
          stepKey,
          {
            note: stepNotes[stepKey] ?? "",
            actual: stepActuals[stepKey] ?? "",
            evidence: stepEvidence[stepKey] ?? "",
          },
        ])
      )
    );
    setBugDraft(null);
    setCreatedBug(null);
  }, [activeRun, focusedRowId]);

  const persistProject = async (nextProject: Project) => {
    setIsSaving(true);

    try {
      const projectsResponse = await fetch("/api/projects", {
        cache: "no-store",
      });
      const projectsPayload = (await projectsResponse.json()) as {
        projects?: Project[];
        error?: string;
      };

      if (!projectsResponse.ok || !Array.isArray(projectsPayload.projects)) {
        throw new Error(projectsPayload.error || "Failed to load projects.");
      }

      const updatedProjects = projectsPayload.projects.map((entry) =>
        entry.id === nextProject.id ||
        entry.projectKey?.trim().toLowerCase() === projectKey.trim().toLowerCase()
          ? nextProject
          : entry
      );

      const persistResponse = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projects: updatedProjects }),
      });

      const persistPayload = (await persistResponse.json()) as {
        projects?: Project[];
        error?: string;
      };

      if (!persistResponse.ok || !Array.isArray(persistPayload.projects)) {
        throw new Error(persistPayload.error || "Failed to save run updates.");
      }

      const savedProject =
        persistPayload.projects.find((entry) => entry.id === nextProject.id) ??
        nextProject;

      setProject(savedProject);
      projectDataState?.setProject(savedProject);
      router.refresh();
      return savedProject;
    } finally {
      setIsSaving(false);
    }
  };

  const syncProjectWithRun = (
    currentProject: Project,
    nextRuns: TestRunRecord[],
    nextActiveRunId: string
  ): Project => {
    const selectedRun = nextRuns.find((run) => run.id === nextActiveRunId) ?? null;
    const syncedRows = currentProject.rows.map((row) => ({
      ...row,
      executionResult:
        selectedRun?.rowResults[row.id] ??
        row.executionResult ??
        "not-run",
    }));

    return {
      ...currentProject,
      rows: syncedRows,
      runs: nextRuns,
      activeRunId: nextActiveRunId,
      savedViews: currentProject.savedViews ?? { cases: [], runs: [] },
      updatedAt: Date.now(),
    };
  };

  const saveRunsDefaultPreset = async (
    preset: "default" | "high-risk" | "failed-linked"
  ) => {
    if (!project) {
      return;
    }

    try {
      const savedProject = await persistProject({
        ...project,
        viewPreferences: {
          ...(project.viewPreferences ?? {}),
          runsDefaultPreset: preset,
          runsDefaultSavedViewId: runsDefaultSavedViewId ?? undefined,
        },
        updatedAt: Date.now(),
      });
      setRunsDefaultPreset(preset);
      setProject(savedProject);
      setNotice({
        tone: "success",
        text: `Saved ${preset === "high-risk" ? "High Risk Run" : preset === "failed-linked" ? "Failed Linked Run" : "Default Run View"} as the preferred run view.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to save the preferred run view.",
      });
    }
  };

  const saveCurrentRunsView = async () => {
    const trimmedName = newRunsViewName.trim();
    if (!project || !trimmedName) {
      setNotice({
        tone: "error",
        text: "Name the run view before saving it.",
      });
      return;
    }

    const nextViews = [
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        filters: currentRunsViewFilters,
        updatedAt: Date.now(),
      },
      ...runsSavedViews.filter(
        (view) => view.name.trim().toLowerCase() !== trimmedName.toLowerCase()
      ),
    ].slice(0, 12);

    try {
      const savedProject = await persistProject({
        ...project,
        savedViews: {
          cases: project.savedViews?.cases ?? [],
          runs: nextViews,
        },
        updatedAt: Date.now(),
      });
      setRunsSavedViews(nextViews);
      setNewRunsViewName("");
      setProject(savedProject);
      setNotice({
        tone: "success",
        text: `Saved run view "${trimmedName}".`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to save the run view.",
      });
    }
  };

  const deleteRunsView = async (viewId: string) => {
    if (!project) {
      return;
    }

    const matchedView = runsSavedViews.find((view) => view.id === viewId);
    const nextViews = runsSavedViews.filter((view) => view.id !== viewId);

    try {
      const savedProject = await persistProject({
        ...project,
        viewPreferences: {
          ...(project.viewPreferences ?? {}),
          runsDefaultPreset,
          runsDefaultSavedViewId:
            runsDefaultSavedViewId === viewId ? undefined : runsDefaultSavedViewId ?? undefined,
        },
        savedViews: {
          cases: project.savedViews?.cases ?? [],
          runs: nextViews,
        },
        updatedAt: Date.now(),
      });
      setRunsSavedViews(nextViews);
      if (runsDefaultSavedViewId === viewId) {
        setRunsDefaultSavedViewId(null);
      }
      setProject(savedProject);
      if (editingRunsViewId === viewId) {
        setEditingRunsViewId(null);
        setEditingRunsViewName("");
      }
      setNotice({
        tone: "info",
        text: matchedView
          ? `Deleted run view "${matchedView.name}".`
          : "Deleted the selected run view.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to delete the run view.",
      });
    }
  };

  const startEditingRunsView = (viewId: string, currentName: string) => {
    setEditingRunsViewId(viewId);
    setEditingRunsViewName(currentName);
  };

  const cancelEditingRunsView = () => {
    setEditingRunsViewId(null);
    setEditingRunsViewName("");
  };

  const renameRunsView = async () => {
    if (!project || !editingRunsViewId) {
      return;
    }

    const trimmedName = editingRunsViewName.trim();
    if (!trimmedName) {
      setNotice({
        tone: "error",
        text: "Enter a name before renaming the saved run view.",
      });
      return;
    }

    const nextViews = runsSavedViews.map((view) =>
      view.id === editingRunsViewId
        ? {
            ...view,
            name: trimmedName,
            updatedAt: Date.now(),
          }
        : view
    );

    try {
      const savedProject = await persistProject({
        ...project,
        savedViews: {
          cases: project.savedViews?.cases ?? [],
          runs: nextViews,
        },
        updatedAt: Date.now(),
      });
      setRunsSavedViews(nextViews);
      setProject(savedProject);
      setNotice({
        tone: "success",
        text: `Renamed saved run view to "${trimmedName}".`,
      });
      cancelEditingRunsView();
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to rename the saved run view.",
      });
    }
  };

  const togglePinRunsView = async (viewId: string) => {
    if (!project) {
      return;
    }

    const nextViews = runsSavedViews.map((view) =>
      view.id === viewId
        ? {
            ...view,
            pinned: !view.pinned,
            updatedAt: Date.now(),
          }
        : view
    );
    const changedView = nextViews.find((view) => view.id === viewId);

    try {
      const savedProject = await persistProject({
        ...project,
        savedViews: {
          cases: project.savedViews?.cases ?? [],
          runs: nextViews,
        },
        updatedAt: Date.now(),
      });
      setRunsSavedViews(nextViews);
      setProject(savedProject);
      setNotice({
        tone: "success",
        text:
          changedView?.pinned
            ? `Pinned saved run view "${changedView.name}".`
            : `Unpinned saved run view "${changedView?.name ?? "view"}".`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to update the saved run view.",
      });
    }
  };

  const setDefaultRunsSavedView = async (viewId: string) => {
    if (!project) {
      return;
    }

    try {
      const savedProject = await persistProject({
        ...project,
        viewPreferences: {
          ...(project.viewPreferences ?? {}),
          runsDefaultPreset,
          runsDefaultSavedViewId: viewId,
        },
        updatedAt: Date.now(),
      });
      setRunsDefaultSavedViewId(viewId);
      setProject(savedProject);
      const view = runsSavedViews.find((entry) => entry.id === viewId);
      setNotice({
        tone: "success",
        text: `Set "${view?.name ?? "Saved run view"}" as the default run view.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to save the default run view.",
      });
    }
  };

  const createRun = async () => {
    if (!project) {
      return;
    }

    const trimmedName = newRunName.trim();
    if (!trimmedName) {
      setNotice({
        tone: "error",
        text: "Enter a run name before creating a test run.",
      });
      return;
    }

    const now = Date.now();
    const newRun: TestRunRecord = {
      id: crypto.randomUUID(),
      name: trimmedName,
      status: "active",
      rowResults: Object.fromEntries(
        project.rows.map((row) => [row.id, row.executionResult ?? "not-run"])
      ),
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

    try {
      const nextRuns = [
        ...runs.map((run) =>
          run.status === "active" ? { ...run, status: "draft" as const } : run
        ),
        newRun,
      ];
      const nextProject = syncProjectWithRun(project, nextRuns, newRun.id);
      const savedProject = await persistProject(nextProject);
      setNewRunName("");
      setActiveRunId(newRun.id);
      setNotice({
        tone: "success",
        text: `Created run "${newRun.name}" and made it the active execution surface.`,
      });
      setProject(savedProject);
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to create the new run.",
      });
    }
  };

  const switchRun = async (nextRunId: string) => {
    if (!project || !nextRunId || nextRunId === activeRunId) {
      setActiveRunId(nextRunId);
      return;
    }

    try {
      const nextRuns = runs.map((run) =>
        run.id === nextRunId
          ? { ...run, status: "active" as const, updatedAt: Date.now() }
          : run.id === activeRunId && run.status === "active"
          ? { ...run, status: "draft" as const, updatedAt: Date.now() }
          : run
      );
      const nextProject = syncProjectWithRun(project, nextRuns, nextRunId);
      const savedProject = await persistProject(nextProject);
      setActiveRunId(nextRunId);
      setProject(savedProject);
      setSelectedRowIds([]);
      setFocusedRowId(null);
      setBugDraft(null);
      setCreatedBug(null);
      setNotice({
        tone: "info",
        text: `Switched execution view to "${nextRuns.find((run) => run.id === nextRunId)?.name ?? "selected run"}".`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to switch the active run.",
      });
    }
  };

  const generateBugDraft = () => {
    if (!project || !activeRun || !focusedRow) {
      setNotice({
        tone: "error",
        text: "Select a failed case in the active run before generating a bug draft.",
      });
      return;
    }

    const executionResult =
      activeRun.rowResults[focusedRow.id] ?? focusedRow.executionResult ?? "not-run";
    if (executionResult !== "failed" && executionResult !== "blocked") {
      setNotice({
        tone: "error",
        text: "Bug drafts are only available for failed or blocked execution results.",
      });
      return;
    }

    const nextDraft = buildBugDraftFromRunCase({
      project,
      run: activeRun,
      caseRow: focusedRow,
      actualResult: actualResultDraft,
      executionNotes: executionNotesDraft,
    });
    const automationDetails = focusedAutomationExecution
      ? [
          "",
          "Automation Failure Context",
          `Provider: ${focusedAutomationExecution.provider}`,
          `Automation status: ${focusedAutomationExecution.status}`,
          focusedAutomationExecution.failureMessage
            ? `Failure message: ${focusedAutomationExecution.failureMessage}`
            : "",
          focusedAutomationArtifacts.length > 0
            ? `Artifacts: ${focusedAutomationArtifacts
                .map((artifact) => `${artifact.type} -> ${artifact.path}`)
                .join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    setBugDraft({
      ...nextDraft,
      description: `${nextDraft.description}${automationDetails}`.trim(),
      labels: Array.from(
        new Set([
          ...nextDraft.labels,
          ...(focusedAutomationExecution
            ? ["automation-failure", focusedAutomationExecution.provider]
            : []),
        ])
      ),
    });
    setNotice({
      tone: "info",
      text: `Generated a bug draft for ${focusedRow.id}. Review it and create the issue when you're ready.`,
    });
  };

  const createBugFromDraft = async () => {
    if (!project || !activeRun || !focusedRow || !bugDraft) {
      setNotice({
        tone: "error",
        text: "Generate a bug draft first before creating an issue.",
      });
      return;
    }

    try {
      setIsCreatingBug(true);
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.projectKey?.trim() || project.id)}/issues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "bug",
            summary: bugDraft.title,
            description: [
              bugDraft.description,
              "",
              bugDraft.labels.length > 0
                ? `Suggested Labels: ${bugDraft.labels.join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
            priority: bugDraft.priority,
            status: "backlog",
          }),
        }
      );

      const payload = (await response.json()) as {
        issue?: {
          id: string;
          issueKey: string;
          summary: string;
          description: string;
          type: "bug";
          priority: "highest" | "high" | "medium" | "low";
          status: "backlog" | "todo" | "in-progress" | "blocked" | "in-review" | "done";
          projectId: string;
          projectKey: string;
          issueNumber: number;
          reporterId: string | null;
          assigneeId: string | null;
          sprintId: string | null;
          dueDate: string | null;
          createdAt: string;
          updatedAt: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.issue) {
        throw new Error(payload.error || "Failed to create bug issue.");
      }
      const createdIssue = payload.issue;

      const updatedRun: TestRunRecord = {
        ...activeRun,
        linkedDefectIds: {
          ...activeRun.linkedDefectIds,
          [focusedRow.id]: Array.from(
            new Set([
              ...(activeRun.linkedDefectIds[focusedRow.id] ?? []),
              createdIssue.id,
            ])
          ),
        },
        updatedAt: Date.now(),
      };
      const nextRuns = runs.map((run) => (run.id === updatedRun.id ? updatedRun : run));
      const nextProject = syncProjectWithRun(
        {
          ...project,
          rows: project.rows.map((row) =>
            row.id === focusedRow.id
              ? {
                  ...row,
                  issueId: createdIssue.id,
                  issueKey: createdIssue.issueKey,
                }
              : row
          ),
          automationExecutions: (project.automationExecutions ?? []).map((execution) =>
            execution.id === focusedAutomationExecution?.id
              ? {
                  ...execution,
                  linkedIssueId: createdIssue.id,
                  linkedIssueKey: createdIssue.issueKey,
                }
              : execution
          ),
        },
        nextRuns,
        updatedRun.id
      );
      const savedProject = await persistProject(nextProject);
      setProject(savedProject);
      const currentSharedIssueState = sharedIssueState;
      const nextIssues = currentSharedIssueState
        ? [createdIssue, ...currentSharedIssueState.issues]
        : null;
      if (nextIssues && currentSharedIssueState) {
        currentSharedIssueState.setIssues(nextIssues);
        metrics?.setIssueCount(nextIssues.length);
      }
      setBugDraft(null);
      setCreatedBug({
        id: createdIssue.id,
        issueKey: createdIssue.issueKey,
      });
      setNotice({
        tone: "success",
        text: `Created bug ${createdIssue.issueKey} from ${focusedRow.id}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to create bug issue.",
      });
    } finally {
      setIsCreatingBug(false);
    }
  };

  const applyExecutionResult = async (nextExecutionResult: TestCaseExecutionResult) => {
    if (!project) {
      return;
    }

    if (!activeRun) {
      setNotice({
        tone: "error",
        text: "Create a named run first before updating execution results.",
      });
      return;
    }

    if (selectedRowIds.length === 0) {
      setNotice({
        tone: "error",
        text: "Select at least one case before applying an execution result.",
      });
      return;
    }

    try {
      const updatedRun: TestRunRecord = {
        ...activeRun,
        rowResults: {
          ...activeRun.rowResults,
          ...Object.fromEntries(
            selectedRowIds.map((rowId) => [rowId, nextExecutionResult])
          ),
        },
        updatedAt: Date.now(),
      };
      const nextRuns = runs.map((run) => (run.id === updatedRun.id ? updatedRun : run));
      const nextProject = syncProjectWithRun(project, nextRuns, updatedRun.id);
      await persistProject(nextProject);
      setNotice({
        tone: "success",
        text: `Updated ${selectedRowIds.length} case${
          selectedRowIds.length === 1 ? "" : "s"
        } in "${updatedRun.name}".`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to save execution updates.",
      });
    }
  };

  const updateFocusedStepResult = async (
    stepIndex: string,
    nextResult: TestCaseExecutionResult
  ) => {
    if (!project || !activeRun || !focusedRow) {
      return;
    }

    try {
      const updatedRun: TestRunRecord = {
        ...activeRun,
        rowStepResults: {
          ...activeRun.rowStepResults,
          [focusedRow.id]: {
            ...(activeRun.rowStepResults[focusedRow.id] ?? {}),
            [stepIndex]: nextResult,
          },
        },
        updatedAt: Date.now(),
      };
      const nextRuns = runs.map((run) => (run.id === updatedRun.id ? updatedRun : run));
      const nextProject = syncProjectWithRun(project, nextRuns, updatedRun.id);
      const savedProject = await persistProject(nextProject);
      setProject(savedProject);
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to update the step-level execution status.",
      });
    }
  };

  const saveFocusedStepNote = async (stepIndex: string) => {
    if (!project || !activeRun || !focusedRow) {
      return;
    }

    try {
      const updatedRun: TestRunRecord = {
        ...activeRun,
        rowStepNotes: {
          ...activeRun.rowStepNotes,
          [focusedRow.id]: {
            ...(activeRun.rowStepNotes[focusedRow.id] ?? {}),
            [stepIndex]: stepDrafts[stepIndex]?.note ?? "",
          },
        },
        rowStepActualResults: {
          ...activeRun.rowStepActualResults,
          [focusedRow.id]: {
            ...(activeRun.rowStepActualResults[focusedRow.id] ?? {}),
            [stepIndex]: stepDrafts[stepIndex]?.actual ?? "",
          },
        },
        rowStepEvidence: {
          ...activeRun.rowStepEvidence,
          [focusedRow.id]: {
            ...(activeRun.rowStepEvidence[focusedRow.id] ?? {}),
            [stepIndex]: stepDrafts[stepIndex]?.evidence ?? "",
          },
        },
        updatedAt: Date.now(),
      };
      const nextRuns = runs.map((run) => (run.id === updatedRun.id ? updatedRun : run));
      const nextProject = syncProjectWithRun(project, nextRuns, updatedRun.id);
      const savedProject = await persistProject(nextProject);
      setProject(savedProject);
      setNotice({
        tone: "success",
      text: `Saved step ${stepIndex} details for ${focusedRow.id}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to save the step note.",
      });
    }
  };

  const saveFocusedExecutionDetails = async () => {
    if (!project || !activeRun || !focusedRow) {
      setNotice({
        tone: "error",
        text: "Select a case in the active run before saving execution details.",
      });
      return;
    }

    try {
      const updatedRun: TestRunRecord = {
        ...activeRun,
        rowActualResults: {
          ...activeRun.rowActualResults,
          [focusedRow.id]: actualResultDraft.trim(),
        },
        rowNotes: {
          ...activeRun.rowNotes,
          [focusedRow.id]: executionNotesDraft.trim(),
        },
        rowStepNotes: {
          ...activeRun.rowStepNotes,
          [focusedRow.id]: {
            ...(activeRun.rowStepNotes[focusedRow.id] ?? {}),
            ...Object.fromEntries(
              Object.entries(stepDrafts).map(([stepKey, value]) => [
                stepKey,
                value.note,
              ])
            ),
          },
        },
        rowStepActualResults: {
          ...activeRun.rowStepActualResults,
          [focusedRow.id]: {
            ...(activeRun.rowStepActualResults[focusedRow.id] ?? {}),
            ...Object.fromEntries(
              Object.entries(stepDrafts).map(([stepKey, value]) => [
                stepKey,
                value.actual,
              ])
            ),
          },
        },
        rowStepEvidence: {
          ...activeRun.rowStepEvidence,
          [focusedRow.id]: {
            ...(activeRun.rowStepEvidence[focusedRow.id] ?? {}),
            ...Object.fromEntries(
              Object.entries(stepDrafts).map(([stepKey, value]) => [
                stepKey,
                value.evidence,
              ])
            ),
          },
        },
        updatedAt: Date.now(),
      };
      const nextRuns = runs.map((run) => (run.id === updatedRun.id ? updatedRun : run));
      const nextProject = syncProjectWithRun(project, nextRuns, updatedRun.id);
      await persistProject(nextProject);
      setNotice({
        tone: "success",
        text: `Saved execution notes for ${focusedRow.id} in "${updatedRun.name}".`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to save execution details.",
      });
    }
  };

  const createIssueFromAutomationFailure = async () => {
    if (!project || !activeRun || !focusedRow || !focusedAutomationExecution) {
      setNotice({
        tone: "error",
        text: "Select a case with a failed automation execution first.",
      });
      return;
    }

    const summary = `[Automation] ${focusedRow.title || focusedRow.id} failed in ${focusedAutomationExecution.provider}`;
    const description = [
      `Case: ${focusedRow.id}`,
      `Run: ${activeRun.name}`,
      `Provider: ${focusedAutomationExecution.provider}`,
      `Status: ${focusedAutomationExecution.status}`,
      focusedAutomationExecution.failureMessage
        ? `Failure: ${focusedAutomationExecution.failureMessage}`
        : "",
      focusedAutomationExecution.logSummary
        ? `Logs:\n${focusedAutomationExecution.logSummary}`
        : "",
      focusedAutomationArtifacts.length > 0
        ? `Artifacts:\n${focusedAutomationArtifacts
            .map((artifact) => `- ${artifact.type}: ${artifact.path}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      setIsCreatingBug(true);
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.projectKey?.trim() || project.id)}/issues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "bug",
            summary,
            description,
            priority: "high",
            status: "backlog",
          }),
        }
      );

      const payload = (await response.json()) as {
        issue?: { id: string; issueKey: string };
        error?: string;
      };

      if (!response.ok || !payload.issue) {
        throw new Error(payload.error || "Failed to create automation issue.");
      }

      const updatedRun: TestRunRecord = {
        ...activeRun,
        linkedDefectIds: {
          ...activeRun.linkedDefectIds,
          [focusedRow.id]: Array.from(
            new Set([
              ...(activeRun.linkedDefectIds[focusedRow.id] ?? []),
              payload.issue.id,
            ])
          ),
        },
        updatedAt: Date.now(),
      };
      const nextRuns = runs.map((run) => (run.id === updatedRun.id ? updatedRun : run));
      const nextProject = syncProjectWithRun(
        {
          ...project,
          rows: project.rows.map((row) =>
            row.id === focusedRow.id
              ? {
                  ...row,
                  issueId: payload.issue?.id,
                  issueKey: payload.issue?.issueKey,
                }
              : row
          ),
          automationExecutions: (project.automationExecutions ?? []).map((execution) =>
            execution.id === focusedAutomationExecution.id
              ? {
                  ...execution,
                  linkedIssueId: payload.issue?.id,
                  linkedIssueKey: payload.issue?.issueKey,
                }
              : execution
          ),
        },
        nextRuns,
        updatedRun.id
      );
      const savedProject = await persistProject(nextProject);
      setProject(savedProject);
      setCreatedBug({
        id: payload.issue.id,
        issueKey: payload.issue.issueKey,
      });
      setNotice({
        tone: "success",
        text: `Created bug ${payload.issue.issueKey} from automation failure on ${focusedRow.id}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to create automation issue.",
      });
    } finally {
      setIsCreatingBug(false);
    }
  };

  const generateBugDraftFromStep = (stepIndex: string, stepText: string) => {
    if (!project || !activeRun || !focusedRow) {
      return;
    }

    const stepResult =
      activeRun.rowStepResults[focusedRow.id]?.[stepIndex] ?? "not-run";

    if (stepResult !== "failed" && stepResult !== "blocked") {
      setNotice({
        tone: "error",
        text: "Only failed or blocked steps can generate a step-specific bug draft.",
      });
      return;
    }

    const stepContext = [
      `Failed step: ${stepIndex}`,
      `Step text: ${stepText}`,
      stepDrafts[stepIndex]?.note.trim()
        ? `Step note: ${stepDrafts[stepIndex].note.trim()}`
        : "",
      stepDrafts[stepIndex]?.actual.trim()
        ? `Step actual result: ${stepDrafts[stepIndex].actual.trim()}`
        : "",
      stepDrafts[stepIndex]?.evidence.trim()
        ? `Evidence reference: ${stepDrafts[stepIndex].evidence.trim()}`
        : "",
      executionNotesDraft.trim() ? `Run notes: ${executionNotesDraft.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    setBugDraft(
      buildBugDraftFromRunCase({
        project,
        run: activeRun,
        caseRow: focusedRow,
        actualResult: actualResultDraft,
        executionNotes: stepContext,
      })
    );
    setNotice({
      tone: "info",
      text: `Generated a bug draft from failed step ${stepIndex} in ${focusedRow.id}.`,
    });
  };

  if (!project) {
    return (
      <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white/80 px-6 py-16 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
          Runs
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Project not available
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          This execution view needs a saved project before it can track run progress.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[24px] border border-zinc-200/80 bg-white/96 px-6 py-6 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Runs
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Named execution runs
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Create named runs like sprint regression, smoke verification, or hotfix validation,
              then execute and update results without mixing one cycle into another.
            </p>
          </div>
          <div className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
            {selectedRowIds.length} selected | {visibleSelectedCount} visible
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
          {[
            ["Total Cases", totalCases, "border-zinc-200 bg-white/80"],
            ["Not Run", executionCounts["not-run"] ?? totalCases, "border-zinc-200 bg-zinc-50/90"],
            ["Passed", executionCounts.passed ?? 0, "border-emerald-200 bg-emerald-50/90"],
            ["Failed", executionCounts.failed ?? 0, "border-rose-200 bg-rose-50/90"],
            ["Blocked", executionCounts.blocked ?? 0, "border-amber-200 bg-amber-50/90"],
          ].map(([label, count, className]) => (
            <article
              key={label}
              className={`rounded-[24px] border px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 ${className}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {count}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-4 rounded-[24px] border border-sky-200 bg-sky-50/90 px-4 py-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                Active Run
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {activeRun?.name ?? "No run selected"}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {activeRun
                  ? `Status: ${activeRun.status}`
                  : "Create your first named run to start a trackable execution cycle."}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                Execution Progress
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {passedRate}%
              </p>
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/80 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${Math.max(6, passedRate)}%` }}
            />
          </div>

          <div className="mt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                Run Result Distribution
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Visual mix across the active run
              </p>
            </div>
            <div className="mt-3 h-4 overflow-hidden rounded-full bg-white/80 dark:bg-zinc-800">
              {executionDistribution.map((entry) =>
                entry.percent > 0 ? (
                  <div
                    key={entry.key}
                    className={`h-full ${executionBarTone[entry.key]}`}
                    style={{ width: `${entry.percent}%`, float: "left" }}
                  />
                ) : null
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {executionDistribution.map((entry) => (
                <div
                  key={entry.key}
                  className="rounded-[18px] border border-white/70 bg-white/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${executionBarTone[entry.key]}`}
                      />
                      <span className="min-w-0 text-sm font-semibold leading-5 text-zinc-900 dark:text-zinc-100">
                        {entry.label}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-zinc-600 dark:text-zinc-300 sm:text-right">
                      {entry.percent}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {entry.count} case{entry.count === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/72">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Runs Command Center
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Keep execution triage sharp without overwhelming the page.
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Use named runs for clean execution cycles, keep the queue central, and open the heavier control surfaces only when you need them.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Active Run
              </p>
              <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {activeRun?.name ?? "None"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {runs.length} named run{runs.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Visible Queue
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {filteredRows.length}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {rowsForRun.length} total in active run
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                High Risk
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {activeRunHighRiskCount}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                cases with failed or blocked steps
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/85 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Selection
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {selectedRowIds.length}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {visibleSelectedCount} visible in current slice
              </p>
            </div>
          </div>
        </div>
      </section>

      <PrimaryToolbar
        title="Primary search and quick filters"
        description="Keep execution triage focused on the queue first, with only the most useful run filters visible by default."
        actions={
          <>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              {filteredRows.length} visible
            </span>
            <button
              type="button"
              onClick={resetRunsFilters}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Reset filters
            </button>
          </>
        }
      >
        <QuickFilters
          title="Quick filters"
          description="Keep only the most useful run controls visible by default."
          actions={
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {[executionFilter, linkedFilter !== "all" ? linkedFilter : "", highRiskOnly ? "risk" : ""].filter(Boolean).length} quick active
            </span>
          }
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search case id, title, issue key, labels..."
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            />
            <select
              value={executionFilter}
              onChange={(event) =>
                setExecutionFilter((event.target.value || "") as TestCaseExecutionResult | "")
              }
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              <option value="">All execution states</option>
              <option value="not-run">Not Run</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
            </select>
            <select
              value={linkedFilter}
              onChange={(event) =>
                setLinkedFilter(event.target.value as "all" | "linked" | "unlinked")
              }
              className="min-h-[48px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              <option value="all">All cases</option>
              <option value="linked">Linked to issues</option>
              <option value="unlinked">Unlinked</option>
            </select>
            <label className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <input
                type="checkbox"
                checked={highRiskOnly}
                onChange={(event) => setHighRiskOnly(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
              />
              High-risk only
            </label>
          </div>
        </QuickFilters>
      </PrimaryToolbar>

      <WorkflowShortcutsSection
        title="Run shortcuts"
        description="Preset run slices stay separate from the queue search controls so the page remains easier to scan."
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyRunsPreset("high-risk")}
            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
          >
            High Risk Run
          </button>
          <button
            type="button"
            onClick={() => applyRunsPreset("failed-linked")}
            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          >
            Failed Linked Run
          </button>
          <button
            type="button"
            onClick={() => applyRunsPreset("default")}
            className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Default Run View
          </button>
        </div>
      </WorkflowShortcutsSection>

      <SavedViewsSection
        title="Run views and preset state"
        description="Saved views and default preset state are grouped here instead of competing with the queue itself."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/70">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <input
                type="text"
                value={newRunsViewName}
                onChange={(event) => setNewRunsViewName(event.target.value)}
                placeholder="Save current run view as..."
                className="min-h-[44px] flex-1 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <button
                type="button"
                onClick={() => void saveCurrentRunsView()}
                className="rounded-2xl bg-[linear-gradient(135deg,_#1d4ed8_0%,_#0f766e_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Save View
              </button>
            </div>
          </div>
          <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/70">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                Active preset: {activeRunsPreset === "high-risk" ? "High Risk Run" : activeRunsPreset === "failed-linked" ? "Failed Linked Run" : activeRunsPreset === "default" ? "Default Run View" : "Custom"}
              </span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                Default preset: {runsDefaultPreset === "high-risk" ? "High Risk Run" : runsDefaultPreset === "failed-linked" ? "Failed Linked Run" : "Default Run View"}
              </span>
              {activeSavedRunsView ? (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                  Active saved view: {activeSavedRunsView.name}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </SavedViewsSection>

      {cameFromRelease && (
        <section className="rounded-[24px] border border-sky-200 bg-sky-50/90 px-4 py-4 text-sm text-sky-900 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">Viewing an execution slice opened from Release</p>
              <p className="mt-1 text-sky-800/80 dark:text-sky-200/80">
                This run view is carrying release context so you can inspect failing or blocked execution without losing the release decision trail.
              </p>
            </div>
            <Link
              href={`/projects/${encodeURIComponent(projectKey)}/release`}
              className="inline-flex items-center justify-center rounded-2xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 dark:border-sky-400/30 dark:bg-zinc-950 dark:text-sky-200 dark:hover:bg-zinc-900"
            >
              Back to Release
            </Link>
          </div>
        </section>
      )}

      {notice && (
        <section
          className={`cf-motion-toast rounded-[24px] border px-4 py-3 text-sm shadow-sm ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
              : notice.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
              : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
          }`}
        >
          {notice.text}
        </section>
      )}

      <details className="group rounded-[24px] border border-zinc-200/80 bg-white/94 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/92" open>
        <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Run Setup
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Create a run, switch the active run, and keep one execution cycle clearly separate from the next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
              {activeRun?.name ?? "No active run"}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              Setup
            </span>
          </div>
        </summary>
        <div className="border-t border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
      <section className="rounded-[24px] border border-zinc-200/0 bg-transparent px-0 py-0 shadow-none">
        <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_auto]">
          <input
            type="text"
            value={newRunName}
            onChange={(event) => setNewRunName(event.target.value)}
            placeholder="New run name, like Sprint 12 Regression"
            className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          />
          <select
            value={activeRunId}
            onChange={(event) => void switchRun(event.target.value)}
            className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          >
            <option value="">No run selected</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.name} ({run.status})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void createRun()}
            disabled={isSaving}
            className="min-h-[44px] rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create Run
          </button>
        </div>
      </section>
        </div>
      </details>

      <details className="group rounded-[24px] border border-zinc-200/80 bg-white/94 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/92">
        <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Bulk Execution Actions
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Queue-wide result updates stay here so the execution queue itself can remain the main focus.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-950">
              {selectedRowIds.length} selected
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-950">
              {visibleSelectedCount} visible
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              Batch Tools
            </span>
          </div>
        </summary>
        <div className="border-t border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
      <section className="rounded-[24px] border border-zinc-200/0 bg-transparent px-0 py-0 shadow-none">
        <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr_1fr_auto_auto]">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search case id, title, issue key, labels..."
            className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          />
          <select
            value={executionFilter}
            onChange={(event) =>
              setExecutionFilter(
                (event.target.value || "") as TestCaseExecutionResult | ""
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
            value={linkedFilter}
            onChange={(event) =>
              setLinkedFilter(event.target.value as "all" | "linked" | "unlinked")
            }
            className="min-h-[44px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          >
            <option value="all">All cases</option>
            <option value="linked">Linked to issues</option>
            <option value="unlinked">Unlinked</option>
          </select>
          <label className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            <input
              type="checkbox"
              checked={highRiskOnly}
              onChange={(event) => setHighRiskOnly(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
            />
            High-risk only
          </label>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setExecutionFilter("");
              setLinkedFilter("all");
              setHighRiskOnly(false);
            }}
            className="min-h-[44px] rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Reset
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
            {filteredRows.length} visible
          </span>
          {searchQuery.trim() ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
              Search active
            </span>
          ) : null}
          {executionFilter ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              Execution filtered
            </span>
          ) : null}
          {linkedFilter !== "all" ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
              Linkage filtered
            </span>
          ) : null}
          {highRiskOnly ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              High-risk only
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              applyRunsPreset("high-risk");
            }}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
          >
            High Risk Run
          </button>
          <button
            type="button"
            onClick={() => {
              applyRunsPreset("failed-linked");
            }}
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          >
            Failed Linked Run
          </button>
          <button
            type="button"
            onClick={() => {
              applyRunsPreset("default");
            }}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Default Run View
          </button>
          <button
            type="button"
            onClick={() =>
              void saveRunsDefaultPreset(
                activeRunsPreset === "custom" ? "default" : activeRunsPreset
              )
            }
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          >
            Set Current As Default
          </button>
          <div className="flex w-full gap-2 lg:w-auto">
            <input
              type="text"
              value={newRunsViewName}
              onChange={(event) => setNewRunsViewName(event.target.value)}
              placeholder="Save current run view as..."
              className="min-h-[40px] flex-1 rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            />
            <button
              type="button"
              onClick={() => void saveCurrentRunsView()}
              className="rounded-2xl bg-[linear-gradient(135deg,_#1d4ed8_0%,_#0f766e_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Save View
            </button>
          </div>
          <span className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            Active preset:{" "}
            {activeRunsPreset === "high-risk"
              ? "High Risk Run"
              : activeRunsPreset === "failed-linked"
              ? "Failed Linked Run"
              : activeRunsPreset === "default"
              ? "Default Run View"
              : "Custom"}
          </span>
          {activeSavedRunsView && (
            <span className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
              Active saved view: {activeSavedRunsView.name}
            </span>
          )}
          {runsDefaultSavedViewId && (
            <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              Default saved view:{" "}
              {runsSavedViews.find((view) => view.id === runsDefaultSavedViewId)?.name ??
                "Missing view"}
            </span>
          )}
          <span className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            Default preset:{" "}
            {runsDefaultPreset === "high-risk"
              ? "High Risk Run"
              : runsDefaultPreset === "failed-linked"
              ? "Failed Linked Run"
              : "Default Run View"}
          </span>
          {orderedRunsSavedViews.map((view) => (
            <div
              key={view.id}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                activeSavedRunsView?.id === view.id
                  ? "border-violet-300 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10"
                  : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              }`}
            >
              {editingRunsViewId === view.id ? (
                <>
                  <input
                    type="text"
                    value={editingRunsViewName}
                    onChange={(event) => setEditingRunsViewName(event.target.value)}
                    className="min-h-[34px] min-w-[180px] rounded-xl border border-zinc-200/80 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => void renameRunsView()}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditingRunsView}
                    className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => applySavedRunsView(view)}
                    className="font-semibold text-zinc-800 transition hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-300"
                  >
                    {view.name}
                  </button>
                  {view.pinned && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      Pinned
                    </span>
                  )}
                  {activeSavedRunsView?.id === view.id && (
                    <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-200">
                      Active
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void togglePinRunsView(view.id)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                  >
                    {view.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void setDefaultRunsSavedView(view.id)}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditingRunsView(view.id, view.name)}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRunsView(view.id)}
                    className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Select Visible
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void applyExecutionResult("passed")}
            disabled={isSaving}
            className="rounded-2xl bg-[linear-gradient(135deg,_#059669_0%,_#047857_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark Passed
          </button>
          <button
            type="button"
            onClick={() => void applyExecutionResult("failed")}
            disabled={isSaving}
            className="rounded-2xl bg-[linear-gradient(135deg,_#dc2626_0%,_#b91c1c_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark Failed
          </button>
          <button
            type="button"
            onClick={() => void applyExecutionResult("blocked")}
            disabled={isSaving}
            className="rounded-2xl bg-[linear-gradient(135deg,_#d97706_0%,_#b45309_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark Blocked
          </button>
          <button
            type="button"
            onClick={() => void applyExecutionResult("not-run")}
            disabled={isSaving}
            className="rounded-2xl bg-[linear-gradient(135deg,_#475569_0%,_#334155_100%)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset To Not Run
          </button>
        </div>
      </section>
        </div>
      </details>

      <section className="overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_24px_55px_-38px_rgba(15,23,42,0.22)] dark:border-zinc-800 dark:bg-zinc-900/94">
        <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Execution Queue
              </p>
              <p className="mt-1 text-xs tracking-wide text-zinc-500 dark:text-zinc-400">
                Showing {filteredRows.length} of {rowsForRun.length} cases in {activeRun?.name ?? "the current run"}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHighRiskOnly(true)}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
              >
                High-risk rows: {visibleHighRiskCount}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHighRiskOnly(true);
                  setExecutionFilter("failed");
                }}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
              >
                Failed steps: {visibleFailedStepCount}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHighRiskOnly(true);
                  setExecutionFilter("blocked");
                }}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                Blocked steps: {visibleBlockedStepCount}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-zinc-50/90 dark:bg-zinc-950/70">
              <tr>
                <th className="border-b border-zinc-200 px-4 py-3 text-left dark:border-zinc-800">
                  <input
                    type="checkbox"
                    checked={
                      filteredRows.length > 0 &&
                      filteredRows.every((row) => selectedRowIds.includes(row.id))
                    }
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    aria-label="Select all visible cases in run"
                  />
                </th>
                <th className="border-b border-zinc-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Case
                </th>
                <th className="border-b border-zinc-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Linked Issue
                </th>
                <th className="border-b border-zinc-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Owner
                </th>
                <th className="border-b border-zinc-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Execution
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    No cases match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="bg-white/70 dark:bg-transparent">
                    <td className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.includes(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label={`Select ${row.id} for run update`}
                      />
                    </td>
                    <td className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setFocusedRowId(row.id)}
                        className="w-full text-left"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        {row.id}
                        </p>
                        <p className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                        {row.title.trim() || "Untitled test case"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.automationScriptId ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                              Automated
                            </span>
                          ) : null}
                          {latestAutomationExecutionByRowId[row.id] ? (
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                latestAutomationExecutionByRowId[row.id].status === "passed"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : latestAutomationExecutionByRowId[row.id].status === "failed"
                                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                                    : latestAutomationExecutionByRowId[row.id].status === "blocked"
                                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                                      : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                              }`}
                            >
                              Automation {latestAutomationExecutionByRowId[row.id].status}
                            </span>
                          ) : null}
                        </div>
                        {(rowStepSignals[row.id]?.failedSteps > 0 ||
                          rowStepSignals[row.id]?.blockedSteps > 0 ||
                          rowStepSignals[row.id]?.passedSteps > 0) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {rowStepSignals[row.id]?.failedSteps > 0 && (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                                {rowStepSignals[row.id].failedSteps} failed step
                                {rowStepSignals[row.id].failedSteps === 1 ? "" : "s"}
                              </span>
                            )}
                            {rowStepSignals[row.id]?.blockedSteps > 0 && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                {rowStepSignals[row.id].blockedSteps} blocked step
                                {rowStepSignals[row.id].blockedSteps === 1 ? "" : "s"}
                              </span>
                            )}
                            {rowStepSignals[row.id]?.passedSteps > 0 &&
                              rowStepSignals[row.id].failedSteps === 0 &&
                              rowStepSignals[row.id].blockedSteps === 0 && (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  {rowStepSignals[row.id].passedSteps} passed step
                                  {rowStepSignals[row.id].passedSteps === 1 ? "" : "s"}
                                </span>
                              )}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
                      {row.issueKey ? (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                          {row.issueKey}
                        </span>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400">Unlinked</span>
                      )}
                    </td>
                    <td className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
                      <span className="text-zinc-700 dark:text-zinc-200">
                        {row.assignee?.trim() || "Unassigned"}
                      </span>
                    </td>
                    <td className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          executionTone[row.executionResult ?? "not-run"]
                        }`}
                      >
                        {row.executionResult ?? "not-run"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-200/80 bg-white/94 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/92">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Execution Details
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Capture what actually happened during the active run for the selected case.
            </p>
          </div>
          {focusedRow && (
            <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
              {focusedRow.id}
            </div>
          )}
        </div>

        {!focusedRow ? (
          <div className="mt-4 rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Select a case from the execution queue to record actual results and run notes.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {focusedRow.title.trim() || "Untitled test case"}
              </p>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    executionTone[focusedRow.executionResult ?? "not-run"]
                  }`}
                >
                  {focusedRow.executionResult ?? "not-run"}
                </span>
                {focusedRow.issueKey && (
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                    {focusedRow.issueKey}
                  </span>
                )}
              </div>
              <textarea
                value={actualResultDraft}
                onChange={(event) => setActualResultDraft(event.target.value)}
                placeholder="Actual result observed during execution"
                rows={5}
                className="min-h-[144px] w-full resize-y rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <div className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  Step-Level Execution
                </p>
                {focusedRowSteps.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                    No structured steps were detected for this case yet.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {focusedRowSteps.map((step, index) => {
                      const stepKey = String(index + 1);
                      const currentResult =
                        activeRun?.rowStepResults[focusedRow.id]?.[stepKey] ?? "not-run";

                      return (
                        <div
                          key={`${focusedRow.id}-step-${stepKey}`}
                          className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                                  Step {stepKey}
                                </p>
                                <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100">
                                  {step}
                                </p>
                              </div>
                              <select
                                value={currentResult}
                                onChange={(event) =>
                                  void updateFocusedStepResult(
                                    stepKey,
                                    event.target.value as TestCaseExecutionResult
                                  )
                                }
                                className="min-h-[40px] rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                              >
                                <option value="not-run">Not Run</option>
                                <option value="passed">Passed</option>
                                <option value="failed">Failed</option>
                                <option value="blocked">Blocked</option>
                              </select>
                            </div>
                            <div className="min-w-0 flex-1">
                              <textarea
                                value={stepDrafts[stepKey]?.note ?? ""}
                                onChange={(event) =>
                                  setStepDrafts((current) => ({
                                    ...current,
                                    [stepKey]: {
                                      note: event.target.value,
                                      actual: current[stepKey]?.actual ?? "",
                                      evidence: current[stepKey]?.evidence ?? "",
                                    },
                                  }))
                                }
                                rows={3}
                                placeholder="Step-specific note, repro detail, or blocker"
                                className="min-h-[88px] w-full resize-y rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                              />
                              <textarea
                                value={stepDrafts[stepKey]?.actual ?? ""}
                                onChange={(event) =>
                                  setStepDrafts((current) => ({
                                    ...current,
                                    [stepKey]: {
                                      note: current[stepKey]?.note ?? "",
                                      actual: event.target.value,
                                      evidence: current[stepKey]?.evidence ?? "",
                                    },
                                  }))
                                }
                                rows={2}
                                placeholder="Actual result for this step"
                                className="mt-2 min-h-[68px] w-full resize-y rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                              />
                              <input
                                type="text"
                                value={stepDrafts[stepKey]?.evidence ?? ""}
                                onChange={(event) =>
                                  setStepDrafts((current) => ({
                                    ...current,
                                    [stepKey]: {
                                      note: current[stepKey]?.note ?? "",
                                      actual: current[stepKey]?.actual ?? "",
                                      evidence: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Evidence link / screenshot note / attachment ref"
                                className="mt-2 min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void saveFocusedStepNote(stepKey)}
                                disabled={isSaving}
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                              >
                                Save Step Note
                              </button>
                              {(currentResult === "failed" || currentResult === "blocked") && (
                                <button
                                  type="button"
                                  onClick={() => generateBugDraftFromStep(stepKey, step)}
                                  disabled={isSaving || isCreatingBug}
                                  className="rounded-2xl bg-[linear-gradient(135deg,_#7c3aed_0%,_#4f46e5_100%)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Draft Bug From Step
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {focusedAutomationExecution ? (
                <div className="rounded-[20px] border border-sky-200 bg-sky-50/90 px-4 py-4 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                        Latest Automation Execution
                      </p>
                      <p className="mt-1 text-sm">
                        {focusedAutomationExecution.provider} reported{" "}
                        <span className="font-semibold">
                          {focusedAutomationExecution.status}
                        </span>
                        .
                      </p>
                    </div>
                    {focusedAutomationExecution.linkedIssueKey ? (
                      <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-300">
                        Linked {focusedAutomationExecution.linkedIssueKey}
                      </span>
                    ) : null}
                  </div>
                  {focusedAutomationExecution.failureMessage ? (
                    <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                      {focusedAutomationExecution.failureMessage}
                    </p>
                  ) : null}
                  {focusedAutomationExecution.failureOrigin ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-300">
                        Failure source:{" "}
                        {focusedAutomationExecution.failureOrigin === "shared-block"
                          ? "Shared block"
                          : "Local case step"}
                      </span>
                      {focusedAutomationExecution.failureReferenceId ? (
                        <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          Ref {focusedAutomationExecution.failureReferenceId}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {focusedAutomationExecution.logSummary ? (
                    <pre className="mt-3 overflow-x-auto rounded-2xl bg-zinc-950 px-3 py-3 text-[11px] leading-5 text-zinc-100">
                      {focusedAutomationExecution.logSummary}
                    </pre>
                  ) : null}
                  {focusedAutomationArtifacts.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {focusedAutomationArtifacts.map((artifact) => (
                        <div
                          key={artifact.id}
                          className="rounded-2xl border border-sky-200/60 bg-white px-3 py-2 text-xs text-sky-900 dark:border-sky-500/20 dark:bg-zinc-950 dark:text-sky-100"
                        >
                          <p className="font-semibold capitalize">{artifact.type}</p>
                          <p className="mt-1 break-all text-sky-700/80 dark:text-sky-200/80">
                            {artifact.path}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <textarea
                value={executionNotesDraft}
                onChange={(event) => setExecutionNotesDraft(event.target.value)}
                placeholder="Execution notes, blockers, environment details, repro hints"
                rows={8}
                className="min-h-[220px] w-full resize-y rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <button
                type="button"
                onClick={() => void saveFocusedExecutionDetails()}
                disabled={isSaving}
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save Execution Notes
              </button>
              {activeRun &&
                ((activeRun.rowResults[focusedRow.id] ?? focusedRow.executionResult ?? "not-run") ===
                  "failed" ||
                  (activeRun.rowResults[focusedRow.id] ?? focusedRow.executionResult ?? "not-run") ===
                    "blocked") && (
                  <button
                    type="button"
                    onClick={generateBugDraft}
                    disabled={isSaving || isCreatingBug}
                    className="rounded-2xl bg-[linear-gradient(135deg,_#7c3aed_0%,_#4f46e5_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(99,102,241,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Generate Bug Draft
                  </button>
                )}
              {activeRun?.linkedDefectIds[focusedRow.id]?.length ? (
                <div className="rounded-[20px] border border-violet-200 bg-violet-50/90 px-4 py-3 text-sm text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
                  {activeRun.linkedDefectIds[focusedRow.id].length} defect
                  {activeRun.linkedDefectIds[focusedRow.id].length === 1 ? "" : "s"} linked to this run case already.
                </div>
              ) : null}
              {focusedAutomationExecution &&
              (focusedAutomationExecution.status === "failed" ||
                focusedAutomationExecution.status === "blocked") &&
              !focusedAutomationExecution.linkedIssueId ? (
                <button
                  type="button"
                  onClick={() => void createIssueFromAutomationFailure()}
                  disabled={isSaving || isCreatingBug}
                  className="rounded-2xl bg-[linear-gradient(135deg,_#991b1b_0%,_#dc2626_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(220,38,38,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingBug ? "Creating Issue..." : "Create Issue From Automation Failure"}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {bugDraft && focusedRow ? (
        <section className="rounded-[24px] border border-zinc-200/80 bg-white/94 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/92">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Bug Draft
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Review the generated defect draft before creating the issue.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBugDraft(null)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Clear Draft
            </button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <input
                type="text"
                value={bugDraft.title}
                onChange={(event) =>
                  setBugDraft((currentDraft) =>
                    currentDraft
                      ? {
                          ...currentDraft,
                          title: event.target.value,
                        }
                      : currentDraft
                  )
                }
                className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <select
                value={bugDraft.priority}
                onChange={(event) =>
                  setBugDraft((currentDraft) =>
                    currentDraft
                      ? {
                          ...currentDraft,
                          priority: event.target.value as BugDraft["priority"],
                        }
                      : currentDraft
                  )
                }
                className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              >
                <option value="highest">Highest</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                type="text"
                value={bugDraft.labels.join(", ")}
                onChange={(event) =>
                  setBugDraft((currentDraft) =>
                    currentDraft
                      ? {
                          ...currentDraft,
                          labels: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        }
                      : currentDraft
                  )
                }
                placeholder="Labels: run-failure, checkout"
                className="min-h-[44px] w-full rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </div>
            <div className="space-y-3">
              <textarea
                value={bugDraft.description}
                onChange={(event) =>
                  setBugDraft((currentDraft) =>
                    currentDraft
                      ? {
                          ...currentDraft,
                          description: event.target.value,
                        }
                      : currentDraft
                  )
                }
                rows={12}
                className="min-h-[260px] w-full resize-y rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <button
                type="button"
                onClick={() => void createBugFromDraft()}
                disabled={isSaving || isCreatingBug}
                className="rounded-2xl bg-[linear-gradient(135deg,_#991b1b_0%,_#dc2626_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(220,38,38,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingBug ? "Creating Bug..." : "Create Bug Issue"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {createdBug ? (
        <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">{createdBug.issueKey} was created and linked back to the case.</p>
              <p className="mt-1 text-emerald-800/80 dark:text-emerald-200/80">
                The source case now carries this defect link, and the run keeps the defect history too.
              </p>
            </div>
            <a
              href={`/projects/${encodeURIComponent(project.projectKey?.trim() || project.id)}/issues?issueId=${encodeURIComponent(createdBug.id)}`}
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-400/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-zinc-900"
            >
              Open Created Bug
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}
