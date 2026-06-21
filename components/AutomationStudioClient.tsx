"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
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
  agent?: {
    name: string;
    version: string;
  };
};

const localAgentOrigin = "http://127.0.0.1:4873";
const companionDownloadUrl =
  process.env.NEXT_PUBLIC_COMPANION_DOWNLOAD_URL ||
  "/downloads/companion";

const isBrowserOnLocalCaseForge = () =>
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const getRecorderEndpoint = (query?: URLSearchParams) => {
  const path = query
    ? `/automation/browser?${query.toString()}`
    : "/automation/browser";
  return isBrowserOnLocalCaseForge()
    ? `/api${path}`
    : `${localAgentOrigin}${path}`;
};

const getAgentOfflineMessage = () =>
  "Browser connection is not ready. Open the CaseForge desktop companion, then start recording again.";

const getRecorderStartErrorMessage = (rawText: string) => {
  if (
    !isBrowserOnLocalCaseForge() &&
    /(^|\b)not found\b|unknown caseforge agent route/i.test(rawText)
  ) {
    return "The browser connection is using an older CaseForge companion. Close the old companion or recorder, use Download Companion to install the latest version, then click Record again.";
  }

  if (
    !isBrowserOnLocalCaseForge() &&
    /failed to fetch|networkerror|load failed/i.test(rawText)
  ) {
    return getAgentOfflineMessage();
  }

  return rawText;
};

const navItems: Array<{
  key: AutomationStudioSection;
  label: string;
  href: string;
}> = [
  { key: "suites", label: "Suites", href: "suites" },
  { key: "scenarios", label: "Scenarios", href: "scenarios" },
  { key: "actions", label: "Actions", href: "actions" },
];

const commandLabels: Record<AutomationV2CommandType, string> = {
  navigate: "Navigate",
  click: "Click",
  fill: "Fill",
  select: "Select",
  hover: "Hover",
  press: "Press Key",
  "assert-text": "Verify Text",
  "assert-image": "Verify Image",
  "assert-a11y": "Accessibility Scan",
  "assert-label": "Verify Label / Name",
  "assert-focus": "Verify Keyboard Focus",
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
  "assert-a11y": "Ctrl+Alt+A adds an accessibility checkpoint.",
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
        ? "API returned a sign-in or error page instead of JSON."
        : "API returned an invalid response."
    );
  }
};

const formatDate = (timestamp?: number) =>
  timestamp ? new Date(timestamp).toLocaleString() : "Not saved";

const getTagsText = (tags?: string[]) => (tags?.length ? tags.join(", ") : "No tags");

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
  const [lastSelectedCommandId, setLastSelectedCommandId] = useState<
    string | null
  >(null);
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const [commandMenu, setCommandMenu] = useState<{
    commandId: string;
    x: number;
    y: number;
  } | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionName, setActionName] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [commandEditorId, setCommandEditorId] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isBrowserStarting, setIsBrowserStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [browserCursor, setBrowserCursor] = useState(0);
  const [browserStatus, setBrowserStatus] = useState<
    BrowserRecorderResponse["status"] | null
  >(null);
  const [browserConnectionLabel, setBrowserConnectionLabel] = useState("");
  const [activityLines, setActivityLines] = useState<string[]>([
    "Visual recorder ready. Keyboard checkpoints are available while recording.",
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
  const actionById = useMemo(
    () => Object.fromEntries(actions.map((action) => [action.id, action])),
    [actions]
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
    null;
  const editorCommand =
    selectedCommands.find((command) => command.id === commandEditorId) ?? null;

  const pushActivity = useCallback((line: string) => {
    setActivityLines((lines) => [
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
      description: "Visual workflow captured from browser actions.",
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
      pushActivity(`added ${commandLabels[type]} step`);
    },
    [pushActivity, selectedCommands, selectedScenario, targetUrl, updateScenarioCommands]
  );

  const ingestRecordedCommands = useCallback(
    async (commands: AutomationV2Command[]) => {
      if (!commands.length) return;
      const existingIds = new Set(selectedCommands.map((command) => command.id));
      const freshCommands = commands.filter((command) => !existingIds.has(command.id));
      if (!freshCommands.length) return;

      await updateScenarioCommands([...selectedCommands, ...freshCommands]);
      setActiveCommandId(freshCommands[freshCommands.length - 1]?.id ?? null);
      pushActivity(`added ${freshCommands.length} visual step${freshCommands.length === 1 ? "" : "s"}`);
    },
    [pushActivity, selectedCommands, updateScenarioCommands]
  );

  const refreshBrowserRecorder = useCallback(
    async (sessionId: string, cursor: number) => {
      const params = new URLSearchParams({
        sessionId,
        cursor: String(cursor),
      });
      const response = await fetch(getRecorderEndpoint(params), {
        cache: "no-store",
      });
      const payload = await readJson<BrowserRecorderResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Could not refresh the visual workflow.");
      }

      setBrowserStatus(payload.status ?? null);
      setBrowserCursor(payload.cursor ?? cursor);
      if (payload.url) {
        setTargetUrl(payload.url);
      }
      if (payload.logs?.[0]) {
        setMessage(payload.logs[0]);
      }
      if (payload.agent) {
        setBrowserConnectionLabel("Desktop companion connected");
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
      const response = await fetch(getRecorderEndpoint(), {
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
        throw new Error(payload.error || "Could not open the browser session.");
      }

      setBrowserSessionId(payload.sessionId);
      setBrowserCursor(payload.cursor ?? 0);
      setBrowserStatus(payload.status ?? "recording");
      setBrowserConnectionLabel(
        payload.agent
          ? `${payload.agent.name} ${payload.agent.version}`
          : isBrowserOnLocalCaseForge()
            ? "Browser session ready"
            : "Desktop companion connected"
      );
      setIsRecording(true);
      if (payload.url) {
        setTargetUrl(payload.url);
      }
      pushActivity("browser session opened");
      await ingestRecordedCommands(payload.commands ?? []);
    } catch (error) {
      const rawText =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Could not open the browser session.";
      const text = getRecorderStartErrorMessage(rawText);
      pushActivity(text);
      setMessage(text);
    } finally {
      setIsBrowserStarting(false);
    }
  }, [ingestRecordedCommands, pushActivity, selectedScenario, targetUrl]);

  const stopBrowserRecorder = useCallback(async () => {
    if (!browserSessionId) {
      setIsRecording(false);
      pushActivity("recording stopped");
      return;
    }

    const response = await fetch(getRecorderEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "stop",
        sessionId: browserSessionId,
      }),
    });
    const payload = await readJson<BrowserRecorderResponse>(response);
    if (!response.ok) {
      const text = payload.error || "Could not stop recording.";
      pushActivity(text);
      setMessage(text);
      return;
    }

    setBrowserStatus("stopped");
    setBrowserSessionId(null);
    setBrowserCursor(payload.cursor ?? browserCursor);
    setIsRecording(false);
    await ingestRecordedCommands(payload.commands ?? []);
    pushActivity("recording stopped");
  }, [browserCursor, browserSessionId, ingestRecordedCommands, pushActivity]);

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
            : "Could not sync the latest visual steps.";
        pushActivity(text);
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
    pushActivity,
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

  useEffect(() => {
    if (!commandMenu) return;
    const closeMenu = () => setCommandMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, [commandMenu]);

  const updateCommandById = useCallback(
    async (commandId: string, updates: Partial<AutomationV2Command>) => {
      await updateScenarioCommands(
        selectedCommands.map((command) =>
          command.id === commandId
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
    [selectedCommands, updateScenarioCommands]
  );

  const selectCommand = (
    commandId: string,
    index: number,
    event: MouseEvent,
  ) => {
    setActiveCommandId(commandId);
    setCommandMenu(null);

    if (event.shiftKey && lastSelectedCommandId) {
      const previousIndex = selectedCommands.findIndex(
        (command) => command.id === lastSelectedCommandId
      );
      if (previousIndex >= 0) {
        const start = Math.min(previousIndex, index);
        const end = Math.max(previousIndex, index);
        setSelectedCommandIds(
          selectedCommands.slice(start, end + 1).map((command) => command.id)
        );
        return;
      }
    }

    setLastSelectedCommandId(commandId);

    if (event.ctrlKey || event.metaKey) {
      setSelectedCommandIds((ids) =>
        ids.includes(commandId)
          ? ids.filter((id) => id !== commandId)
          : [...ids, commandId]
      );
      return;
    }

    setSelectedCommandIds([commandId]);
  };

  const toggleCommandSelection = (commandId: string) => {
    setActiveCommandId(commandId);
    setLastSelectedCommandId(commandId);
    setCommandMenu(null);
    setSelectedCommandIds((ids) =>
      ids.includes(commandId)
        ? ids.filter((id) => id !== commandId)
        : [...ids, commandId]
    );
  };

  const selectAllCommands = () => {
    setCommandMenu(null);
    setSelectedCommandIds(selectedCommands.map((command) => command.id));
    setLastSelectedCommandId(selectedCommands.at(-1)?.id ?? null);
    setActiveCommandId(selectedCommands.at(-1)?.id ?? null);
  };

  const clearSelectedCommands = () => {
    setCommandMenu(null);
    setSelectedCommandIds([]);
    setLastSelectedCommandId(null);
  };

  const openCommandMenu = (
    commandId: string,
    event: MouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (!selectedCommandIds.includes(commandId)) {
      setSelectedCommandIds([commandId]);
      setActiveCommandId(commandId);
      setLastSelectedCommandId(commandId);
    }
    setCommandMenu({ commandId, x: event.clientX, y: event.clientY });
  };

  const openActionModal = () => {
    if (!selectedCommandIds.length) {
      pushActivity("select one or more steps before creating an action");
      return;
    }
    setActionName("");
    setActionDescription("");
    setActionModalOpen(true);
    setCommandMenu(null);
  };

  const duplicateSelectedCommands = async () => {
    if (!selectedCommandIds.length) return;
    const now = Date.now();
    const commandsToCopy = selectedCommands.filter((command) =>
      selectedCommandIds.includes(command.id)
    );
    const copies = commandsToCopy.map((command, index) => ({
      ...command,
      id: crypto.randomUUID(),
      name: `${command.name} copy`,
      order: selectedCommands.length + index,
      updatedAt: now,
    }));
    await updateScenarioCommands([...selectedCommands, ...copies]);
    setSelectedCommandIds(copies.map((command) => command.id));
    setActiveCommandId(copies[0]?.id ?? null);
    setCommandMenu(null);
    pushActivity(`duplicated ${copies.length} step${copies.length === 1 ? "" : "s"}`);
  };

  const deleteSelectedCommands = async () => {
    if (!selectedCommandIds.length) return;
    await updateScenarioCommands(
      selectedCommands.filter((command) => !selectedCommandIds.includes(command.id))
    );
    setSelectedCommandIds([]);
    setActiveCommandId(null);
    setCommandMenu(null);
    pushActivity("deleted selected steps");
  };

  const saveScenario = useCallback(async () => {
    if (!selectedScenario) return;
    await updateScenario({ ...selectedScenario, status: "ready" });
    pushActivity("scenario saved as ready");
  }, [pushActivity, selectedScenario, updateScenario]);

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
            `Run started for ${selectedScenario.name}`,
            `Completed ${selectedCommands.length} workflow step${selectedCommands.length === 1 ? "" : "s"}`,
            "Visual run completed successfully.",
          ]
        : ["Run paused because the scenario has no visual steps."],
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
    pushActivity(`run finished: ${run.status}`);
  }, [persistProject, project, pushActivity, selectedCommands, selectedScenario]);

  const convertSelectionToAction = useCallback(async () => {
    if (!project || !selectedScenario || selectedCommandIds.length === 0) return;
    const groupedCommands = selectedCommands.filter((command) =>
      selectedCommandIds.includes(command.id)
    );
    if (!groupedCommands.length) return;

    const now = Date.now();
    const actionId = crypto.randomUUID();
    const actionNameText =
      actionName.trim() || `Reusable Action ${actions.length + 1}`;
    const action: AutomationV2Action = {
      id: actionId,
      projectId: project.id,
      name: actionNameText,
      description:
        actionDescription.trim() ||
        `Created from ${groupedCommands.length} selected workflow step${groupedCommands.length === 1 ? "" : "s"}.`,
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
    const firstSelectedIndex = selectedCommands.findIndex((command) =>
      selectedCommandIds.includes(command.id)
    );
    const actionCommand: AutomationV2Command = {
      id: crypto.randomUUID(),
      scenarioId: selectedScenario.id,
      order: Math.max(0, firstSelectedIndex),
      type: "run-action",
      name: actionNameText,
      description: `Reusable Action with ${groupedCommands.length} step${groupedCommands.length === 1 ? "" : "s"}.`,
      actionId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    const nextScenarioCommands = selectedCommands
      .flatMap((command, index) => {
        if (index === firstSelectedIndex) {
          return [actionCommand];
        }
        if (selectedCommandIds.includes(command.id)) {
          return [];
        }
        return [command];
      })
      .map((command, index) => ({
        ...command,
        order: index,
        updatedAt: command.id === actionCommand.id ? now : command.updatedAt,
      }));

    await persistProject({
      ...project,
      automationV2Actions: [action, ...(project.automationV2Actions ?? [])],
      automationV2Scenarios: (project.automationV2Scenarios ?? []).map((scenario) =>
        scenario.id === selectedScenario.id
          ? {
              ...scenario,
              commands: nextScenarioCommands,
              status: "ready",
              updatedAt: now,
            }
          : scenario
      ),
      updatedAt: now,
    });
    setSelectedCommandIds([actionCommand.id]);
    setActiveCommandId(actionCommand.id);
    setActionModalOpen(false);
    setActionName("");
    setActionDescription("");
    pushActivity(`created action ${action.name} and replaced selected steps`);
  }, [
    actionDescription,
    actionName,
    actions.length,
    persistProject,
    project,
    pushActivity,
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
      pushActivity(`deleted scenario ${scenario.name}`);
    },
    [
      encodedProjectKey,
      isRecording,
      persistProject,
      project,
      pushActivity,
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
      pushActivity(`deleted action ${action.name}`);
    },
    [persistProject, project, pushActivity]
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
      pushActivity(`deleted suite ${suite.name}`);
    },
    [persistProject, project, pushActivity]
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
            Automation Studio
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Visual automation workbench
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Scenarios start from browser interactions. Visual steps become
            reusable Actions, and run history stays lightweight.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void createScenario()}
          className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"
        >
          + New Scenario
        </button>
        <a
          href={companionDownloadUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50"
        >
          Download Companion 0.1.37
        </a>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Suites", suites.length],
          ["Scenarios", scenarios.length],
          ["Actions", actions.length],
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
              Compact visual flows. Create one, capture steps, then run.
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
                <th className="px-4 py-3 font-semibold">Steps</th>
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
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Actions</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reusable workflow blocks created from selected visual steps.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Steps</th>
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
                  Select visual steps in the workflow timeline and turn them into a reusable Action.
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
          Lightweight run history and activity notes.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Run</th>
              <th className="px-4 py-3 font-semibold">Scenario</th>
              <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Activity</th>
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
                <td className="px-4 py-3 text-zinc-600">{run.logs[0] ?? "No activity yet"}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(run.startedAt)}</td>
              </tr>
            ))}
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  Run a scenario to create activity history.
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
                  Suites will group visual scenarios as the library grows.
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
      <div className="grid h-[calc(100vh-72px)] grid-rows-[56px_minmax(0,1fr)_auto] overflow-hidden">
        <header className="flex min-w-0 items-center gap-2 border-b border-zinc-200 bg-white px-4">
          <input
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
            aria-label="Target URL"
          />
          <button
            type="button"
            onClick={() =>
              isRecording
                ? void stopBrowserRecorder()
                : void startBrowserRecorder()
            }
            disabled={isBrowserStarting}
            className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70 ${
              isRecording ? "bg-rose-600 text-white" : "bg-zinc-950 text-white"
            }`}
          >
            {isBrowserStarting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : null}
            {isBrowserStarting
              ? "Opening..."
              : isRecording
                ? "Stop Recording"
                : "Record"}
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
          <a
            href={companionDownloadUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50"
          >
            Download Companion 0.1.37
          </a>
        </header>

        <section className="min-h-0 bg-white">
          <aside className="min-h-0 h-full overflow-y-auto bg-white">
            <div className="space-y-3 border-b border-zinc-200 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Workflow Steps
                  </p>
                  <h2 className="text-sm font-semibold">{selectedScenario.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Select steps to combine them into a reusable Action.
                  </p>
                </div>
                <div className="text-right">
                  <div className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700">
                    {browserStatus === "recording" ? "Recording" : "Ready"} ·{" "}
                    {selectedCommands.length} step
                    {selectedCommands.length === 1 ? "" : "s"}
                  </div>
                  {browserConnectionLabel ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {browserConnectionLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openActionModal}
                  disabled={selectedCommandIds.length === 0}
                  className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
                >
                  Create Reusable Action
                </button>
                {selectedCommands.length ? (
                  <button
                    type="button"
                    onClick={
                      selectedCommandIds.length === selectedCommands.length
                        ? clearSelectedCommands
                        : selectAllCommands
                    }
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    {selectedCommandIds.length === selectedCommands.length
                      ? "Clear"
                      : "Select all"}
                  </button>
                ) : null}
                <span className="text-xs font-medium text-zinc-500">
                  {selectedCommandIds.length} selected
                </span>
              </div>
            </div>
            <div className="space-y-2 p-4">
              {selectedCommands.map((command, index) => {
                const linkedAction =
                  command.type === "run-action"
                    ? actionById[command.actionId ?? ""]
                    : undefined;
                return (
                <div
                  key={command.id}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => selectCommand(command.id, index, event)}
                  onContextMenu={(event) => openCommandMenu(command.id, event)}
                  onDoubleClick={() => {
                    setActiveCommandId(command.id);
                    setCommandEditorId(command.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveCommandId(command.id);
                      setSelectedCommandIds([command.id]);
                    }
                  }}
                  className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    selectedCommandIds.includes(command.id)
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                      : activeCommand?.id === command.id
                        ? "border-zinc-300 bg-zinc-100 text-zinc-950"
                        : "border-transparent hover:border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCommandSelection(command.id);
                    }}
                    className={`mt-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold transition ${
                      selectedCommandIds.includes(command.id)
                        ? "border-emerald-500 bg-emerald-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400 hover:text-emerald-700"
                    }`}
                    aria-pressed={selectedCommandIds.includes(command.id)}
                    aria-label={`Select step ${index + 1}`}
                  >
                    <span
                      className={`h-3 w-3 rounded border ${
                        selectedCommandIds.includes(command.id)
                          ? "border-white bg-white"
                          : "border-zinc-400 bg-white"
                      }`}
                    />
                    {selectedCommandIds.includes(command.id) ? "Selected" : "Select"}
                  </button>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-xs font-semibold text-zinc-700">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {linkedAction?.name ?? command.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">
                      {linkedAction
                        ? `${linkedAction.commands.length} reusable step${linkedAction.commands.length === 1 ? "" : "s"}`
                        : command.url ||
                          command.locator?.value ||
                          command.inputValue ||
                          "No target configured"}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      command.type === "run-action"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {command.type === "run-action" ? "Action" : "Step"}
                  </span>
                </div>
                );
              })}
              {selectedCommands.length === 0 ? (
                <div className="flex min-h-[45vh] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
                  <div>
                    <p className="text-base font-semibold text-zinc-950">
                      Start recording to build this workflow.
                    </p>
                    <p className="mt-2 text-sm text-zinc-500">
                      Open the browser, perform the flow, and visual steps will appear here automatically.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </section>

        <footer className="border-t border-zinc-200 bg-zinc-950 text-xs text-zinc-300">
          <button
            type="button"
            onClick={() => setActivityOpen((open) => !open)}
            className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left"
          >
            <span className="font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Activity
            </span>
            <span>{message || (isSaving ? "Saving..." : "Ready")}</span>
          </button>
          {activityOpen ? (
            <div className="max-h-28 space-y-1 overflow-y-auto border-t border-zinc-800 px-4 py-3">
              {activityLines.slice(0, 5).map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          ) : null}
        </footer>

        {commandMenu ? (
          <div
            className="fixed z-50 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-xl"
            style={{ left: commandMenu.x, top: commandMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={openActionModal}
              className="block w-full cursor-pointer px-3 py-2 text-left font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Create Reusable Action
            </button>
            <button
              type="button"
              onClick={() => {
                setCommandEditorId(commandMenu.commandId);
                setActiveCommandId(commandMenu.commandId);
                setCommandMenu(null);
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Rename / Edit
            </button>
            <button
              type="button"
              onClick={() => void duplicateSelectedCommands()}
              className="block w-full cursor-pointer px-3 py-2 text-left font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => void deleteSelectedCommands()}
              className="block w-full cursor-pointer px-3 py-2 text-left font-medium text-rose-600 hover:bg-rose-50"
            >
              Delete
            </button>
          </div>
        ) : null}

        {actionModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Create reusable action
              </p>
              <h3 className="mt-2 text-lg font-semibold text-zinc-950">
                Group {selectedCommandIds.length} selected step
                {selectedCommandIds.length === 1 ? "" : "s"}
              </h3>
              <label className="mt-4 block text-sm font-medium text-zinc-700">
                Action name
                <input
                  value={actionName}
                  onChange={(event) => setActionName(event.target.value)}
                  autoFocus
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-emerald-400"
                  placeholder="Login Action"
                />
              </label>
              <label className="mt-3 block text-sm font-medium text-zinc-700">
                Description
                <textarea
                  value={actionDescription}
                  onChange={(event) => setActionDescription(event.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-400"
                  placeholder="Optional notes for reuse"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActionModalOpen(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void convertSelectionToAction()}
                  disabled={!actionName.trim()}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
                >
                  Create Reusable Action
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {editorCommand ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Step settings
              </p>
              <h3 className="mt-2 text-lg font-semibold text-zinc-950">
                Edit step
              </h3>
              <div className="mt-4 grid gap-3">
                <label className="block text-sm font-medium text-zinc-700">
                  Name
                  <input
                    value={editorCommand.name}
                    onChange={(event) =>
                      void updateCommandById(editorCommand.id, {
                        name: event.target.value,
                      })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400"
                  />
                </label>
                <label className="block text-sm font-medium text-zinc-700">
                  Target
                  <input
                    value={editorCommand.locator?.value ?? editorCommand.url ?? ""}
                    onChange={(event) =>
                      editorCommand.type === "navigate"
                        ? void updateCommandById(editorCommand.id, {
                            url: event.target.value,
                          })
                        : void updateCommandById(editorCommand.id, {
                            locator: {
                              ...(editorCommand.locator ??
                                getDefaultLocator(editorCommand.type)),
                              value: event.target.value,
                            },
                          })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    Input
                    <input
                      value={editorCommand.inputValue ?? ""}
                      onChange={(event) =>
                        void updateCommandById(editorCommand.id, {
                          inputValue: event.target.value,
                        })
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-700">
                    Expected
                    <input
                      value={editorCommand.expectedValue ?? ""}
                      onChange={(event) =>
                        void updateCommandById(editorCommand.id, {
                          expectedValue: event.target.value,
                        })
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCommandEditorId(null)}
                  className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
