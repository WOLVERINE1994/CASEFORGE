"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import AutomationArtifactViewer from "./AutomationArtifactViewer";
import AutomationStepForm from "./AutomationStepForm";
import { OverlayFormShell, compactEyebrowClassName } from "./FilterWorkspaceSections";
import { formatUtcDate } from "../utils/date-format";
import {
  buildAutomationTemplateSteps,
  type AutomationStepTemplateId,
} from "../utils/automation-step-templates";
import type {
  AutomationAction,
  AutomationBindingMode,
  AutomationDebugSession,
  AutomationEnvironmentBinding,
  AutomationExecutionEvent,
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationExecutionMode,
  AutomationProvider,
  AutomationRecorderSession,
  AutomationReusableBlock,
  AutomationSelectorPreset,
  AutomationStep,
  AutomationStepResult,
  AutomationValidationIssue,
  AutomationValidationResult,
  TestCaseRow,
} from "../utils/workspace";

type Props = {
  context?: "case" | "automation";
  row: TestCaseRow;
  script: {
    id: string;
    name: string;
    description?: string;
    provider: AutomationProvider;
    executionMode?: AutomationExecutionMode;
    environmentBindingId?: string;
  } | null;
  steps: AutomationStep[];
  latestExecution: AutomationExecution | null;
  latestArtifacts: AutomationExecutionArtifact[];
  projectRouteRef: string | null;
  scheduleHref?: string | null;
  actions?: AutomationAction[];
  reusableBlocks: AutomationReusableBlock[];
  selectorPresets: AutomationSelectorPreset[];
  environments: AutomationEnvironmentBinding[];
  activeEnvironmentId: string;
  onSave: (payload: {
    rowId: string;
    mode: AutomationBindingMode;
    provider: AutomationProvider;
    executionMode: AutomationExecutionMode;
    environmentBindingId?: string;
    name: string;
    description?: string;
    steps: AutomationStep[];
  }) => void;
  onSaveReuseLibrary: (payload: {
    reusableBlocks: AutomationReusableBlock[];
    environments: AutomationEnvironmentBinding[];
    activeEnvironmentId: string;
  }) => void;
  onRun: (rowId: string) => Promise<{
    tone: "info" | "success" | "error";
    text: string;
  } | void>;
  onRunWithOptions?: (payload: {
    rowId: string;
    scriptId?: string;
    executionMode: AutomationExecutionMode;
  }) => Promise<{
    tone: "info" | "success" | "error";
    text: string;
  } | void>;
  executionStreamRequest?: Record<string, unknown> | null;
  onExecutionFinished?: (payload: {
    execution: AutomationExecution | null;
    executions: AutomationExecution[];
  }) => Promise<void> | void;
  onCreateIssueFromFailure?: (rowId: string) => Promise<void>;
};

type WorkspaceSuggestion = {
  id: string;
  title: string;
  description: string;
  tone: "sky" | "amber" | "emerald";
  applyLabel?: string;
  onApply?: () => void;
};

type ConsoleEntry = {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
  source: "system" | "debug" | "validation" | "execution" | "ai" | "recording";
  timestamp: number;
};

type LiveExecutionState = {
  status: "idle" | "running" | "passed" | "failed" | "blocked";
  currentStepId: string | null;
  currentSourceStepId: string | null;
  stepResults: AutomationStepResult[];
  execution: AutomationExecution | null;
  executions: AutomationExecution[];
  artifacts: AutomationExecutionArtifact[];
  failureMessage: string | null;
};

type StepVisualStatus = "pending" | "running" | "success" | "failed";

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

const parseExecutionStreamChunks = (
  rawChunk: string
): Array<{ eventName: string; data: AutomationExecutionEvent }> => {
  return rawChunk
    .split("\n\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      const lines = item.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!dataLine) {
        return [];
      }

      try {
        return [
          {
            eventName: eventLine?.replace(/^event:\s*/, "") || "message",
            data: JSON.parse(dataLine.replace(/^data:\s*/, "")) as AutomationExecutionEvent,
          },
        ];
      } catch {
        return [];
      }
    });
};

const validationTone = (validation: AutomationValidationResult | null) => {
  if (!validation) {
    return "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }

  return validation.valid
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
    : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
};

const debugTone = (status: AutomationDebugSession["status"] | undefined) => {
  switch (status) {
    case "passed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "failed":
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
    case "running":
    case "starting":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
    default:
      return "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }
};

const stepStatusTone = (status: StepVisualStatus) => {
  switch (status) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
    case "running":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
    default:
      return "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }
};

const actionGlyph = (action: AutomationStep["action"]) => {
  switch (action) {
    case "goto":
      return "GO";
    case "click":
      return "CL";
    case "fill":
      return "FI";
    case "select":
      return "SL";
    case "wait-for":
      return "WT";
    case "assert-visible":
    case "assert-text":
    case "assert-url":
    case "assert-value":
      return "AS";
    case "press":
      return "KY";
    case "run-block":
      return "RB";
    default:
      return "ST";
  }
};

const actionLabel = (step: AutomationStep) => {
  const actionCall = step.metaJson?.actionCall;
  const actionCallName =
    actionCall &&
    typeof actionCall === "object" &&
    !Array.isArray(actionCall) &&
    typeof (actionCall as Record<string, unknown>).actionName === "string"
      ? ((actionCall as Record<string, unknown>).actionName as string)
      : "";

  switch (step.action) {
    case "goto":
      return "Navigate";
    case "click":
      return "Click";
    case "fill":
      return "Fill";
    case "select":
      return "Select";
    case "wait-for":
      return "Wait";
    case "assert-visible":
      return "Assert Visible";
    case "assert-text":
      return "Assert Text";
    case "assert-url":
      return "Assert URL";
    case "assert-value":
      return "Assert Value";
    case "press":
      return "Press Key";
    case "run-block":
      return actionCallName ? `Run ${actionCallName}` : "Run Action";
    default:
      return step.action;
  }
};

const getStepDescription = (step: AutomationStep) =>
  typeof step.metaJson?.description === "string" ? step.metaJson.description : "";

const getStepExpectedResult = (step: AutomationStep) =>
  typeof step.metaJson?.expectedResult === "string" ? step.metaJson.expectedResult : "";

const formatStepSummary = (step: AutomationStep) => {
  const actionCall =
    step.metaJson?.actionCall &&
    typeof step.metaJson.actionCall === "object" &&
    !Array.isArray(step.metaJson.actionCall)
      ? (step.metaJson.actionCall as Record<string, unknown>)
      : null;
  const actionCallName =
    typeof actionCall?.actionName === "string" ? actionCall.actionName : "";
  const target = step.targetValue?.trim() || step.sharedBlockId?.trim() || "target";
  if (step.action === "run-block") {
    return actionCallName || target;
  }
  if (step.action === "fill") {
    const value = step.inputValue?.trim();
    return value ? `${target} -> ${value}` : target;
  }
  if (step.action === "select") {
    const value = step.inputValue?.trim();
    return value ? `${target} => ${value}` : target;
  }
  if (step.action.startsWith("assert")) {
    const expected = step.expectedValue?.trim();
    return expected ? `${target} = ${expected}` : target;
  }
  return target;
};

const formatConsoleTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const emptyStep = (scriptId: string, order: number): AutomationStep => ({
  id: crypto.randomUUID(),
  scriptId,
  order,
  action: "goto",
  targetType: "url",
  targetValue: "",
  inputValue: "",
  expectedValue: "",
  timeoutMs: 5000,
  metaJson: {},
});

const normalizeOrders = (nextSteps: AutomationStep[]) =>
  nextSteps.map((step, index) => ({ ...step, order: index }));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resultPriority: Record<AutomationStepResult["status"], number> = {
  failed: 5,
  running: 4,
  blocked: 3,
  passed: 2,
  pending: 1,
  skipped: 0,
};

const aggregateStepResults = (results: AutomationStepResult[]) => {
  const primary = [...results].sort(
    (left, right) =>
      resultPriority[right.status] - resultPriority[left.status] ||
      right.stepIndex - left.stepIndex
  )[0];

  if (!primary) {
    return null;
  }

  if (primary.status === "running") {
    return "running" as const;
  }
  if (primary.status === "passed") {
    return "success" as const;
  }
  return "failed" as const;
};

export default function CaseAutomationPanel({
  context = "case",
  row,
  script,
  steps,
  latestExecution,
  latestArtifacts,
  projectRouteRef,
  scheduleHref = null,
  actions = [],
  reusableBlocks,
  selectorPresets,
  environments,
  activeEnvironmentId,
  onSave,
  onSaveReuseLibrary,
  onRun,
  onRunWithOptions,
  executionStreamRequest = null,
  onExecutionFinished,
  onCreateIssueFromFailure,
}: Props) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const debugLogCursorRef = useRef(0);
  const recorderLogCursorRef = useRef(0);
  const activeDebugSessionIdRef = useRef<string | null>(null);
  const activeRecorderSessionIdRef = useRef<string | null>(null);
  const recorderSuggestionSessionIdRef = useRef<string | null>(null);
  const latestExecutionIdRef = useRef<string | null>(null);

  const [draftName, setDraftName] = useState(script?.name ?? `${row.id} flow`);
  const [draftDescription, setDraftDescription] = useState(script?.description ?? "");
  const [draftProvider, setDraftProvider] = useState<AutomationProvider>(
    script?.provider ?? "playwright"
  );
  const [draftExecutionMode, setDraftExecutionMode] = useState<AutomationExecutionMode>(
    script?.executionMode ?? "headless"
  );
  const [draftMode, setDraftMode] = useState<AutomationBindingMode>(
    row.automationBindingMode ?? "automated"
  );
  const [draftEnvironmentId, setDraftEnvironmentId] = useState(
    script?.environmentBindingId ?? activeEnvironmentId
  );
  const [draftSteps, setDraftSteps] = useState<AutomationStep[]>(
    steps.length > 0
      ? steps
      : [
          {
            id: crypto.randomUUID(),
            scriptId: script?.id ?? "",
            order: 0,
            action: "goto",
            targetType: "url",
            targetValue: "",
            timeoutMs: 5000,
          },
        ]
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(steps[0]?.id ?? null);
  const [validationResult, setValidationResult] = useState<AutomationValidationResult | null>(
    null
  );
  const [isValidating, setIsValidating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [debugSession, setDebugSession] = useState<AutomationDebugSession | null>(null);
  const [recorderSession, setRecorderSession] = useState<AutomationRecorderSession | null>(null);
  const [runNotice, setRunNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [isEnvironmentEditorOpen, setIsEnvironmentEditorOpen] = useState(false);
  const [isReuseLibraryOpen, setIsReuseLibraryOpen] = useState(false);
  const [sharedBlockDraftName, setSharedBlockDraftName] = useState(
    script?.name ?? `${row.id} shared flow`
  );
  const [sharedBlockDraftDescription, setSharedBlockDraftDescription] = useState(
    script?.description ?? ""
  );
  const [environmentBaseUrl, setEnvironmentBaseUrl] = useState("");
  const [environmentLoginRoute, setEnvironmentLoginRoute] = useState("/login");
  const [environmentDashboardRoute, setEnvironmentDashboardRoute] = useState("/dashboard");
  const [credentialAliases, setCredentialAliases] = useState("");
  const [playbackMode, setPlaybackMode] = useState<"live" | "replay">("live");
  const [replayCursor, setReplayCursor] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [liveExecution, setLiveExecution] = useState<LiveExecutionState>({
    status: "idle",
    currentStepId: null,
    currentSourceStepId: null,
    stepResults: [],
    execution: null,
    executions: [],
    artifacts: [],
    failureMessage: null,
  });
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(460);
  const [consoleHeight, setConsoleHeight] = useState(156);
  const [assistantSuggestions, setAssistantSuggestions] = useState<WorkspaceSuggestion[]>([]);

  const activeEnvironment =
    environments.find((item) => item.id === draftEnvironmentId) ??
    environments.find((item) => item.isDefault) ??
    null;

  useEffect(() => {
    setEnvironmentBaseUrl(activeEnvironment?.baseUrl ?? "");
    setEnvironmentLoginRoute(activeEnvironment?.routePresets?.login ?? "/login");
    setEnvironmentDashboardRoute(activeEnvironment?.routePresets?.dashboard ?? "/dashboard");
    setCredentialAliases((activeEnvironment?.credentialAliases ?? []).join(", "));
  }, [activeEnvironment]);

  useEffect(() => {
    if (selectedStepId && draftSteps.some((step) => step.id === selectedStepId)) {
      return;
    }
    setSelectedStepId(draftSteps[0]?.id ?? null);
  }, [draftSteps, selectedStepId]);

  const appendConsoleEntries = useCallback(
    (
      lines: string[],
      tone: ConsoleEntry["tone"],
      source: ConsoleEntry["source"] = "system"
    ) => {
      if (lines.length === 0) {
        return;
      }

      const baseTime = Date.now();
      setConsoleEntries((currentEntries) =>
        [...currentEntries, ...lines.map((line, index) => ({
          id: `${baseTime}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          message: line,
          tone,
          source,
          timestamp: baseTime + index,
        }))].slice(-250)
      );
    },
    []
  );

  useEffect(() => {
    if (!debugSession) {
      return;
    }

    if (debugSession.id !== activeDebugSessionIdRef.current) {
      activeDebugSessionIdRef.current = debugSession.id;
      debugLogCursorRef.current = 0;
    }

    const newLogs = debugSession.logs.slice(debugLogCursorRef.current);
    if (newLogs.length > 0) {
      appendConsoleEntries(
        newLogs,
        debugSession.status === "failed" || debugSession.status === "blocked"
          ? "error"
          : "info",
        "debug"
      );
      debugLogCursorRef.current = debugSession.logs.length;
    }
  }, [appendConsoleEntries, debugSession]);

  useEffect(() => {
    if (!recorderSession) {
      return;
    }

    if (recorderSession.id !== activeRecorderSessionIdRef.current) {
      activeRecorderSessionIdRef.current = recorderSession.id;
      recorderLogCursorRef.current = 0;
    }

    const newLogs = recorderSession.logs.slice(recorderLogCursorRef.current);
    if (newLogs.length > 0) {
      appendConsoleEntries(
        newLogs,
        recorderSession.status === "failed" ? "error" : "info",
        "recording"
      );
      recorderLogCursorRef.current = recorderSession.logs.length;
    }
  }, [appendConsoleEntries, recorderSession]);

  useEffect(() => {
    if (!latestExecution || latestExecution.id === latestExecutionIdRef.current) {
      return;
    }

    latestExecutionIdRef.current = latestExecution.id;
    const logs = latestExecution.logSummary?.split("\n").filter(Boolean) ?? [];
    appendConsoleEntries(
      [`Execution ${latestExecution.status} for ${row.id}.`, ...logs],
      latestExecution.status === "passed" ? "success" : "error",
      "execution"
    );
  }, [appendConsoleEntries, latestExecution, row.id]);

  const activeExecution = liveExecution.execution ?? latestExecution;
  const activeArtifacts = liveExecution.artifacts.length
    ? liveExecution.artifacts
    : latestArtifacts;
  const activeStepResults =
    liveExecution.stepResults.length
      ? liveExecution.stepResults
      : debugSession?.stepResults.length
      ? debugSession.stepResults
      : activeExecution?.stepResults ?? [];
  const activeDebugStepId =
    debugSession?.currentSourceStepId ??
    liveExecution.currentSourceStepId ??
    null;

  const validationIssuesByStepId = useMemo(() => {
    const grouped = new Map<string, AutomationValidationIssue[]>();
    (validationResult?.issues ?? []).forEach((issue) => {
      if (!issue.stepId) {
        return;
      }
      const existing = grouped.get(issue.stepId) ?? [];
      existing.push(issue);
      grouped.set(issue.stepId, existing);
    });
    return grouped;
  }, [validationResult]);

  const stepResultsBySourceStepId = useMemo(() => {
    const grouped = new Map<string, AutomationStepResult[]>();
    activeStepResults.forEach((result) => {
      const key = result.sourceStepId ?? result.stepId;
      const existing = grouped.get(key) ?? [];
      existing.push(result);
      grouped.set(key, existing);
    });
    return grouped;
  }, [activeStepResults]);

  const stepStatuses = useMemo(
    () =>
      new Map<string, StepVisualStatus>(
        draftSteps.map((step) => {
          const status =
            step.id === activeDebugStepId
              ? "running"
              : aggregateStepResults(stepResultsBySourceStepId.get(step.id) ?? []) ?? "pending";
          return [step.id, status];
        })
      ),
    [activeDebugStepId, draftSteps, stepResultsBySourceStepId]
  );

  const replaySequence = useMemo(() => {
    const seen = new Set<string>();
    return activeStepResults
      .sort((left, right) => left.stepIndex - right.stepIndex)
      .filter((result) => {
        const key = result.sourceStepId ?? result.stepId;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }, [activeStepResults]);

  const playbackStepId =
    playbackMode === "replay" && replaySequence.length > 0
      ? replaySequence[replayCursor]?.sourceStepId ?? replaySequence[replayCursor]?.stepId ?? null
      : activeDebugStepId;

  useEffect(() => {
    if (!playbackStepId) {
      return;
    }
    setSelectedStepId(playbackStepId);
  }, [playbackStepId]);

  useEffect(() => {
    if (playbackMode !== "replay" || !replayPlaying || replaySequence.length === 0) {
      return;
    }

    if (replayCursor >= replaySequence.length - 1) {
      setReplayPlaying(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReplayCursor((current) => Math.min(current + 1, replaySequence.length - 1));
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [playbackMode, replayCursor, replayPlaying, replaySequence.length]);

  useEffect(() => {
    if (!debugSession || !["starting", "running"].includes(debugSession.status)) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ sessionId: debugSession.id });
        const response = await fetch(`/api/automation/debug?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await parseAutomationApiResponse<{
          error?: string;
          session?: AutomationDebugSession;
        }>(response);

        if (!response.ok || !payload.session) {
          const text = payload.error || "Failed to refresh debug status.";
          setDebugSession((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  failureMessage: text,
                }
              : current
          );
          setRunNotice({ tone: "error", text });
          appendConsoleEntries([text], "error", "debug");
          return;
        }

        setDebugSession(payload.session);
      } catch (error) {
        const text =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to refresh debug status.";
        setDebugSession((current) =>
          current
            ? {
                ...current,
                status: "failed",
                failureMessage: text,
              }
            : current
        );
        setRunNotice({ tone: "error", text });
        appendConsoleEntries([text], "error", "debug");
      }
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [appendConsoleEntries, debugSession]);

  useEffect(() => {
    if (!recorderSession || !["starting", "recording", "stopping"].includes(recorderSession.status)) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ sessionId: recorderSession.id });
        const response = await fetch(`/api/automation/record?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await parseAutomationApiResponse<{
          error?: string;
          session?: AutomationRecorderSession;
        }>(response);

        if (!response.ok || !payload.session) {
          const text = payload.error || "Failed to refresh recorder status.";
          setRecorderSession((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  failureMessage: text,
                }
              : current
          );
          setRunNotice({ tone: "error", text });
          appendConsoleEntries([text], "error", "recording");
          return;
        }

        setRecorderSession(payload.session);
      } catch (error) {
        const text =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to refresh recorder status.";
        setRecorderSession((current) =>
          current
            ? {
                ...current,
                status: "failed",
                failureMessage: text,
              }
            : current
        );
        setRunNotice({ tone: "error", text });
        appendConsoleEntries([text], "error", "recording");
      }
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [appendConsoleEntries, recorderSession]);

  useEffect(() => {
    if (
      !recorderSession ||
      recorderSession.status !== "stopped" ||
      recorderSuggestionSessionIdRef.current === recorderSession.id
    ) {
      return;
    }

    recorderSuggestionSessionIdRef.current = recorderSession.id;
    const generatedSteps = recorderSession.generatedSteps;
    const suggestions: WorkspaceSuggestion[] = [];

    const brittleSelectorCount = generatedSteps.filter((step) => {
      const target = step.targetValue ?? "";
      return (
        step.targetType === "selector" &&
        (target.includes(":nth-of-type") ||
          target.includes(" > ") ||
          (!target.includes("data-testid") && !target.startsWith("#") && target.includes(".")))
      );
    }).length;

    if (brittleSelectorCount > 0) {
      suggestions.push({
        id: "recording-selector-review",
        title: `${brittleSelectorCount} selector${brittleSelectorCount === 1 ? "" : "s"} should be hardened`,
        description:
          "The recorder found CSS-heavy selectors. Review them and replace the weakest ones with stable test ids, names, or selector presets.",
        tone: "amber",
      });
    }

    const lowerHaystack = generatedSteps
      .map((step) =>
        `${step.targetValue ?? ""} ${step.inputValue ?? ""} ${getStepDescription(step)}`
          .toLowerCase()
          .trim()
      )
      .join(" ");
    const loginDetected =
      /user|email/.test(lowerHaystack) &&
      /pass/.test(lowerHaystack) &&
      /login|sign in|signin/.test(lowerHaystack);

    if (loginDetected) {
      suggestions.push({
        id: "recording-login-flow",
        title: "Reusable login flow detected",
        description:
          "This recording looks like a login path. Save it as a reusable block so other cases can reference it instead of duplicating the same steps.",
        tone: "sky",
        applyLabel: "Prep shared flow",
        onApply: () => {
          setSharedBlockDraftName("Recorded Login Flow");
          setSharedBlockDraftDescription("Generated from a smart recording session.");
          setIsReuseLibraryOpen(true);
        },
      });
    }

    suggestions.push({
      id: "recording-noise-reduction",
      title: "Noise reduction applied",
      description:
        "Rapid duplicate clicks and repeated field edits were merged during recording so the output stays focused on meaningful user intent.",
      tone: "emerald",
    });

    setAssistantSuggestions(suggestions);
  }, [recorderSession]);

  useEffect(() => {
    setValidationResult(null);
  }, [
    draftDescription,
    draftEnvironmentId,
    draftExecutionMode,
    draftName,
    draftProvider,
    draftSteps,
  ]);

  const selectedStep =
    (selectedStepId ? draftSteps.find((step) => step.id === selectedStepId) : null) ??
    draftSteps[0] ??
    null;
  const selectedStepIssues =
    (selectedStep ? validationIssuesByStepId.get(selectedStep.id) : undefined) ?? [];
  const validationIssueCount = validationResult?.issues.length ?? 0;

  const runHref = useMemo(() => {
    if (!projectRouteRef || !latestExecution) {
      return null;
    }

    const params = new URLSearchParams({
      runId: latestExecution.runId,
      rowId: row.id,
    });

    return `/projects/${encodeURIComponent(projectRouteRef)}/runs?${params.toString()}`;
  }, [latestExecution, projectRouteRef, row.id]);

  const reportHref = useMemo(() => {
    if (!projectRouteRef) {
      return null;
    }

    return `/projects/${encodeURIComponent(projectRouteRef)}/reports`;
  }, [projectRouteRef]);

  const recordingStartUrl =
    activeEnvironment?.baseUrl?.trim() ||
    draftSteps.find((step) => step.action === "goto" && step.targetValue?.trim())?.targetValue?.trim() ||
    "";

  const requestValidation = async () => {
    const response = await fetch("/api/automation/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: draftProvider,
        script: {
          id: script?.id ?? "draft-validation-script",
          projectId: "draft-project",
          provider: draftProvider,
          executionMode: draftExecutionMode,
          environmentBindingId: draftEnvironmentId || undefined,
          name: draftName.trim() || `${row.id} flow`,
          description: draftDescription.trim() || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        steps: draftSteps,
        reusableBlocks,
        selectorPresets,
        environments,
      }),
    });
    const data = await parseAutomationApiResponse<AutomationValidationResult & {
      error?: string;
    }>(response);
    setValidationResult(data);
    return data;
  };

  const save = () => {
    onSave({
      rowId: row.id,
      mode: draftMode,
      provider: draftProvider,
      executionMode: draftExecutionMode,
      environmentBindingId: draftEnvironmentId || undefined,
      name: draftName,
      description: draftDescription,
      steps: draftSteps,
    });
    const text = `Saved automation draft for ${row.id}.`;
    setRunNotice({ tone: "success", text });
    appendConsoleEntries([text], "success", "system");
  };

  const addStep = () => {
    const scriptId = draftSteps[0]?.scriptId ?? script?.id ?? "";
    const nextStep = emptyStep(scriptId, draftSteps.length);
    setDraftSteps((currentSteps) => normalizeOrders([...currentSteps, nextStep]));
    setSelectedStepId(nextStep.id);
  };

  const deleteStep = (stepId: string) => {
    const nextSteps = normalizeOrders(draftSteps.filter((step) => step.id !== stepId));
    setDraftSteps(nextSteps);
    setSelectedStepId(nextSteps[Math.max(0, nextSteps.length - 1)]?.id ?? null);
    appendConsoleEntries([`Removed step from ${row.id}.`], "info", "system");
  };

  const moveStep = (stepId: string, direction: "up" | "down") => {
    const currentIndex = draftSteps.findIndex((step) => step.id === stepId);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= draftSteps.length) {
      return;
    }

    const nextSteps = [...draftSteps];
    const [movedStep] = nextSteps.splice(currentIndex, 1);
    nextSteps.splice(targetIndex, 0, movedStep);
    const normalized = normalizeOrders(nextSteps);
    setDraftSteps(normalized);
    setSelectedStepId(stepId);
    appendConsoleEntries(
      [`Moved step ${direction === "up" ? "up" : "down"} in the flow.`],
      "info",
      "system"
    );
  };

  const insertTemplate = (templateId: AutomationStepTemplateId) => {
    const scriptId = draftSteps[0]?.scriptId ?? script?.id ?? "";
    const nextSteps = [
      ...draftSteps,
      ...buildAutomationTemplateSteps({
        templateId,
        provider: draftProvider,
        scriptId,
        startOrder: draftSteps.length,
      }),
    ];
    const normalized = normalizeOrders(nextSteps);
    setDraftSteps(normalized);
    setSelectedStepId(normalized[draftSteps.length]?.id ?? normalized[0]?.id ?? null);
    appendConsoleEntries([`Inserted ${templateId} template.`], "info", "system");
  };

  const insertSharedBlock = (blockId: string) => {
    const scriptId = draftSteps[0]?.scriptId ?? script?.id ?? "";
    const matchedAction =
      actions.find((action) => action.id === blockId) ??
      actions.find((action) => (action.backingBlockId ?? action.id) === blockId) ??
      null;
    const resolvedBlockId = matchedAction?.backingBlockId ?? matchedAction?.id ?? blockId;
    const nextStep: AutomationStep = {
      id: crypto.randomUUID(),
      scriptId,
      order: draftSteps.length,
      action: "run-block",
      targetType: "shared-block",
      targetValue: resolvedBlockId,
      sharedBlockId: resolvedBlockId,
      timeoutMs: 5000,
      metaJson: matchedAction
        ? {
            actionCall: {
              actionId: matchedAction.id,
              actionName: matchedAction.name,
              parameterBindings: {},
            },
          }
        : {},
    };
    const normalized = normalizeOrders([...draftSteps, nextStep]);
    setDraftSteps(normalized);
    setSelectedStepId(nextStep.id);
    appendConsoleEntries(
      [`Inserted ${matchedAction ? "action call" : "shared block"} into the flow.`],
      "info",
      "system"
    );
  };

  const saveCurrentStepsAsSharedBlock = () => {
    const trimmedName = sharedBlockDraftName.trim() || `${row.id} shared flow`;
    const now = Date.now();
    const nextBlock: AutomationReusableBlock = {
      id: crypto.randomUUID(),
      name: trimmedName,
      description: sharedBlockDraftDescription.trim() || undefined,
      provider: draftProvider,
      steps: draftSteps.map((step, index) => ({
        ...step,
        id: crypto.randomUUID(),
        scriptId: trimmedName,
        order: index,
      })),
      createdAt: now,
      updatedAt: now,
    };

    onSaveReuseLibrary({
      reusableBlocks: [...reusableBlocks, nextBlock],
      environments,
      activeEnvironmentId: draftEnvironmentId || activeEnvironmentId,
    });
    const text = `Saved "${trimmedName}" as a shared block.`;
    setRunNotice({ tone: "success", text });
    setIsReuseLibraryOpen(false);
    appendConsoleEntries([text], "success", "system");
  };

  const updateReusableBlock = (
    blockId: string,
    field: "name" | "description",
    value: string
  ) => {
    onSaveReuseLibrary({
      reusableBlocks: reusableBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              [field]: value,
              updatedAt: Date.now(),
            }
          : block
      ),
      environments,
      activeEnvironmentId: draftEnvironmentId || activeEnvironmentId,
    });
  };

  const deleteReusableBlock = (blockId: string) => {
    onSaveReuseLibrary({
      reusableBlocks: reusableBlocks.filter((block) => block.id !== blockId),
      environments,
      activeEnvironmentId: draftEnvironmentId || activeEnvironmentId,
    });
    appendConsoleEntries(["Removed a shared block from the library."], "info", "system");
  };

  const saveEnvironment = () => {
    const now = Date.now();
    const nextEnvironmentId = draftEnvironmentId || activeEnvironmentId || crypto.randomUUID();
    const nextEnvironment: AutomationEnvironmentBinding = {
      id: nextEnvironmentId,
      name:
        environments.find((item) => item.id === nextEnvironmentId)?.name ||
        "Default Environment",
      baseUrl: environmentBaseUrl.trim() || undefined,
      routePresets: {
        login: environmentLoginRoute.trim() || "/login",
        dashboard: environmentDashboardRoute.trim() || "/dashboard",
      },
      credentialAliases: credentialAliases
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      isDefault: true,
      createdAt:
        environments.find((item) => item.id === nextEnvironmentId)?.createdAt ?? now,
      updatedAt: now,
    };

    onSaveReuseLibrary({
      reusableBlocks,
      environments: [
        nextEnvironment,
        ...environments.filter((item) => item.id !== nextEnvironmentId).map((item) => ({
          ...item,
          isDefault: false,
        })),
      ],
      activeEnvironmentId: nextEnvironmentId,
    });
    setDraftEnvironmentId(nextEnvironmentId);
    setIsEnvironmentEditorOpen(false);
    const text = "Saved the active automation environment.";
    setRunNotice({ tone: "success", text });
    appendConsoleEntries([text], "success", "system");
  };

  const validate = async () => {
    setIsValidating(true);
    try {
      const data = await requestValidation();
      const text = data.valid
        ? "Validation passed. Automation is ready to run."
        : data.error || data.errors[0] || "Validation found issues to fix.";
      setRunNotice({ tone: data.valid ? "success" : "error", text });
      appendConsoleEntries([text], data.valid ? "success" : "error", "validation");
    } finally {
      setIsValidating(false);
    }
  };

  const run = async () => {
    setIsRunning(true);
    setPlaybackMode("live");
    setReplayPlaying(false);
    setLiveExecution({
      status: "running",
      currentStepId: null,
      currentSourceStepId: null,
      stepResults: [],
      execution: null,
      executions: [],
      artifacts: [],
      failureMessage: null,
    });
    const startText = "Running automation now.";
    setRunNotice({ tone: "info", text: startText });
    appendConsoleEntries([startText], "info", "execution");
    try {
      const validation = await requestValidation();
      if (!validation.valid) {
        const text = validation.errors[0] || "Fix validation issues before running.";
        setRunNotice({ tone: "error", text });
        appendConsoleEntries([text], "error", "validation");
        setLiveExecution((current) => ({
          ...current,
          status: "blocked",
          failureMessage: text,
        }));
        return;
      }

      if (executionStreamRequest) {
        const response = await fetch("/api/automation/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...executionStreamRequest,
            executionMode: draftExecutionMode,
            stream: true,
          }),
        });

        if (!response.ok || !response.body) {
          const payload = await parseAutomationApiResponse<{ error?: string }>(response);
          throw new Error(payload.error || "Live execution stream did not start.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completedExecutions: AutomationExecution[] = [];

        const handleExecutionEvent = async (event: AutomationExecutionEvent) => {
          switch (event.type) {
            case "log_message":
              if (event.message) {
                appendConsoleEntries(
                  [event.message],
                  event.level === "error"
                    ? "error"
                    : event.level === "success"
                      ? "success"
                      : "info",
                  "execution"
                );
              }
              break;
            case "step_start":
              setLiveExecution((current) => {
                const runningResult = event.stepResult;
                const nextStepResults = runningResult
                  ? [
                      ...current.stepResults.filter(
                        (result) =>
                          !(
                            result.stepId === runningResult.stepId &&
                            result.stepIndex === runningResult.stepIndex
                          )
                      ),
                      runningResult,
                    ]
                  : current.stepResults;
                return {
                  ...current,
                  status: "running",
                  currentStepId: event.stepId ?? null,
                  currentSourceStepId: event.sourceStepId ?? event.stepId ?? null,
                  stepResults: nextStepResults,
                };
              });
              break;
            case "step_success":
            case "step_failure":
              setLiveExecution((current) => {
                const stepResult = event.stepResult;
                const nextStepResults = stepResult
                  ? [
                      ...current.stepResults.filter(
                        (result) =>
                          !(
                            result.stepId === stepResult.stepId &&
                            result.stepIndex === stepResult.stepIndex
                          )
                      ),
                      stepResult,
                    ].sort((left, right) => left.stepIndex - right.stepIndex)
                  : current.stepResults;

                return {
                  ...current,
                  status: event.type === "step_failure" ? "failed" : current.status,
                  currentStepId:
                    event.type === "step_failure"
                      ? event.stepId ?? current.currentStepId
                      : current.currentStepId,
                  currentSourceStepId:
                    event.type === "step_failure"
                      ? event.sourceStepId ?? event.stepId ?? current.currentSourceStepId
                      : current.currentSourceStepId,
                  stepResults: nextStepResults,
                  artifacts:
                    event.artifact
                      ? [
                          ...current.artifacts,
                          {
                            id: `${event.executionId}-${current.artifacts.length + 1}`,
                            executionId: event.executionId,
                            type: event.artifact.type,
                            path: event.artifact.path,
                            metadataJson: event.artifact.metadataJson,
                          },
                        ]
                      : current.artifacts,
                  failureMessage:
                    event.type === "step_failure"
                      ? event.failureMessage ?? event.message ?? current.failureMessage
                      : current.failureMessage,
                };
              });

              if (event.message) {
                appendConsoleEntries(
                  [event.message],
                  event.type === "step_failure" ? "error" : "success",
                  "execution"
                );
              }
              break;
            case "execution_complete": {
              const execution = event.execution ?? null;
              const executions = execution
                ? [...completedExecutions, execution]
                : completedExecutions;
              completedExecutions = executions;
              setLiveExecution((current) => ({
                ...current,
                status:
                  event.status === "passed" || event.status === "failed" || event.status === "blocked"
                    ? event.status
                    : current.status,
                currentStepId: null,
                currentSourceStepId: null,
                execution,
                executions,
                artifacts:
                  event.artifacts && event.artifacts.length > 0
                    ? event.artifacts
                    : current.artifacts,
                failureMessage: event.failureMessage ?? current.failureMessage,
              }));

              const text =
                event.status === "passed"
                  ? `${draftName.trim() || row.id} passed.`
                  : event.failureMessage || "Automation finished with issues.";
              setRunNotice({
                tone: event.status === "passed" ? "success" : "error",
                text,
              });
              appendConsoleEntries(
                [text],
                event.status === "passed" ? "success" : "error",
                "execution"
              );
              if (execution && onExecutionFinished) {
                await onExecutionFinished({ execution, executions });
              }
              break;
            }
            default:
              break;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = parseExecutionStreamChunks(buffer);
          const completeChunks = buffer.split("\n\n");
          buffer = completeChunks[completeChunks.length - 1] ?? "";

          for (const event of events) {
            await handleExecutionEvent(event.data);
          }
        }

        const trailingEvents = parseExecutionStreamChunks(buffer);
        for (const event of trailingEvents) {
          await handleExecutionEvent(event.data);
        }
        return;
      }

      const result = onRunWithOptions
        ? await onRunWithOptions({
            rowId: row.id,
            scriptId: script?.id,
            executionMode: draftExecutionMode,
          })
        : await onRun(row.id);

      if (result) {
        setRunNotice(result);
        appendConsoleEntries(
          [result.text],
          result.tone === "success" ? "success" : result.tone === "error" ? "error" : "info",
          "execution"
        );
      }
    } catch (error) {
      const text =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Automation did not complete. Try again.";
      setRunNotice({ tone: "error", text });
      appendConsoleEntries([text], "error", "execution");
      setLiveExecution((current) => ({
        ...current,
        status: "failed",
        failureMessage: text,
        currentStepId: null,
        currentSourceStepId: null,
      }));
    } finally {
      setIsRunning(false);
    }
  };

  const debugInBrowser = async () => {
    setIsDebugging(true);
    setPlaybackMode("live");
    setReplayPlaying(false);
    setLiveExecution({
      status: "idle",
      currentStepId: null,
      currentSourceStepId: null,
      stepResults: [],
      execution: null,
      executions: [],
      artifacts: [],
      failureMessage: null,
    });
    const startText = "Starting debug mode and preparing the workspace stream.";
    setRunNotice({ tone: "info", text: startText });
    appendConsoleEntries([startText], "info", "debug");

    try {
      const response = await fetch("/api/automation/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId: row.id,
          provider: draftProvider,
          scriptName: draftName.trim() || `${row.id} flow`,
          script: {
            id: script?.id ?? "draft-debug-script",
            environmentBindingId: draftEnvironmentId || undefined,
            description: draftDescription.trim() || undefined,
          },
          steps: draftSteps,
          reusableBlocks,
          selectorPresets,
          environments,
        }),
      });
      const payload = await parseAutomationApiResponse<{
        error?: string;
        message?: string;
        validation?: AutomationValidationResult;
        session?: AutomationDebugSession;
      }>(response);

      if (!response.ok || !payload.session) {
        if (payload.validation) {
          setValidationResult(payload.validation);
        }
        throw new Error(payload.error || "Visible browser debug did not start.");
      }

      setDebugSession(payload.session);
      const text =
        payload.message ||
        "Debug mode started. The workspace will highlight the running step as logs arrive.";
      setRunNotice({ tone: "info", text });
      appendConsoleEntries([text], "info", "debug");
    } catch (error) {
      const text =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Visible browser debug did not start.";
      setRunNotice({ tone: "error", text });
      appendConsoleEntries([text], "error", "debug");
    } finally {
      setIsDebugging(false);
    }
  };

  const recordInBrowser = async () => {
    setIsRecording(true);
    const startText = recordingStartUrl
      ? `Starting recorder at ${recordingStartUrl}.`
      : "Starting recorder. Use the opened browser to navigate and interact.";
    setRunNotice({ tone: "info", text: startText });
    appendConsoleEntries([startText], "info", "recording");

    try {
      const response = await fetch("/api/automation/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId: row.id,
          provider: draftProvider,
          scriptName: draftName.trim() || `${row.id} flow`,
          initialUrl: recordingStartUrl || undefined,
        }),
      });
      const payload = await parseAutomationApiResponse<{
        error?: string;
        message?: string;
        session?: AutomationRecorderSession;
      }>(response);

      if (!response.ok || !payload.session) {
        throw new Error(payload.error || "Live recorder did not start.");
      }

      startTransition(() => {
        setPlaybackMode("live");
        setReplayPlaying(false);
      });
      setRecorderSession(payload.session);
      const text =
        payload.message ||
        "Recorder started. Interact with the opened browser, then stop recording to generate steps.";
      setRunNotice({ tone: "info", text });
      appendConsoleEntries([text], "info", "recording");
    } catch (error) {
      const text =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Live recorder did not start.";
      setRunNotice({ tone: "error", text });
      appendConsoleEntries([text], "error", "recording");
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!recorderSession) {
      return;
    }

    setIsRecording(true);
    try {
      const response = await fetch("/api/automation/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stop",
          sessionId: recorderSession.id,
        }),
      });
      const payload = await parseAutomationApiResponse<{
        error?: string;
        message?: string;
        session?: AutomationRecorderSession;
      }>(response);

      if (!response.ok || !payload.session) {
        throw new Error(payload.error || "Failed to stop recorder.");
      }

      setRecorderSession(payload.session);
      const text =
        payload.message || "Stopping recorder and finalizing captured interactions.";
      setRunNotice({ tone: "info", text });
      appendConsoleEntries([text], "info", "recording");
    } catch (error) {
      const text =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to stop recorder.";
      setRunNotice({ tone: "error", text });
      appendConsoleEntries([text], "error", "recording");
    } finally {
      setIsRecording(false);
    }
  };

  const applyRecording = () => {
    if (!recorderSession || recorderSession.generatedSteps.length === 0) {
      return;
    }

    const scriptId = script?.id ?? draftSteps[0]?.scriptId ?? "";
    const nextSteps = normalizeOrders(
      recorderSession.generatedSteps.map((step, index) => ({
        ...step,
        id: crypto.randomUUID(),
        scriptId,
        order: index,
      }))
    );
    setDraftSteps(nextSteps);
    setSelectedStepId(nextSteps[0]?.id ?? null);
    setValidationResult(null);
    const text = `Applied ${nextSteps.length} recorded step${nextSteps.length === 1 ? "" : "s"} to the draft.`;
    setRunNotice({ tone: "success", text });
    appendConsoleEntries([text], "success", "recording");
    setAssistantSuggestions([
      {
        id: "recording-applied",
        title: "Recording applied",
        description:
          "The captured interactions are now in the step editor. Review selectors and assertions before saving or running.",
        tone: "emerald",
      },
    ]);
  };

  const generateFromCase = async () => {
    setIsGenerating(true);
    const startText = "Generating automation from the selected test case.";
    appendConsoleEntries([startText], "info", "ai");
    setRunNotice({ tone: "info", text: startText });

    try {
      const response = await fetch("/api/automation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row }),
      });
      const payload = await parseAutomationApiResponse<{
        error?: string;
        domain?: "ui" | "api" | "salesforce";
        steps?: AutomationStep[];
      }>(response);

      if (!response.ok || !Array.isArray(payload.steps) || payload.steps.length === 0) {
        throw new Error(payload.error || "No automation steps were generated.");
      }

      const scriptId = script?.id ?? draftSteps[0]?.scriptId ?? "";
      const nextSteps = normalizeOrders(
        payload.steps.map((step, index) => ({
          ...step,
          id: step.id || crypto.randomUUID(),
          scriptId,
          order: index,
        }))
      );
      setDraftSteps(nextSteps);
      setSelectedStepId(nextSteps[0]?.id ?? null);
      const text = `Generated ${nextSteps.length} ${payload.domain ?? "automation"} step${
        nextSteps.length === 1 ? "" : "s"
      } from the case.`;
      setRunNotice({ tone: "success", text });
      appendConsoleEntries([text], "success", "ai");
      setAssistantSuggestions([
        {
          id: "generated-case",
          title: "Generated from case",
          description:
            "The step list was rebuilt from the current case. Review logical targets and placeholders before saving.",
          tone: "emerald",
        },
      ]);
    } catch (error) {
      const text =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to generate automation from the case.";
      setRunNotice({ tone: "error", text });
      appendConsoleEntries([text], "error", "ai");
    } finally {
      setIsGenerating(false);
    }
  };

  const fixSelectedStep = () => {
    if (!selectedStep) {
      return;
    }

    const fallbackSelector = selectorPresets[0];
    const fallbackBlock = reusableBlocks[0];
    let changed = false;

    const nextSteps = normalizeOrders(
      draftSteps.map((step) => {
        if (step.id !== selectedStep.id) {
          return step;
        }

        const nextStep: AutomationStep = {
          ...step,
          metaJson: step.metaJson ? { ...step.metaJson } : undefined,
        };

        const ensureTargetType = (targetType: AutomationStep["targetType"]) => {
          if (nextStep.targetType !== targetType) {
            nextStep.targetType = targetType;
            changed = true;
          }
        };

        const ensureTargetValue = (value: string) => {
          if (!nextStep.targetValue?.trim()) {
            nextStep.targetValue = value;
            changed = true;
          }
        };

        const ensureInputValue = (value: string) => {
          if (!nextStep.inputValue?.trim()) {
            nextStep.inputValue = value;
            changed = true;
          }
        };

        const ensureExpectedValue = (value: string) => {
          if (!nextStep.expectedValue?.trim()) {
            nextStep.expectedValue = value;
            changed = true;
          }
        };

        if (!nextStep.timeoutMs || nextStep.timeoutMs < 500) {
          nextStep.timeoutMs = 5000;
          changed = true;
        }

        switch (nextStep.action) {
          case "goto":
            ensureTargetType("url");
            ensureTargetValue(activeEnvironment?.baseUrl ? "{{baseUrl}}" : "/");
            break;
          case "click":
          case "fill":
          case "select":
          case "wait-for":
          case "assert-visible":
          case "assert-text":
          case "assert-value":
            if (fallbackSelector) {
              ensureTargetType("selector-preset");
              if (!nextStep.selectorPresetId) {
                nextStep.selectorPresetId = fallbackSelector.id;
                changed = true;
              }
              ensureTargetValue(fallbackSelector.selector);
            } else {
              ensureTargetType("selector");
              ensureTargetValue("[data-testid='replace-me']");
            }
            break;
          case "assert-url":
            ensureTargetType("url");
            ensureTargetValue("Current URL");
            break;
          case "press":
            ensureTargetType("key");
            ensureTargetValue("body");
            break;
          case "run-block":
            ensureTargetType("shared-block");
            if (!nextStep.sharedBlockId && fallbackBlock) {
              nextStep.sharedBlockId = fallbackBlock.id;
              nextStep.targetValue = fallbackBlock.id;
              changed = true;
            }
            break;
          default:
            break;
        }

        if (nextStep.action === "fill") {
          ensureInputValue("sample-value");
        }

        if (nextStep.action === "select") {
          ensureInputValue("sample-option");
        }

        if (nextStep.action === "press") {
          ensureInputValue("Enter");
        }

        if (nextStep.action === "assert-text") {
          ensureExpectedValue("Expected text");
        }

        if (nextStep.action === "assert-url") {
          ensureExpectedValue(activeEnvironment?.baseUrl ? "{{baseUrl}}" : "/expected-path");
        }

        if (nextStep.action === "assert-value") {
          ensureExpectedValue("Expected value");
        }

        if (!getStepDescription(nextStep)) {
          nextStep.metaJson = {
            ...(nextStep.metaJson ?? {}),
            description: `${actionLabel(nextStep)} ${formatStepSummary(nextStep)}`,
          };
          changed = true;
        }

        return nextStep;
      })
    );

    if (!changed) {
      const text = "The selected step already looks healthy. Review its assertions or selectors manually.";
      setAssistantSuggestions([
        {
          id: "fix-step-noop",
          title: "No quick fix needed",
          description:
            "This step already has the required structure. If it still fails, refine its selector or expected value.",
          tone: "sky",
        },
      ]);
      setRunNotice({ tone: "info", text });
      appendConsoleEntries([text], "info", "ai");
      return;
    }

    setDraftSteps(nextSteps);
    const text = `Applied quick fixes to step ${selectedStep.order + 1}.`;
    setRunNotice({ tone: "success", text });
    appendConsoleEntries([text], "success", "ai");
    setAssistantSuggestions([
      {
        id: "fix-step-applied",
        title: "Quick fix applied",
        description:
          "The selected step was repaired with safe defaults. Validate once more before running.",
        tone: "emerald",
      },
    ]);
  };

  const improveAutomation = () => {
    const missingDescriptions = draftSteps.filter((step) => !getStepDescription(step)).length;
    const missingExpectedResults = draftSteps.filter(
      (step) =>
        (
          step.action.startsWith("assert") ||
          step.action === "fill" ||
          step.action === "select" ||
          step.action === "click"
        ) &&
        !getStepExpectedResult(step)
    ).length;
    const lowTimeoutSteps = draftSteps.filter(
      (step) => !step.timeoutMs || step.timeoutMs < (step.action === "wait-for" ? 4000 : 2000)
    ).length;
    const rawSelectorSteps = draftSteps.filter(
      (step) =>
        step.targetType === "selector" &&
        step.targetValue?.trim() &&
        !step.selectorPresetId &&
        step.action !== "goto"
    ).length;

    const nextSuggestions: WorkspaceSuggestion[] = [];

    if (missingDescriptions > 0) {
      nextSuggestions.push({
        id: "describe-steps",
        title: `Add ${missingDescriptions} step description${missingDescriptions === 1 ? "" : "s"}`,
        description:
          "Readable step descriptions make debug playback easier to scan and help new contributors understand intent.",
        tone: "sky",
        applyLabel: "Apply descriptions",
        onApply: () => {
          setDraftSteps((currentSteps) =>
            normalizeOrders(
              currentSteps.map((step) =>
                getStepDescription(step)
                  ? step
                  : {
                      ...step,
                      metaJson: {
                        ...(step.metaJson ?? {}),
                        description: `${actionLabel(step)} ${formatStepSummary(step)}`,
                      },
                    }
              )
            )
          );
          appendConsoleEntries(["Added missing step descriptions."], "success", "ai");
        },
      });
    }

    if (missingExpectedResults > 0) {
      nextSuggestions.push({
        id: "expected-results",
        title: `Add ${missingExpectedResults} expected outcome${missingExpectedResults === 1 ? "" : "s"}`,
        description:
          "Expected outcomes give playback more context and make failures actionable instead of generic.",
        tone: "amber",
        applyLabel: "Add outcomes",
        onApply: () => {
          setDraftSteps((currentSteps) =>
            normalizeOrders(
              currentSteps.map((step) => {
                if (getStepExpectedResult(step)) {
                  return step;
                }

                let expectedResult = "";
                if (step.action === "goto") {
                  expectedResult = "The requested page loads successfully.";
                } else if (step.action === "click") {
                  expectedResult = "The click completes and the next UI state appears.";
                } else if (step.action === "fill") {
                  expectedResult = "The field accepts the new value.";
                } else if (step.action === "select") {
                  expectedResult = "The requested option is selected.";
                } else if (step.action === "assert-visible") {
                  expectedResult = "The element stays visible.";
                } else if (step.action === "assert-text") {
                  expectedResult = "The expected text is visible.";
                } else if (step.action === "assert-url") {
                  expectedResult = "The browser URL matches the expected path.";
                } else if (step.action === "assert-value") {
                  expectedResult = "The field value matches the expected content.";
                } else {
                  return step;
                }

                return {
                  ...step,
                  metaJson: {
                    ...(step.metaJson ?? {}),
                    expectedResult,
                  },
                };
              })
            )
          );
          appendConsoleEntries(["Added expected outcomes to the draft."], "success", "ai");
        },
      });
    }

    if (lowTimeoutSteps > 0) {
      nextSuggestions.push({
        id: "normalize-timeouts",
        title: `Normalize ${lowTimeoutSteps} timeout${lowTimeoutSteps === 1 ? "" : "s"}`,
        description:
          "A stable timeout baseline reduces false negatives during slower environments and replay sessions.",
        tone: "emerald",
        applyLabel: "Normalize timeouts",
        onApply: () => {
          setDraftSteps((currentSteps) =>
            normalizeOrders(
              currentSteps.map((step) => ({
                ...step,
                timeoutMs:
                  step.action === "wait-for"
                    ? Math.max(step.timeoutMs ?? 0, 8000)
                    : Math.max(step.timeoutMs ?? 0, 3000),
              }))
            )
          );
          appendConsoleEntries(["Normalized timeouts for the current flow."], "success", "ai");
        },
      });
    }

    if (rawSelectorSteps > 0) {
      nextSuggestions.push({
        id: "selector-presets",
        title: `${rawSelectorSteps} raw selector${rawSelectorSteps === 1 ? "" : "s"} could be standardized`,
        description:
          "Selector presets reduce duplication and make it easier to repair flows when UI locators change.",
        tone: "sky",
      });
    }

    if (nextSuggestions.length === 0) {
      nextSuggestions.push({
        id: "healthy-automation",
        title: "Automation already looks tidy",
        description:
          "This draft already has strong structure. The next best improvement is usually adding richer assertions for the most important checkpoints.",
        tone: "emerald",
      });
    }

    setAssistantSuggestions(nextSuggestions);
    const text = "Prepared inline automation improvement suggestions.";
    setRunNotice({ tone: "info", text });
    appendConsoleEntries([text], "info", "ai");
  };

  const startHorizontalResize =
    (side: "left" | "right") => (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const workspace = workspaceRef.current;
      if (!workspace) {
        return;
      }

      const bounds = workspace.getBoundingClientRect();

      const handleMove = (moveEvent: MouseEvent) => {
        if (side === "left") {
          setLeftWidth(clamp(moveEvent.clientX - bounds.left, 220, 360));
          return;
        }

        setRightWidth(clamp(bounds.right - moveEvent.clientX, 380, 560));
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    };

  const startConsoleResize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    const bounds = workspace.getBoundingClientRect();

    const handleMove = (moveEvent: MouseEvent) => {
      setConsoleHeight(clamp(bounds.bottom - moveEvent.clientY - 8, 140, 320));
    };

    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  useEffect(() => {
    if (replaySequence.length === 0) {
      setReplayCursor(0);
      setReplayPlaying(false);
      return;
    }

    if (replayCursor > replaySequence.length - 1) {
      setReplayCursor(Math.max(0, replaySequence.length - 1));
    }
  }, [replayCursor, replaySequence.length]);

  const playbackStep =
    (playbackStepId ? draftSteps.find((step) => step.id === playbackStepId) : null) ?? null;
  const playbackStepResults = playbackStep
    ? stepResultsBySourceStepId.get(playbackStep.id) ?? []
    : [];
  const playbackPrimaryResult =
    [...playbackStepResults].sort(
      (left, right) =>
        resultPriority[right.status] - resultPriority[left.status] ||
        right.stepIndex - left.stepIndex
    )[0] ?? null;
  const completedResults = activeStepResults.filter((result) =>
    ["passed", "failed", "blocked"].includes(result.status)
  ).length;
  const recorderEventCount = recorderSession?.events.length ?? 0;
  const recorderGeneratedStepCount = recorderSession?.generatedSteps.length ?? 0;
  const workspaceStatus =
    recorderSession?.status === "recording" || recorderSession?.status === "starting"
      ? "Recording"
      : liveExecution.status === "running"
        ? "Executing"
        : liveExecution.status === "passed"
          ? "Last run passed"
          : liveExecution.status === "failed" || liveExecution.status === "blocked"
            ? "Last run failed"
      : debugSession?.status === "running" || debugSession?.status === "starting"
      ? "Debugging"
      : activeExecution?.status === "passed"
        ? "Last run passed"
        : activeExecution?.status === "failed"
          ? "Last run failed"
        : "Draft only";

  const actionButtonClassName =
    "inline-flex items-center justify-center whitespace-nowrap rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60";
  const secondaryButtonClassName = `${actionButtonClassName} cf-secondary-button`;
  const primaryButtonClassName = `${actionButtonClassName} cf-primary-button`;

  const renderStepListPanel = () => (
    <div className="cf-panel flex h-full min-h-[340px] flex-col overflow-hidden rounded-[28px]">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={compactEyebrowClassName}>Flow Steps</p>
            <p className="mt-1 text-lg font-semibold text-slate-50">
              {draftSteps.length} step{draftSteps.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Status-aware step list for execution and replay.
            </p>
          </div>
          <button
            type="button"
            onClick={addStep}
            className="cf-secondary-button rounded-2xl px-3 py-2 text-xs font-semibold transition"
          >
            Add Step
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {draftSteps.map((step, index) => {
          const isSelected = selectedStepId === step.id;
          const isPlaybackStep = playbackStepId === step.id;
          const status = stepStatuses.get(step.id) ?? "pending";
          const issues = validationIssuesByStepId.get(step.id) ?? [];

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setSelectedStepId(step.id)}
              className={`w-full rounded-[24px] border px-3 py-3 text-left transition ${
                isPlaybackStep
                  ? "border-emerald-500/35 bg-emerald-500/10 shadow-[0_18px_36px_-30px_rgba(16,185,129,0.4)]"
                  : isSelected
                    ? "border-sky-500/30 bg-[linear-gradient(135deg,rgba(37,99,235,0.14),rgba(79,70,229,0.12),rgba(124,58,237,0.14))] shadow-[0_18px_34px_-32px_rgba(15,23,42,0.6)]"
                    : "border-slate-700/80 bg-slate-900/82 hover:border-slate-500 hover:bg-slate-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/75 text-[11px] font-semibold tracking-[0.12em] text-slate-300">
                  {actionGlyph(step.action)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">
                      {index + 1}. {actionLabel(step)}
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${stepStatusTone(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-400">
                    {getStepDescription(step) || formatStepSummary(step)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {issues.length > 0 ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                        {issues.length} issue{issues.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {isPlaybackStep ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                        current
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPlaybackPanel = () => (
    <div className="flex h-full min-h-[340px] flex-col overflow-hidden rounded-[28px] border border-slate-700/80 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.12),_transparent_34%),linear-gradient(180deg,_rgba(17,24,39,0.98)_0%,_rgba(15,23,42,0.98)_100%)]">
      <div className="border-b border-slate-800 px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className={compactEyebrowClassName}>Playback</p>
            <p className="mt-1 text-xl font-semibold text-slate-50">
              {workspaceStatus}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Live execution and replay stay visually synced with the current step editor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPlaybackMode("live")}
              className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                playbackMode === "live"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaybackMode("replay");
                setReplayCursor(0);
                setReplayPlaying(false);
              }}
              className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                playbackMode === "replay"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              Replay
            </button>
            <button
              type="button"
              onClick={() => setReplayPlaying((current) => !current)}
              disabled={playbackMode !== "replay" || replaySequence.length === 0}
              className="cf-secondary-button rounded-2xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {replayPlaying ? "Pause" : "Play"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className={`rounded-[22px] border px-4 py-3 ${validationTone(validationResult)}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">Validation</p>
            <p className="mt-1 text-lg font-semibold">
              {validationResult
                ? validationResult.valid
                  ? "Ready"
                  : `${validationIssueCount} issue${validationIssueCount === 1 ? "" : "s"}`
                : "Not checked"}
            </p>
            <p className="mt-1 text-sm opacity-85">
              {validationResult
                ? validationResult.valid
                  ? "The current draft passed validation."
                  : validationResult.errors[0] || "Resolve inline issues to continue."
                : "Run validation before execution."}
            </p>
          </div>
          <div className={`rounded-[22px] border px-4 py-3 ${debugTone(debugSession?.status)}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Execution Session
            </p>
            <p className="mt-1 text-lg font-semibold">
              {liveExecution.status !== "idle" ? liveExecution.status : debugSession?.status ?? "idle"}
            </p>
            <p className="mt-1 text-sm opacity-85">
              {liveExecution.failureMessage ||
                debugSession?.failureMessage ||
                (debugSession
                  ? `Updated ${formatUtcDate(debugSession.updatedAt)}`
                  : liveExecution.status === "running"
                    ? "Run events are streaming into playback and console now."
                    : "Launch headed debug mode for step-by-step playback.")}
            </p>
          </div>
          <div className="rounded-[22px] border border-zinc-200 bg-white/80 px-4 py-3 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-200">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Progress
            </p>
            <p className="mt-1 text-lg font-semibold">
              {completedResults}/{Math.max(draftSteps.length, 1)} step{draftSteps.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {playbackMode === "replay"
                ? `${replaySequence.length} recorded step event${replaySequence.length === 1 ? "" : "s"}`
                : "Live status updates stream here during execution."}
            </p>
          </div>
        </div>
        {runNotice ? (
          <div
            className={`mt-4 rounded-[22px] border px-4 py-3 text-sm ${
              runNotice.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                : runNotice.tone === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
            }`}
          >
            {runNotice.text}
          </div>
        ) : null}
        {activeExecution?.failureMessage || activeArtifacts.some((artifact) => artifact.type === "screenshot") ? (
          <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <p className="font-semibold">Failure detail</p>
            <p className="mt-1 opacity-85">
              {activeExecution?.failureMessage || liveExecution.failureMessage || "Execution failed."}
            </p>
            {activeArtifacts.find((artifact) => artifact.type === "screenshot") ? (
              <p className="mt-2 break-all text-xs opacity-80">
                Evidence: {activeArtifacts.find((artifact) => artifact.type === "screenshot")?.path}
              </p>
            ) : null}
          </div>
        ) : null}
        {recorderSession ? (
          <div
            className={`mt-4 rounded-[22px] border px-4 py-3 text-sm ${
              recorderSession.status === "failed"
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                : recorderSession.status === "recording" || recorderSession.status === "starting"
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
            }`}
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">
                  Recorder {recorderSession.status}
                </p>
                <p className="mt-1 opacity-85">
                  {recorderSession.failureMessage ||
                    `${recorderEventCount} interaction${recorderEventCount === 1 ? "" : "s"} captured and ${recorderGeneratedStepCount} generated step${recorderGeneratedStepCount === 1 ? "" : "s"} ready.`}
                </p>
              </div>
              {recorderGeneratedStepCount > 0 ? (
                <button
                  type="button"
                  onClick={applyRecording}
                  className="rounded-2xl border border-current/20 bg-white/70 px-3 py-2 text-xs font-semibold shadow-sm transition hover:bg-white dark:bg-zinc-950/40 dark:hover:bg-zinc-950/60"
                >
                  Apply Recording
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden px-5 py-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)]">
        <div className="flex min-h-[220px] flex-col rounded-[26px] border border-zinc-200/80 bg-white/92 p-5 dark:border-zinc-700 dark:bg-zinc-950/80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={compactEyebrowClassName}>Current Step</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {playbackStep ? `${playbackStep.order + 1}. ${actionLabel(playbackStep)}` : "No active step"}
              </p>
            </div>
            {playbackPrimaryResult ? (
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${stepStatusTone(
                  playbackPrimaryResult.status === "passed"
                    ? "success"
                    : playbackPrimaryResult.status === "running"
                      ? "running"
                      : playbackPrimaryResult.status === "failed" || playbackPrimaryResult.status === "blocked"
                        ? "failed"
                        : "pending"
                )}`}
              >
                {playbackPrimaryResult.status}
              </span>
            ) : null}
          </div>

          <div className="mt-5 flex flex-1 flex-col justify-between rounded-[26px] border border-dashed border-zinc-200 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_55%),linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(244,247,246,0.92)_100%)] px-5 py-5 dark:border-zinc-700 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_55%),linear-gradient(180deg,_rgba(24,24,27,0.94)_0%,_rgba(12,12,14,0.98)_100%)]">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {playbackStep
                  ? getStepDescription(playbackStep) || formatStepSummary(playbackStep)
                  : "Run or replay the automation to inspect execution details."}
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {playbackPrimaryResult?.failureReason ||
                  playbackPrimaryResult?.message ||
                  (playbackStep
                    ? getStepExpectedResult(playbackStep) ||
                      "Waiting for execution details. The selected step editor stays in sync with playback."
                    : "This playback panel shows the focused step, result, and replay context while execution is running.")}
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-zinc-200 bg-white/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                <p className={compactEyebrowClassName}>Target</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {playbackStep?.targetValue || playbackStep?.sharedBlockId || "Not specified"}
                </p>
              </div>
              <div className="rounded-[22px] border border-zinc-200 bg-white/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/70">
                <p className={compactEyebrowClassName}>Duration</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {playbackPrimaryResult?.durationMs
                    ? `${playbackPrimaryResult.durationMs} ms`
                    : playbackStep?.timeoutMs
                      ? `${playbackStep.timeoutMs} ms timeout`
                      : "No timing yet"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4 overflow-hidden">
          <div className="rounded-[26px] border border-zinc-200/80 bg-white/92 p-4 dark:border-zinc-700 dark:bg-zinc-950/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={compactEyebrowClassName}>Timeline</p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Click any recorded step to focus it in the editor.
                </p>
              </div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {playbackMode === "replay" ? "Replay" : "Live"}
              </p>
            </div>
            <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {(playbackMode === "replay" ? replaySequence : activeStepResults).length > 0 ? (
                (playbackMode === "replay" ? replaySequence : activeStepResults).map((result, index) => {
                  const sourceStepId = result.sourceStepId ?? result.stepId;
                  const matchedStep = draftSteps.find((step) => step.id === sourceStepId);
                  const isActive =
                    playbackMode === "replay"
                      ? replayCursor === index
                      : activeDebugStepId === sourceStepId;

                  return (
                    <button
                      key={`${sourceStepId}-${result.stepIndex}-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedStepId(sourceStepId);
                        if (playbackMode === "replay") {
                          setReplayCursor(index);
                        }
                      }}
                      className={`w-full rounded-[22px] border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                          : "border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {matchedStep ? `${matchedStep.order + 1}. ${actionLabel(matchedStep)}` : result.action}
                        </p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${stepStatusTone(
                            result.status === "passed"
                              ? "success"
                              : result.status === "running"
                                ? "running"
                                : result.status === "failed" || result.status === "blocked"
                                  ? "failed"
                                  : "pending"
                          )}`}
                        >
                          {result.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {matchedStep
                          ? getStepDescription(matchedStep) || formatStepSummary(matchedStep)
                          : result.targetValue || "Recorded step"}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {result.failureReason || result.message || "Execution detail captured."}
                      </p>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[22px] border border-dashed border-zinc-200 bg-zinc-50/70 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-400">
                  No playback events yet. Run the automation or start debug mode to populate the timeline.
                </div>
              )}
            </div>
          </div>

          {recorderSession?.generatedSteps.length ? (
            <div className="rounded-[26px] border border-zinc-200/80 bg-white/92 p-4 dark:border-zinc-700 dark:bg-zinc-950/80">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className={compactEyebrowClassName}>Recorded Draft</p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Review the smart-mapped recording before applying it to the step builder.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applyRecording}
                  className={secondaryButtonClassName}
                >
                  Apply Recording
                </button>
              </div>
              <div className="mt-4 max-h-[220px] space-y-2 overflow-y-auto pr-1">
                {recorderSession.generatedSteps.map((step, index) => (
                  <div
                    key={`${step.id}-${index}`}
                    className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/70"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {index + 1}. {actionLabel(step)}
                      </p>
                      <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                        preview
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {getStepDescription(step) || formatStepSummary(step)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderConsolePanel = () => (
    <div className="flex h-full min-h-[140px] flex-col overflow-hidden rounded-[28px] border border-zinc-200/80 bg-zinc-950 text-zinc-100 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Console
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Real-time validation, execution, debug, and AI messages.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConsoleOpen(false)}
          className="rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
        >
          Collapse
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {consoleEntries.length > 0 ? (
          <div className="space-y-2 font-mono text-[12px] leading-6">
            {consoleEntries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-2xl border px-3 py-2 ${
                  entry.tone === "success"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                    : entry.tone === "error"
                      ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
                      : "border-zinc-800 bg-zinc-900/90 text-zinc-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  <span>{formatConsoleTimestamp(entry.timestamp)}</span>
                  <span>{entry.source}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words">{entry.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            Console output will appear here when you validate, run, debug, or apply AI suggestions.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="min-w-0 space-y-4">
        <section className="min-w-0 overflow-hidden rounded-[32px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(244,247,246,0.98)_100%)] shadow-[0_32px_90px_-54px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-[linear-gradient(180deg,_rgba(24,24,27,0.98)_0%,_rgba(12,12,14,0.98)_100%)]">
          <div className="border-b border-zinc-200/80 px-5 py-5 dark:border-zinc-800">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 max-w-3xl">
                <p className={compactEyebrowClassName}>Automation Workspace</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {draftName.trim() || `${row.id} flow`}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Clean execution-first workspace for {row.id}: {row.title}
                </p>
              </div>

              <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:w-auto xl:grid-cols-none xl:auto-cols-max xl:grid-flow-col">
                <button type="button" onClick={save} className={secondaryButtonClassName}>
                  Save
                </button>
                <button type="button" onClick={run} disabled={isRunning} className={primaryButtonClassName}>
                  {isRunning ? "Running..." : "Run"}
                </button>
                <button
                  type="button"
                  onClick={debugInBrowser}
                  disabled={isDebugging}
                  className={secondaryButtonClassName}
                >
                  {isDebugging ? "Starting..." : "Debug"}
                </button>
                <button
                  type="button"
                  onClick={recorderSession && ["starting", "recording", "stopping"].includes(recorderSession.status) ? stopRecording : recordInBrowser}
                  disabled={isRecording || draftProvider !== "playwright"}
                  className={`${actionButtonClassName} border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20`}
                >
                  {isRecording
                    ? "Working..."
                    : recorderSession && ["starting", "recording", "stopping"].includes(recorderSession.status)
                      ? "Stop Recording"
                      : "Record"}
                </button>
                <button
                  type="button"
                  onClick={() => void validate()}
                  disabled={isValidating}
                  className={secondaryButtonClassName}
                >
                  {isValidating ? "Validating..." : "Validate"}
                </button>
                {scheduleHref ? (
                  <Link href={scheduleHref} className={secondaryButtonClassName}>
                    Schedule
                  </Link>
                ) : (
                  <button type="button" disabled className={secondaryButtonClassName}>
                    Schedule
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(220px,1.2fr)_minmax(140px,0.7fr)_minmax(150px,0.7fr)_minmax(150px,0.9fr)]">
              <label className="min-w-0 space-y-2">
                <span className={compactEyebrowClassName}>Flow Name</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                  placeholder="Automation flow name"
                />
              </label>
              <label className="min-w-0 space-y-2">
                <span className={compactEyebrowClassName}>Provider</span>
                <select
                  value={draftProvider}
                  onChange={(event) => setDraftProvider(event.target.value as AutomationProvider)}
                  className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                >
                  <option value="playwright">Playwright</option>
                  <option value="cypress">Cypress</option>
                  <option value="api">API</option>
                  <option value="mobile">Mobile</option>
                </select>
              </label>
              <label className="min-w-0 space-y-2">
                <span className={compactEyebrowClassName}>Execution Mode</span>
                <select
                  value={draftExecutionMode}
                  onChange={(event) =>
                    setDraftExecutionMode(event.target.value as AutomationExecutionMode)
                  }
                  className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                >
                  <option value="headless">Headless</option>
                  <option value="headed">Headed</option>
                </select>
              </label>
              <label className="min-w-0 space-y-2">
                <span className={compactEyebrowClassName}>Environment</span>
                <select
                  value={draftEnvironmentId}
                  onChange={(event) => setDraftEnvironmentId(event.target.value)}
                  className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                >
                  {environments.length > 0 ? (
                    environments.map((environment) => (
                      <option key={environment.id} value={environment.id}>
                        {environment.name}
                      </option>
                    ))
                  ) : (
                    <option value="">Default Environment</option>
                  )}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEnvironmentEditorOpen(true)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Edit Environment
              </button>
              <button
                type="button"
                onClick={() => setIsReuseLibraryOpen(true)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Actions
              </button>
              <button
                type="button"
                onClick={generateFromCase}
                disabled={isGenerating}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                {isGenerating ? "Generating..." : "Generate From Case"}
              </button>
              {runHref ? (
                <Link
                  href={runHref}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Latest Run
                </Link>
              ) : null}
              {reportHref ? (
                <Link
                  href={reportHref}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Reports
                </Link>
              ) : null}
              {latestExecution?.status === "failed" && onCreateIssueFromFailure ? (
                <button
                  type="button"
                  onClick={() => void onCreateIssueFromFailure(row.id)}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                >
                  Create Issue
                </button>
              ) : null}
            </div>
          </div>

          <div ref={workspaceRef} className="p-3 lg:p-4">
            <div
              className="hidden min-h-[620px] gap-y-0 2xl:grid 2xl:min-h-[660px]"
              style={{
                gridTemplateColumns: `${leftWidth}px 12px minmax(360px,1fr) 12px ${rightWidth}px`,
                gridTemplateRows: consoleOpen ? `minmax(0,1fr) 12px ${consoleHeight}px` : `minmax(0,1fr)`,
              }}
            >
              <div className="min-h-0">{renderStepListPanel()}</div>
              <button
                type="button"
                aria-label="Resize step list"
                onMouseDown={startHorizontalResize("left")}
                className="group relative col-start-2 row-start-1 flex items-center justify-center"
              >
                <span className="h-20 w-1 rounded-full bg-slate-700 transition group-hover:bg-cyan-400" />
              </button>
              <div className="min-h-0">{renderPlaybackPanel()}</div>
              <button
                type="button"
                aria-label="Resize editor panel"
                onMouseDown={startHorizontalResize("right")}
                className="group relative col-start-4 row-start-1 flex items-center justify-center"
              >
                <span className="h-20 w-1 rounded-full bg-slate-700 transition group-hover:bg-cyan-400" />
              </button>
              <div className="min-h-0">
                <AutomationStepForm
                  steps={draftSteps}
                  selectedStepId={selectedStepId}
                  onSelectStep={setSelectedStepId}
                  onChange={(nextSteps) => setDraftSteps(normalizeOrders(nextSteps))}
                  onAddStep={addStep}
                  onDeleteStep={deleteStep}
                  onMoveStep={moveStep}
                  onInsertTemplate={insertTemplate}
                  onInsertSharedBlock={insertSharedBlock}
                  onInsertAction={insertSharedBlock}
                  actions={actions}
                  reusableBlocks={reusableBlocks}
                  selectorPresets={selectorPresets}
                  provider={draftProvider}
                  validationIssues={validationResult?.issues ?? []}
                  stepResults={activeStepResults}
                  assistantSuggestions={assistantSuggestions}
                  onFixStep={fixSelectedStep}
                  onImproveAutomation={improveAutomation}
                  onGenerateFromCase={generateFromCase}
                />
              </div>

              {consoleOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Resize console"
                    onMouseDown={startConsoleResize}
                    className="group col-span-5 row-start-2 flex items-center justify-center"
                  >
                    <span className="h-1 w-24 rounded-full bg-slate-700 transition group-hover:bg-cyan-400" />
                  </button>
                  <div className="col-span-5 row-start-3 min-h-0">{renderConsolePanel()}</div>
                </>
              ) : (
                <div className="col-span-5 row-start-2">
                  <button
                    type="button"
                    onClick={() => setConsoleOpen(true)}
                    className="cf-secondary-button rounded-2xl px-3 py-2 text-xs font-semibold transition"
                  >
                    Open Console
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4 2xl:hidden">
              {renderStepListPanel()}
              {renderPlaybackPanel()}
              <AutomationStepForm
                steps={draftSteps}
                selectedStepId={selectedStepId}
                onSelectStep={setSelectedStepId}
                onChange={(nextSteps) => setDraftSteps(normalizeOrders(nextSteps))}
                onAddStep={addStep}
                onDeleteStep={deleteStep}
                onMoveStep={moveStep}
                onInsertTemplate={insertTemplate}
                onInsertSharedBlock={insertSharedBlock}
                onInsertAction={insertSharedBlock}
                actions={actions}
                reusableBlocks={reusableBlocks}
                selectorPresets={selectorPresets}
                provider={draftProvider}
                validationIssues={validationResult?.issues ?? []}
                stepResults={activeStepResults}
                assistantSuggestions={assistantSuggestions}
                onFixStep={fixSelectedStep}
                onImproveAutomation={improveAutomation}
                onGenerateFromCase={generateFromCase}
              />
              {consoleOpen ? (
                renderConsolePanel()
              ) : (
                <button
                  type="button"
                  onClick={() => setConsoleOpen(true)}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Open Console
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-zinc-200/80 bg-white/92 px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className={compactEyebrowClassName}>Run Evidence</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Latest execution artifacts and step evidence
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Failure reasons, logs, and saved artifacts stay connected to the new workspace without backend changes.
              </p>
            </div>
            {latestExecution?.finishedAt ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Last updated {formatUtcDate(latestExecution.finishedAt)}
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <AutomationArtifactViewer execution={activeExecution} artifacts={activeArtifacts} />
          </div>
        </section>
      </div>

      <OverlayFormShell
        eyebrow="Actions"
        title="Reusable automation actions"
        description="Keep shared login, navigation, and setup sequences reusable across scenarios without cluttering the scenario timeline."
        open={isReuseLibraryOpen}
        onClose={() => setIsReuseLibraryOpen(false)}
        actions={
          <button type="button" onClick={saveCurrentStepsAsSharedBlock} className={primaryButtonClassName}>
            Save Current Flow
          </button>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className={compactEyebrowClassName}>Shared Block Name</span>
              <input
                value={sharedBlockDraftName}
                onChange={(event) => setSharedBlockDraftName(event.target.value)}
                className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                placeholder="Shared flow name"
              />
            </label>
            <label className="space-y-2">
              <span className={compactEyebrowClassName}>Description</span>
              <input
                value={sharedBlockDraftDescription}
                onChange={(event) => setSharedBlockDraftDescription(event.target.value)}
                className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                placeholder="Optional note"
              />
            </label>
          </div>

          <div className="space-y-3">
            {reusableBlocks.length > 0 ? (
              reusableBlocks.map((block) => (
                <div
                  key={block.id}
                  className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <input
                        value={block.name}
                        onChange={(event) => updateReusableBlock(block.id, "name", event.target.value)}
                        className="min-h-[42px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                      <input
                        value={block.description ?? ""}
                        onChange={(event) =>
                          updateReusableBlock(block.id, "description", event.target.value)
                        }
                        className="min-h-[42px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                        placeholder="Shared block description"
                      />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {block.steps.length} step{block.steps.length === 1 ? "" : "s"} in this reusable flow.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          insertSharedBlock(block.id);
                          setIsReuseLibraryOpen(false);
                        }}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Use in Flow
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReusableBlock(block.id)}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-zinc-200 bg-zinc-50/70 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-400">
                No reusable blocks yet. Save the current flow to start building a shared library.
              </div>
            )}
          </div>
        </div>
      </OverlayFormShell>

      <OverlayFormShell
        eyebrow="Environment"
        title="Automation environment"
        description="Keep environment details in a focused side sheet so the main workspace stays clean."
        open={isEnvironmentEditorOpen}
        onClose={() => setIsEnvironmentEditorOpen(false)}
        actions={
          <button type="button" onClick={saveEnvironment} className={primaryButtonClassName}>
            Save Environment
          </button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className={compactEyebrowClassName}>Active Environment</p>
            <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {activeEnvironment?.name ?? "Default Environment"}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Configure routes and aliases without crowding the core automation panels.
            </p>
          </div>

          <label className="space-y-2">
            <span className={compactEyebrowClassName}>Base URL</span>
            <input
              value={environmentBaseUrl}
              onChange={(event) => setEnvironmentBaseUrl(event.target.value)}
              className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              placeholder="https://example.test"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className={compactEyebrowClassName}>Login Route</span>
              <input
                value={environmentLoginRoute}
                onChange={(event) => setEnvironmentLoginRoute(event.target.value)}
                className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                placeholder="/login"
              />
            </label>
            <label className="space-y-2">
              <span className={compactEyebrowClassName}>Dashboard Route</span>
              <input
                value={environmentDashboardRoute}
                onChange={(event) => setEnvironmentDashboardRoute(event.target.value)}
                className="min-h-[46px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                placeholder="/dashboard"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className={compactEyebrowClassName}>Credential Aliases</span>
            <textarea
              value={credentialAliases}
              onChange={(event) => setCredentialAliases(event.target.value)}
              className="min-h-[120px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              placeholder="qa-admin, qa-manager"
            />
          </label>
        </div>
      </OverlayFormShell>
    </>
  );
}
