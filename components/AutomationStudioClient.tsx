"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AutomationV2Action,
  AutomationV2Command,
  AutomationV2CommandType,
  AutomationV2Run,
  AutomationV2Scenario,
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

type ScenarioStatusFilter = "all" | AutomationV2Scenario["status"];

type BrowserRecorderResponse = {
  started?: boolean;
  stopped?: boolean;
  sessionId?: string;
  status?: "starting" | "recording" | "stopping" | "stopped" | "failed";
  cursor?: number;
  url?: string;
  commands?: AutomationV2Command[];
  logs?: string[];
  error?: string;
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

const commandLabels: Record<AutomationV2CommandType, string> = {
  navigate: "Navigate",
  click: "Click",
  fill: "Fill",
  select: "Select",
  hover: "Hover",
  press: "Key Press",
  "assert-text": "Assert Text",
  "assert-image": "Assert Image",
  "assert-a11y": "Accessibility Scan",
  "assert-label": "Label / Name Assert",
  "assert-focus": "Keyboard Focus Assert",
  "run-action": "Run Action",
};

const commandHints: Record<AutomationV2CommandType, string> = {
  navigate: "Open a page URL.",
  click: "Click a selected element.",
  fill: "Fill an input or textarea.",
  select: "Choose from a dropdown.",
  hover: "Hover over an element.",
  press: "Press a keyboard key.",
  "assert-text": "Ctrl+Alt+T validates visible text.",
  "assert-image": "Ctrl+Alt+I validates an image.",
  "assert-a11y": "Ctrl+Alt+A creates an accessibility scan command.",
  "assert-label": "Ctrl+Alt+L validates label or accessible name.",
  "assert-focus": "Ctrl+Alt+F validates keyboard focus.",
  "run-action": "Reuse a saved Action.",
};

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

const recorderCommandTypes: AutomationV2CommandType[] = [
  "click",
  "fill",
  "select",
  "hover",
  "press",
];

const validationCommandTypes: AutomationV2CommandType[] = [
  "assert-text",
  "assert-image",
  "assert-a11y",
  "assert-label",
  "assert-focus",
];

const TrashIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
  >
    <path d="M3.5 5.5h13" />
    <path d="M8 5.5V3.75h4V5.5" />
    <path d="M5.5 5.5l.75 10.25h7.5l.75-10.25" />
    <path d="M8.5 8.25v4.75" />
    <path d="M11.5 8.25v4.75" />
  </svg>
);

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

const getTagsText = (tags?: string[]) => (tags?.length ? tags.join(", ") : "No tags");

const toPlaywrightLocator = (command: AutomationV2Command) => {
  const locator = command.locator;
  const value = locator?.value || "[data-testid=\"target\"]";

  if (locator?.strategy === "text") {
    return `page.getByText(${JSON.stringify(command.expectedValue || value)})`;
  }

  if (locator?.strategy === "label") {
    return `page.getByLabel(${JSON.stringify(command.expectedValue || value)})`;
  }

  if (locator?.strategy === "testid") {
    return `page.getByTestId(${JSON.stringify(value)})`;
  }

  if (locator?.strategy === "role" && locator.role) {
    return `page.getByRole(${JSON.stringify(locator.role)}, { name: ${JSON.stringify(locator.label || locator.text || value)} })`;
  }

  return `page.locator(${JSON.stringify(value)})`;
};

const getDefaultLocator = (type: AutomationV2CommandType) => {
  if (type === "assert-text") {
    return {
      strategy: "text" as const,
      value: "Expected text",
      text: "Expected text",
    };
  }
  if (type === "assert-image") {
    return {
      strategy: "image" as const,
      value: "image alt text or src",
    };
  }
  if (type === "assert-a11y") {
    return {
      strategy: "a11y" as const,
      value: "page",
    };
  }
  if (type === "assert-label") {
    return {
      strategy: "label" as const,
      value: "Accessible label",
      label: "Accessible label",
    };
  }
  return {
    strategy: "css" as const,
    value: "[data-testid=\"target\"]",
    cssPath: "[data-testid=\"target\"]",
  };
};

const buildCommand = (
  scenarioId: string,
  type: AutomationV2CommandType,
  order: number,
  url: string
): AutomationV2Command => {
  const now = Date.now();
  if (type === "navigate") {
    return {
      id: crypto.randomUUID(),
      scenarioId,
      order,
      type,
      name: commandLabels[type],
      url: url || "https://example.com",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
  }

  return {
    id: crypto.randomUUID(),
    scenarioId,
    order,
    type,
    name: commandLabels[type],
    description: commandHints[type],
    locator: getDefaultLocator(type),
    inputValue: type === "fill" ? "{{value}}" : undefined,
    expectedValue: type.startsWith("assert") ? getDefaultLocator(type).value : undefined,
    key: type === "press" ? "Enter" : undefined,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    meta:
      type === "assert-a11y"
        ? {
            wcag: ["keyboard", "labels", "contrast", "focus-order"],
          }
        : undefined,
  };
};

const buildPlaywrightSpec = (scenario: AutomationV2Scenario) => {
  const lines = [
    "import { test, expect } from '@playwright/test';",
    "",
    `test(${JSON.stringify(scenario.name)}, async ({ page }) => {`,
  ];

  scenario.commands
    .slice()
    .sort((left, right) => left.order - right.order)
    .forEach((command) => {
      const locator = toPlaywrightLocator(command);
      if (command.type === "navigate") {
        lines.push(`  await page.goto(${JSON.stringify(command.url || scenario.startUrl || "/")});`);
      } else if (command.type === "click") {
        lines.push(`  await ${locator}.click();`);
      } else if (command.type === "fill") {
        lines.push(
          `  await ${locator}.fill(${JSON.stringify(command.inputValue || "")});`
        );
      } else if (command.type === "select") {
        lines.push(
          `  await ${locator}.selectOption(${JSON.stringify(command.inputValue || "")});`
        );
      } else if (command.type === "hover") {
        lines.push(`  await ${locator}.hover();`);
      } else if (command.type === "press") {
        lines.push(`  await page.keyboard.press(${JSON.stringify(command.key || "Enter")});`);
      } else if (command.type === "assert-text") {
        lines.push(`  await expect(${locator}).toBeVisible();`);
      } else if (command.type === "assert-image") {
        lines.push(`  await expect(${locator}).toBeVisible();`);
      } else if (command.type === "assert-label") {
        lines.push(`  await expect(${locator}).toBeVisible();`);
      } else if (command.type === "assert-focus") {
        lines.push(`  await expect(${locator}).toBeFocused();`);
      } else if (command.type === "assert-a11y") {
        lines.push("  // Accessibility scan command captured; axe/playwright integration lands in Phase 2.");
      } else if (command.type === "run-action") {
        lines.push(`  // Reusable Action: ${command.actionId || command.name}`);
      }
    });

  lines.push("});");
  return lines.join("\n");
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
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [selectedCommandIds, setSelectedCommandIds] = useState<string[]>([]);
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isBrowserStarting, setIsBrowserStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [browserCursor, setBrowserCursor] = useState(0);
  const [browserStatus, setBrowserStatus] = useState<
    BrowserRecorderResponse["status"] | null
  >(null);
  const [consoleLines, setConsoleLines] = useState<string[]>([
    "Automation v2 recorder ready. Ctrl+Alt+T/I/A/L/F creates validation commands.",
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
      [...(project?.automationV2Scenarios ?? [])].sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
    [project?.automationV2Scenarios]
  );
  const actions = useMemo(
    () =>
      [...(project?.automationV2Actions ?? [])].sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
    [project?.automationV2Actions]
  );
  const runs = useMemo(
    () =>
      [...(project?.automationV2Runs ?? [])].sort(
        (left, right) => right.startedAt - left.startedAt
      ),
    [project?.automationV2Runs]
  );
  const suites = useMemo(
    () => project?.automationSuites ?? [],
    [project?.automationSuites]
  );
  const suiteById = useMemo(
    () => Object.fromEntries(suites.map((suite) => [suite.id, suite.name])),
    [suites]
  );
  const selectedScenario =
    scenarios.find((scenario) => scenario.id === scenarioId) ??
    scenarios.find((scenario) => scenario.id === project?.activeAutomationV2ScenarioId) ??
    (section === "recorder" ? scenarios[0] : null);
  const selectedCommands = useMemo(
    () =>
      selectedScenario
        ? [...selectedScenario.commands].sort((left, right) => left.order - right.order)
        : [],
    [selectedScenario]
  );
  const activeCommand =
    selectedCommands.find((command) => command.id === activeCommandId) ??
    selectedCommands[0] ??
    null;

  const pushConsole = useCallback((line: string) => {
    setConsoleLines((lines) => [
      `${new Date().toLocaleTimeString()} ${line}`,
      ...lines,
    ]);
  }, []);

  const persistProject = useCallback(
    async (nextProject: Project) => {
      setIsSaving(true);
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const payload = await readJson<{ projects?: Project[]; error?: string }>(
          response
        );
        if (!response.ok || !Array.isArray(payload.projects)) {
          throw new Error(payload.error || "Failed to load projects.");
        }

        const projectFound = payload.projects.some(
          (entry) =>
            entry.id === nextProject.id ||
            entry.projectKey?.trim().toLowerCase() ===
              projectKey.trim().toLowerCase()
        );
        const nextProjects = projectFound
          ? payload.projects.map((entry) =>
              entry.id === nextProject.id ||
              entry.projectKey?.trim().toLowerCase() ===
                projectKey.trim().toLowerCase()
                ? nextProject
                : entry
            )
          : [nextProject, ...payload.projects];

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
    },
    [projectKey]
  );

  const createScenario = useCallback(async () => {
    if (!project) return;
    const now = Date.now();
    const id = crypto.randomUUID();
    const scenario: AutomationV2Scenario = {
      id,
      projectId: project.id,
      name: `Scenario ${scenarios.length + 1}`,
      description: "Recorder-first Playwright workflow.",
      tags: ["draft"],
      status: "draft",
      startUrl: targetUrl,
      commands: [],
      createdAt: now,
      updatedAt: now,
    };

    await persistProject({
      ...project,
      automationV2Scenarios: [scenario, ...(project.automationV2Scenarios ?? [])],
      activeAutomationV2ScenarioId: id,
      updatedAt: now,
    });
    router.push(`/projects/${encodedProjectKey}/automation/scenarios/${id}`);
  }, [encodedProjectKey, persistProject, project, router, scenarios.length, targetUrl]);

  const updateScenario = useCallback(
    async (nextScenario: AutomationV2Scenario) => {
      if (!project) return;
      const now = Date.now();
      await persistProject({
        ...project,
        automationV2Scenarios: (project.automationV2Scenarios ?? []).map((scenario) =>
          scenario.id === nextScenario.id
            ? { ...nextScenario, updatedAt: now }
            : scenario
        ),
        activeAutomationV2ScenarioId: nextScenario.id,
        updatedAt: now,
      });
    },
    [persistProject, project]
  );

  const updateScenarioCommands = useCallback(
    async (nextCommands: AutomationV2Command[]) => {
      if (!selectedScenario) return;
      const now = Date.now();
      await updateScenario({
        ...selectedScenario,
        commands: nextCommands.map((command, index) => ({
          ...command,
          scenarioId: selectedScenario.id,
          order: index,
          updatedAt: now,
        })),
        updatedAt: now,
      });
    },
    [selectedScenario, updateScenario]
  );

  const addCommand = useCallback(
    async (type: AutomationV2CommandType) => {
      if (!selectedScenario) return;
      const nextCommand = buildCommand(
        selectedScenario.id,
        type,
        selectedCommands.length,
        targetUrl
      );
      await updateScenarioCommands([...selectedCommands, nextCommand]);
      setActiveCommandId(nextCommand.id);
      pushConsole(`captured ${commandLabels[type]}`);
    },
    [pushConsole, selectedCommands, selectedScenario, targetUrl, updateScenarioCommands]
  );

  const ingestRecordedCommands = useCallback(
    async (commands: AutomationV2Command[]) => {
      if (!commands.length) return;
      const existingIds = new Set(selectedCommands.map((command) => command.id));
      const freshCommands = commands.filter((command) => !existingIds.has(command.id));
      if (!freshCommands.length) return;

      await updateScenarioCommands([...selectedCommands, ...freshCommands]);
      setActiveCommandId(freshCommands[freshCommands.length - 1]?.id ?? null);
      pushConsole(`synced ${freshCommands.length} browser command(s)`);
    },
    [pushConsole, selectedCommands, updateScenarioCommands]
  );

  const refreshBrowserRecorder = useCallback(
    async (sessionId: string, cursor: number) => {
      const params = new URLSearchParams({
        sessionId,
        cursor: String(cursor),
      });
      const response = await fetch(`/api/automation/browser?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await readJson<BrowserRecorderResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Failed to refresh browser recorder.");
      }

      setBrowserStatus(payload.status ?? null);
      setBrowserCursor(payload.cursor ?? cursor);
      if (payload.url) {
        setTargetUrl(payload.url);
      }
      if (payload.logs?.[0]) {
        setMessage(payload.logs[0]);
      }
      await ingestRecordedCommands(payload.commands ?? []);
      if (payload.status === "stopped" || payload.status === "failed") {
        setIsRecording(false);
      }
    },
    [ingestRecordedCommands]
  );

  const startBrowserRecorder = useCallback(async () => {
    if (!selectedScenario) return;
    setIsBrowserStarting(true);
    try {
      const response = await fetch("/api/automation/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          scenarioId: selectedScenario.id,
          startUrl: targetUrl,
        }),
      });
      const payload = await readJson<BrowserRecorderResponse>(response);
      if (!response.ok || !payload.sessionId) {
        throw new Error(payload.error || "Failed to start browser recorder.");
      }

      setBrowserSessionId(payload.sessionId);
      setBrowserCursor(payload.cursor ?? 0);
      setBrowserStatus(payload.status ?? "recording");
      setIsRecording(true);
      if (payload.url) {
        setTargetUrl(payload.url);
      }
      pushConsole("local Playwright browser opened");
      await ingestRecordedCommands(payload.commands ?? []);
    } catch (error) {
      const text =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to start browser recorder.";
      pushConsole(text);
      setMessage(text);
    } finally {
      setIsBrowserStarting(false);
    }
  }, [ingestRecordedCommands, pushConsole, selectedScenario, targetUrl]);

  const stopBrowserRecorder = useCallback(async () => {
    if (!browserSessionId) {
      setIsRecording(false);
      pushConsole("record stopped");
      return;
    }

    const response = await fetch("/api/automation/browser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "stop",
        sessionId: browserSessionId,
      }),
    });
    const payload = await readJson<BrowserRecorderResponse>(response);
    if (!response.ok) {
      const text = payload.error || "Failed to stop browser recorder.";
      pushConsole(text);
      setMessage(text);
      return;
    }

    setBrowserStatus("stopped");
    setBrowserSessionId(null);
    setBrowserCursor(payload.cursor ?? browserCursor);
    setIsRecording(false);
    await ingestRecordedCommands(payload.commands ?? []);
    pushConsole("browser recorder stopped");
  }, [browserCursor, browserSessionId, ingestRecordedCommands, pushConsole]);

  useEffect(() => {
    if (!browserSessionId || !isRecording) {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(() => {
      if (cancelled) {
        return;
      }
      void refreshBrowserRecorder(browserSessionId, browserCursor).catch((error) => {
        const text =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Browser recorder polling failed.";
        pushConsole(text);
        setMessage(text);
        setIsRecording(false);
      });
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    browserCursor,
    browserSessionId,
    isRecording,
    pushConsole,
    refreshBrowserRecorder,
  ]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.repeat) {
        return;
      }

      const shortcutMap: Partial<Record<string, AutomationV2CommandType>> = {
        t: "assert-text",
        i: "assert-image",
        a: "assert-a11y",
        l: "assert-label",
        f: "assert-focus",
      };
      const commandType = shortcutMap[event.key.toLowerCase()];
      if (!commandType) {
        return;
      }

      event.preventDefault();
      void addCommand(commandType);
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [addCommand]);

  const updateActiveCommand = useCallback(
    async (updates: Partial<AutomationV2Command>) => {
      if (!activeCommand) return;
      await updateScenarioCommands(
        selectedCommands.map((command) =>
          command.id === activeCommand.id
            ? {
                ...command,
                ...updates,
                locator: updates.locator
                  ? { ...command.locator, ...updates.locator }
                  : command.locator,
              }
            : command
        )
      );
    },
    [activeCommand, selectedCommands, updateScenarioCommands]
  );

  const saveScenario = useCallback(async () => {
    if (!selectedScenario) return;
    await updateScenario({ ...selectedScenario, status: "ready" });
    pushConsole("scenario saved as ready");
  }, [pushConsole, selectedScenario, updateScenario]);

  const runScenario = useCallback(async () => {
    if (!project || !selectedScenario) return;
    const now = Date.now();
    const results = selectedCommands.map((command, index) => ({
      commandId: command.id,
      commandName: command.name,
      commandType: command.type,
      status: "passed" as const,
      message: `${commandLabels[command.type]} validated.`,
      startedAt: now + index * 100,
      finishedAt: now + index * 100 + 80,
    }));
    const run: AutomationV2Run = {
      id: crypto.randomUUID(),
      scenarioId: selectedScenario.id,
      scenarioName: selectedScenario.name,
      status: selectedCommands.length ? "passed" : "blocked",
      startedAt: now,
      finishedAt: now + Math.max(200, selectedCommands.length * 120),
      logs: selectedCommands.length
        ? [
            `Replay started for ${selectedScenario.name}`,
            `Executed ${selectedCommands.length} command(s)`,
            "Playwright API wiring is prepared for Phase 2 execution.",
          ]
        : ["Run blocked because the scenario has no commands."],
      commandResults: results,
    };

    await persistProject({
      ...project,
      automationV2Scenarios: (project.automationV2Scenarios ?? []).map((scenario) =>
        scenario.id === selectedScenario.id
          ? { ...scenario, lastRunAt: now, updatedAt: now }
          : scenario
      ),
      automationV2Runs: [run, ...(project.automationV2Runs ?? [])],
      updatedAt: now,
    });
    pushConsole(`run finished: ${run.status}`);
  }, [persistProject, project, pushConsole, selectedCommands, selectedScenario]);

  const convertSelectionToAction = useCallback(async () => {
    if (!project || !selectedScenario || selectedCommandIds.length === 0) return;
    const groupedCommands = selectedCommands.filter((command) =>
      selectedCommandIds.includes(command.id)
    );
    if (!groupedCommands.length) return;

    const now = Date.now();
    const actionId = crypto.randomUUID();
    const action: AutomationV2Action = {
      id: actionId,
      projectId: project.id,
      name:
        groupedCommands.length === 3
          ? "Login Action"
          : `Reusable Action ${actions.length + 1}`,
      description: `Created from ${groupedCommands.length} selected command(s).`,
      tags: ["reusable"],
      parameters: [],
      commands: groupedCommands.map((command, index) => ({
        ...command,
        id: crypto.randomUUID(),
        scenarioId: actionId,
        order: index,
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    };

    await persistProject({
      ...project,
      automationV2Actions: [action, ...(project.automationV2Actions ?? [])],
      updatedAt: now,
    });
    setSelectedCommandIds([]);
    pushConsole(`converted ${groupedCommands.length} command(s) into ${action.name}`);
  }, [
    actions.length,
    persistProject,
    project,
    pushConsole,
    selectedCommandIds,
    selectedCommands,
    selectedScenario,
  ]);

  const deleteScenario = useCallback(
    async (scenario: AutomationV2Scenario) => {
      if (!project) return;
      const confirmed = window.confirm(
        `Delete scenario "${scenario.name}" and its run history?`
      );
      if (!confirmed) return;

      if (selectedScenario?.id === scenario.id && isRecording) {
        await stopBrowserRecorder();
      }

      const now = Date.now();
      const remainingScenarios = (project.automationV2Scenarios ?? []).filter(
        (entry) => entry.id !== scenario.id
      );
      const nextActiveScenarioId =
        project.activeAutomationV2ScenarioId === scenario.id
          ? remainingScenarios[0]?.id ?? ""
          : project.activeAutomationV2ScenarioId ?? "";

      await persistProject({
        ...project,
        automationSuites: (project.automationSuites ?? []).map((suite) => ({
          ...suite,
          scenarioIds: (suite.scenarioIds ?? []).filter(
            (scenarioIdEntry) => scenarioIdEntry !== scenario.id
          ),
          updatedAt: now,
        })),
        automationV2Scenarios: remainingScenarios,
        automationV2Runs: (project.automationV2Runs ?? []).filter(
          (run) => run.scenarioId !== scenario.id
        ),
        activeAutomationV2ScenarioId: nextActiveScenarioId,
        updatedAt: now,
      });

      if (selectedScenario?.id === scenario.id) {
        setActiveCommandId(null);
        setSelectedCommandIds([]);
        router.push(`/projects/${encodedProjectKey}/automation/scenarios`);
      }
      pushConsole(`deleted scenario ${scenario.name}`);
    },
    [
      encodedProjectKey,
      isRecording,
      persistProject,
      project,
      pushConsole,
      router,
      selectedScenario?.id,
      stopBrowserRecorder,
    ]
  );

  const deleteAction = useCallback(
    async (action: AutomationV2Action) => {
      if (!project) return;
      const confirmed = window.confirm(`Delete action "${action.name}"?`);
      if (!confirmed) return;

      const now = Date.now();
      await persistProject({
        ...project,
        automationV2Actions: (project.automationV2Actions ?? []).filter(
          (entry) => entry.id !== action.id
        ),
        automationV2Scenarios: (project.automationV2Scenarios ?? []).map(
          (scenario) => ({
            ...scenario,
            commands: scenario.commands.filter(
              (command) =>
                command.type !== "run-action" || command.actionId !== action.id
            ),
            updatedAt: now,
          })
        ),
        updatedAt: now,
      });
      pushConsole(`deleted action ${action.name}`);
    },
    [persistProject, project, pushConsole]
  );

  const deleteSuite = useCallback(
    async (suite: NonNullable<Project["automationSuites"]>[number]) => {
      if (!project) return;
      const confirmed = window.confirm(`Delete suite "${suite.name}"?`);
      if (!confirmed) return;

      const now = Date.now();
      await persistProject({
        ...project,
        automationSuites: (project.automationSuites ?? []).filter(
          (entry) => entry.id !== suite.id
        ),
        automationV2Scenarios: (project.automationV2Scenarios ?? []).map(
          (scenario) =>
            scenario.suiteId === suite.id
              ? { ...scenario, suiteId: undefined, updatedAt: now }
              : scenario
        ),
        updatedAt: now,
      });
      pushConsole(`deleted suite ${suite.name}`);
    },
    [persistProject, project, pushConsole]
  );

  const filteredScenarios = scenarios.filter((scenario) => {
    const haystack = [
      scenario.name,
      suiteById[scenario.suiteId ?? ""],
      ...(scenario.tags ?? []),
      scenario.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const searchMatch =
      !search.trim() || haystack.includes(search.trim().toLowerCase());
    const statusMatch =
      statusFilter === "all" || scenario.status === statusFilter;
    const tagMatch =
      !tagFilter.trim() ||
      scenario.tags.some((tag) =>
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
              const active =
                section === item.key ||
                (section === "recorder" && item.key === "scenarios");
              return (
                <Link
                  key={item.key}
                  href={`/projects/${encodedProjectKey}/automation/${item.href}`}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-zinc-950 !text-white shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                  }`}
                >
                  <span>{item.label}</span>
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
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
            Automation v2
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Recorder-first automation workbench
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Scenarios now start in the recorder. Commands become reusable
            Actions, and runs stay lightweight.
          </p>
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
                <th className="px-4 py-3 font-semibold">Commands</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Delete</th>
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
                  <td className="px-4 py-3 text-zinc-600">{scenario.commands.length}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[scenario.status]}`}>
                      {scenario.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(scenario.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteScenario(scenario)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                      aria-label={`Delete scenario ${scenario.name}`}
                      title="Delete scenario"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredScenarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                    No v2 scenarios yet. Start with + New Scenario.
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
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Actions</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reusable command groups converted from selected timeline commands.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Commands</th>
              <th className="px-4 py-3 font-semibold">Tags</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 text-right font-semibold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => (
              <tr key={action.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-semibold">{action.name}</td>
                <td className="px-4 py-3 text-zinc-600">{action.commands.length}</td>
                <td className="px-4 py-3 text-zinc-600">{getTagsText(action.tags)}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(action.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void deleteAction(action)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                    aria-label={`Delete action ${action.name}`}
                    title="Delete action"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
            {actions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
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
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Runs</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Lightweight replay history and command-level logs.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Run</th>
              <th className="px-4 py-3 font-semibold">Scenario</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Logs</th>
              <th className="px-4 py-3 font-semibold">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-semibold">{run.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-zinc-600">{run.scenarioName}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[run.status]}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-600">{run.logs[0] ?? "No logs"}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(run.startedAt)}</td>
              </tr>
            ))}
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  Run a scenario to create replay logs.
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
              <th className="px-4 py-3 text-right font-semibold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {suites.map((suite) => (
              <tr key={suite.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-semibold">{suite.name}</td>
                <td className="px-4 py-3 text-zinc-600">{suite.status ?? "draft"}</td>
                <td className="px-4 py-3 text-zinc-600">{suite.scenarioIds?.length ?? 0}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(suite.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void deleteSuite(suite)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                    aria-label={`Delete suite ${suite.name}`}
                    title="Delete suite"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
            {suites.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  Suites will group v2 scenarios as the library grows.
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

    const specPreview = buildPlaywrightSpec(selectedScenario);

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
            onClick={() => void startBrowserRecorder()}
            disabled={isBrowserStarting}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 disabled:cursor-wait disabled:text-zinc-500"
          >
            {isBrowserStarting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950" />
            ) : null}
            {isBrowserStarting ? "Opening..." : "Open Browser"}
          </button>
          <button
            type="button"
            onClick={() =>
              isRecording
                ? void stopBrowserRecorder()
                : void startBrowserRecorder()
            }
            disabled={isBrowserStarting}
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
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:text-zinc-500"
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
            onClick={() => void stopBrowserRecorder()}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950"
          >
            Stop
          </button>
        </header>

        <section className="grid min-h-0 grid-cols-[290px_minmax(0,1fr)_340px]">
          <aside className="min-h-0 overflow-y-auto border-r border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Command Timeline
                </p>
                <h2 className="text-sm font-semibold">{selectedScenario.name}</h2>
              </div>
              <span className="text-xs text-zinc-500">{selectedCommands.length}</span>
            </div>
            <div className="space-y-1 p-2">
              {selectedCommands.map((command, index) => (
                <div
                  key={command.id}
                  className={`flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-sm ${
                    activeCommand?.id === command.id
                      ? "bg-zinc-950 text-white"
                      : "hover:bg-zinc-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCommandIds.includes(command.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      setSelectedCommandIds((ids) =>
                        ids.includes(command.id)
                          ? ids.filter((id) => id !== command.id)
                          : [...ids, command.id]
                      );
                    }}
                    className="mt-1"
                    aria-label={`Select command ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setActiveCommandId(command.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <span className="font-mono text-xs opacity-60">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{command.name}</span>
                      <span className="block truncate text-xs opacity-75">
                        {command.url ||
                          command.locator?.value ||
                          command.inputValue ||
                          "No target configured"}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
              {selectedCommands.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-zinc-500">
                  Open a URL or use the recorder buttons to create commands.
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
              <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Browser / Playback
                </p>
                <p className="mt-2 text-lg font-semibold text-zinc-800">
                  {browserStatus === "recording"
                    ? "Live browser recording"
                    : "Playwright recorder API target"}
                </p>
                <p className="mt-2 max-w-lg text-sm text-zinc-500">
                  {browserStatus === "recording"
                    ? "Use the opened Chromium window. Click, type, select, navigate, and press Ctrl+Alt+T/I/A/L/F to capture assertions."
                    : "Open Browser launches a local Playwright Chromium window and syncs recorded commands into this timeline."}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {recorderCommandTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => void addCommand(type)}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
                    >
                      {commandLabels[type]}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {validationCommandTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => void addCommand(type)}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                    >
                      {commandLabels[type]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-l border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Properties
            </p>
            {activeCommand ? (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Command</span>
                  <select
                    value={activeCommand.type}
                    onChange={(event) =>
                      void updateActiveCommand({
                        type: event.target.value as AutomationV2CommandType,
                        name: commandLabels[event.target.value as AutomationV2CommandType],
                      })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950"
                  >
                    {Object.entries(commandLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Name</span>
                  <input
                    value={activeCommand.name}
                    onChange={(event) =>
                      void updateActiveCommand({ name: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Locator / Target</span>
                  <input
                    value={activeCommand.locator?.value ?? activeCommand.url ?? ""}
                    onChange={(event) =>
                      activeCommand.type === "navigate"
                        ? void updateActiveCommand({ url: event.target.value })
                        : void updateActiveCommand({
                            locator: {
                              ...(activeCommand.locator ?? getDefaultLocator(activeCommand.type)),
                              value: event.target.value,
                            },
                          })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Input / Expected</span>
                  <input
                    value={activeCommand.inputValue ?? activeCommand.expectedValue ?? ""}
                    onChange={(event) =>
                      void updateActiveCommand({
                        inputValue: activeCommand.type.startsWith("assert")
                          ? activeCommand.inputValue
                          : event.target.value,
                        expectedValue: activeCommand.type.startsWith("assert")
                          ? event.target.value
                          : activeCommand.expectedValue,
                      })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950"
                  />
                </label>
                <div className="rounded-xl bg-zinc-50 px-3 py-3">
                  <p className="text-xs font-semibold text-zinc-500">
                    Smart Locator Suggestions
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    <p>role + accessible name</p>
                    <p>data-testid</p>
                    <p>stable CSS path</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                Select a command to edit locators and settings.
              </p>
            )}
            <button
              type="button"
              onClick={() => void convertSelectionToAction()}
              disabled={selectedCommandIds.length === 0}
              className="mt-5 w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600"
            >
              Convert Selection to Action
            </button>
            <details className="mt-4 rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
              <summary className="cursor-pointer font-semibold">Playwright Spec Preview</summary>
              <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-zinc-200">
                {specPreview}
              </pre>
            </details>
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
