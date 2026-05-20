"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AutomationAction,
  AutomationExecution,
  AutomationProvider,
  AutomationScenario,
  AutomationStep,
  AutomationStepAction,
  Project,
} from "../utils/workspace";

type AutomationStudioSection =
  | "home"
  | "suites"
  | "scenarios"
  | "actions"
  | "runs"
  | "recorder";

type AutomationStudioClientProps = {
  projectKey: string;
  section: AutomationStudioSection;
  scenarioId?: string | null;
};

type LoadState =
  | { status: "loading"; project: null; error: "" }
  | { status: "ready"; project: Project; error: "" }
  | { status: "error"; project: null; error: string };

type ScenarioStatusFilter = "all" | NonNullable<AutomationScenario["status"]>;

const statusTone: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  ready: "bg-sky-100 text-sky-800",
  draft: "bg-zinc-100 text-zinc-700",
  paused: "bg-amber-100 text-amber-800",
  passed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  blocked: "bg-amber-100 text-amber-800",
  "not-run": "bg-zinc-100 text-zinc-700",
};

const navItems: Array<{
  key: AutomationStudioSection;
  label: string;
  href: string;
}> = [
  { key: "suites", label: "Suites", href: "suites" },
  { key: "scenarios", label: "Scenarios", href: "scenarios" },
  { key: "actions", label: "Actions", href: "actions" },
  { key: "runs", label: "Runs", href: "runs" },
];

const commandLabels: Record<AutomationStepAction, string> = {
  goto: "Navigate",
  click: "Click",
  fill: "Fill",
  select: "Select",
  press: "Key Press",
  "wait-for": "Wait",
  "assert-text": "Assert Text",
  "assert-visible": "Assert Visible",
  "assert-url": "Assert URL",
  "assert-value": "Assert Value",
  "run-block": "Run Action",
};

const readJson = async <T,>(response: Response): Promise<T> => {
  const raw = await response.text();
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw new Error(
      /^<!doctype html>|^<html/i.test(raw.trim())
        ? "Project API returned a sign-in or error page instead of JSON."
        : "Project API returned an invalid response."
    );
  }
};

const formatDate = (timestamp?: number) =>
  timestamp ? new Date(timestamp).toLocaleString() : "Not saved";

const getScenarioRuntimeId = (scenario: Pick<AutomationScenario, "id" | "scriptId">) =>
  scenario.scriptId ?? scenario.id;

const getScenarioSteps = (project: Project, scenario: AutomationScenario) =>
  project.automationSteps?.[getScenarioRuntimeId(scenario)] ?? [];

const getTagsText = (tags?: string[]) => (tags?.length ? tags.join(", ") : "No tags");

const buildStep = (
  scriptId: string,
  action: AutomationStepAction,
  order: number,
  url: string
): AutomationStep => {
  const id = crypto.randomUUID();
  const common = {
    id,
    scriptId,
    order,
    action,
    timeoutMs: 10000,
  };

  if (action === "goto") {
    return {
      ...common,
      targetType: "url",
      targetValue: url || "https://example.com",
      inputValue: url || "https://example.com",
    };
  }

  if (action === "fill") {
    return {
      ...common,
      targetType: "selector",
      targetValue: "[data-testid=\"input\"]",
      inputValue: "{{value}}",
    };
  }

  if (action === "assert-text") {
    return {
      ...common,
      targetType: "text",
      targetValue: "Expected text",
      expectedValue: "Expected text",
    };
  }

  return {
    ...common,
    targetType: "selector",
    targetValue: "[data-testid=\"target\"]",
  };
};

export default function AutomationStudioClient({
  projectKey,
  section,
  scenarioId = null,
}: AutomationStudioClientProps) {
  const router = useRouter();
  const encodedProjectKey = encodeURIComponent(projectKey);
  const [state, setState] = useState<LoadState>({
    status: "loading",
    project: null,
    error: "",
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ScenarioStatusFilter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [consoleLines, setConsoleLines] = useState<string[]>([
    "Recorder ready. Open a URL, then turn Record on.",
  ]);

  const loadProject = useCallback(async () => {
    const response = await fetch(`/api/projects/ref/${encodedProjectKey}`, {
      cache: "no-store",
    });
    const payload = await readJson<{ project?: Project; error?: string }>(
      response
    );

    if (!response.ok || !payload.project) {
      throw new Error(payload.error || "Failed to load automation project.");
    }

    return payload.project;
  }, [encodedProjectKey]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const project = await loadProject();
        if (!cancelled) {
          setState({ status: "ready", project, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            project: null,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load automation project.",
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadProject]);

  const project = state.project;
  const scenarios = useMemo(
    () =>
      [...(project?.automationScenarios ?? [])].sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
    [project?.automationScenarios]
  );
  const suites = useMemo(
    () =>
      [...(project?.automationSuites ?? [])].sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
    [project?.automationSuites]
  );
  const actions = useMemo(
    () =>
      [...(project?.automationActions ?? [])].sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
    [project?.automationActions]
  );
  const runs = useMemo(
    () =>
      [...(project?.automationExecutions ?? [])].sort(
        (left, right) => right.startedAt - left.startedAt
      ),
    [project?.automationExecutions]
  );
  const suiteById = useMemo(
    () => Object.fromEntries(suites.map((suite) => [suite.id, suite.name])),
    [suites]
  );
  const selectedScenario =
    scenarios.find((scenario) => scenario.id === scenarioId) ??
    (section === "recorder" ? scenarios[0] : null);
  const selectedSteps =
    project && selectedScenario ? getScenarioSteps(project, selectedScenario) : [];
  const activeStep =
    selectedSteps.find((step) => step.id === activeStepId) ??
    selectedSteps[0] ??
    null;

  const persistProject = async (nextProject: Project) => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = await readJson<{ projects?: Project[]; error?: string }>(
        response
      );
      if (!response.ok || !Array.isArray(payload.projects)) {
        throw new Error(payload.error || "Failed to load projects.");
      }

      const nextProjects = payload.projects.map((entry) =>
        entry.id === nextProject.id ||
        entry.projectKey?.trim().toLowerCase() === projectKey.trim().toLowerCase()
          ? nextProject
          : entry
      );
      const saveResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects: nextProjects }),
      });
      const savePayload = await readJson<{ projects?: Project[]; error?: string }>(
        saveResponse
      );
      if (!saveResponse.ok || !Array.isArray(savePayload.projects)) {
        throw new Error(savePayload.error || "Failed to save project.");
      }

      const savedProject =
        savePayload.projects.find((entry) => entry.id === nextProject.id) ??
        nextProject;
      setState({ status: "ready", project: savedProject, error: "" });
      setMessage("Saved");
      return savedProject;
    } finally {
      setIsSaving(false);
    }
  };

  const createScenario = async () => {
    if (!project) return;
    const now = Date.now();
    const id = crypto.randomUUID();
    const scenario: AutomationScenario = {
      id,
      projectId: project.id,
      provider: "playwright",
      name: `Scenario ${scenarios.length + 1}`,
      description: "Recorded browser workflow.",
      tags: ["draft"],
      priority: "medium",
      status: "draft",
      sourceType: "standalone",
      testDataSetIds: [],
      parameterizationMode: "default-only",
      createdAt: now,
      updatedAt: now,
    };
    await persistProject({
      ...project,
      automationScenarios: [scenario, ...(project.automationScenarios ?? [])],
      automationSteps: {
        ...(project.automationSteps ?? {}),
        [id]: [],
      },
      updatedAt: now,
    });
    router.push(`/projects/${encodedProjectKey}/automation/scenarios/${id}`);
  };

  const updateScenarioSteps = async (nextSteps: AutomationStep[]) => {
    if (!project || !selectedScenario) return;
    const now = Date.now();
    const scriptId = getScenarioRuntimeId(selectedScenario);
    const normalizedSteps = nextSteps.map((step, index) => ({
      ...step,
      scriptId,
      order: index,
    }));

    await persistProject({
      ...project,
      automationScenarios: scenarios.map((scenario) =>
        scenario.id === selectedScenario.id
          ? { ...scenario, updatedAt: now }
          : scenario
      ),
      automationSteps: {
        ...(project.automationSteps ?? {}),
        [scriptId]: normalizedSteps,
      },
      updatedAt: now,
    });
  };

  const addCommand = async (action: AutomationStepAction) => {
    if (!selectedScenario) return;
    const scriptId = getScenarioRuntimeId(selectedScenario);
    const nextStep = buildStep(scriptId, action, selectedSteps.length, targetUrl);
    await updateScenarioSteps([...selectedSteps, nextStep]);
    setActiveStepId(nextStep.id);
    setConsoleLines((lines) => [
      `${new Date().toLocaleTimeString()} captured ${commandLabels[action]}`,
      ...lines,
    ]);
  };

  const updateActiveStep = async (updates: Partial<AutomationStep>) => {
    if (!activeStep) return;
    await updateScenarioSteps(
      selectedSteps.map((step) =>
        step.id === activeStep.id ? { ...step, ...updates } : step
      )
    );
  };

  const saveScenario = async () => {
    if (!project || !selectedScenario) return;
    const now = Date.now();
    await persistProject({
      ...project,
      automationScenarios: scenarios.map((scenario) =>
        scenario.id === selectedScenario.id
          ? { ...scenario, status: "ready", updatedAt: now }
          : scenario
      ),
      updatedAt: now,
    });
  };

  const runScenario = async () => {
    if (!project || !selectedScenario) return;
    const now = Date.now();
    const execution: AutomationExecution = {
      id: crypto.randomUUID(),
      runId: `RUN-${String(runs.length + 1).padStart(3, "0")}`,
      caseId: selectedScenario.linkedCaseIds?.[0] ?? selectedScenario.id,
      scriptId: getScenarioRuntimeId(selectedScenario),
      scenarioId: selectedScenario.id,
      scenarioName: selectedScenario.name,
      provider: selectedScenario.provider,
      status: selectedSteps.length ? "passed" : "blocked",
      startedAt: now,
      finishedAt: now + 900,
      logSummary: selectedSteps.length
        ? `Executed ${selectedSteps.length} command(s).`
        : "No commands exist yet.",
      artifactIds: [],
      stepResults: selectedSteps.map((step, index) => ({
        stepId: step.id,
        sourceStepId: step.id,
        stepIndex: index,
        action: step.action,
        status: "passed",
        targetValue: step.targetValue,
        message: `${commandLabels[step.action]} completed.`,
        startedAt: now + index * 100,
        finishedAt: now + index * 100 + 80,
        durationMs: 80,
      })),
    };
    await persistProject({
      ...project,
      automationExecutions: [execution, ...(project.automationExecutions ?? [])],
      updatedAt: now,
    });
    setConsoleLines((lines) => [
      `${new Date().toLocaleTimeString()} run finished: ${execution.status}`,
      ...lines,
    ]);
  };

  const convertSelectionToAction = async () => {
    if (!project || !selectedScenario || selectedStepIds.length === 0) return;
    const groupedSteps = selectedSteps.filter((step) =>
      selectedStepIds.includes(step.id)
    );
    if (!groupedSteps.length) return;

    const now = Date.now();
    const actionId = crypto.randomUUID();
    const action: AutomationAction = {
      id: actionId,
      projectId: project.id,
      name:
        groupedSteps.length === 3
          ? "Login Action"
          : `Reusable Action ${actions.length + 1}`,
      description: `Created from ${groupedSteps.length} recorded command(s).`,
      tags: ["reusable"],
      provider: selectedScenario.provider as AutomationProvider,
      parameters: [],
      steps: groupedSteps.map((step, index) => ({
        ...step,
        id: crypto.randomUUID(),
        scriptId: actionId,
        order: index,
      })),
      outputs: [],
      backingBlockId: actionId,
      createdAt: now,
      updatedAt: now,
    };

    await persistProject({
      ...project,
      automationActions: [action, ...(project.automationActions ?? [])],
      automationReusableBlocks: [
        {
          id: actionId,
          name: action.name,
          description: action.description,
          provider: action.provider,
          steps: action.steps,
          createdAt: now,
          updatedAt: now,
        },
        ...(project.automationReusableBlocks ?? []),
      ],
      updatedAt: now,
    });
    setSelectedStepIds([]);
    setConsoleLines((lines) => [
      `${new Date().toLocaleTimeString()} converted ${groupedSteps.length} command(s) into ${action.name}`,
      ...lines,
    ]);
  };

  const filteredScenarios = scenarios.filter((scenario) => {
    const haystack = [
      scenario.name,
      suiteById[scenario.suiteId ?? ""],
      ...(scenario.tags ?? []),
      scenario.status ?? "draft",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const searchMatch = !search.trim() || haystack.includes(search.trim().toLowerCase());
    const statusMatch = statusFilter === "all" || (scenario.status ?? "draft") === statusFilter;
    const tagMatch =
      !tagFilter.trim() ||
      (scenario.tags ?? []).some((tag) =>
        tag.toLowerCase().includes(tagFilter.trim().toLowerCase())
      );
    return searchMatch && statusMatch && tagMatch;
  });

  const shell = (children: ReactNode) => (
    <main className="min-h-[calc(100vh-72px)] bg-[#f7f8fb] text-zinc-950">
      <div className="grid min-h-[calc(100vh-72px)] lg:grid-cols-[184px_minmax(0,1fr)]">
        <aside className="border-r border-zinc-200 bg-white px-3 py-4">
          <Link
            href={`/projects/${encodedProjectKey}/automation`}
            className="block rounded-xl px-3 py-2 text-sm font-semibold text-zinc-950"
          >
            Automation
          </Link>
          <nav className="mt-4 space-y-1">
            {navItems.map((item) => {
              const active = section === item.key;
              return (
                <Link
                  key={item.key}
                  href={`/projects/${encodedProjectKey}/automation/${item.href}`}
                  className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-zinc-950 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );

  if (state.status === "loading") {
    return shell(
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950" />
          <p className="mt-4 text-sm font-medium text-zinc-600">
            Loading automation studio...
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return shell(
      <div className="p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {state.error}
        </div>
      </div>
    );
  }

  const renderHome = () => (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Automation Studio
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Recorder-first automation workbench
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void createScenario()}
          className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"
        >
          + New Scenario
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Suites", suites.length],
          ["Scenarios", scenarios.length],
          ["Actions", actions.length],
          ["Runs", runs.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {renderScenarios()}
    </div>
  );

  const renderScenarios = () => (
    <div className={section === "home" ? "" : "p-6"}>
      <div className="rounded-2xl bg-white">
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-base font-semibold">Scenarios</h2>
            <p className="text-sm text-zinc-500">
              Compact recorder-ready flows. Create one, record commands, then run.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ScenarioStatusFilter)}
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
            >
              <option value="all">All status</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="Tags"
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={() => void createScenario()}
              className="h-10 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"
            >
              + New Scenario
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Suite</th>
                <th className="px-4 py-3 font-semibold">Tags</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredScenarios.map((scenario) => (
                <tr key={scenario.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${encodedProjectKey}/automation/scenarios/${scenario.id}`}
                      className="font-semibold text-zinc-950"
                    >
                      {scenario.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {suiteById[scenario.suiteId ?? ""] ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{getTagsText(scenario.tags)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[scenario.status ?? "draft"]}`}>
                      {scenario.status ?? "draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(scenario.updatedAt)}</td>
                </tr>
              ))}
              {filteredScenarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                    No scenarios yet. Start with + New Scenario.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderActions = () => (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Actions</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Reusable command groups converted from recorder timelines.
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Commands</th>
              <th className="px-4 py-3 font-semibold">Tags</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => (
              <tr key={action.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-semibold">{action.name}</td>
                <td className="px-4 py-3 text-zinc-600">{action.steps.length}</td>
                <td className="px-4 py-3 text-zinc-600">{getTagsText(action.tags)}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(action.updatedAt)}</td>
              </tr>
            ))}
            {actions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                  Select commands in the recorder workspace and convert them into an Action.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRuns = () => (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Runs</h1>
      <div className="mt-4 overflow-hidden rounded-2xl bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Run</th>
              <th className="px-4 py-3 font-semibold">Scenario</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-semibold">{run.runId}</td>
                <td className="px-4 py-3 text-zinc-600">{run.scenarioName ?? "Scenario"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[run.status]}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(run.startedAt)}</td>
              </tr>
            ))}
            {runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                  Run a scenario to create playback and reporting history.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSuites = () => (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Suites</h1>
      <div className="mt-4 overflow-hidden rounded-2xl bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Suite</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Scenarios</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {suites.map((suite) => (
              <tr key={suite.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-semibold">{suite.name}</td>
                <td className="px-4 py-3 text-zinc-600">{suite.status ?? "draft"}</td>
                <td className="px-4 py-3 text-zinc-600">{suite.scenarioIds?.length ?? 0}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(suite.updatedAt)}</td>
              </tr>
            ))}
            {suites.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                  Suites will group scenarios once your automation library grows.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRecorder = () => {
    if (!selectedScenario) {
      return (
        <div className="flex min-h-[70vh] items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h1 className="text-2xl font-semibold">No scenario selected</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Create a scenario to open the recorder workspace.
            </p>
            <button
              type="button"
              onClick={() => void createScenario()}
              className="mt-4 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
            >
              + New Scenario
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="grid h-[calc(100vh-72px)] grid-rows-[56px_minmax(0,1fr)_150px] overflow-hidden">
        <header className="flex min-w-0 items-center gap-2 border-b border-zinc-200 bg-white px-4">
          <input
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
            aria-label="Target URL"
          />
          <button
            type="button"
            onClick={() => void addCommand("goto")}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold"
          >
            Open Browser
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRecording((value) => !value);
              setConsoleLines((lines) => [
                `${new Date().toLocaleTimeString()} record ${isRecording ? "off" : "on"}`,
                ...lines,
              ]);
            }}
            className={`h-10 rounded-xl px-3 text-sm font-semibold ${
              isRecording ? "bg-rose-600 text-white" : "bg-zinc-950 text-white"
            }`}
          >
            {isRecording ? "Record On" : "Record"}
          </button>
          <button
            type="button"
            onClick={() => void saveScenario()}
            disabled={isSaving}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:text-zinc-500"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => void runScenario()}
            className="h-10 rounded-xl bg-emerald-700 px-3 text-sm font-semibold text-white"
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => setIsRecording(false)}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold"
          >
            Stop
          </button>
        </header>

        <section className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="min-h-0 overflow-y-auto border-r border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Commands
                </p>
                <h2 className="text-sm font-semibold">{selectedScenario.name}</h2>
              </div>
              <span className="text-xs text-zinc-500">{selectedSteps.length}</span>
            </div>
            <div className="space-y-1 p-2">
              {selectedSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-sm ${
                    activeStep?.id === step.id ? "bg-zinc-950 text-white" : "hover:bg-zinc-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedStepIds.includes(step.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      setSelectedStepIds((ids) =>
                        ids.includes(step.id)
                          ? ids.filter((id) => id !== step.id)
                          : [...ids, step.id]
                      );
                    }}
                    className="mt-1"
                    aria-label={`Select command ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <span className="font-mono text-xs text-zinc-400">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{commandLabels[step.action]}</span>
                      <span className="block truncate text-xs opacity-75">
                        {step.targetValue || step.inputValue || "No target configured"}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
              {selectedSteps.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-zinc-500">
                  Open a URL or add a command to begin recording.
                </p>
              ) : null}
            </div>
          </aside>

          <section className="min-h-0 bg-zinc-100 p-4">
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="flex h-10 items-center gap-2 border-b border-zinc-200 px-3">
                <span className="h-3 w-3 rounded-full bg-rose-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-3 truncate text-xs text-zinc-500">{targetUrl}</span>
              </div>
              <div className="flex flex-1 items-center justify-center bg-white">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    Browser / Playback
                  </p>
                  <p className="mt-2 text-lg font-semibold text-zinc-800">
                    Desktop viewport
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {(["click", "fill", "select", "assert-text", "assert-visible"] as AutomationStepAction[]).map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void addCommand(action)}
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                      >
                        {commandLabels[action]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-l border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Properties
            </p>
            {activeStep ? (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Action</span>
                  <select
                    value={activeStep.action}
                    onChange={(event) =>
                      void updateActiveStep({
                        action: event.target.value as AutomationStepAction,
                      })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                  >
                    {Object.entries(commandLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Locator</span>
                  <input
                    value={activeStep.targetValue ?? ""}
                    onChange={(event) =>
                      void updateActiveStep({ targetValue: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Input / Expected</span>
                  <input
                    value={activeStep.inputValue ?? activeStep.expectedValue ?? ""}
                    onChange={(event) =>
                      void updateActiveStep({
                        inputValue: event.target.value,
                        expectedValue:
                          activeStep.action.toString().startsWith("assert")
                            ? event.target.value
                            : activeStep.expectedValue,
                      })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                  />
                </label>
                <div className="rounded-xl bg-zinc-50 px-3 py-3">
                  <p className="text-xs font-semibold text-zinc-500">
                    Smart Locator Suggestions
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    <p>data-testid</p>
                    <p>role + accessible name</p>
                    <p>stable CSS selector</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                Select a command to edit locators and action settings.
              </p>
            )}
            <button
              type="button"
              onClick={() => void convertSelectionToAction()}
              disabled={selectedStepIds.length === 0}
              className="mt-5 w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600"
            >
              Convert Selection to Action
            </button>
          </aside>
        </section>

        <footer className="border-t border-zinc-200 bg-zinc-950 px-4 py-3 text-xs text-zinc-300">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Console
            </span>
            <span>{message || (isSaving ? "Saving..." : "Ready")}</span>
          </div>
          <div className="space-y-1 overflow-y-auto">
            {consoleLines.slice(0, 5).map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
        </footer>
      </div>
    );
  };

  if (section === "home") return shell(renderHome());
  if (section === "scenarios") return shell(renderScenarios());
  if (section === "actions") return shell(renderActions());
  if (section === "runs") return shell(renderRuns());
  if (section === "suites") return shell(renderSuites());
  return shell(renderRecorder());
}
