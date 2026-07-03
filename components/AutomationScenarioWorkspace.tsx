"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

import type {
  AutomationLocatorCandidate,
  AutomationScenario,
  AutomationStep,
} from "./AutomationScenariosClient";
import {
  AUTOMATION_COMMAND_CATALOG,
  commandDefinitionForAction,
  normalizeAutomationAction,
} from "../utils/automation/language-core";
import { ensureBrowserProjectSynced } from "../utils/automation/browser-project-sync";
import type {
  AutomationCommandDefinition,
  AutomationCommandParameterDefinition,
  StepParameterValueType,
} from "../utils/automation/language-core";

type Props = {
  projectKey: string;
  scenarioId: string;
};

type RecorderEvent = {
  id: string;
  type: string;
  scenarioId?: string;
  order?: number;
  command?: string;
  params?: Record<string, unknown>;
  createdAt?: string | number;
  updatedAt?: string | number;
  ambiguity?: {
    candidate?: { strategy?: string; value?: string };
    matchCount?: number;
    previews?: Array<Record<string, unknown>>;
    selectedIndex?: number;
  } | null;
  timestamp?: number;
  pageId?: string;
  url?: string;
  value?: string;
  rawValue?: string;
  domValue?: string;
  key?: string;
  commandAction?: string;
  commandLabel?: string;
  assertionType?: string;
  expectedValue?: string;
  verify?: {
    assertionType?: string;
    cssProperties?: Record<string, string>;
    expectedValue?: string;
    imageState?: Record<string, unknown>;
    kind?: string;
    suggestedAssertions?: string[];
    summary?: string;
  } | null;
  element?: AutomationStep["element"];
  locatorCandidates?: AutomationLocatorCandidate[];
  recommendedLocator?: AutomationLocatorCandidate;
};

type ProviderSessionEvent = {
  id?: string;
  timestamp?: string;
  type: string;
  data?: Record<string, unknown>;
};

type CompanionPreviewTab = {
  active?: boolean;
  id: string;
  openerId?: string | null;
  title?: string;
  url?: string;
};

type LivePreviewTabNotice = {
  label: string;
  tabId: string;
} | null;

type BrokerSessionMetadata = {
  activeTabId?: string | null;
  currentUrl?: string | null;
  eventStreamUrl?: string | null;
  id?: string;
  idleExpiresAt?: string | null;
  lastActivityAt?: string | null;
  lastRunId?: string | null;
  liveViewUrl?: string | null;
  metadata?: Record<string, unknown>;
  provider?: string;
  providerSessionId?: string | null;
  sessionId?: string;
  status?: string;
  streamUrl?: string | null;
  tabs?: CompanionPreviewTab[];
};

type RecorderState =
  | "idle"
  | "recording"
  | "paused"
  | "selectingTarget"
  | "verifyingTarget";

type PlaybackState =
  | "idle"
  | "running"
  | "stepRunning"
  | "failed"
  | "completed";

type BrowserSessionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "expired";

function normalizeBrokerSessionMetadata(
  sessionMetadata?: BrokerSessionMetadata | null,
  fallbackSessionId?: string | null,
) {
  if (!sessionMetadata) return null;
  const sessionId =
    sessionMetadata.sessionId ||
    sessionMetadata.id ||
    fallbackSessionId ||
    undefined;
  return {
    ...sessionMetadata,
    metadata: sessionMetadata.metadata ?? {},
    sessionId,
    tabs: Array.isArray(sessionMetadata.tabs)
      ? sessionMetadata.tabs
          .filter(
            (tab): tab is CompanionPreviewTab =>
              Boolean(tab) && typeof tab.id === "string" && tab.id.trim().length > 0,
          )
          .map((tab) => ({
            ...tab,
            active: Boolean(tab.active),
            id: tab.id,
            title: tab.title || tab.url || "New tab",
            url: tab.url || "",
          }))
      : [],
  };
}

function companionLiveViewUrl(sessionId: string) {
  const url = new URL("/automation/browser/live", localAgentUrl);
  url.searchParams.set("sessionId", sessionId);
  return url.toString();
}

function companionSessionMetadata(
  data: CompanionBrowserResponse,
  fallbackUrl: string,
): BrokerSessionMetadata | null {
  if (!data.sessionId) return null;
  return normalizeBrokerSessionMetadata(
    {
      activeTabId: data.activeTabId ?? null,
      currentUrl: data.url || fallbackUrl,
      id: data.sessionId,
      liveViewUrl: companionLiveViewUrl(data.sessionId),
      metadata: {
        source: "caseforge-companion",
      },
      provider: "caseforge-companion",
      providerSessionId: data.sessionId,
      sessionId: data.sessionId,
      status: data.status || "recording",
      tabs: data.tabs ?? [],
    },
    data.sessionId,
  );
}

function patchCompanionSession(
  session: BrokerSessionMetadata | null,
  patch: {
    activeTabId?: string | null;
    currentUrl?: string | null;
    status?: string;
    tabs?: CompanionPreviewTab[];
    url?: string | null;
  },
) {
  if (!session) return session;
  return normalizeBrokerSessionMetadata(
    {
      ...session,
      activeTabId:
        patch.activeTabId !== undefined ? patch.activeTabId : session.activeTabId,
      currentUrl:
        patch.currentUrl ??
        patch.url ??
        session.currentUrl ??
        null,
      status: patch.status ?? session.status,
      tabs: patch.tabs ?? session.tabs ?? [],
    },
    session.sessionId,
  );
}

function livePreviewTabLabel(tab?: CompanionPreviewTab | null) {
  if (!tab) return "New tab";
  if (tab.title?.trim()) return tab.title.trim();
  if (tab.url?.trim()) return tab.url.trim();
  return "New tab";
}

function isCompanionPreviewSession(session?: BrokerSessionMetadata | null) {
  return (
    session?.provider === "caseforge-companion" ||
    session?.metadata?.source === "caseforge-companion" ||
    Boolean(session?.liveViewUrl?.startsWith(localAgentUrl))
  );
}

function companionPreviewUrl(
  session: BrokerSessionMetadata,
  path: "live-frame" | "inspect" | "interact" | "scroll",
) {
  const url = new URL(session.liveViewUrl || companionLiveViewUrl(session.sessionId || ""));
  url.pathname = url.pathname.replace(/\/live\/?$/, `/${path}`);
  url.searchParams.set("sessionId", session.sessionId || session.providerSessionId || "");
  return url.toString();
}

function companionPreviewStreamUrl(session: BrokerSessionMetadata) {
  const url = new URL(session.liveViewUrl || companionLiveViewUrl(session.sessionId || ""));
  url.pathname = url.pathname.replace(/\/live\/?$/, "/live-stream");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("sessionId", session.sessionId || session.providerSessionId || "");
  return url.toString();
}

function liveFrameSrcForSession(session: BrokerSessionMetadata, tick: number) {
  if (isCompanionPreviewSession(session)) {
    const url = new URL(companionPreviewUrl(session, "live-frame"));
    url.searchParams.set("t", String(tick));
    return url.toString();
  }
  return `/api/automation/sessions/${encodeURIComponent(session.sessionId || "")}/live-frame?t=${tick}`;
}

type CompanionCommand = {
  id?: string;
  scenarioId?: string;
  order?: number;
  command?: string;
  type?: string;
  name?: string;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    text?: string;
    label?: string;
    role?: string;
    tagName?: string;
  };
  inputValue?: string;
  expectedValue?: string;
  rawValue?: string;
  value?: string;
  domValue?: string;
  url?: string;
  key?: string;
  params?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type CompanionStepResult = {
  error?: string;
  index?: number;
  output?: unknown;
  status?: string;
  stepId?: string | null;
};

type CompanionPlaybackEvent = {
  action?: string | null;
  error?: string;
  id?: string;
  index?: number;
  label?: string;
  output?: unknown;
  runId?: string | null;
  stepCount?: number;
  stepId?: string | null;
  timestamp?: string;
  type?: string;
};

type CompanionBrowserResponse = {
  activeTabId?: string | null;
  error?: string;
  result?: { count?: number; previews?: Array<Record<string, unknown>> };
  results?: CompanionStepResult[];
  runId?: string | null;
  started?: boolean;
  stopped?: boolean;
  sessionId?: string;
  currentUrl?: string;
  status?: "starting" | "previewing" | "recording" | "stopping" | "stopped" | "failed";
  cursor?: number;
  url?: string;
  commands?: CompanionCommand[];
  logs?: string[];
  playbackEventCursor?: number;
  playbackEvents?: CompanionPlaybackEvent[];
  tabs?: CompanionPreviewTab[];
  agent?: {
    name?: string;
    version?: string;
  };
};

type HealingReviewEvent = {
  id: string;
  runId: string;
  sessionId?: string | null;
  actionId?: string | null;
  stepId?: string | null;
  commandId?: string | null;
  originalLocator?: Record<string, unknown> | null;
  healedLocator?: Record<string, unknown> | null;
  confidenceScore?: number | null;
  healReason?: string;
  suggestedCandidates?: Array<Record<string, unknown>>;
  status: "not_reviewed" | "accepted" | "discarded";
  timestamp: string;
};

type PendingAmbiguity = {
  actionId?: string | null;
  description?: string;
  index?: number;
  locator?: Record<string, unknown> | null;
  matchCount?: number;
  message?: string;
  previews?: Array<Record<string, unknown>>;
  runId?: string | null;
  sessionId: string;
  stepId?: string | null;
};

type StepExecutionResult = {
  stepId?: string | null;
  status: "passed" | "failed" | "skipped";
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  errorType?: string;
  screenshotPath?: string | null;
  suggestion?: string;
  index?: number;
  runId?: string | null;
};

type TimelineUndoSnapshot = {
  selectedStepId: string | null;
  selectedStepIds: string[];
  steps: AutomationStep[];
};

type CommandRunState = {
  status: "running" | "passed" | "failed";
  message?: string;
  suggestion?: string;
  runId?: string | null;
  updatedAt: string;
};

type LiveRunReportRowStatus = "queued" | "running" | "passed" | "failed" | "skipped";

type LiveRunReportRow = {
  action: string;
  details: string[];
  endedAt?: string;
  index: number;
  label: string;
  message?: string;
  outputSummary?: string;
  parentActionId?: string | null;
  parentActionName?: string | null;
  runId?: string | null;
  startedAt?: string;
  status: LiveRunReportRowStatus;
  stepId?: string | null;
};

type LiveRunReport = {
  browserMode?: string;
  completedAt?: string;
  device?: string;
  environment?: string;
  open: boolean;
  rows: LiveRunReportRow[];
  runId?: string | null;
  startedAt: string;
  status: "queued" | "running" | "passed" | "failed" | "cancelled";
  title: string;
};

type SessionRunScope = "scenario" | "action" | "command" | "resume";

type ScenarioParameter = {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "secret" | "enum";
  defaultValue?: string;
  required?: boolean;
};

type VariablePickerItem = {
  detail: string;
  name: string;
  source: "commandOutput" | "logicVariable" | "scenarioParameter";
};

type LocatorLoopAction =
  | "click"
  | "getAttribute"
  | "getProperty"
  | "getText"
  | "hover"
  | "verifyVisible";

type LocatorLoopBuilderActionKind =
  | LocatorLoopAction
  | "addToList"
  | "clearList"
  | "countListItems"
  | "createList"
  | "getListItem"
  | "joinList"
  | "log"
  | "sortList"
  | "uniqueList"
  | "wait";

type LocatorLoopBuilderPhase = "before" | "inside" | "after";

type LocatorLoopBuilderAction = {
  action: LocatorLoopBuilderActionKind;
  attributeName: string;
  createLocatorVariable: boolean;
  fieldName: string;
  id: string;
  listVariable: string;
  logMessage: string;
  locatorType: "css" | "xpath";
  locatorValue: string;
  locatorVariable: string;
  outputVariable: string;
  propertyName: string;
  separator: string;
  sortOrder: "asc" | "desc";
  valueExpression: string;
  waitMs: string;
};

type LocatorLoopBuilderState = {
  action: LocatorLoopAction;
  attributeName: string;
  afterActions: LocatorLoopBuilderAction[];
  beforeActions: LocatorLoopBuilderAction[];
  countValue: string;
  countVariable: string;
  createCountVariable: boolean;
  logEach: boolean;
  loopActions: LocatorLoopBuilderAction[];
  outputVariable: string;
  propertyName: string;
  waitMs: string;
};

type CustomSnippetCommand = {
  description?: string;
  failIfEmpty?: boolean;
  id: string;
  label: string;
  logOutputToConsole?: boolean;
  outputFormat?: string;
  outputVariableName?: string;
  script: string;
  timeoutMs?: number;
  updatedAt: string;
};

type ScenarioTestCase = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  expectedResult?: string;
  lastStatus?: "passed" | "failed" | "notRun";
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
  data: Record<string, string>;
};

type RunBrowserMode = "headed" | "headless";

type RunDeviceKey = "desktop" | "mobile" | "tablet" | "custom";

type RunExecutionMode = "sequential" | "parallel";

type RunScope = "allActive" | "failedOnly" | "tag" | "priority";

type RunEnvironmentDraft = {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  basicAuthEnabled: boolean;
  username: string;
  password: string;
};

type RunViewport = {
  width: number;
  height: number;
  isMobile?: boolean;
  deviceScaleFactor?: number;
  maximize?: boolean;
};

type LivePreviewSizeKey = "normal" | "large" | "full";

const LIVE_PREVIEW_SIZES: Array<{
  key: LivePreviewSizeKey;
  label: string;
  panelMinHeight: number;
  viewport: RunViewport;
}> = [
  { key: "normal", label: "Normal", panelMinHeight: 560, viewport: { height: 900, width: 1440 } },
  { key: "large", label: "Large", panelMinHeight: 700, viewport: { height: 1080, width: 1920 } },
  { key: "full", label: "Full", panelMinHeight: 820, viewport: { height: 1440, width: 1920 } },
];

type RunConfig = {
  browserMode: RunBrowserMode;
  customHeight: number;
  customWidth: number;
  device: RunDeviceKey;
  environments: RunEnvironmentDraft[];
  executionMode: RunExecutionMode;
  runScope: RunScope;
  scopePriority: ScenarioTestCase["priority"] | "all";
  scopeTag: string;
};

type PlaybackScope =
  | "selected"
  | "selectedToEnd"
  | "startToSelected"
  | "fullScenario"
  | "singleCommand"
  | "actionCommand";

type PlaybackConfig = {
  autoPlaybackEnabled: boolean;
  pauseOnElementErrors: boolean;
  selfHealingEnabled: boolean;
  environmentId?: string | null;
  autoElementTimeoutMs: number;
  manualElementTimeoutMs: number;
  manualPageTimeoutMs: number;
  executionParameters: Record<string, unknown>;
};

type PlaybackJob = {
  id: string;
  scope: string;
  status: string;
  logs: string[];
  items: Array<{
    id: string;
    orderIndex: number;
    status: string;
    stepId?: string | null;
    command: Record<string, unknown>;
  }>;
};

type PlaybackStateGuard = {
  anchorStepId?: string | null;
  currentUrl: string;
  expectedUrl: string;
  message: string;
  scope: PlaybackScope;
};

type CanvasView = {
  id: string;
  name: string;
  url: string;
  title: string;
  screenshotUri?: string;
  viewport: Record<string, unknown>;
  elementSnapshots: Array<Record<string, unknown>>;
  capturedAt: string;
};

type CanvasElement = {
  id: string;
  name: string;
  businessName?: string;
  technicalName?: string;
  aliases?: string[];
  description?: string;
  elementType: string;
  status: string;
  canonicalLocator: Record<string, unknown>;
  locatorCandidates: AutomationLocatorCandidate[];
  fallbackLocators?: AutomationLocatorCandidate[];
  boundingBox: Record<string, unknown>;
  elementSnapshot: Record<string, unknown>;
  lastVerifiedAt?: string | null;
  stabilityScore?: number;
  preferredLocatorStrategy?: string | null;
  metadata: Record<string, unknown>;
  viewId?: string | null;
};

type CanvasContextMenu = {
  element: Record<string, unknown>;
  x: number;
  y: number;
} | null;

type LiveInspectorResult = {
  bounds?: Record<string, unknown>;
  element?: Record<string, unknown> | null;
  inspectorPoint?: { x: number; y: number };
  locatorCandidates?: AutomationLocatorCandidate[];
  page?: {
    title?: string;
    url?: string;
    viewport?: Record<string, unknown>;
  };
  recommendedLocator?: AutomationLocatorCandidate | null;
  status?: string;
  suggestedActions?: string[];
};

type LiveCommandMenu = {
  query: string;
  result: LiveInspectorResult;
  x: number;
  y: number;
} | null;

type CommandInsertMenu = {
  actionId?: string | null;
  actionStepId?: string | null;
  anchorStepId: string;
  position: "before" | "after";
  query: string;
  x: number;
  y: number;
} | null;

type LogicEditorSuggestion = {
  detail: string;
  insertText: string;
  label: string;
  source: "commandOutput" | "logicVariable" | "scenarioParameter" | "builtin" | "locator" | "snippet";
};

type LogicEditorSuggestState = {
  cursor: number;
  end: number;
  query: string;
  start: number;
} | null;

type LogicDslValidation = {
  branchCount: number;
  commandCount: number;
  elseIfCount: number;
  forCount: number;
  ifCount: number;
  issues: string[];
  repeatCount: number;
  summary: string;
  valid: boolean;
};

const localAgentUrl =
  process.env.NEXT_PUBLIC_AUTOMATION_LOCAL_AGENT_URL || "http://127.0.0.1:4873";
const companionDownloadUrl =
  process.env.NEXT_PUBLIC_COMPANION_DOWNLOAD_URL ||
  "/downloads/companion";
const COMPANION_VERSION = "0.1.46";
const privateConnectorEnabled =
  process.env.NEXT_PUBLIC_AUTOMATION_PRIVATE_CONNECTOR_ENABLED === "true";
const legacyDesktopBridgeEnabled =
  process.env.NEXT_PUBLIC_AUTOMATION_LOCAL_CONNECTOR_ENABLED !== "false";
const advancedRecordingUiEnabled = false;
const advancedPlaybackUiEnabled = false;
const advancedCanvasUiEnabled = false;

const actionCommandDefinition: AutomationCommandDefinition = {
  action: "action",
  aliases: ["reusable action", "run action"],
  canSaveOutput: false,
  category: "utility.action",
  defaultRetryCount: 0,
  defaultTimeoutMs: 30000,
  description: "Run a saved reusable CaseForge Action.",
  domain: "utility",
  executable: true,
  id: "utility.action",
  inputs: [{ label: "Action", name: "actionId", required: true, type: "string" }],
  label: "Run reusable action",
  logging: {
    onFailure: "Reusable action failed.",
    onStart: "Reusable action started.",
    onSuccess: "Reusable action completed.",
  },
  normalizedAction: "action",
  outputDefinition: { canSaveAsVariable: false, outputType: "void" },
  outputs: [],
  parameters: [{ label: "Action", name: "actionId", required: true, type: "string" }],
  runtimeAction: "action",
  runtimeHandler: "caseforge.action",
  stepKind: "reusableActionCall",
  supportStatus: "implemented",
  visibleInDropdown: true,
  visibleInLibrary: false,
};
const commandActionOptions = [
  ...AUTOMATION_COMMAND_CATALOG.filter((command) => command.visibleInDropdown !== false),
  actionCommandDefinition,
];
function commandLibraryGroupLabel(command: AutomationCommandDefinition) {
  const category = command.category || "";
  if (category.startsWith("logic.")) return "Flow blocks";
  if (category.startsWith("data.compare")) return "Compare data";
  if (category.startsWith("data.collections")) return "Collections";
  if (category.startsWith("data.tables")) return "Tables";
  if (category.startsWith("browser.javascript")) return "JavaScript and tags";
  if (category.startsWith("debug.")) return "Debug";
  if (category.startsWith("browser.navigation")) return "Browser";
  if (category.startsWith("browser.")) return "Browser actions";
  if (category.startsWith("validation.")) return "Bulk validation";
  if (command.action === "action") return "Reusable actions";
  return command.domain || "Other";
}
const commandCatalogByDomain = AUTOMATION_COMMAND_CATALOG.reduce<Record<string, typeof AUTOMATION_COMMAND_CATALOG>>(
  (groups, command) => ({
    ...groups,
    [commandLibraryGroupLabel(command)]: [...(groups[commandLibraryGroupLabel(command)] ?? []), command],
  }),
  {},
);
const defaultPlaybackConfig: PlaybackConfig = {
  autoElementTimeoutMs: 5000,
  autoPlaybackEnabled: true,
  environmentId: null,
  executionParameters: {},
  manualElementTimeoutMs: 30000,
  manualPageTimeoutMs: 60000,
  pauseOnElementErrors: true,
  selfHealingEnabled: true,
};
const valueSourceOptions: Array<{ label: string; value: StepParameterValueType }> = [
  { label: "Static value", value: "static" },
  { label: "Variable", value: "variable" },
  { label: "Secret", value: "secret" },
  { label: "Test data", value: "testData" },
  { label: "Environment", value: "environment" },
  { label: "Generated", value: "generated" },
  { label: "Expression", value: "expression" },
  { label: "Previous output", value: "previousStepOutput" },
];
const locatorOrder = ["testid", "role", "label", "placeholder", "alt", "title", "text", "css", "xpath"];
const assertionOptions = [
  { label: "Element is visible", value: "visible" },
  { label: "Text contains", value: "text_contains" },
  { label: "Text equals", value: "text_equals" },
  { label: "Image is loaded", value: "image_loaded" },
  { label: "CSS property equals", value: "css_property" },
  { label: "Element is hidden", value: "hidden" },
];
const cssPropertyOptions = ["color", "background-color", "font-size", "font-weight", "font-family", "background-image"];
const runDeviceOptions: Array<{
  description: string;
  key: RunDeviceKey;
  label: string;
  viewport: RunViewport;
}> = [
  {
    description: "Maximized browser",
    key: "desktop",
    label: "Desktop",
    viewport: { height: 900, maximize: true, width: 1440 },
  },
  {
    description: "390 x 844",
    key: "mobile",
    label: "Mobile",
    viewport: { deviceScaleFactor: 3, height: 844, isMobile: true, width: 390 },
  },
  {
    description: "820 x 1180",
    key: "tablet",
    label: "Tablet",
    viewport: { deviceScaleFactor: 2, height: 1180, isMobile: true, width: 820 },
  },
  {
    description: "Set manually",
    key: "custom",
    label: "Custom",
    viewport: { height: 768, width: 1366 },
  },
];

function draftCacheKey(projectKey: string, scenarioId: string) {
  return `caseforge:automation:draft-cache:${projectKey}:${scenarioId}`;
}

function normalizeUrl(value: string) {
  if (value === "about:blank") return value;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function hasTemplateToken(value?: string | null) {
  return /\{\{[^}]+\}\}/.test(value ?? "");
}

function resolvedBaseUrlTemplate(value: string, baseUrl?: string | null) {
  const rawValue = textValue(value);
  if (!rawValue) return baseUrl ? normalizeUrl(baseUrl) : "";
  if (!rawValue.includes("{{baseUrl}}")) return rawValue;
  const normalizedBase = baseUrl ? normalizeUrl(baseUrl).replace(/\/+$/, "") : "";
  if (!normalizedBase) return rawValue;
  return rawValue
    .replace(/^https?:\/\/\{\{baseUrl\}\}/i, normalizedBase)
    .replaceAll("{{baseUrl}}", normalizedBase);
}

function scenarioBaseUrlFromMetadata(metadata: Record<string, unknown>) {
  const sources = [
    metadata.variables,
    metadata.automationContext,
  ];
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const baseUrl = textValue((source as Record<string, unknown>).baseUrl);
    if (baseUrl && !hasTemplateToken(baseUrl)) return normalizeUrl(baseUrl);
  }
  return "";
}

function safeUrl(value: string) {
  try {
    return new URL(normalizeUrl(value));
  } catch {
    return null;
  }
}

function cleanUrlAuth(value: string) {
  const url = safeUrl(value);
  if (!url) return normalizeUrl(value);
  url.username = "";
  url.password = "";
  return url.toString();
}

function environmentDraftFromUrl(value: string): RunEnvironmentDraft {
  const url = safeUrl(value);
  const name = url?.hostname
    ? url.hostname.includes("stg") || url.hostname.includes("stage")
      ? "Staging"
      : "Current"
    : "Current";
  return {
    baseUrl: cleanUrlAuth(value),
    basicAuthEnabled: Boolean(url?.username || url?.password),
    enabled: true,
    id: makeStepId(),
    name,
    password: url?.password ? decodeURIComponent(url.password) : "",
    username: url?.username ? decodeURIComponent(url.username) : "",
  };
}

function authFromUrl(value: string) {
  const url = safeUrl(value);
  if (!url?.username) return null;
  return {
    password: url.password ? decodeURIComponent(url.password) : "",
    username: decodeURIComponent(url.username),
  };
}

function makeEmptyEnvironmentDraft(index: number): RunEnvironmentDraft {
  return {
    baseUrl: "",
    basicAuthEnabled: false,
    enabled: true,
    id: makeStepId(),
    name: `Environment ${index}`,
    password: "",
    username: "",
  };
}

function defaultRunConfig(targetUrl: string): RunConfig {
  return {
    browserMode: "headed",
    customHeight: 768,
    customWidth: 1366,
    device: "desktop",
    environments: [environmentDraftFromUrl(targetUrl)],
    executionMode: "sequential",
    runScope: "allActive",
    scopePriority: "all",
    scopeTag: "",
  };
}

function viewportForRunConfig(config: RunConfig): RunViewport {
  if (config.device === "custom") {
    return {
      height: Math.max(320, Number(config.customHeight) || 768),
      width: Math.max(320, Number(config.customWidth) || 1366),
    };
  }
  return runDeviceOptions.find((option) => option.key === config.device)?.viewport ?? {
    height: 900,
    width: 1440,
  };
}

function deviceLabelForRunConfig(config: RunConfig) {
  if (config.device === "custom") {
    const viewport = viewportForRunConfig(config);
    return `Custom ${viewport.width}x${viewport.height}`;
  }
  return runDeviceOptions.find((option) => option.key === config.device)?.label ?? "Desktop";
}

function isRestrictedHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (!host.includes(".")) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^127\./.test(host)) return true;
  return host === "::1";
}

function shouldUsePrivateConnector(url: string) {
  if (!privateConnectorEnabled && !legacyDesktopBridgeEnabled) return false;
  try {
    return isRestrictedHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isBrowserOnLocalCaseForge() {
  if (typeof window === "undefined") return false;
  return isRestrictedHostname(window.location.hostname);
}

function shouldUseLegacyDesktopBridge(url: string) {
  // Companion is the primary interactive runtime. The old worker-backed browser
  // path stays available in server APIs, but workspace record/playback/run flows
  // should go through the local Companion unless explicitly disabled by env.
  void url;
  return Boolean(localAgentUrl && legacyDesktopBridgeEnabled);
}

function isUsableBrokerSession(
  session?: BrokerSessionMetadata | null,
): session is BrokerSessionMetadata & { sessionId: string } {
  if (!session?.sessionId) return false;
  return !["broken", "closed", "expired", "failed", "stopped", "terminated", "terminating"].includes(
    session.status || "",
  );
}

function browserSessionStateFor(
  session?: BrokerSessionMetadata | null,
): BrowserSessionState {
  if (!session?.sessionId) return "disconnected";
  if (session.status === "expired") return "expired";
  if (["creating", "requested", "starting"].includes(session.status || "")) {
    return "connecting";
  }
  return isUsableBrokerSession(session) ? "connected" : "disconnected";
}

function sessionStartUrlForRun(_steps: AutomationStep[], fallback?: string) {
  return fallback;
}

function readDraftCache(projectKey: string, scenarioId: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(draftCacheKey(projectKey, scenarioId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { scenario?: AutomationScenario };
    return parsed.scenario ?? null;
  } catch {
    return null;
  }
}

function writeDraftCache(
  projectKey: string,
  scenarioId: string,
  scenario: AutomationScenario,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    draftCacheKey(projectKey, scenarioId),
    JSON.stringify({
      cachedAt: new Date().toISOString(),
      reason: "pending-db-sync",
      scenario,
      version: 1,
    }),
  );
}

function draftScenarioForVisibleSteps(
  projectKey: string,
  scenarioId: string,
  scenario: AutomationScenario | null,
  steps: AutomationStep[],
) {
  const baseScenario: AutomationScenario =
    scenario ?? {
      description: "",
      id: scenarioId,
      name: "Untitled Scenario",
      projectId: projectKey,
      status: "draft",
      tags: [],
      updatedAt: new Date().toISOString(),
      version: 1,
    };
  return {
    ...baseScenario,
    steps,
    updatedAt: new Date().toISOString(),
    version: (baseScenario.version ?? 1) + 1,
  };
}

function shouldUseCachedScenario(
  serverScenario?: AutomationScenario | null,
  cachedScenario?: AutomationScenario | null,
) {
  if (!cachedScenario) return false;
  if (!serverScenario) return true;
  const cachedUpdatedAt = Date.parse(String(cachedScenario.updatedAt || ""));
  const serverUpdatedAt = Date.parse(String(serverScenario.updatedAt || ""));
  if (Number.isFinite(cachedUpdatedAt) && Number.isFinite(serverUpdatedAt)) {
    return cachedUpdatedAt > serverUpdatedAt;
  }
  return normalizeSteps(cachedScenario.steps).length > normalizeSteps(serverScenario.steps).length;
}

function clearDraftCache(projectKey: string, scenarioId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftCacheKey(projectKey, scenarioId));
}

function normalizeLocatorType(value?: string) {
  const lower = String(value || "css").toLowerCase();
  if (lower === "aria-label") return "label";
  if (lower === "data-testid" || lower === "data-qa" || lower === "data-cy" || lower === "data-*") {
    return "testid";
  }
  if (lower === "url" || lower === "action" || lower === "page") return lower;
  return locatorOrder.includes(lower) ? lower : "css";
}

function looksLikeXPathLocator(value: unknown) {
  return /^(xpath=|\/|\.\/|\.\.\/|\()/i.test(String(value || "").trim());
}

function inferLocatorTypeFromValue(value: unknown, fallback = "css") {
  const normalizedFallback = normalizeLocatorType(fallback);
  if ((normalizedFallback === "css" || !normalizedFallback) && looksLikeXPathLocator(value)) return "xpath";
  return normalizedFallback;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function humanizeToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactLabel(value: string, fallback = "Element") {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 58 ? `${normalized.slice(0, 55).trim()}...` : normalized;
}

function isGenericElementLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return [
    "",
    "a",
    "anchor",
    "button",
    "div",
    "element",
    "img",
    "image",
    "input",
    "label",
    "li",
    "link",
    "nav",
    "section",
    "span",
    "svg",
    "web element",
  ].includes(normalized);
}

function pageContextName(url?: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const lastMeaningful = [...segments]
      .reverse()
      .find((segment) => !/^[0-9a-f-]{8,}$/i.test(segment));
    return lastMeaningful ? humanizeToken(lastMeaningful) : humanizeToken(parsed.hostname.replace(/^www\./, ""));
  } catch {
    return "";
  }
}

function dataAttributeName(element?: AutomationStep["element"]) {
  const dataAttributes =
    element?.dataAttributes && typeof element.dataAttributes === "object"
      ? (element.dataAttributes as Record<string, unknown>)
      : {};
  for (const key of ["data-testid", "data-qa", "data-cy", "data-test", "data-test-id"]) {
    const value = textValue(dataAttributes[key]);
    if (value) return humanizeToken(value);
  }
  return "";
}

function semanticTargetName(
  element?: AutomationStep["element"],
  fallback = "Element",
  contextUrl?: string,
) {
  const tag = textValue(element?.tag).toLowerCase();
  const role = textValue(element?.role).toLowerCase();
  const kind = textValue(element?.elementKind).toLowerCase();
  const dataName = dataAttributeName(element);
  const ariaLabel = textValue(element?.ariaLabel);
  const labelText = textValue(element?.labelText);
  const placeholder = textValue(element?.placeholder);
  const altText = textValue(element?.alt);
  const title = textValue(element?.title);
  const text = textValue(element?.text);
  const nearbyText = textValue(element?.nearbyText);
  const heading = textValue(element?.headingText);
  const section = textValue(element?.sectionText);
  const parentTag = textValue(element?.parentTag).toLowerCase();
  const contextBlob = [
    dataName,
    ariaLabel,
    labelText,
    placeholder,
    altText,
    title,
    text,
    nearbyText,
    heading,
    section,
    pageContextName(contextUrl),
  ]
    .join(" ")
    .toLowerCase();

  if (contextBlob.includes("cookie") || contextBlob.includes("consent")) {
    if (role === "dialog" || role === "banner" || tag === "div" || tag === "section") {
      return "Cookie Consent Banner";
    }
    if (tag === "button" || role === "button") {
      const buttonName = compactLabel(ariaLabel || labelText || text || "Accept Cookies", "Accept Cookies");
      return /cookie|consent/i.test(buttonName) ? `${buttonName} button` : `${buttonName} Cookies button`;
    }
  }

  if (role === "navigation" || tag === "nav" || parentTag === "header") {
    return "Header Navigation";
  }

  const isImage = tag === "img" || tag === "image" || role === "img" || kind === "image";
  if (isImage) {
    const imageName = altText || ariaLabel || title || dataName || heading;
    if (imageName && !isGenericElementLabel(imageName)) {
      const label = compactLabel(imageName);
      return /\b(image|photo|picture|logo|avatar)\b/i.test(label) ? label : `${label} Image`;
    }
    if (/product|item|catalog|shop|cart|price/.test(contextBlob)) return "Product Image";
    const pageName = pageContextName(contextUrl);
    return pageName ? `${pageName} Image` : "Image";
  }

  const directName = dataName || ariaLabel || labelText || placeholder || title || text;
  if (directName && !isGenericElementLabel(directName)) {
    const label = compactLabel(directName);
    if (tag === "button" || role === "button") return `${label} button`;
    if (tag === "a" || role === "link") return `${label} link`;
    if (["input", "textarea", "select"].includes(tag)) return `${label} field`;
    return label;
  }

  if (heading && !isGenericElementLabel(heading)) return compactLabel(heading);
  if (section && !isGenericElementLabel(section)) return compactLabel(section);

  const pageName = pageContextName(contextUrl);
  if (pageName) return `${pageName} ${humanizeToken(role || tag || fallback)}`;
  return humanizeToken(fallback);
}

function locatorType(candidate?: AutomationLocatorCandidate) {
  return normalizeLocatorType(candidate?.strategy || candidate?.type);
}

function rankedLocators(candidates: AutomationLocatorCandidate[] = []) {
  return candidates
    .filter((candidate) => candidate?.value)
    .map((candidate, index) => ({
      ...candidate,
      rank: candidate.rank ?? index + 1,
      type: locatorType(candidate),
    }))
    .sort((left, right) => {
      const leftIndex = locatorOrder.indexOf(locatorType(left));
      const rightIndex = locatorOrder.indexOf(locatorType(right));
      return (
        leftIndex - rightIndex ||
        Number(right.isUnique ?? right.unique) - Number(left.isUnique ?? left.unique) ||
        right.score - left.score
      );
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function candidateQuality(candidate?: AutomationLocatorCandidate | null) {
  const quality =
    candidate?.metadata?.quality && typeof candidate.metadata.quality === "object"
      ? (candidate.metadata.quality as Record<string, unknown>)
      : {};
  const type = locatorType(candidate || undefined);
  const matchCount = Number(candidate?.metadata?.matchCount ?? 0) || 0;
  const unique = Boolean(candidate?.isUnique ?? candidate?.unique) || matchCount === 1;
  const fallbackStability =
    type === "testid"
      ? 96
      : type === "role"
        ? 88
        : type === "label" || type === "placeholder" || type === "alt"
          ? 82
          : type === "text"
            ? 68
            : 42;
  const uniquenessScore = clampScore(
    Number(quality.uniqueness ?? 0) || (unique ? 100 : matchCount > 1 ? Math.max(15, 72 - matchCount * 10) : 60),
  );
  const stabilityScore = clampScore(Number(quality.stability ?? 0) || fallbackStability);
  const readabilityScore = clampScore(
    Number(quality.readability ?? 0) || (type === "css" ? 40 : type === "testid" || type === "role" ? 92 : 76),
  );
  const candidateScore = clampScore(Number(candidate?.score ?? 0));
  const confidenceScore = clampScore(
    uniquenessScore * 0.42 + stabilityScore * 0.34 + readabilityScore * 0.14 + candidateScore * 0.1,
  );
  return { confidenceScore, readabilityScore, stabilityScore, uniquenessScore };
}

function locatorQualityForStep(step: AutomationStep) {
  const ranked = rankedLocators(step.locatorCandidates);
  const primaryCandidate =
    ranked.find(
      (candidate) =>
        locatorType(candidate) === normalizeLocatorType(step.target?.locatorType) &&
        candidate.value === step.target?.value,
    ) ?? ranked[0];
  const targetType = normalizeLocatorType(step.target?.locatorType);
  const primary = primaryCandidate
    ? {
        score: primaryCandidate.score,
        type: locatorType(primaryCandidate),
        value: primaryCandidate.value,
      }
    : {
        score: 0,
        type: targetType,
        value: step.target?.value || "",
      };
  const ambiguity = stepAmbiguity(step);
  const matchCount =
    ambiguity?.matchCount ||
    Number(primaryCandidate?.metadata?.matchCount ?? 0) ||
    (primary.value ? 1 : 0);
  const selectedIndex = ambiguity?.selectedIndex;
  const quality = candidateQuality(primaryCandidate);
  const ambiguityStatus =
    matchCount > 1
      ? typeof selectedIndex === "number"
        ? "resolved"
        : "unresolved"
      : "none";
  return {
    ambiguityStatus,
    fallbackLocators: ranked
      .filter((candidate) => candidate.value !== primary.value || locatorType(candidate) !== primary.type)
      .slice(0, 5)
      .map((candidate) => ({
        score: candidate.score,
        type: locatorType(candidate),
        value: candidate.value,
      })),
    healed: Boolean(step.options?.healed),
    healedLocator: step.options?.healedLocator ?? null,
    healingReason: textValue(step.options?.healingReason),
    locatorType: primary.type,
    matchCount,
    primaryLocator: primary,
    selectedIndex,
    ...quality,
  };
}

function withLocatorQuality(step: AutomationStep): AutomationStep {
  return {
    ...step,
    options: {
      ...(step.options ?? {}),
      healed: Boolean(step.options?.healed),
      healedLocator: step.options?.healedLocator ?? null,
      healingReason: textValue(step.options?.healingReason),
      locatorQuality: locatorQualityForStep(step),
    },
  };
}

function timelineBadges(step: AutomationStep, healed: boolean) {
  const action = displayAction(step.action);
  if (action === "navigate") {
    const url = textValue(step.inputValue || step.target?.value);
    if (!url) return [{ label: "Missing URL", title: "Add a URL before running this navigation command.", tone: "rose" as const }];
    return /^https?:\/\//i.test(url) ? [] : [{ label: "Check URL", title: "Use a valid http:// or https:// URL.", tone: "amber" as const }];
  }
  if (!stepShowsLocatorDiagnostics(step)) return [];
  const quality = locatorQualityForStep(step);
  const badges: Array<{
    label: string;
    tone: "amber" | "emerald" | "rose" | "sky" | "zinc";
    title: string;
  }> = [];
  if (healed || quality.healed) {
    badges.push({ label: "Self-healed", title: quality.healingReason || "Locator was healed during execution.", tone: "amber" });
  }
  if (quality.ambiguityStatus === "unresolved") {
    badges.push({ label: "Low confidence", title: `${quality.matchCount} matches need a locator choice.`, tone: "rose" });
  } else if (quality.ambiguityStatus === "resolved") {
    badges.push({
      label: typeof quality.selectedIndex === "number" ? "Indexed" : "Ambiguous resolved",
      title: `Resolved ${quality.matchCount} matches by saved context.`,
      tone: "sky",
    });
  } else if (step.target?.type === "smart" && quality.confidenceScore >= 78 && quality.locatorType !== "css") {
    badges.push({ label: "Smart locator", title: `Confidence ${quality.confidenceScore}`, tone: "emerald" });
  } else if (quality.confidenceScore > 0 && quality.confidenceScore < 62) {
    badges.push({ label: "Low confidence", title: `Confidence ${quality.confidenceScore}`, tone: "rose" });
  }
  return badges.slice(0, 2);
}

function badgeClass(tone: "amber" | "emerald" | "rose" | "sky" | "zinc") {
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
  if (tone === "emerald") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
  if (tone === "rose") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
  if (tone === "sky") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200";
  return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
}

function commandRunStatusLabel(state?: CommandRunState) {
  if (!state) return "";
  if (state.status === "running") return "Running";
  if (state.status === "passed") return "Passed";
  return "Failed";
}

function commandRunStatusTone(state?: CommandRunState): "emerald" | "rose" | "sky" | "zinc" {
  if (!state) return "zinc";
  if (state.status === "running") return "sky";
  if (state.status === "passed") return "emerald";
  return "rose";
}

function ambiguousLocatorCandidates(candidates: AutomationLocatorCandidate[] = []) {
  return rankedLocators(candidates).filter((candidate) => {
    const metadata = candidate.metadata ?? {};
    return Boolean(metadata.ambiguous) || Number(metadata.matchCount ?? 0) > 1;
  });
}

function stepAmbiguity(step: AutomationStep) {
  const optionAmbiguity =
    step.options?.ambiguity && typeof step.options.ambiguity === "object"
      ? (step.options.ambiguity as Record<string, unknown>)
      : null;
  const candidates = ambiguousLocatorCandidates(step.locatorCandidates);
  if (!optionAmbiguity && !candidates.length) return null;
  const candidate = candidates[0];
  const optionCandidate =
    optionAmbiguity?.candidate && typeof optionAmbiguity.candidate === "object"
      ? (optionAmbiguity.candidate as Record<string, unknown>)
      : null;
  const quality =
    candidate?.metadata?.quality && typeof candidate.metadata.quality === "object"
      ? (candidate.metadata.quality as Record<string, unknown>)
      : null;
  return {
    candidate: candidate ?? optionCandidate,
    matchCount:
      Number(optionAmbiguity?.matchCount ?? candidate?.metadata?.matchCount ?? 0) || 0,
    method:
      typeof optionAmbiguity?.resolutionMethod === "string"
        ? optionAmbiguity.resolutionMethod
        : "",
    previews:
      Array.isArray(optionAmbiguity?.previews)
        ? (optionAmbiguity.previews as Array<Record<string, unknown>>)
        : Array.isArray(candidate?.metadata?.previews)
          ? (candidate.metadata.previews as Array<Record<string, unknown>>)
          : [],
    quality: {
      readability: Number(optionAmbiguity?.readabilityScore ?? quality?.readability ?? 0) || 0,
      stability: Number(optionAmbiguity?.stabilityScore ?? quality?.stability ?? 0) || 0,
      uniqueness: Number(optionAmbiguity?.uniquenessScore ?? quality?.uniqueness ?? 0) || 0,
    },
    selectedIndex:
      typeof optionAmbiguity?.selectedIndex === "number"
        ? optionAmbiguity.selectedIndex
        : undefined,
  };
}

function ambiguityMethodLabel(method?: string) {
  if (!method) return "Ambiguous";
  if (method === "clicked_index" || method === "index") return "Indexed locator";
  if (method === "context_anchor" || method === "parent_context") return "Context-bound locator";
  if (method === "needs_review") return "Needs locator choice";
  return "Ambiguous resolved";
}

function previewText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function previewBounds(preview: Record<string, unknown>) {
  const bounds = preview.bounds && typeof preview.bounds === "object"
    ? (preview.bounds as Record<string, unknown>)
    : null;
  if (!bounds) return "";
  const x = Number(bounds.x ?? 0);
  const y = Number(bounds.y ?? 0);
  const width = Number(bounds.width ?? 0);
  const height = Number(bounds.height ?? 0);
  return `${Math.round(x)},${Math.round(y)} ${Math.round(width)}x${Math.round(height)}`;
}

function rectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericRect(value: unknown) {
  const rect = rectRecord(value);
  return {
    height: Number(rect.height ?? 0) || 0,
    width: Number(rect.width ?? 0) || 0,
    x: Number(rect.x ?? 0) || 0,
    y: Number(rect.y ?? 0) || 0,
  };
}

function canvasBoxStyle(bounds: unknown, viewport: Record<string, unknown>) {
  const rect = numericRect(bounds);
  const viewportWidth = Number(viewport.width ?? 1365) || 1365;
  const viewportHeight = Number(viewport.height ?? 768) || 768;
  return {
    height: `${Math.max(4, (rect.height / viewportHeight) * 100)}%`,
    left: `${Math.max(0, (rect.x / viewportWidth) * 100)}%`,
    top: `${Math.max(0, (rect.y / viewportHeight) * 100)}%`,
    width: `${Math.max(4, (rect.width / viewportWidth) * 100)}%`,
  };
}

function containedMediaMetrics(
  container: HTMLElement,
  naturalWidth: number,
  naturalHeight: number,
) {
  const rect = container.getBoundingClientRect();
  const safeWidth = naturalWidth || rect.width || 1;
  const safeHeight = naturalHeight || rect.height || 1;
  const scale = Math.min(rect.width / safeWidth, rect.height / safeHeight);
  const renderedWidth = safeWidth * scale;
  const renderedHeight = safeHeight * scale;
  return {
    naturalHeight: safeHeight,
    naturalWidth: safeWidth,
    rect,
    renderedHeight,
    renderedWidth,
    xOffset: (rect.width - renderedWidth) / 2,
    yOffset: (rect.height - renderedHeight) / 2,
  };
}

function liveInspectorBoxStyle(
  bounds: unknown,
  viewport: Record<string, unknown> | undefined,
) {
  const rect = numericRect(bounds);
  const viewportWidth = Number(viewport?.width ?? 0) || 1;
  const viewportHeight = Number(viewport?.height ?? 0) || 1;
  return {
    height: `${Math.max(1, (rect.height / viewportHeight) * 100)}%`,
    left: `${Math.max(0, (rect.x / viewportWidth) * 100)}%`,
    top: `${Math.max(0, (rect.y / viewportHeight) * 100)}%`,
    width: `${Math.max(1, (rect.width / viewportWidth) * 100)}%`,
  };
}

function locatorFromAmbiguityCandidate(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") return { locatorType: "css", value: "" };
  const record = candidate as Record<string, unknown>;
  return {
    locatorType: normalizeLocatorType(
      typeof record.type === "string"
        ? record.type
        : typeof record.strategy === "string"
          ? record.strategy
          : "css",
    ),
    value: typeof record.value === "string" ? record.value : "",
  };
}

function elementName(element?: AutomationStep["element"], fallback = "Element", contextUrl?: string) {
  return semanticTargetName(element, fallback, contextUrl);
}

function displayAction(action: string) {
  return normalizeAutomationAction(action);
}

function isSecretInputStep(step: AutomationStep) {
  const inputType = textValue(step.element?.inputType).toLowerCase();
  const targetName = `${step.target?.displayName || ""} ${step.target?.value || ""}`.toLowerCase();
  return inputType === "password" || /\b(password|passcode|pin|otp|secret|token)\b/.test(targetName);
}

function compactStepValue(value?: string, maxLength = 42) {
  const text = textValue(value).replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function visibleStepInputValue(step: AutomationStep) {
  const action = displayAction(step.action);
  if (!["fill", "press", "scroll", "select", "type"].includes(action)) return "";
  if (!textValue(step.inputValue)) return "";
  if (isSecretInputStep(step)) return "******";
  return compactStepValue(step.inputValue);
}

function isCompareCommandAction(action: string) {
  return action === "compareValues" || action === "compareLists" || action === "compareDatasets";
}

function stepShowsLocatorDiagnostics(step?: AutomationStep | null) {
  if (!step) return false;
  const action = displayAction(step.action);
  if (isCompareCommandAction(action)) return false;
  return Boolean(
    commandRequiresLocator(action) ||
      step.target?.value ||
      step.locatorCandidates?.length ||
      stepAmbiguity(step),
  );
}

function primaryValueParameterForCommand(action: string) {
  if (action === "runJavaScriptSnippet") return undefined;
  const definition = commandDefinitionForAction(action);
  if (isCompareCommandAction(action)) {
    return definition?.parameters.find((parameter) => parameter.name === "actual");
  }
  const primaryParameterNames = new Set([
    "actionName",
    "amount",
    "baseDate",
    "body",
    "content",
    "expected",
    "expectedText",
    "filePath",
    "key",
    "message",
    "option",
    "query",
    "script",
    "subject",
    "text",
    "to",
    "transaction",
    "url",
    "value",
  ]);
  return definition?.parameters.find((parameter) => primaryParameterNames.has(parameter.name));
}

function parameterLabel(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (match) => match.toUpperCase());
}

function commandInputLabel(action: string) {
  const parameter = primaryValueParameterForCommand(action);
  if (!parameter) return "Value";
  if (parameter.name === "url") return "URL";
  if (parameter.name === "text") return "Text";
  if (parameter.name === "option") return "Option";
  if (parameter.name === "key") return "Key";
  if (parameter.name === "deltaY") return "Scroll delta";
  if (parameter.name === "duration") return "Duration";
  return parameterLabel(parameter.name);
}

function commandShowsInputValue(action: string) {
  return Boolean(primaryValueParameterForCommand(action));
}

function commandSupportsTestData(action: string) {
  const parameter = primaryValueParameterForCommand(action);
  return Boolean(parameter && ["actual", "expected", "expectedText", "option", "text", "url", "value"].includes(parameter.name));
}

function commandCanSaveOutput(definition?: AutomationCommandDefinition | null) {
  return Boolean(
    definition?.canSaveOutput &&
      definition.outputDefinition.canSaveAsVariable &&
      definition.outputDefinition.outputType !== "void" &&
      definition.outputDefinition.outputType !== "passFail",
  );
}

function commandOutputDefaultName(definition?: AutomationCommandDefinition | null) {
  return definition?.outputDefinition.defaultOutputVariableName || "result";
}

function commandOutputTypeLabel(definition?: AutomationCommandDefinition | null) {
  const outputType = definition?.outputDefinition.outputType;
  if (!outputType || outputType === "void") return "output";
  if (outputType === "passFail") return "pass/fail result";
  return `${outputType} output`;
}

function commandHasAdvancedRuntimeInput(action: string) {
  if (isCompareCommandAction(action)) return false;
  const parameter = primaryValueParameterForCommand(action);
  return Boolean(parameter && !commandSupportsTestData(action));
}

type CommandEditorUxKind =
  | "actionOnly"
  | "inputCommand"
  | "outputCommand"
  | "assertionCommand"
  | "waitCommand"
  | "dataCommand";

function commandEditorUxKind(definition?: AutomationCommandDefinition | null): CommandEditorUxKind {
  if (!definition) return "actionOnly";
  const label = definition.label.toLowerCase();
  const category = definition.category.toLowerCase();
  const isAssertion =
    definition.stepKind === "assertion" ||
    definition.outputDefinition.outputType === "passFail" ||
    category.includes(".verify") ||
    /\b(assert|verify)\b/.test(label);
  if (isAssertion) return "assertionCommand";
  if (definition.stepKind === "wait" || category.startsWith("wait.")) return "waitCommand";
  if (definition.domain === "data" || category.startsWith("dateTime") || category.startsWith("utility.generator")) {
    return "dataCommand";
  }
  if (commandCanSaveOutput(definition)) return "outputCommand";
  if (definition.parameters.some((parameter) => parameter.name !== "locator")) return "inputCommand";
  return "actionOnly";
}

function commandEditorParameterSectionTitle(kind: CommandEditorUxKind) {
  if (kind === "assertionCommand") return "Expected result";
  if (kind === "outputCommand") return "Getter details";
  if (kind === "waitCommand") return "Wait settings";
  if (kind === "dataCommand") return "Data settings";
  return "Command inputs";
}

function commandEditorParameterSectionHint(kind: CommandEditorUxKind) {
  if (kind === "assertionCommand") return "Enter only what this verification needs.";
  if (kind === "outputCommand") return "Set any lookup details, then choose where the returned value is stored.";
  if (kind === "waitCommand") return "Choose the timing or element state this wait should use.";
  if (kind === "dataCommand") return "Provide the data inputs this command needs.";
  return "Fields are generated from the shared CaseForge command registry.";
}

function commandShowsOutputCapture(definition?: AutomationCommandDefinition | null) {
  if (definition?.category.startsWith("web.table")) return commandCanSaveOutput(definition);
  return commandCanSaveOutput(definition) && commandEditorUxKind(definition) !== "assertionCommand";
}

function commandRequiresLocator(action: string) {
  const definition = commandDefinitionForAction(action);
  return Boolean(definition?.parameters.some((parameter) => parameter.name === "locator" && parameter.required));
}

function commandParameterDisplayValue(step: AutomationStep, parameter: AutomationCommandParameterDefinition) {
  if (parameter.name === "locator") return step.target?.value || "";
  if (isCompareCommandAction(displayAction(step.action)) && parameter.name === "actual") {
    return textValue(step.inputValue) || String(step.options?.actual ?? parameter.defaultValue ?? "");
  }
  if (parameter.name === "expectedText" || parameter.name === "expected") {
    return textValue(step.expectedValue) || String(step.options?.[parameter.name] ?? parameter.defaultValue ?? "");
  }
  const primaryParameter = primaryValueParameterForCommand(displayAction(step.action));
  if (primaryParameter?.name === parameter.name) {
    return textValue(step.inputValue) || String(step.options?.[parameter.name] ?? parameter.defaultValue ?? "");
  }
  const value = step.options?.[parameter.name] ?? parameter.defaultValue ?? "";
  return typeof value === "boolean" ? value : String(value);
}

function shouldRenderCommandSchemaParameter(
  action: string,
  parameter: AutomationCommandParameterDefinition,
) {
  if (parameter.name === "locator") return false;
  const primaryParameter = primaryValueParameterForCommand(action);
  if (primaryParameter?.name === parameter.name) return false;
  if (action === "wait" && parameter.name === "duration") return false;
  return true;
}

function commandAdapterPendingMessage(action: string) {
  const definition = commandDefinitionForAction(action);
  const label = definition?.label || action;
  return definition
    ? `${label} is available for authoring, but its ${definition.domain} execution adapter is coming soon.`
    : `${label} is not in the CaseForge command registry.`;
}

function isRunnableWebCommand(action: string) {
  const definition = commandDefinitionForAction(action);
  return Boolean(definition?.executable && definition.domain === "web");
}

function commandExecutionBadgeLabel(command: AutomationCommandDefinition) {
  if (!command.executable) return "adapter pending";
  if (command.domain === "web") return "web";
  return "adapter pending";
}

function liveCommandText(action: string, elementLabel: string, command?: AutomationCommandDefinition) {
  const label = elementLabel || "element";
  if (action === "fill" || action === "type") return `Fill ${label}`;
  if (action === "select") return `Select option in ${label}`;
  if (action === "click") return `Click ${label}`;
  if (action === "doubleClick") return `Double click ${label}`;
  if (action === "rightClick") return `Right click ${label}`;
  if (action === "hover") return `Hover over ${label}`;
  if (action === "check") return `Check ${label}`;
  if (action === "uncheck") return `Uncheck ${label}`;
  if (action === "clear") return `Clear ${label}`;
  if (action === "press") return `Press key on ${label}`;
  if (action === "assert") return `Verify ${label}`;
  return command?.label || action;
}

function readableStepLabel(step: AutomationStep) {
  const action = displayAction(step.action);
  const targetName =
    step.target?.displayName ||
    elementName(
      step.element,
      step.target?.value || "Element",
      typeof step.options?.pageUrl === "string" ? step.options.pageUrl : undefined,
    );
  if (action === "navigate") return `Navigate to ${step.inputValue || step.target?.value || "page"}`;
  if (action === "switchPage") return step.commandText || step.description || `Switch to ${targetName}`;
  if (action === "reload") return "Reload page";
  if (action === "doubleClick") return `Double click ${targetName}`;
  if (action === "rightClick") return `Right click ${targetName}`;
  if (action === "coordinateClick") return `Click coordinates ${step.options?.x || 0}, ${step.options?.y || 0}`;
  if (action === "scroll") return `Scroll ${step.inputValue || step.options?.deltaY || 600}`;
  if (action === "scrollIntoView") return `Scroll ${targetName} into view`;
  if (action === "fill") {
    const value = visibleStepInputValue(step);
    return value ? `Fill ${targetName} with "${value}"` : `Fill ${targetName}`;
  }
  if (action === "type") {
    const value = visibleStepInputValue(step);
    return value ? `Type "${value}" in ${targetName}` : `Type in ${targetName}`;
  }
  if (action === "clear") return `Clear ${targetName}`;
  if (action === "press") return `Press ${step.inputValue || "Enter"} on ${targetName}`;
  if (action === "select") return `Select ${step.inputValue || "option"} in ${targetName}`;
  if (action === "check") return `Check ${targetName}`;
  if (action === "uncheck") return `Uncheck ${targetName}`;
  if (action === "assert") {
    if (step.assertionType === "image_loaded") return `Verify ${targetName} is loaded`;
    if (step.assertionType === "css_property") {
      const property =
        step.options?.property && typeof step.options.property === "string"
          ? step.options.property
          : "CSS property";
      return `Verify ${targetName} ${property} is ${step.expectedValue || "expected"}`;
    }
    if (step.assertionType === "text_equals") return `Verify ${targetName} text equals ${step.expectedValue || "expected text"}`;
    if (step.assertionType === "text_contains") return `Verify ${targetName} text contains ${step.expectedValue || "expected text"}`;
    if (step.assertionType === "hidden") return `Verify ${targetName} is hidden`;
    return `Verify ${targetName} is visible`;
  }
  const commandDefinition = commandDefinitionForAction(action);
  if (isCompareCommandAction(action)) return commandDefinition?.label || "Compare values";
  if (commandDefinition?.category.startsWith("data.collections.")) return commandDefinition.label;
  if (action.includes("WebTable") || action === "getWebTableData" || action === "validateWebTable") {
    return commandDefinition?.label || action;
  }
  if (action === "validateAccordionSections") return commandDefinition?.label || "Validate all accordion sections";
  if (action === "runJavaScriptSnippet") return commandDefinition?.label || "Run JavaScript snippet";
  if (action === "action") return `Action: ${targetName}`;
  if (action === "wait") {
    const waitType = textValue(step.options?.waitType) || (step.target?.value ? "soft" : "hard");
    const duration = Number(step.inputValue || step.options?.duration || 1000);
    if (waitType === "hard") return `Wait ${Number.isFinite(duration) ? duration : 1000} ms`;
    const condition = textValue(step.options?.waitCondition) || "visible";
    return `Wait until ${targetName} is ${condition}`;
  }
  if (action === "hover") return `Hover over ${targetName}`;
  return `Click ${targetName}`;
}

function commandOutputSummary(output: unknown) {
  if (output === undefined || output === null) return "";
  if (typeof output === "string") return output;
  if (typeof output === "number" || typeof output === "boolean") return String(output);
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function commandDetailValue(output: unknown) {
  const text = commandOutputSummary(output);
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}

function javaScriptSnippetSummary(output: unknown) {
  if (output === undefined) return "undefined";
  if (output === null) return "null";
  return commandOutputSummary(output);
}

function javaScriptSnippetDetailLines(output: unknown) {
  if (output === undefined || output === null) return [];
  if (typeof output !== "object") return [];
  try {
    return JSON.stringify(output, null, 2).split("\n").slice(0, 30);
  } catch {
    return [];
  }
}

function accordionValidationSummary(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return "";
  const record = output as {
    accordionCount?: unknown;
    failed?: unknown;
    passed?: unknown;
  };
  const count = Number(record.accordionCount ?? 0);
  const passed = Number(record.passed ?? 0);
  const failed = Number(record.failed ?? 0);
  if (![count, passed, failed].every(Number.isFinite)) return "";
  return `Accordion validation: ${count} item${count === 1 ? "" : "s"}, ${passed} passed, ${failed} failed`;
}

function accordionValidationDetailLines(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const record = output as {
    countErrors?: unknown;
    failedAccordionItems?: unknown;
  };
  const lines: string[] = [];
  if (Array.isArray(record.countErrors)) {
    for (const error of record.countErrors.slice(0, 5)) {
      if (error) lines.push(`Accordion count check failed: ${String(error)}`);
    }
  }
  if (Array.isArray(record.failedAccordionItems)) {
    for (const item of record.failedAccordionItems.slice(0, 10)) {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const index = Number(row.index ?? 0);
      const question = textValue(row.question) || "Untitled accordion item";
      const reason = textValue(row.errorReason) || "Validation failed.";
      lines.push(`Accordion ${Number.isFinite(index) && index > 0 ? index : "?"} failed: ${question}. ${reason}`);
    }
  }
  return lines;
}

function tableCommandSummary(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return "";
  const record = output as Record<string, unknown>;
  if (typeof record.rowCount === "number" || typeof record.columnCount === "number") {
    const rowCount = Number(record.rowCount ?? 0);
    const columnCount = Number(record.columnCount ?? 0);
    const failed =
      Number(record.failed ?? 0) ||
      (Array.isArray(record.failedCells) ? record.failedCells.length : 0) +
        (Array.isArray(record.failedRows) ? record.failedRows.length : 0) +
        (Array.isArray(record.failedColumns) ? record.failedColumns.length : 0);
    return `Table: ${Number.isFinite(rowCount) ? rowCount : 0} row${rowCount === 1 ? "" : "s"}, ${Number.isFinite(columnCount) ? columnCount : 0} column${columnCount === 1 ? "" : "s"}${failed ? `, ${failed} issue${failed === 1 ? "" : "s"}` : ""}`;
  }
  if (typeof record.failedCount === "number" || typeof record.passedCount === "number") {
    const failed = Number(record.failedCount ?? 0);
    const passed = Number(record.passedCount ?? 0);
    return `Table comparison: ${passed} passed, ${failed} failed`;
  }
  if (typeof record.matchedRowIndex === "number") {
    return `Matched table row ${record.matchedRowIndex}`;
  }
  if (typeof record.columnIndex === "number" && record.columnName) {
    return `Matched table column ${record.columnName} at ${record.columnIndex}`;
  }
  if ("actual" in record && "expected" in record) {
    return `Table check: expected ${textValue(record.expected)}, actual ${textValue(record.actual)}`;
  }
  return "";
}

function tableCommandDetailLines(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const record = output as Record<string, unknown>;
  const lines: string[] = [];
  const warnings = Array.isArray(record.warnings) ? record.warnings : [];
  for (const warning of warnings.slice(0, 3)) {
    if (warning) lines.push(`Table warning: ${String(warning)}`);
  }
  const failedRows = Array.isArray(record.failedRows) ? record.failedRows : [];
  for (const item of failedRows.slice(0, 5)) {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    lines.push(`Table row ${row.rowIndex ?? "?"} failed: ${textValue(row.reason) || "Validation failed."}`);
  }
  const failedCells = Array.isArray(record.failedCells) ? record.failedCells : [];
  for (const item of failedCells.slice(0, 5)) {
    const cell = item && typeof item === "object" ? item as Record<string, unknown> : {};
    lines.push(`Table cell row ${cell.rowIndex ?? "?"}, ${textValue(cell.column) || textValue(cell.columnName) || "column"} failed: ${textValue(cell.reason) || "Validation failed."}`);
  }
  const failedColumns = Array.isArray(record.failedColumns) ? record.failedColumns : [];
  for (const item of failedColumns.slice(0, 5)) {
    const column = item && typeof item === "object" ? item as Record<string, unknown> : {};
    lines.push(`Table column ${textValue(column.column) || "?"} failed: ${textValue(column.reason) || "Validation failed."}`);
  }
  const mismatchedCells = Array.isArray(record.mismatchedCells) ? record.mismatchedCells : [];
  for (const item of mismatchedCells.slice(0, 8)) {
    const cell = item && typeof item === "object" ? item as Record<string, unknown> : {};
    lines.push(`Mismatch row ${cell.rowIndex ?? "?"}, ${textValue(cell.column) || "column"}: expected "${textValue(cell.expected)}", actual "${textValue(cell.actual)}"`);
  }
  const missingRows = Array.isArray(record.missingRows) ? record.missingRows : [];
  if (missingRows.length) lines.push(`Missing rows: ${missingRows.length}`);
  const extraRows = Array.isArray(record.extraRows) ? record.extraRows : [];
  if (extraRows.length) lines.push(`Extra rows: ${extraRows.length}`);
  const missingColumns = Array.isArray(record.missingColumns) ? record.missingColumns : [];
  if (missingColumns.length) lines.push(`Missing columns: ${missingColumns.map(String).join(", ")}`);
  const extraColumns = Array.isArray(record.extraColumns) ? record.extraColumns : [];
  if (extraColumns.length) lines.push(`Extra columns: ${extraColumns.map(String).join(", ")}`);
  return lines;
}

function comparisonCommandSummary(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return "";
  const record = output as Record<string, unknown>;
  if (typeof record.passed !== "boolean" && typeof record.failedCount !== "number") return "";
  const failed = Number(record.failedCount ?? 0);
  const passed = Boolean(record.passed);
  const missing = Array.isArray(record.missingItems) ? record.missingItems.length : 0;
  const extra = Array.isArray(record.extraItems) ? record.extraItems.length : 0;
  const mismatches = Array.isArray(record.mismatches) ? record.mismatches.length : 0;
  return `Comparison ${passed ? "passed" : "failed"}${failed ? `: ${failed} issue${failed === 1 ? "" : "s"}` : ""}${missing ? `, ${missing} missing` : ""}${extra ? `, ${extra} extra` : ""}${mismatches ? `, ${mismatches} mismatch${mismatches === 1 ? "" : "es"}` : ""}`;
}

function comparisonCommandDetailLines(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const record = output as Record<string, unknown>;
  const lines: string[] = [];
  if (record.agentVersion) lines.push(`Companion version: ${textValue(record.agentVersion)}`);
  if (record.actualSource) {
    lines.push(
      `Actual source: ${textValue(record.actualSource)}${
        "actualInput" in record ? ` (${textValue(record.actualInput) || "blank"})` : ""
      }`,
    );
  }
  const runtimeVariableNames = Array.isArray(record.runtimeVariableNames)
    ? record.runtimeVariableNames.map(String).filter(Boolean)
    : [];
  if (runtimeVariableNames.length) {
    lines.push(`Runtime variables available: ${runtimeVariableNames.slice(0, 12).join(", ")}`);
  } else if ("runtimeVariableNames" in record) {
    lines.push("Runtime variables available: none");
  }
  if ("actualText" in record || "actual" in record) {
    const actualText = textValue(record.actualText) || commandDetailValue(record.actual);
    const actualType = textValue(record.actualType);
    const actualCount = typeof record.actualCount === "number" ? `, ${record.actualCount} item${record.actualCount === 1 ? "" : "s"}` : "";
    lines.push(`Actual resolved: ${actualText || "(empty)"}${actualType ? ` (${actualType}${actualCount})` : ""}`);
  }
  if ("expectedText" in record || "expected" in record) {
    const expectedText = textValue(record.expectedText) || commandDetailValue(record.expected);
    const expectedType = textValue(record.expectedType);
    const expectedCount = typeof record.expectedCount === "number" ? `, ${record.expectedCount} item${record.expectedCount === 1 ? "" : "s"}` : "";
    lines.push(`Expected resolved: ${expectedText || "(empty)"}${expectedType ? ` (${expectedType}${expectedCount})` : ""}`);
  }
  const mismatches = Array.isArray(record.mismatches) ? record.mismatches : [];
  for (const item of mismatches.slice(0, 8)) {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    lines.push(`Mismatch ${textValue(row.path) || "value"}: expected "${commandDetailValue(row.expected)}", actual "${commandDetailValue(row.actual)}"`);
  }
  const missing = Array.isArray(record.missingItems) ? record.missingItems : [];
  if (missing.length) lines.push(`Missing items: ${missing.length}`);
  const extra = Array.isArray(record.extraItems) ? record.extraItems : [];
  if (extra.length) lines.push(`Extra items: ${extra.length}`);
  return lines;
}

function logicDslRunSummary(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return "";
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.results)) return "";
  const results = record.results as unknown[];
  const counts = { command: 0, for: 0, if: 0, repeat: 0, skipped: 0 };
  const visit = (items: unknown[]) => {
    for (const item of items) {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const type = textValue(row.type);
      if (type in counts) counts[type as keyof typeof counts] += 1;
      if (row.status === "skipped") counts.skipped += 1;
      if (Array.isArray(row.results)) visit(row.results);
    }
  };
  visit(results);
  return `Logic: ${counts.if} branch block${counts.if === 1 ? "" : "s"}, ${counts.for} for-loop${counts.for === 1 ? "" : "s"}, ${counts.repeat} repeat-loop${counts.repeat === 1 ? "" : "s"}, ${counts.command} command${counts.command === 1 ? "" : "s"}${counts.skipped ? `, ${counts.skipped} skipped` : ""}`;
}

function logicDslRunDetailLines(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const record = output as Record<string, unknown>;
  const lines: string[] = [];
  const walk = (items: unknown[], depth = 0) => {
    for (const item of items.slice(0, 12)) {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const prefix = depth ? "  ".repeat(Math.min(depth, 2)) : "";
      const type = textValue(row.type);
      if (type === "if") {
        lines.push(`${prefix}Logic branch ${textValue(row.branch) || "if"}: ${textValue(row.status) || "passed"}`);
      } else if (type === "for" || type === "repeat") {
        lines.push(`${prefix}Logic ${type}: ${Number(row.iterations ?? 0)} iteration(s).`);
      } else if (type === "command") {
        const command = textValue(row.command) || "command";
        if (command === "log") {
          lines.push(`${prefix}Log: ${commandOutputSummary(row.output) || "(empty)"}`);
        } else {
          const target = textValue(row.target);
          const output = commandOutputSummary(row.output);
          const storedOutput = target && output ? ` stored ${target} = ${output}` : output ? ` output: ${output}` : "";
          lines.push(`${prefix}Logic command ${command}${storedOutput} passed.`);
        }
      }
      if (Array.isArray(row.results) && lines.length < 12) walk(row.results, depth + 1);
    }
  };
  if (Array.isArray(record.results)) walk(record.results);
  return lines.slice(0, 12);
}

function commandConsoleOutputForStep(step: AutomationStep | undefined, output: unknown) {
  if (!step) return "";
  const action = displayAction(step.action);
  if (action === "logMessage") return commandOutputSummary(output);
  if (action === "runJavaScriptSnippet") return javaScriptSnippetSummary(output);
  if (isLogicIdeCommand(action)) return logicDslRunSummary(output);
  if (action === "validateAccordionSections") return accordionValidationSummary(output);
  if (action === "compareValues" || action === "compareLists" || action === "compareDatasets") {
    return comparisonCommandSummary(output);
  }
  if (action.includes("WebTable") || action === "getWebTableData" || action === "validateWebTable") {
    return tableCommandSummary(output);
  }
  const definition = commandDefinitionForAction(action);
  if (!commandShowsOutputCapture(definition)) return "";
  return commandOutputSummary(output);
}

function commandConsoleOutputLineForStep(step: AutomationStep | undefined, output: unknown) {
  const displayOutput = commandConsoleOutputForStep(step, output);
  if (!displayOutput) return "";
  if (step && displayAction(step.action) === "logMessage") {
    return `Log: ${displayOutput}.`;
  }
  const variableName = step ? phaseOutputVariable(step) : "";
  return variableName
    ? `Stored ${variableName} = ${displayOutput}.`
    : `Output: ${displayOutput}.`;
}

function commandConsoleDetailLinesForStep(step: AutomationStep | undefined, output: unknown) {
  if (!step) return [];
  if (displayAction(step.action) === "validateAccordionSections") {
    return accordionValidationDetailLines(output);
  }
  const action = displayAction(step.action);
  if (action === "runJavaScriptSnippet") {
    return javaScriptSnippetDetailLines(output);
  }
  if (isLogicIdeCommand(action)) {
    return logicDslRunDetailLines(output);
  }
  if (action === "compareValues" || action === "compareLists" || action === "compareDatasets") {
    return comparisonCommandDetailLines(output);
  }
  if (action.includes("WebTable") || action === "getWebTableData" || action === "validateWebTable") {
    return tableCommandDetailLines(output);
  }
  return [];
}

function consoleLogPreview(log: string, maxLength = 260) {
  const normalized = String(log || "");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function consoleLogNeedsExpand(log: string) {
  return String(log || "").length > 260;
}

function commandPhraseForStep(
  step: AutomationStep,
  definition?: AutomationCommandDefinition | null,
) {
  const action = displayAction(step.action);
  const commandDefinition =
    definition ?? (action === "action" ? actionCommandDefinition : commandDefinitionForAction(action));
  const basePhrase = commandDefinition?.label || readableStepLabel({ ...step, commandText: "" });
  if (!commandShowsOutputCapture(commandDefinition)) return basePhrase;

  const outputVariable =
    phaseOutputVariable(step) || commandOutputDefaultName(commandDefinition);
  return outputVariable ? `${basePhrase} -> ${outputVariable}` : basePhrase;
}

function defaultCommandTextForStep(
  step: AutomationStep,
  definition?: AutomationCommandDefinition | null,
) {
  const action = displayAction(step.action);
  const commandDefinition =
    definition ?? (action === "action" ? actionCommandDefinition : commandDefinitionForAction(action));
  if (commandDefinition) return commandPhraseForStep(step, commandDefinition);
  return readableStepLabel(step);
}

function validateCommandPromptStep(step: AutomationStep) {
  const action = displayAction(step.action);
  const prompt = textValue(step.commandText || step.description || readableStepLabel(step));
  const targetValue = textValue(step.target?.value);
  const waitType = textValue(step.options?.waitType) || (targetValue ? "soft" : "hard");
  const duration = Number(step.inputValue || step.options?.duration || 0);

  if (!prompt) {
    return { field: "prompt", message: "Add a command prompt before saving.", ok: false };
  }
  if (action === "navigate" && !textValue(step.inputValue || step.target?.value)) {
    return { field: "url", message: "Add the URL for this navigation command.", ok: false };
  }
  if (action === "wait" && waitType === "hard" && (!Number.isFinite(duration) || duration <= 0)) {
    return { field: "duration", message: "Enter a wait duration greater than 0 ms.", ok: false };
  }
  if (action === "wait" && waitType === "soft" && !targetValue) {
    return { field: "locator", message: "Add the locator to wait for.", ok: false };
  }
  if (commandRequiresLocator(action) && !targetValue) {
    return { field: "locator", message: "Add a locator for this command.", ok: false };
  }
  if (
    action === "assert" &&
    ["text_contains", "text_equals", "css_property"].includes(step.assertionType || "") &&
    !textValue(step.expectedValue)
  ) {
    return { field: "expected", message: "Add the expected value for this assertion.", ok: false };
  }
  return { ok: true };
}

function isRawRecorderLabel(value?: string) {
  const normalized = textValue(value).toLowerCase();
  if (!normalized) return true;
  return [
    "click button",
    "click div",
    "click element",
    "verify div is visible",
    "verify element is visible",
    "verify img image is loaded",
    "verify image is loaded",
    "verify img is visible",
  ].includes(normalized);
}

function makeStepId() {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function customSnippetStorageKey(projectKey: string) {
  return `caseforge.customSnippetCommands.${projectKey}`;
}

function normalizeCustomSnippetCommands(value: unknown): CustomSnippetCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CustomSnippetCommand[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = textValue(record.id);
    const label = textValue(record.label);
    const script = typeof record.script === "string" ? record.script.trim() : "";
    if (!id || !label || !script) return [];
    const timeoutMs = Number(record.timeoutMs);
    return [
      {
        description: textValue(record.description),
        failIfEmpty: Boolean(record.failIfEmpty),
        id,
        label,
        logOutputToConsole: record.logOutputToConsole === undefined ? true : Boolean(record.logOutputToConsole),
        outputFormat: textValue(record.outputFormat) || "auto",
        outputVariableName: textValue(record.outputVariableName),
        script,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
        updatedAt: textValue(record.updatedAt) || new Date().toISOString(),
      },
    ];
  });
}

function loadCustomSnippetCommands(projectKey: string) {
  if (typeof window === "undefined") return [];
  try {
    return normalizeCustomSnippetCommands(JSON.parse(window.localStorage.getItem(customSnippetStorageKey(projectKey)) || "[]"));
  } catch {
    return [];
  }
}

function saveCustomSnippetCommands(projectKey: string, commands: CustomSnippetCommand[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(customSnippetStorageKey(projectKey), JSON.stringify(commands));
}

function customSnippetCommandDefinition(snippet: CustomSnippetCommand): AutomationCommandDefinition | null {
  const base = commandDefinitionForAction("runJavaScriptSnippet");
  if (!base) return null;
  const outputDefinition = {
    ...base.outputDefinition,
    defaultOutputVariableName: snippet.outputVariableName || base.outputDefinition.defaultOutputVariableName,
  };
  const parameters = base.parameters.map((parameter) => {
    const next = { ...parameter };
    if (next.name === "script") next.defaultValue = snippet.script;
    if (next.name === "outputFormat") next.defaultValue = snippet.outputFormat || "auto";
    if (next.name === "logOutputToConsole") next.defaultValue = snippet.logOutputToConsole ?? true;
    if (next.name === "failIfEmpty") next.defaultValue = snippet.failIfEmpty ?? false;
    if (next.name === "timeoutMs") next.defaultValue = snippet.timeoutMs || 5000;
    return next;
  });
  return {
    ...base,
    action: `customSnippet.${snippet.id}`,
    aliases: ["Custom JavaScript command", snippet.label],
    category: "custom.javascript",
    description: snippet.description || `Runs saved JavaScript snippet "${snippet.label}".`,
    id: `customSnippet.${snippet.id}`,
    inputs: parameters,
    label: snippet.label,
    logging: {
      onFailure: `${snippet.label} failed.`,
      onStart: `${snippet.label} started.`,
      onSuccess: `${snippet.label} completed.`,
    },
    normalizedAction: "runJavaScriptSnippet",
    outputDefinition,
    outputs: [{ ...outputDefinition }],
    parameters,
    runtimeAction: "runJavaScriptSnippet",
    runtimeHandler: "web.runJavaScriptSnippet",
    visibleInDropdown: false,
    visibleInLibrary: true,
  };
}

function makeNavigateStep(url: string, id = makeStepId()): AutomationStep {
  return {
    action: "navigate",
    commandText: `Navigate to ${url}`,
    description: `Navigate to ${url}`,
    id,
    inputValue: url,
    locatorCandidates: [],
    options: {},
    target: {
      displayName: url,
      elementKind: "browser",
      locatorType: "url",
      operator: "equals",
      type: "manual",
      value: url,
    },
  };
}

function navigationUrlForStep(step: AutomationStep, baseUrl = "") {
  if (displayAction(step.action) !== "navigate") return null;
  const value = resolvedBaseUrlTemplate(step.inputValue || step.target?.value || "", baseUrl);
  if (!value) return null;
  if (hasTemplateToken(value)) return null;
  return normalizeUrl(value);
}

function lastNavigationUrl(steps: AutomationStep[], baseUrl = "") {
  for (const step of [...steps].reverse()) {
    const url = navigationUrlForStep(step, baseUrl);
    if (url) return url;
  }
  return null;
}

function firstNavigationUrl(steps: AutomationStep[], baseUrl = "") {
  for (const step of steps) {
    const url = navigationUrlForStep(step, baseUrl);
    if (url) return url;
  }
  return null;
}

function normalizedUrlPath(value?: string | null) {
  if (!value) return "";
  const parsed = safeUrl(value);
  const path = parsed ? parsed.pathname : value;
  return path.replace(/\/+$/, "") || "/";
}

function urlsRoughlyMatch(currentUrl?: string | null, expectedUrl?: string | null) {
  if (!currentUrl || !expectedUrl) return false;
  const current = safeUrl(currentUrl);
  const expected = safeUrl(expectedUrl);
  if (current && expected && current.origin !== expected.origin) return false;
  return normalizedUrlPath(currentUrl) === normalizedUrlPath(expectedUrl);
}

function mergeUrlPath(baseUrl: string, sourceUrl: string) {
  const base = safeUrl(baseUrl);
  const source = safeUrl(sourceUrl);
  if (!base) return normalizeUrl(sourceUrl || baseUrl);
  if (!source) return base.toString();
  base.pathname = source.pathname;
  base.search = source.search;
  base.hash = source.hash;
  return base.toString();
}

function environmentUrlForStep(step: AutomationStep, environmentBaseUrl: string) {
  const rawValue = textValue(step.inputValue || step.target?.value);
  if (!rawValue) return normalizeUrl(environmentBaseUrl);
  if (rawValue.includes("{{baseUrl}}")) {
    return normalizeUrl(resolvedBaseUrlTemplate(rawValue, environmentBaseUrl));
  }
  return mergeUrlPath(environmentBaseUrl, rawValue);
}

function applyRunEnvironmentToSteps(
  steps: AutomationStep[],
  environment: RunEnvironmentDraft,
) {
  const baseUrl = normalizeUrl(environment.baseUrl);
  return steps.map((step) => {
    if (displayAction(step.action) !== "navigate") {
      return step;
    }
    const nextUrl = environmentUrlForStep(step, baseUrl);
    return {
      ...step,
      commandText: `Navigate to ${nextUrl}`,
      description: `Navigate to ${nextUrl}`,
      inputValue: nextUrl,
      target: {
        ...step.target,
        displayName: nextUrl,
        value: nextUrl,
      },
    };
  });
}

function isScenarioInitStep(step: AutomationStep, index: number) {
  return index === 0 && displayAction(step.action) === "navigate";
}

function actionCandidateSteps(steps: AutomationStep[]) {
  return steps.filter((step, index) => !isScenarioInitStep(step, index));
}

function actionCommandSelectionKey(actionStepId: string, commandId: string) {
  return `${actionStepId}:${commandId}`;
}

function scenarioInitSteps(steps: AutomationStep[]) {
  return steps.filter((step, index) => isScenarioInitStep(step, index));
}

function withScenarioInitSteps(runSteps: AutomationStep[], setupSourceSteps: AutomationStep[]) {
  if (!runSteps.length || firstNavigationUrl(runSteps)) return runSteps;
  const setupSteps = scenarioInitSteps(setupSourceSteps);
  if (!setupSteps.length) return runSteps;
  const runStepIds = new Set(runSteps.map((step) => step.id).filter(Boolean));
  return [...setupSteps.filter((step) => !runStepIds.has(step.id)), ...runSteps];
}

function timelineContextStepsForStep(step: AutomationStep, sourceSteps: AutomationStep[]) {
  const stepIndex = step.id ? sourceSteps.findIndex((sourceStep) => sourceStep.id === step.id) : -1;
  if (stepIndex < 0) return withScenarioInitSteps([step], sourceSteps);
  return [...sourceSteps.slice(0, stepIndex), step];
}

function makeManualStep(count: number): AutomationStep {
  return {
    action: "click",
    commandText: `Click element ${count}`,
    description: `Click element ${count}`,
    id: makeStepId(),
    locatorCandidates: [],
    options: {},
    target: {
      displayName: `element ${count}`,
      elementKind: "web element",
      locatorType: "css",
      operator: "equals",
      type: "manual",
      value: "",
    },
  };
}

function makeWaitStep(): AutomationStep {
  return {
    action: "wait",
    commandText: "Wait 1000 ms",
    description: "Wait 1000 ms",
    id: makeStepId(),
    inputValue: "1000",
    locatorCandidates: [],
    options: {
      duration: 1000,
      waitCondition: "visible",
      waitType: "hard",
    },
    target: {
      displayName: "Timer",
      elementKind: "timer",
      locatorType: "css",
      operator: "equals",
      type: "manual",
      value: "",
    },
  };
}

function commandParameterInitialValue(
  parameter: AutomationCommandParameterDefinition | undefined,
  fallbackUrl: string,
) {
  if (!parameter) return "";
  if (parameter.defaultValue !== undefined && parameter.defaultValue !== null) {
    return String(parameter.defaultValue);
  }
  if (parameter.name === "url") return normalizeUrl(fallbackUrl);
  if (parameter.name === "key") return "Enter";
  if (parameter.name === "duration" || parameter.name === "timeoutMs") return "1000";
  if (parameter.name === "amount") return "1";
  if (parameter.name === "index" || parameter.name === "rowIndex" || parameter.name === "columnIndex") return "0";
  if (parameter.options?.[0]?.value !== undefined) return String(parameter.options[0].value);
  return "";
}

function commandParameterOptionValue(parameter: AutomationCommandParameterDefinition) {
  if (parameter.defaultValue !== undefined) return parameter.defaultValue;
  if (parameter.type === "boolean") return false;
  if (parameter.type === "number") return 0;
  if (parameter.options?.[0]?.value !== undefined) return parameter.options[0].value;
  return "";
}

function commandTargetDisplayName(command: AutomationCommandDefinition) {
  if (command.parameters.some((parameter) => parameter.name === "locator")) return "Element";
  if (command.category.startsWith("browser.") || command.domain === "web") return "Browser";
  return command.domain.replace(/^\w/, (letter) => letter.toUpperCase());
}

function makeCommandLibraryStep(
  command: AutomationCommandDefinition,
  fallbackUrl: string,
): AutomationStep {
  const action = normalizeAutomationAction(command.normalizedAction || command.action);
  const primaryParameter = primaryValueParameterForCommand(action);
  const inputValue = commandParameterInitialValue(primaryParameter, fallbackUrl);
  const options = command.parameters.reduce<Record<string, unknown>>(
    (record, parameter) => {
      if (parameter.name === "locator") return record;
      return {
        ...record,
        [parameter.name]:
          primaryParameter?.name === parameter.name
            ? inputValue
            : commandParameterOptionValue(parameter),
      };
    },
    {
      adapterPending: !(command.executable && command.domain === "web"),
      insertedFromCommandLibrary: true,
      libraryCommandId: command.id,
      outputVariableName: commandShowsOutputCapture(command)
        ? commandOutputDefaultName(command)
        : undefined,
      runtimeAction: command.runtimeAction,
      runtimeHandler: command.runtimeHandler,
    },
  );
  if (isLogicIdeCommand(action)) {
    options.dsl = defaultLogicDsl(action);
  }
  const targetName = commandTargetDisplayName(command);
  const stepBase: AutomationStep = {
    action,
    commandText: command.label,
    description: command.description || command.label,
    expectedValue:
      primaryParameter?.name === "expected" || primaryParameter?.name === "expectedText"
        ? inputValue
        : "",
    id: makeStepId(),
    inputValue,
    locatorCandidates: [],
    options,
    target: {
      displayName: targetName,
      elementKind: targetName.toLowerCase(),
      locatorType: "css",
      operator: "equals",
      type: "manual",
      value: "",
    },
  };
  if (action === "wait" || action === "waitForTimeout" || action === "waitForElement") {
    const duration = Number(inputValue || options.duration || 1000);
    stepBase.inputValue = String(Number.isFinite(duration) && duration > 0 ? duration : 1000);
    stepBase.options = {
      ...stepBase.options,
      duration: Number(stepBase.inputValue),
      waitCondition: options.state || "visible",
      waitType: action === "waitForElement" ? "soft" : "hard",
    };
    stepBase.target = {
      ...stepBase.target,
      displayName: action === "waitForElement" ? "Element" : "Timer",
      elementKind: action === "waitForElement" ? "web element" : "timer",
    };
  }
  const commandText = commandPhraseForStep(stepBase, command);
  return withLocatorQuality({
    ...stepBase,
    commandText,
    description: commandText,
  });
}

function makeActionStep(action: { id: string; name: string }, count: number): AutomationStep {
  return {
    action: "action",
    commandText: `Action: ${action.name}`,
    description: `Run reusable action ${action.name}`,
    id: makeStepId(),
    inputValue: "",
    locatorCandidates: [],
    options: { stepCount: count },
    target: {
      displayName: action.name,
      elementKind: "reusable action",
      locatorType: "action",
      operator: "equals",
      type: "manual",
      value: action.id,
    },
  };
}

function eventToStep(event: RecorderEvent): AutomationStep | null {
  const candidate = event.recommendedLocator ?? rankedLocators(event.locatorCandidates)[0];
  const ambiguousCandidate = ambiguousLocatorCandidates(event.locatorCandidates)[0];
  const ambiguousQuality =
    ambiguousCandidate?.metadata?.quality && typeof ambiguousCandidate.metadata.quality === "object"
      ? (ambiguousCandidate.metadata.quality as Record<string, unknown>)
      : null;
  const ambiguity =
    event.ambiguity ||
    (ambiguousCandidate
      ? {
          candidate: { strategy: ambiguousCandidate.type || ambiguousCandidate.strategy, value: ambiguousCandidate.value },
          matchCount: Number(ambiguousCandidate.metadata?.matchCount ?? 0),
          previews: Array.isArray(ambiguousCandidate.metadata?.previews)
            ? (ambiguousCandidate.metadata.previews as Array<Record<string, unknown>>)
            : [],
          selectedIndex:
            typeof ambiguousCandidate.metadata?.clickedIndex === "number"
              ? ambiguousCandidate.metadata.clickedIndex
              : undefined,
        }
      : null);
  const eventUrl = event.url || textValue(event.element?.pageUrl);
  const isBrowserDialog =
    event.type === "assert" &&
    (event.verify?.kind === "browser_dialog" ||
      textValue(event.element?.elementKind).toLowerCase() === "browser dialog");
  const targetName = isBrowserDialog ? "Browser dialog" : elementName(event.element, "Element", eventUrl);
  const target = {
    displayName: targetName,
    elementKind: isBrowserDialog ? "browser dialog" : event.element?.elementKind || "web element",
    locatorType: isBrowserDialog ? "dialog" : locatorType(candidate),
    operator: "equals",
    type: candidate && !isBrowserDialog ? ("smart" as const) : ("manual" as const),
    value: candidate?.value || (isBrowserDialog ? "browser_dialog" : ""),
  };
  const capturedStep = {
    command: event.command || event.type,
    createdAt: event.createdAt,
    id: event.id,
    order: event.order,
    params: event.params,
    scenarioId: event.scenarioId,
    updatedAt: event.updatedAt,
  };
  const baseOptions =
    ambiguity?.matchCount && ambiguity.matchCount > 1
      ? {
          ambiguity: {
            candidate: ambiguity.candidate,
            matchCount: ambiguity.matchCount,
            previews: ambiguity.previews ?? [],
            recordedIndex:
              typeof ambiguity.selectedIndex === "number" && ambiguity.selectedIndex >= 0
                ? ambiguity.selectedIndex
                : undefined,
            resolutionMethod: "needs_review",
            selectedIndex: undefined,
            readabilityScore: Number(ambiguousQuality?.readability ?? 0) || undefined,
            stabilityScore: Number(ambiguousQuality?.stability ?? 0) || undefined,
            uniquenessScore: Number(ambiguousQuality?.uniqueness ?? 0) || undefined,
          },
          healed: false,
          healedLocator: null,
          healingReason: "",
          rawValue: event.rawValue,
          domValue: event.domValue,
          pageId: event.pageId || textValue(event.element?.pageId),
          pageUrl: eventUrl,
        }
      : {
          healed: false,
          healedLocator: null,
          healingReason: "",
          rawValue: event.rawValue,
          domValue: event.domValue,
          pageId: event.pageId || textValue(event.element?.pageId),
          pageUrl: eventUrl,
        };
  const base = {
    element: event.element,
    id: event.id || makeStepId(),
    locatorCandidates: rankedLocators(event.locatorCandidates),
    options: { ...baseOptions, capturedStep },
    target,
  };

  if (event.type === "navigation" && event.url) {
    const step = makeNavigateStep(event.url, event.id || makeStepId());
    return {
      ...step,
      element: event.element,
      options: {
        ...step.options,
        pageId: event.pageId || textValue(event.element?.pageId),
        pageUrl: event.url,
      },
    };
  }
  if (event.type === "switchPage") {
    const pageLabel = event.commandLabel || `Switch to ${eventUrl ? "tab" : "window"}`;
    const step = {
      action: "switchPage",
      commandText: pageLabel,
      description: pageLabel,
      element: event.element,
      id: event.id || makeStepId(),
      inputValue: eventUrl,
      locatorCandidates: [],
      options: {
        pageId: event.pageId || textValue(event.element?.pageId),
        pageUrl: eventUrl,
      },
      target: {
        displayName: eventUrl || pageLabel,
        elementKind: event.element?.elementKind || "browser tab",
        locatorType: "page",
        operator: "equals",
        type: "manual" as const,
        value: eventUrl || event.pageId || textValue(event.element?.pageId),
      },
    };
    return { ...step, commandText: readableStepLabel(step) };
  }
  if (event.type === "input") {
    const inputValue = event.rawValue ?? event.value ?? "";
    const step = {
      ...base,
      action: "fill",
      description: `Type "${inputValue || "value"}" into ${targetName}`,
      inputValue,
      options: {
        ...base.options,
        domValue: event.domValue ?? event.value ?? inputValue,
        rawValue: inputValue,
      },
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "select" || event.type === "change") {
    const optionValue = event.value || "";
    const rawValue = event.rawValue || optionValue;
    const step = {
      ...base,
      action: "select",
      description: `Select "${rawValue || "option"}" from ${targetName}`,
      inputValue: optionValue,
      options: {
        ...base.options,
        domValue: event.domValue ?? optionValue,
        rawValue,
      },
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "check" || event.type === "uncheck") {
    const checked = event.type === "check";
    const step = {
      ...base,
      action: checked ? "check" : "uncheck",
      description: `${checked ? "Check" : "Uncheck"} ${targetName}`,
      inputValue: "",
      options: {
        ...base.options,
        domValue: event.domValue ?? String(checked),
        rawValue: event.rawValue ?? String(checked),
      },
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "mouseover" || event.type === "hover") {
    const step = { ...base, action: "hover", description: `Hover over ${targetName}` };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "assert") {
    const assertionType = event.assertionType || event.verify?.assertionType || "visible";
    const cssProperties = event.verify?.cssProperties ?? {};
    const defaultCssProperty =
      typeof cssProperties.color === "string" && cssProperties.color ? "color" : "background-color";
    const expectedValue =
      event.expectedValue ||
      event.verify?.expectedValue ||
      (assertionType === "css_property" ? cssProperties[defaultCssProperty] : "") ||
      "";
    const step = {
      ...base,
      action: "assert",
      assertionType,
      description: event.commandLabel || `Verify ${targetName}`,
      expectedValue,
      inputValue: "",
      options: {
        ...base.options,
        property: assertionType === "css_property" ? defaultCssProperty : undefined,
        operator: "equals",
        verify: event.verify ?? undefined,
      },
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "command") {
    const action = displayAction(event.commandAction || "click");
    const step = {
      ...base,
      action,
      assertionType: event.assertionType || "",
      description: event.commandLabel || `${action} ${targetName}`,
      expectedValue: event.expectedValue || "",
      inputValue: event.value || "",
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "keydown") {
    const step = {
      ...base,
      action: "press",
      description: `Press ${event.key || event.value || "key"} on ${targetName}`,
      inputValue: event.key || event.value || "",
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "press") {
    const step = {
      ...base,
      action: "press",
      description: `Press ${event.value || "key"} on ${targetName}`,
      inputValue: event.value || "",
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "click") {
    const step = { ...base, action: "click", description: `Click ${targetName}` };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  return null;
}

function providerEventToRecorderEvent(event: ProviderSessionEvent): RecorderEvent | null {
  if (event.type !== "record:command") return null;
  const data = event.data ?? {};
  const action = typeof data.action === "string" ? data.action : "";
  const type =
    action === "navigate"
      ? "navigation"
      : action === "switchPage"
        ? "switchPage"
      : action === "fill"
        ? "input"
        : action === "select"
          ? "select"
          : action === "click"
            ? "click"
            : action === "check" || action === "uncheck"
              ? action
            : action;
  if (!["navigation", "switchPage", "input", "select", "click", "check", "uncheck", "assert", "wait", "press"].includes(type)) {
    return null;
  }
  const url =
    typeof data.pageUrl === "string"
      ? data.pageUrl
      : typeof data.frameUrl === "string"
        ? data.frameUrl
        : undefined;
  const value = typeof data.value === "string" ? data.value : undefined;
  const rawValue = typeof data.rawValue === "string" ? data.rawValue : value;
  const domValue = typeof data.domValue === "string" ? data.domValue : value;
  return {
    ambiguity:
      data.ambiguity && typeof data.ambiguity === "object"
        ? (data.ambiguity as RecorderEvent["ambiguity"])
        : null,
    assertionType: typeof data.assertionType === "string" ? data.assertionType : undefined,
    commandLabel: typeof data.commandLabel === "string" ? data.commandLabel : undefined,
    element:
      data.element && typeof data.element === "object"
        ? (data.element as AutomationStep["element"])
        : undefined,
    expectedValue: typeof data.expectedValue === "string" ? data.expectedValue : undefined,
    id: event.id || makeStepId(),
    locatorCandidates: Array.isArray(data.locatorCandidates)
      ? (data.locatorCandidates as AutomationLocatorCandidate[])
      : [],
    pageId: typeof data.pageId === "string" ? data.pageId : undefined,
    timestamp: event.timestamp ? Date.parse(event.timestamp) : Date.now(),
    type,
    url: action === "navigate" ? value || url : url,
    value,
    rawValue,
    domValue,
    verify:
      data.verify && typeof data.verify === "object"
        ? (data.verify as RecorderEvent["verify"])
        : null,
  };
}

function recorderEventsFromProviderEvents(
  events: ProviderSessionEvent[],
  captureAfterMs = 0,
): RecorderEvent[] {
  return events
    .filter((event) => {
      if (event.type !== "record:command") return false;
      if (!captureAfterMs) return true;
      const eventTime = event.timestamp ? Date.parse(event.timestamp) : 0;
      return Number.isFinite(eventTime) && eventTime >= captureAfterMs;
    })
    .map(providerEventToRecorderEvent)
    .filter(Boolean) as RecorderEvent[];
}

function normalizeSteps(steps: unknown): AutomationStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((step): AutomationStep[] => {
    if (!step || typeof step !== "object") return [];
    const item = step as Partial<AutomationStep>;
    if (typeof item.id !== "string" || typeof item.action !== "string") return [];
    const pageUrl = typeof item.options?.pageUrl === "string" ? item.options.pageUrl : undefined;
    const semanticName = semanticTargetName(
      item.element,
      item.target?.displayName || item.target?.value || "Element",
      pageUrl,
    );
    const normalized: AutomationStep = {
      action: displayAction(item.action),
      assertionType: item.assertionType || "",
      commandText: item.commandText || item.description || "",
      description: item.description || item.commandText || displayAction(item.action),
      element: item.element,
      expectedValue: item.expectedValue || "",
      id: item.id,
      inputValue: item.inputValue || "",
      locatorCandidates: rankedLocators(item.locatorCandidates),
      options: item.options || {},
      status: item.status || "pending",
      target:
        item.target && typeof item.target === "object"
          ? {
              displayName:
                isGenericElementLabel(item.target.displayName || "")
                  ? semanticName
                  : item.target.displayName || semanticName,
              elementKind: item.target.elementKind || "web element",
              locatorType: normalizeLocatorType(item.target.locatorType),
              operator: item.target.operator || "equals",
              type: item.target.type === "manual" ? "manual" : "smart",
              value: item.target.value || "",
            }
          : { locatorType: "css", type: "manual", value: "" },
    };
    const commandText = isRawRecorderLabel(normalized.commandText)
      ? readableStepLabel(normalized)
      : normalized.commandText || readableStepLabel(normalized);
    return [withLocatorQuality({ ...normalized, commandText })];
  });
}

function companionOfflineMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "CaseForge Companion is not reachable. Open the desktop app on this computer, wait until it shows Agent running, then try again.";
  }
  if (/unknown caseforge agent route|not found/i.test(message)) {
    return "Your CaseForge Companion is outdated. Install or start the latest Companion, then try again.";
  }
  return message || "CaseForge Companion could not complete the request.";
}

function isInactiveCompanionSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /browser session is not active|companion browser session is not active/i.test(message);
}

async function companionBrowserRequest(
  init?: RequestInit,
  query?: URLSearchParams,
) {
  const path = query
    ? `/automation/browser?${query.toString()}`
    : "/automation/browser";
  try {
    const response = await fetch(`${localAgentUrl}${path}`, init);
    const data = await readJsonResponse<CompanionBrowserResponse>(response, {});
    if (!response.ok) {
      throw new Error(data.error || "CaseForge Companion request failed.");
    }
    return data;
  } catch (error) {
    throw new Error(companionOfflineMessage(error));
  }
}

function companionCommandToRecorderEvent(command: CompanionCommand): RecorderEvent | null {
  const commandType = textValue(command.type);
  const recordedUrl = textValue(command.url || command.meta?.recordedUrl);
  const value = textValue(command.inputValue || command.expectedValue);
  const rawValue = textValue(command.rawValue || command.params?.rawValue || command.meta?.rawValue || value);
  const domValue = textValue(command.domValue || command.params?.value || command.meta?.domValue || value);
  const locator = command.locator;
  const locatorValue = textValue(locator?.value);
  const locatorType = textValue(locator?.strategy) || "css";
  const element = locator
    ? {
        ariaLabel: locator.label,
        elementKind: locator.tagName || "web element",
        labelText: locator.label,
        role: locator.role,
        tag: locator.tagName,
        text: locator.text,
      }
    : undefined;
  const locatorCandidates =
    locator && locatorValue
      ? [
          {
            score: 0.9,
            source: "caseforge-companion",
            type: locatorType,
            value: locatorValue,
          },
        ]
      : [];
  const capturedFields = {
    command: command.command || commandType,
    createdAt: command.meta?.recordedAt as string | number | undefined,
    order: command.order,
    params: command.params,
    scenarioId: command.scenarioId,
    updatedAt: command.meta?.recordedAt as string | number | undefined,
  };

  if (commandType === "navigate" && recordedUrl) {
    return {
      ...capturedFields,
      id: command.id || makeStepId(),
      timestamp: Date.now(),
      type: "navigation",
      url: recordedUrl,
    };
  }

  if (commandType === "fill") {
    return {
      commandLabel: command.description || command.name,
      command: command.command || commandType,
      createdAt: command.meta?.recordedAt as string | number | undefined,
      element,
      id: command.id || makeStepId(),
      locatorCandidates,
      order: command.order,
      params: command.params,
      scenarioId: command.scenarioId,
      timestamp: Date.now(),
      type: "input",
      updatedAt: command.meta?.recordedAt as string | number | undefined,
      url: recordedUrl,
      value,
      rawValue,
      domValue,
    };
  }

  if (commandType === "select") {
    return {
      commandLabel: command.description || command.name,
      command: command.command || commandType,
      createdAt: command.meta?.recordedAt as string | number | undefined,
      element,
      id: command.id || makeStepId(),
      locatorCandidates,
      order: command.order,
      params: command.params,
      scenarioId: command.scenarioId,
      timestamp: Date.now(),
      type: "select",
      updatedAt: command.meta?.recordedAt as string | number | undefined,
      url: recordedUrl,
      value,
      rawValue,
      domValue,
    };
  }

  if (commandType === "check" || commandType === "uncheck") {
    return {
      commandLabel: command.description || command.name,
      command: command.command || commandType,
      createdAt: command.meta?.recordedAt as string | number | undefined,
      element,
      id: command.id || makeStepId(),
      locatorCandidates,
      order: command.order,
      params: command.params,
      scenarioId: command.scenarioId,
      timestamp: Date.now(),
      type: commandType,
      updatedAt: command.meta?.recordedAt as string | number | undefined,
      url: recordedUrl,
      value,
      rawValue,
      domValue,
    };
  }

  if (commandType === "press") {
    return {
      ...capturedFields,
      commandLabel: command.description || command.name,
      element,
      id: command.id || makeStepId(),
      key: command.key,
      locatorCandidates,
      timestamp: Date.now(),
      type: "press",
      url: recordedUrl,
      value: command.key,
    };
  }

  if (commandType === "hover") {
    return {
      commandLabel: command.description || command.name,
      element,
      id: command.id || makeStepId(),
      locatorCandidates,
      timestamp: Date.now(),
      type: "hover",
      url: recordedUrl,
    };
  }

  if (commandType.startsWith("assert")) {
    const assertionType =
      commandType === "assert-text"
        ? "text_contains"
        : commandType === "assert-image"
          ? "image_loaded"
          : commandType === "assert-label"
            ? "label"
            : commandType === "assert-focus"
              ? "focus"
              : "visible";
    return {
      assertionType,
      commandLabel: command.description || command.name,
      element,
      expectedValue: textValue(command.expectedValue || value),
      id: command.id || makeStepId(),
      locatorCandidates,
      timestamp: Date.now(),
      type: "assert",
      url: recordedUrl,
      value,
    };
  }

  if (commandType === "click") {
    return {
      ...capturedFields,
      commandLabel: command.description || command.name,
      element,
      id: command.id || makeStepId(),
      locatorCandidates,
      timestamp: Date.now(),
      type: "click",
      url: recordedUrl,
    };
  }

  return null;
}

function companionCommandsToRecorderEvents(commands: CompanionCommand[] = []) {
  return commands.map(companionCommandToRecorderEvent).filter(Boolean) as RecorderEvent[];
}

function mergeStepsById(steps: AutomationStep[]) {
  const seen = new Set<string>();
  return steps.filter((step) => {
    if (seen.has(step.id)) return false;
    seen.add(step.id);
    return true;
  });
}

function withoutAdjacentDuplicateNavigations(steps: AutomationStep[]) {
  const nextSteps: AutomationStep[] = [];
  for (const step of steps) {
    const currentUrl = navigationUrlForStep(step);
    const previousUrl = nextSteps.length ? navigationUrlForStep(nextSteps[nextSteps.length - 1]) : null;
    if (currentUrl && previousUrl && currentUrl === previousUrl) continue;
    nextSteps.push(step);
  }
  return nextSteps;
}

function cloneAutomationSteps(steps: AutomationStep[]) {
  return JSON.parse(JSON.stringify(steps)) as AutomationStep[];
}

function timelineStepsSignature(steps: AutomationStep[]) {
  return JSON.stringify(steps);
}

function makeParameterId(name: string) {
  return `param-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now().toString(36)}`;
}

function makeTestCaseId() {
  return `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function parameterNamesFromText(value?: string) {
  const names = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value || ""))) {
    names.add(match[1]);
  }
  return names;
}

function parameterToken(name: string) {
  return `{{${name}}}`;
}

function variablePickerSourcePriority(source: VariablePickerItem["source"]) {
  if (source === "commandOutput") return 0;
  if (source === "logicVariable") return 1;
  return 2;
}

function logicVariableToken(name: string) {
  const clean = name.startsWith("$") ? name.slice(1) : name;
  return `{{$${clean}}}`;
}

function isLogicIdeCommand(action: string) {
  return action === "conditionalBlock" || action === "loopBlock";
}

function defaultLogicDsl(action: string) {
  if (action === "loopBlock") {
    return [
      "for item in {{$items}} {",
      "  log \"Item: \" + item",
      "}",
    ].join("\n");
  }
  return [
    "if {{$viewport}} == \"desktop\" {",
    "  log \"Running desktop flow\"",
    "} else if {{$viewport}} == \"phone\" {",
    "  log \"Running phone flow\"",
    "} else {",
    "  log \"Running fallback flow\"",
    "}",
  ].join("\n");
}

function logicIdeTemplates(action: string) {
  const templates = [
    {
      label: "Desktop / Phone",
      value: [
        'if {{$viewport}} == "desktop" {',
        '  log "Running desktop flow"',
        '} else if {{$viewport}} == "phone" {',
        '  log "Running phone flow"',
        '} else {',
        '  log "Running tablet/fallback flow"',
        '}',
      ].join("\n"),
    },
    {
      label: "Staging / Prod",
      value: [
        'if {{$env}} == "staging" {',
        '  log "Staging flow"',
        '} else if {{$env}} == "production" {',
        '  log "Production-safe flow"',
        '} else {',
        '  log "Unknown environment"',
        '}',
      ].join("\n"),
    },
    {
      label: "Nested If",
      value: [
        'if {{$viewport}} == "desktop" {',
        '  if {{$env}} == "staging" {',
        '    log "Desktop staging"',
        '  } else {',
        '    log "Desktop non-staging"',
        '  }',
        '} else {',
        '  log "Non-desktop flow"',
        '}',
      ].join("\n"),
    },
    {
      label: "For List",
      value: [
        "for item in {{$items}} {",
        '  log "Item: " + item',
        "}",
      ].join("\n"),
    },
    {
      label: "For Count",
      value: [
        "for item in {{$count}} {",
        '  log "Item: " + item',
        "}",
      ].join("\n"),
    },
    {
      label: "Loop Table Rows",
      value: [
        "for row in {{$tableData.tableData}} {",
        '  log "Row: " + row',
        "}",
      ].join("\n"),
    },
    {
      label: "Count + Index",
      value: [
        "repeat {{$productCount}} {",
        '  getText css(".product-card") at {{$loop.number}} as productText',
        '  log "Product: " + productText',
        "}",
      ].join("\n"),
    },
    {
      label: "Repeat Retry",
      value: [
        "repeat 3 {",
        '  log "Retry #" + {{$loop.number}}',
        "  wait 1000",
        "}",
      ].join("\n"),
    },
    {
      label: "Locator Flow",
      value: [
        'if {{$viewport}} == "desktop" {',
        '  click css("#desktop-menu")',
        '} else {',
        '  click xpath(\'//button[contains(., "Menu")]\')',
        '}',
      ].join("\n"),
    },
  ];
  return action === "loopBlock"
    ? templates.filter((template) => ["For List", "For Count", "Loop Table Rows", "Count + Index", "Repeat Retry", "Nested If"].includes(template.label))
    : templates;
}

const locatorLoopActionOptions: Array<{ label: string; value: LocatorLoopAction }> = [
  { label: "Get text", value: "getText" },
  { label: "Get attribute", value: "getAttribute" },
  { label: "Get property", value: "getProperty" },
  { label: "Click each", value: "click" },
  { label: "Hover each", value: "hover" },
  { label: "Verify visible", value: "verifyVisible" },
];

const locatorLoopBuilderActionOptions: Array<{
  group: "Collection" | "Debug" | "Web";
  label: string;
  value: LocatorLoopBuilderActionKind;
}> = [
  { group: "Web", label: "Get text", value: "getText" },
  { group: "Web", label: "Get attribute", value: "getAttribute" },
  { group: "Web", label: "Get property", value: "getProperty" },
  { group: "Web", label: "Click", value: "click" },
  { group: "Web", label: "Hover", value: "hover" },
  { group: "Web", label: "Verify visible", value: "verifyVisible" },
  { group: "Web", label: "Wait", value: "wait" },
  { group: "Collection", label: "Create list", value: "createList" },
  { group: "Collection", label: "Add value to list", value: "addToList" },
  { group: "Collection", label: "Clear list", value: "clearList" },
  { group: "Collection", label: "Join list", value: "joinList" },
  { group: "Collection", label: "Unique list", value: "uniqueList" },
  { group: "Collection", label: "Sort list", value: "sortList" },
  { group: "Collection", label: "Count list items", value: "countListItems" },
  { group: "Collection", label: "Get list item", value: "getListItem" },
  { group: "Debug", label: "Log message", value: "log" },
];

const locatorLoopBuilderOptionGroups = ["Web", "Collection", "Debug"] as const;

function isLocatorLoopWebAction(action: LocatorLoopBuilderActionKind) {
  return ["click", "getAttribute", "getProperty", "getText", "hover", "verifyVisible"].includes(action);
}

const locatorLoopAttributeSuggestions = [
  "class",
  "href",
  "src",
  "alt",
  "title",
  "aria-label",
  "aria-expanded",
  "aria-checked",
  "role",
  "id",
  "name",
  "value",
  "data-testid",
];

const locatorLoopPropertySuggestions = [
  "checked",
  "disabled",
  "value",
  "innerText",
  "textContent",
  "href",
  "src",
];

function cleanLogicVariableName(value: string, fallback: string) {
  const clean = String(value || "")
    .trim()
    .replace(/^\{\{\$?/, "")
    .replace(/\}\}$/, "")
    .replace(/^\$/, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "");
  return clean || fallback;
}

function locatorLoopDefaultOutput(action: LocatorLoopAction) {
  if (action === "getAttribute") return "itemAttribute";
  if (action === "getProperty") return "itemProperty";
  return "itemText";
}

function makeLocatorLoopAction(
  action: LocatorLoopBuilderActionKind = "getText",
  overrides: Partial<LocatorLoopBuilderAction> = {},
): LocatorLoopBuilderAction {
  const defaultOutput =
    action === "getAttribute"
      ? "itemAttribute"
      : action === "getProperty"
        ? "itemProperty"
        : action === "joinList"
          ? "joinedList"
          : action === "uniqueList"
            ? "uniqueList"
            : action === "sortList"
              ? "sortedList"
              : action === "countListItems"
                ? "listCount"
                : action === "getListItem"
                  ? "listItem"
                  : "itemText";
  return {
    action,
    attributeName: "class",
    createLocatorVariable: false,
    fieldName: "",
    id: `loop-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    listVariable: "items",
    logMessage: action === "log" ? '"List: " + items' : "",
    locatorType: "xpath",
    locatorValue: "",
    locatorVariable: isLocatorLoopWebAction(action) ? "locator" : "",
    outputVariable: defaultOutput,
    propertyName: "innerText",
    separator: ", ",
    sortOrder: "asc",
    valueExpression: action === "addToList" ? "itemText" : action === "getListItem" ? "0" : "",
    waitMs: action === "wait" ? "1000" : "",
    ...overrides,
  };
}

function locatorLoopBuilderActions(config: LocatorLoopBuilderState) {
  return config.loopActions.length
    ? config.loopActions
    : [
        makeLocatorLoopAction(config.action, {
          attributeName: config.attributeName,
          outputVariable: config.outputVariable,
          propertyName: config.propertyName,
          waitMs: config.waitMs,
        }),
      ];
}

function locatorLoopPhaseKey(phase: LocatorLoopBuilderPhase) {
  return phase === "before" ? "beforeActions" : phase === "after" ? "afterActions" : "loopActions";
}

function logicStringLiteral(value: string) {
  return JSON.stringify(String(value || ""));
}

function addLogicVariable(
  variables: Map<string, string>,
  name: string | undefined,
  detail: string,
) {
  const clean = cleanLogicVariableName(String(name || ""), "");
  if (!clean || clean.includes(".")) return;
  if (!variables.has(clean)) variables.set(clean, detail);
}

function extractLogicDslVariables(value: string) {
  const variables = new Map<string, string>();
  const lines = String(value || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    const setMatch = line.match(/^set\s+([a-zA-Z_][\w.]*)\s*=\s*(.+)$/);
    if (setMatch) {
      addLogicVariable(
        variables,
        setMatch[1],
        /^\[\s*\]$/.test(setMatch[2].trim()) ? "Logic list variable" : "Logic variable",
      );
      continue;
    }

    const addToListMatch = line.match(/^addToList\s+([a-zA-Z_][\w.]*)\b/);
    if (addToListMatch) {
      addLogicVariable(variables, addToListMatch[1], "Logic list variable");
      continue;
    }

    const clearListMatch = line.match(/^clearList\s+([a-zA-Z_][\w.]*)\b/);
    if (clearListMatch) {
      addLogicVariable(variables, clearListMatch[1], "Logic list variable");
      continue;
    }

    const webOutputMatch = line.match(/^(getText|getAttribute|getProperty)\b[\s\S]*\bas\s+([a-zA-Z_][\w.]*)\s*$/);
    if (webOutputMatch) {
      addLogicVariable(variables, webOutputMatch[2], `Logic output from ${webOutputMatch[1]}`);
      continue;
    }

    const collectionMatch = line.match(
      /^(countListItems|getListItem|joinList|sortList|uniqueList)\s+([a-zA-Z_][\w.]*)(?:[\s\S]*\bas\s+([a-zA-Z_][\w.]*))?\s*$/,
    );
    if (collectionMatch) {
      const command = collectionMatch[1];
      const source = collectionMatch[2];
      const target = collectionMatch[3] || source;
      const detail =
        command === "countListItems"
          ? "Logic count output"
          : command === "joinList"
            ? "Logic text output"
            : command === "getListItem"
              ? "Logic item output"
              : "Logic list output";
      addLogicVariable(variables, target, detail);
    }
  }
  return Array.from(variables.entries()).map(([name, detail]) => ({ detail, name }));
}

function logicExpressionValue(value: string, fallback = "\"\"") {
  const text = textValue(value);
  return text || fallback;
}

function buildLocatorLoopActionDsl(
  action: LocatorLoopBuilderAction,
  phase: LocatorLoopBuilderPhase,
) {
  const lines: string[] = [];
  const outputVariable = cleanLogicVariableName(action.outputVariable, "itemText");
  const listVariable = cleanLogicVariableName(action.listVariable, "items");
  const locatorVariable = cleanLogicVariableName(action.locatorVariable, "locator");
  const indexedLocator = `${logicVariableToken(locatorVariable)} at current index`;
  const waitMs = Math.max(0, Number(action.waitMs || 0));
  const actionLabel =
    locatorLoopBuilderActionOptions.find((option) => option.value === action.action)?.label ||
    action.action;

  if (action.action === "getText") {
    lines.push(`getText ${indexedLocator} as ${outputVariable}`);
  } else if (action.action === "getAttribute") {
    const attributeName = textValue(action.attributeName) || "class";
    lines.push(`getAttribute ${indexedLocator} "${attributeName.replace(/"/g, '\\"')}" as ${outputVariable}`);
  } else if (action.action === "getProperty") {
    const propertyName = textValue(action.propertyName) || "innerText";
    lines.push(`getProperty ${indexedLocator} "${propertyName.replace(/"/g, '\\"')}" as ${outputVariable}`);
  } else if (action.action === "click") {
    lines.push(`click ${indexedLocator}`);
  } else if (action.action === "hover") {
    lines.push(`hover ${indexedLocator}`);
  } else if (action.action === "verifyVisible") {
    lines.push(`verifyVisible ${indexedLocator}`);
  } else if (action.action === "wait") {
    lines.push(`wait ${waitMs || 1000}`);
  } else if (action.action === "log") {
    lines.push(`log ${logicExpressionValue(action.logMessage, logicStringLiteral(`${phase} log`))}`);
  } else if (action.action === "createList") {
    lines.push(`set ${listVariable} = []`);
  } else if (action.action === "clearList") {
    lines.push(`clearList ${listVariable}`);
  } else if (action.action === "addToList") {
    lines.push(`addToList ${listVariable} ${logicExpressionValue(action.valueExpression, "itemText")}`);
  } else if (action.action === "joinList") {
    lines.push(`joinList ${listVariable} ${logicStringLiteral(action.separator || ", ")} as ${outputVariable}`);
  } else if (action.action === "uniqueList") {
    const fieldName = textValue(action.fieldName);
    lines.push(`uniqueList ${listVariable}${fieldName ? ` field ${logicStringLiteral(fieldName)}` : ""} as ${outputVariable}`);
  } else if (action.action === "sortList") {
    const fieldName = textValue(action.fieldName);
    lines.push(`sortList ${listVariable} ${action.sortOrder || "asc"}${fieldName ? ` field ${logicStringLiteral(fieldName)}` : ""} as ${outputVariable}`);
  } else if (action.action === "countListItems") {
    lines.push(`countListItems ${listVariable} as ${outputVariable}`);
  } else if (action.action === "getListItem") {
    lines.push(`getListItem ${listVariable} ${logicExpressionValue(action.valueExpression, "0")} as ${outputVariable}`);
  }

  if (waitMs > 0 && action.action !== "wait") lines.push(`wait ${waitMs}`);
  if (!lines.length) lines.push(`log ${logicStringLiteral(`${actionLabel} configured`)}`);
  return lines;
}

function buildLocatorLoopDsl(config: LocatorLoopBuilderState) {
  const countVariable = cleanLogicVariableName(config.countVariable, "count");
  const countToken = logicVariableToken(countVariable);
  const lines: string[] = [];
  if (config.createCountVariable) {
    const countValue = textValue(config.countValue) || "0";
    lines.push(`set ${countVariable} = ${Number.isFinite(Number(countValue)) ? String(Number(countValue)) : logicStringLiteral(countValue)}`);
  }
  const declaredLocators = new Set<string>();
  for (const action of locatorLoopBuilderActions(config)) {
    if (!isLocatorLoopWebAction(action.action) || !action.createLocatorVariable) continue;
    const locatorVariable = cleanLogicVariableName(action.locatorVariable, "locator");
    if (declaredLocators.has(locatorVariable)) continue;
    const locatorValue = textValue(action.locatorValue) || (action.locatorType === "xpath" ? "//button" : "button");
    lines.push(`set ${locatorVariable} = ${logicStringLiteral(locatorValue)}`);
    declaredLocators.add(locatorVariable);
  }
  if (lines.length) lines.push("");
  for (const action of config.beforeActions) {
    lines.push(...buildLocatorLoopActionDsl(action, "before"));
  }
  if (config.beforeActions.length) lines.push("");
  lines.push(`for item in ${countToken} {`);
  for (const action of locatorLoopBuilderActions(config)) {
    for (const line of buildLocatorLoopActionDsl(action, "inside")) {
      lines.push(`  ${line}`);
    }
    if (config.logEach && ["getText", "getAttribute", "getProperty"].includes(action.action)) {
      const outputVariable = cleanLogicVariableName(action.outputVariable, "itemText");
      lines.push(`  log "Item " + item + ": " + ${outputVariable}`);
    }
  }
  lines.push("}");
  if (config.afterActions.length) {
    lines.push("");
    for (const action of config.afterActions) {
      lines.push(...buildLocatorLoopActionDsl(action, "after"));
    }
  }
  return lines.join("\n");
}

function logicDslValue(step?: AutomationStep | null) {
  return textValue(step?.options?.dsl) || defaultLogicDsl(displayAction(step?.action || "conditionalBlock"));
}

function logicSuggestionTrigger(value: string, cursor: number): LogicEditorSuggestState {
  const before = value.slice(0, cursor);
  const variableMatch = before.match(/\{\{\$([a-zA-Z0-9_.-]*)$/);
  if (variableMatch && variableMatch.index !== undefined) {
    return {
      cursor,
      end: cursor,
      query: variableMatch[1] || "",
      start: variableMatch.index,
    };
  }
  const helperMatch = before.match(/\b(css|xpath|text|role|testid|label)\(\"([^"]*)$/);
  if (helperMatch && helperMatch.index !== undefined) {
    return {
      cursor,
      end: cursor,
      query: helperMatch[2] || "",
      start: helperMatch.index,
    };
  }
  const commandLocatorMatch = before.match(/\b(click|hover|type|fill|getText|getAttribute|getProperty|verifyVisible)\s+$/);
  if (commandLocatorMatch && commandLocatorMatch.index !== undefined) {
    return {
      cursor,
      end: cursor,
      query: "",
      start: cursor,
    };
  }
  return null;
}

function logicSuggestionSourceLabel(source: LogicEditorSuggestion["source"]) {
  if (source === "commandOutput") return "OUTPUT";
  if (source === "logicVariable") return "LOGIC";
  if (source === "scenarioParameter") return "PARAM";
  if (source === "builtin") return "BUILTIN";
  if (source === "locator") return "LOCATOR";
  return "SNIP";
}

function logicSuggestionSourcePriority(source: LogicEditorSuggestion["source"]) {
  if (source === "commandOutput") return 0;
  if (source === "logicVariable") return 1;
  if (source === "scenarioParameter") return 2;
  if (source === "builtin") return 3;
  if (source === "locator") return 4;
  return 4;
}

function stripLogicDslStrings(value: string) {
  return value.replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, "\"\"");
}

function stripLogicDslVariables(value: string) {
  return value.replace(/\{\{[^}]*\}\}/g, "__variable__");
}

function logicIssue(line: number, column: number, message: string) {
  return `Line ${line}, column ${Math.max(1, column)}: ${message}`;
}

function validateLogicDsl(value: string): LogicDslValidation {
  const issues: string[] = [];
  let depth = 0;
  let branchCount = 0;
  let ifCount = 0;
  let elseIfCount = 0;
  let forCount = 0;
  let repeatCount = 0;
  let commandCount = 0;
  const lines = value.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("//")) return;
    const clean = stripLogicDslVariables(stripLogicDslStrings(trimmed));
    const opens = (clean.match(/\{/g) || []).length;
    const closes = (clean.match(/\}/g) || []).length;
    if (closes > depth + opens) {
      issues.push(logicIssue(lineNumber, Math.max(1, rawLine.indexOf("}") + 1), "closing brace has no matching opening brace."));
    }
    depth += opens - closes;

    const statement = clean.replace(/[{}]/g, "").trim();
    const column = Math.max(1, rawLine.indexOf(trimmed) + 1);
    if (!statement) return;
    if (/^if\s+.+/.test(statement)) {
      ifCount += 1;
      branchCount += 1;
      if (!clean.includes("{")) issues.push(logicIssue(lineNumber, column, "if statement needs an opening brace."));
      return;
    }
    if (/^else\s+if\s+.+/.test(statement)) {
      elseIfCount += 1;
      branchCount += 1;
      if (!clean.includes("{")) issues.push(logicIssue(lineNumber, column, "else if statement needs an opening brace."));
      return;
    }
    if (/^else$/.test(statement)) {
      branchCount += 1;
      if (!clean.includes("{")) issues.push(logicIssue(lineNumber, column, "else statement needs an opening brace."));
      return;
    }
    if (/^for\s+[a-zA-Z_][\w]*\s+in\s+.+/.test(statement)) {
      forCount += 1;
      if (!clean.includes("{")) issues.push(logicIssue(lineNumber, column, "for loop needs an opening brace."));
      return;
    }
    if (/^repeat\s+.+/.test(statement)) {
      repeatCount += 1;
      if (!clean.includes("{")) issues.push(logicIssue(lineNumber, column, "repeat loop needs an opening brace."));
      return;
    }
    if (/^(addToList|clearList|countListItems|getListItem|joinList|log|sortList|uniqueList|wait|break|continue)\b/.test(statement)) {
      commandCount += 1;
      return;
    }
    if (/^(click|hover|type|fill|getText|getAttribute|getProperty|verifyVisible)\s+.+/.test(statement)) {
      commandCount += 1;
      return;
    }
    if (/^set\s+[a-zA-Z_][\w.]*\s*=/.test(statement)) {
      commandCount += 1;
      return;
    }
    if (/^assert\s+.+/.test(statement)) {
      commandCount += 1;
      return;
    }
    issues.push(logicIssue(lineNumber, column, `unsupported statement "${trimmed}".`));
  });
  if (depth > 0) issues.push(`Missing ${depth} closing brace${depth === 1 ? "" : "s"}.`);
  const parts = [];
  if (ifCount) {
    parts.push(`This will create ${ifCount} IF block${ifCount === 1 ? "" : "s"} with ${branchCount} branch${branchCount === 1 ? "" : "es"}.`);
  }
  if (forCount) parts.push(`${forCount} for-loop${forCount === 1 ? "" : "s"}.`);
  if (repeatCount) parts.push(`${repeatCount} repeat-loop${repeatCount === 1 ? "" : "s"}.`);
  if (commandCount) parts.push(`${commandCount} command${commandCount === 1 ? "" : "s"}.`);
  return {
    branchCount,
    commandCount,
    elseIfCount,
    forCount,
    ifCount,
    issues,
    repeatCount,
    summary: parts.length ? parts.join(" ") : "No executable logic yet.",
    valid: issues.length === 0,
  };
}

function exactParameterNameFromText(value?: string) {
  const match = textValue(value).match(/^\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}$/);
  return match?.[1] ?? "";
}

function optionRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function phaseValueSource(step: AutomationStep): StepParameterValueType {
  const source = textValue(step.options?.valueSource || step.options?.valueType);
  if (valueSourceOptions.some((option) => option.value === source)) {
    return source as StepParameterValueType;
  }
  return exactParameterNameFromText(step.inputValue) ? "testData" : "static";
}

function phaseValueReference(step: AutomationStep) {
  const source = phaseValueSource(step);
  if (source === "static") return step.inputValue || "";
  if (source === "testData") {
    return textValue(step.options?.parameterName) || exactParameterNameFromText(step.inputValue);
  }
  return textValue(step.options?.valueReference || step.inputValue);
}

function phaseExpression(step: AutomationStep) {
  return textValue(step.options?.expression || step.options?.conditionExpression);
}

function phaseOutputVariable(step: AutomationStep) {
  return textValue(step.options?.outputVariableName);
}

function phaseFailureBehavior(step: AutomationStep) {
  const behavior = optionRecord(step.options?.failureBehavior);
  return {
    continueOnFailure: Boolean(behavior.continueOnFailure),
    recoveryActionId: textValue(behavior.recoveryActionId),
    retryCount: Number(behavior.retryCount ?? 0) || 0,
    screenshotOnFailure: behavior.screenshotOnFailure !== false,
    stopOnFailure: behavior.stopOnFailure !== false && !behavior.continueOnFailure,
    timeoutMs: Number(behavior.timeoutMs ?? step.options?.timeoutMs ?? 30000) || 30000,
  };
}

function phaseParameterPreview(step: AutomationStep) {
  const source = phaseValueSource(step);
  const reference = phaseValueReference(step);
  if (source === "static") return reference ? "Resolved immediately" : "No value set";
  if (source === "testData") return reference ? `Resolves from {{${reference}}}` : "Choose a test data parameter";
  if (source === "secret") return reference ? "Resolved from secrets at runtime" : "Enter a secret reference";
  if (source === "environment") return reference ? "Resolved from selected run environment" : "Enter an environment key";
  if (source === "previousStepOutput") return reference ? "Resolved from a previous step output" : "Enter an output variable";
  if (source === "expression") return phaseExpression(step) ? "Evaluated safely at runtime" : "Enter a safe expression";
  if (source === "generated") return reference ? "Generated at runtime" : "Enter a generated value type";
  return "Resolved at runtime";
}

function inferParameterNamesFromSteps(steps: AutomationStep[]) {
  const names = new Set<string>();
  for (const step of steps) {
    [
      step.commandText,
      step.description,
      step.inputValue,
      step.expectedValue,
      step.target?.value,
      step.target?.displayName,
    ].forEach((value) => {
      for (const name of parameterNamesFromText(value)) names.add(name);
    });
  }
  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function scenarioMetadataRecord(scenario?: AutomationScenario | null) {
  return scenario?.metadata && typeof scenario.metadata === "object" ? scenario.metadata : {};
}

function normalizeScenarioParameters(value: unknown): ScenarioParameter[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): ScenarioParameter[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = textValue(record.name).replace(/[{}\s]/g, "");
    if (!name || seen.has(name)) return [];
    seen.add(name);
    const type =
      record.type === "number" ||
      record.type === "boolean" ||
      record.type === "secret" ||
      record.type === "enum"
        ? record.type
        : "string";
    return [
      {
        defaultValue: typeof record.defaultValue === "string" ? record.defaultValue : "",
        id: typeof record.id === "string" ? record.id : makeParameterId(name),
        name,
        required: record.required !== false,
        type,
      },
    ];
  });
}

function normalizeScenarioTestCases(value: unknown): ScenarioTestCase[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): ScenarioTestCase[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const data =
      record.data && typeof record.data === "object" && !Array.isArray(record.data)
        ? Object.fromEntries(
            Object.entries(record.data as Record<string, unknown>).map(([key, cell]) => [
              key,
              String(cell ?? ""),
            ]),
          )
        : {};
    return [
      {
        data,
        description: typeof record.description === "string" ? record.description : "",
        enabled: record.enabled !== false,
        expectedResult: typeof record.expectedResult === "string" ? record.expectedResult : "",
        lastStatus:
          record.lastStatus === "passed" || record.lastStatus === "failed"
            ? record.lastStatus
            : "notRun",
        id: typeof record.id === "string" ? record.id : makeTestCaseId(),
        name: textValue(record.name) || `Test Case ${index + 1}`,
        priority:
          record.priority === "low" ||
          record.priority === "high" ||
          record.priority === "critical"
            ? record.priority
            : "medium",
        tags: Array.isArray(record.tags)
          ? record.tags.map((tag) => textValue(tag)).filter(Boolean)
          : typeof record.tags === "string"
            ? record.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
            : [],
      },
    ];
  });
}

function mergeParametersWithInferred(
  parameters: ScenarioParameter[],
  inferredNames: string[],
) {
  const byName = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  for (const name of inferredNames) {
    if (!byName.has(name)) {
      byName.set(name, {
        defaultValue: "",
        id: makeParameterId(name),
        name,
        required: true,
        type: "string",
      });
    }
  }
  return Array.from(byName.values());
}

function defaultParameterData(parameters: ScenarioParameter[]) {
  return Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter.defaultValue ?? ""]));
}

function dataForTestCase(testCase: ScenarioTestCase | null, parameters: ScenarioParameter[]) {
  return Object.fromEntries(
    parameters.map((parameter) => {
      const testCaseValue = testCase?.data?.[parameter.name];
      const value =
        typeof testCaseValue === "string" && testCaseValue.trim().length
          ? testCaseValue
          : parameter.defaultValue ?? "";
      return [parameter.name, value];
    }),
  );
}

function normalizedTestDataDrafts(
  parameterDrafts: ScenarioParameter[],
  testCaseDrafts: ScenarioTestCase[],
) {
  const parameterNames = new Set<string>();
  const parameters = parameterDrafts.flatMap((parameter): ScenarioParameter[] => {
    const name = parameter.name.trim().replace(/[{}\s]/g, "");
    if (!name || parameterNames.has(name)) return [];
    parameterNames.add(name);
    return [{ ...parameter, id: parameter.id || makeParameterId(name), name }];
  });
  const testCases = testCaseDrafts.flatMap((testCase, index): ScenarioTestCase[] => {
    const name = testCase.name.trim();
    if (!name) return [];
    const allowedData = Object.fromEntries(
      parameters.map((parameter) => {
        const testCaseValue = testCase.data?.[parameter.name];
        const value =
          typeof testCaseValue === "string" && testCaseValue.trim().length
            ? testCaseValue
            : parameter.defaultValue ?? "";
        return [parameter.name, value];
      }),
    );
    return [
      {
        ...testCase,
        data: allowedData,
        id: testCase.id || makeTestCaseId(),
        name: name || `Test Case ${index + 1}`,
        priority: testCase.priority || "medium",
        tags: testCase.tags ?? [],
      },
    ];
  });
  return { parameters, testCases };
}

function testCaseMatchesRunScope(testCase: ScenarioTestCase, config: RunConfig) {
  if (!testCase.enabled) return false;
  if (config.runScope === "tag") {
    const tag = config.scopeTag.trim().toLowerCase();
    if (!tag) return true;
    return (testCase.tags ?? []).some((item) => item.toLowerCase() === tag);
  }
  if (config.runScope === "priority") {
    if (config.scopePriority === "all") return true;
    return testCase.priority === config.scopePriority;
  }
  if (config.runScope === "failedOnly") {
    return testCase.lastStatus === "failed";
  }
  return true;
}

function substituteTemplate(
  value: string | undefined,
  data: Record<string, string>,
  preserveNames = new Set<string>(),
) {
  return String(value ?? "").replace(/\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g, (match, name: string) =>
    preserveNames.has(name) || !Object.prototype.hasOwnProperty.call(data, name)
      ? match
      : data[name] ?? "",
  );
}

function substituteJavaScriptTemplate(
  value: string | undefined,
  data: Record<string, string>,
  preserveNames = new Set<string>(),
) {
  return String(value ?? "").replace(/\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g, (match, name: string) =>
    preserveNames.has(name)
      ? match
      : Object.prototype.hasOwnProperty.call(data, name)
      ? JSON.stringify(data[name] ?? "")
      : match,
  );
}

function substituteUnknown(
  value: unknown,
  data: Record<string, string>,
  preserveNames = new Set<string>(),
): unknown {
  if (typeof value === "string") return substituteTemplate(value, data, preserveNames);
  if (Array.isArray(value)) return value.map((item) => substituteUnknown(item, data, preserveNames));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        substituteUnknown(item, data, preserveNames),
      ]),
    );
  }
  return value;
}

function substituteStepParameters(
  step: AutomationStep,
  data: Record<string, string>,
  preserveNames = new Set<string>(),
): AutomationStep {
  if (displayAction(step.action) === "runJavaScriptSnippet") {
    const options = substituteUnknown(step.options ?? {}, data, preserveNames) as Record<string, unknown>;
    return {
      ...step,
      commandText: substituteTemplate(step.commandText, data, preserveNames),
      description: substituteTemplate(step.description, data, preserveNames),
      expectedValue: substituteTemplate(step.expectedValue, data, preserveNames),
      inputValue: substituteJavaScriptTemplate(step.inputValue, data, preserveNames),
      locatorCandidates: Array.isArray(step.locatorCandidates)
        ? step.locatorCandidates.map((candidate) => ({
            ...candidate,
            value: substituteTemplate(candidate.value, data, preserveNames),
          }))
        : step.locatorCandidates,
      options: {
        ...options,
        script: substituteJavaScriptTemplate(
          typeof step.options?.script === "string" ? step.options.script : "",
          data,
          preserveNames,
        ),
      },
      target: substituteUnknown(step.target, data, preserveNames) as AutomationStep["target"],
    };
  }
  return {
    ...step,
    commandText: substituteTemplate(step.commandText, data, preserveNames),
    description: substituteTemplate(step.description, data, preserveNames),
    expectedValue: substituteTemplate(step.expectedValue, data, preserveNames),
    inputValue: substituteTemplate(step.inputValue, data, preserveNames),
    locatorCandidates: Array.isArray(step.locatorCandidates)
      ? step.locatorCandidates.map((candidate) => ({
          ...candidate,
          value: substituteTemplate(candidate.value, data, preserveNames),
        }))
      : step.locatorCandidates,
    options: substituteUnknown(step.options ?? {}, data, preserveNames) as Record<string, unknown>,
    target: substituteUnknown(step.target, data, preserveNames) as AutomationStep["target"],
  };
}

function substituteStepsParameters(
  steps: AutomationStep[],
  data: Record<string, string>,
  preserveNames = new Set<string>(),
) {
  return steps.map((step) => substituteStepParameters(step, data, preserveNames));
}

async function readJsonResponse<T>(response: Response, fallback: T): Promise<T> {
  const text = await response.text();
  const path = (() => {
    try {
      return new URL(response.url).pathname || "request";
    } catch {
      return "request";
    }
  })();
  if (!text.trim()) {
    if (!response.ok) {
      throw new Error(
        `The automation service returned an empty ${response.status} response from ${path}. Your commands were not changed.`,
      );
    }
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const responseStart = text.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(
      response.ok
        ? `The automation service returned an invalid response from ${path}.`
        : `The automation service returned ${response.status} from ${path}. Your commands were not changed. Response started with: ${responseStart}`,
    );
  }
}

function responseStatusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function isNotFoundStatusError(error: unknown) {
  return (
    error instanceof Error &&
    typeof (error as Error & { status?: unknown }).status === "number" &&
    (error as Error & { status?: number }).status === 404
  );
}

function locatorText(locator?: Record<string, unknown> | null) {
  if (!locator) return "none";
  const type = typeof locator.type === "string" ? locator.type : typeof locator.strategy === "string" ? locator.strategy : "locator";
  const value = typeof locator.value === "string" ? locator.value : "";
  return value ? `${type}: ${value}` : type;
}

function pendingAmbiguityFromEvent(sessionId: string, event: ProviderSessionEvent): PendingAmbiguity {
  const data = event.data ?? {};
  return {
    actionId: typeof data.actionId === "string" ? data.actionId : null,
    description: typeof data.description === "string" ? data.description : "",
    index: typeof data.index === "number" ? data.index : undefined,
    locator:
      data.locator && typeof data.locator === "object"
        ? (data.locator as Record<string, unknown>)
        : null,
    matchCount: typeof data.matchCount === "number" ? data.matchCount : undefined,
    message: typeof data.message === "string" ? data.message : "",
    previews: Array.isArray(data.previews)
      ? (data.previews.filter(Boolean) as Array<Record<string, unknown>>)
      : [],
    runId: typeof data.runId === "string" ? data.runId : null,
    sessionId,
    stepId: typeof data.stepId === "string" ? data.stepId : null,
  };
}

function stepResultFromEvent(event: ProviderSessionEvent): StepExecutionResult | null {
  if (event.type !== "step:failed" && event.type !== "step:success") return null;
  const data = event.data ?? {};
  const embedded =
    data.result && typeof data.result === "object"
      ? (data.result as Record<string, unknown>)
      : {};
  const status =
    embedded.status === "passed" || embedded.status === "failed" || embedded.status === "skipped"
      ? embedded.status
      : event.type === "step:failed"
        ? "failed"
        : "passed";
  return {
    durationMs: typeof embedded.durationMs === "number" ? embedded.durationMs : undefined,
    endedAt: typeof embedded.endedAt === "string" ? embedded.endedAt : event.timestamp,
    errorMessage:
      typeof embedded.errorMessage === "string"
        ? embedded.errorMessage
        : typeof data.errorMessage === "string"
          ? data.errorMessage
          : typeof data.error === "string"
            ? data.error
            : "",
    errorType:
      typeof embedded.errorType === "string"
        ? embedded.errorType
        : typeof data.errorType === "string"
          ? data.errorType
          : "",
    index: typeof data.index === "number" ? data.index : undefined,
    runId: typeof data.runId === "string" ? data.runId : null,
    screenshotPath:
      typeof embedded.screenshotPath === "string"
        ? embedded.screenshotPath
        : typeof data.screenshotPath === "string"
          ? data.screenshotPath
          : null,
    startedAt: typeof embedded.startedAt === "string" ? embedded.startedAt : undefined,
    status,
    stepId:
      typeof embedded.stepId === "string"
        ? embedded.stepId
        : typeof data.stepId === "string"
          ? data.stepId
          : null,
    suggestion:
      typeof embedded.suggestion === "string"
        ? embedded.suggestion
        : typeof data.suggestion === "string"
          ? data.suggestion
          : "",
  };
}

function providerEventToHealingEvent(event: ProviderSessionEvent): HealingReviewEvent | null {
  if (event.type !== "step.healed" && event.type !== "step:self_healed") return null;
  const data = event.data ?? {};
  const runId = typeof data.runId === "string" ? data.runId : "";
  const stepId = typeof data.stepId === "string" ? data.stepId : typeof data.commandId === "string" ? data.commandId : "";
  if (!runId || !stepId) return null;
  return {
    actionId: typeof data.actionId === "string" ? data.actionId : null,
    commandId: typeof data.commandId === "string" ? data.commandId : stepId,
    confidenceScore: typeof data.confidenceScore === "number" ? data.confidenceScore : typeof data.score === "number" ? data.score : null,
    healedLocator:
      data.healedLocator && typeof data.healedLocator === "object"
        ? (data.healedLocator as Record<string, unknown>)
        : null,
    healReason: typeof data.healReason === "string" ? data.healReason : typeof data.healedBy === "string" ? data.healedBy : "",
    id: `${runId}:${stepId}:${locatorText(
      data.healedLocator && typeof data.healedLocator === "object"
        ? (data.healedLocator as Record<string, unknown>)
        : null,
    )}:${String(data.confidenceScore ?? data.score ?? "")}`,
    originalLocator:
      data.originalLocator && typeof data.originalLocator === "object"
        ? (data.originalLocator as Record<string, unknown>)
        : null,
    runId,
    sessionId: typeof data.sessionId === "string" ? data.sessionId : null,
    status:
      data.status === "accepted" || data.status === "discarded"
        ? data.status
        : "not_reviewed",
    stepId,
    suggestedCandidates: Array.isArray(data.suggestedCandidates)
      ? (data.suggestedCandidates.filter(Boolean) as Array<Record<string, unknown>>)
      : [],
    timestamp: event.timestamp || new Date().toISOString(),
  };
}

function mergeHealingEvents(events: HealingReviewEvent[]) {
  const byId = new Map<string, HealingReviewEvent>();
  for (const event of events) byId.set(event.id, { ...byId.get(event.id), ...event });
  return Array.from(byId.values());
}

export default function AutomationScenarioWorkspace({ projectKey, scenarioId }: Props) {
  const [targetUrl, setTargetUrl] = useState("https://www.google.com");
  const [browserMode, setBrowserMode] = useState<"headed" | "headless">("headed");
  const [scenario, setScenario] = useState<AutomationScenario | null>(null);
  const [session, setSession] = useState<BrokerSessionMetadata | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [verifyPicking, setVerifyPicking] = useState(false);
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [browserSessionState, setBrowserSessionState] =
    useState<BrowserSessionState>("disconnected");
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [providerEventCaptureAfter, setProviderEventCaptureAfter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [glowCartPreparing, setGlowCartPreparing] = useState(false);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "paused" | "failed" | "completed">("idle");
  const [failedStepResult, setFailedStepResult] = useState<StepExecutionResult | null>(null);
  const [commandRunStates, setCommandRunStates] = useState<Record<string, CommandRunState>>({});
  const [playbackJobs, setPlaybackJobs] = useState<PlaybackJob[]>([]);
  const [playbackConfig, setPlaybackConfig] = useState<PlaybackConfig>(defaultPlaybackConfig);
  const [playbackConsoleOpen, setPlaybackConsoleOpen] = useState(true);
  const [expandedConsoleLog, setExpandedConsoleLog] = useState<{
    body: string;
    title: string;
  } | null>(null);
  const [playbackConfigOpen, setPlaybackConfigOpen] = useState(false);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [events, setEvents] = useState<RecorderEvent[]>([]);
  const [logs, setLogs] = useState<string[]>(["Studio ready"]);
  const [customSnippetCommands, setCustomSnippetCommands] = useState<CustomSnippetCommand[]>(() =>
    loadCustomSnippetCommands(projectKey),
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<TimelineUndoSnapshot[]>([]);
  const [timelineSelectionAnchorId, setTimelineSelectionAnchorId] = useState<string | null>(null);
  const [selectedActionCommandKeys, setSelectedActionCommandKeys] = useState<Set<string>>(new Set());
  const [actionCommandSelectionAnchorKey, setActionCommandSelectionAnchorKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandPromptDraft, setCommandPromptDraft] = useState<AutomationStep | null>(null);
  const [locatorDiagnosticsOpen, setLocatorDiagnosticsOpen] = useState(false);
  const [commandPromptError, setCommandPromptError] = useState("");
  const [commandPromptSaving, setCommandPromptSaving] = useState(false);
  const [actionCommandEditor, setActionCommandEditor] = useState<{
    actionId: string;
    actionStepId: string;
    stepId: string;
  } | null>(null);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [draggedActionCommand, setDraggedActionCommand] = useState<{
    actionStepId: string;
    commandId: string;
  } | null>(null);
  const [actionDropTarget, setActionDropTarget] = useState<{
    actionStepId: string;
    commandId?: string;
    position: "inside" | "before";
  } | null>(null);
  const [timelineMenu, setTimelineMenu] = useState<{
    actionStepId?: string;
    stepId: string;
    x: number;
    y: number;
  } | null>(null);
  const [locatorFlyout, setLocatorFlyout] = useState<{
    actionStepId?: string;
    stepId: string;
    x: number;
    y: number;
  } | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionName, setActionName] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [actionModalStepIds, setActionModalStepIds] = useState<string[]>([]);
  const [actionModalTimelineSteps, setActionModalTimelineSteps] = useState<AutomationStep[]>([]);
  const [actionModalError, setActionModalError] = useState("");
  const [creatingAction, setCreatingAction] = useState(false);
  const [expandedActionStepIds, setExpandedActionStepIds] = useState<Set<string>>(new Set());
  const [loadingActionStepIds, setLoadingActionStepIds] = useState<Set<string>>(new Set());
  const [actionStepCommands, setActionStepCommands] = useState<Record<string, AutomationStep[]>>({});
  const [healingEvents, setHealingEvents] = useState<HealingReviewEvent[]>([]);
  const [selectedHealingEvent, setSelectedHealingEvent] = useState<HealingReviewEvent | null>(null);
  const [pendingAmbiguity, setPendingAmbiguity] = useState<PendingAmbiguity | null>(null);
  const [locatorTestResult, setLocatorTestResult] = useState<string>("");
  const [customLocatorType, setCustomLocatorType] = useState<"css" | "xpath">("css");
  const [customLocatorValue, setCustomLocatorValue] = useState("");
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runModalError, setRunModalError] = useState("");
  const [runModalMode, setRunModalMode] = useState<"record" | "run">("run");
  const [liveRunReport, setLiveRunReport] = useState<LiveRunReport | null>(null);
  const [runConfig, setRunConfig] = useState<RunConfig>(() =>
    defaultRunConfig(targetUrl),
  );
  const [playbackStateGuard, setPlaybackStateGuard] = useState<PlaybackStateGuard | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"browser" | "canvas">("browser");
  const [livePreviewTick, setLivePreviewTick] = useState(Date.now());
  const [livePreviewFailed, setLivePreviewFailed] = useState(false);
  const [livePreviewStreamConnected, setLivePreviewStreamConnected] = useState(false);
  const [livePreviewStreamFrameSrc, setLivePreviewStreamFrameSrc] = useState("");
  const [livePreviewSize, setLivePreviewSize] = useState<LivePreviewSizeKey>("normal");
  const [livePreviewScroll, setLivePreviewScroll] = useState({ maxY: 0, y: 0 });
  const [livePreviewTabNotice, setLivePreviewTabNotice] = useState<LivePreviewTabNotice>(null);
  const [livePreviewTabsExpanded, setLivePreviewTabsExpanded] = useState(false);
  const [browserAddressDraft, setBrowserAddressDraft] = useState(targetUrl);
  const [browserNavBusy, setBrowserNavBusy] = useState(false);
  const [liveInspectorEnabled, setLiveInspectorEnabled] = useState(true);
  const [liveInspectorResult, setLiveInspectorResult] = useState<LiveInspectorResult | null>(null);
  const [liveInspectorSelected, setLiveInspectorSelected] = useState<LiveInspectorResult | null>(null);
  const [liveInspectorBusy, setLiveInspectorBusy] = useState(false);
  const [liveCommandMenu, setLiveCommandMenu] = useState<LiveCommandMenu>(null);
  const [authoringPreviewUrl, setAuthoringPreviewUrl] = useState("");
  const [authoringPreviewError, setAuthoringPreviewError] = useState("");
  const [canvasView, setCanvasView] = useState<CanvasView | null>(null);
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
  const [canvasMenu, setCanvasMenu] = useState<CanvasContextMenu>(null);
  const [canvasHoverElement, setCanvasHoverElement] = useState<Record<string, unknown> | null>(null);
  const [canvasExploreElement, setCanvasExploreElement] = useState<Record<string, unknown> | null>(null);
  const [canvasExploreIndex, setCanvasExploreIndex] = useState(0);
  const [canvasInsertPreview, setCanvasInsertPreview] = useState<{
    action: string;
    insertAfterStepId?: string | null;
    locator: Record<string, unknown>;
    snapshot: Record<string, unknown>;
  } | null>(null);
  const [canvasMessage, setCanvasMessage] = useState("");
  const [commandInsertMenu, setCommandInsertMenu] = useState<CommandInsertMenu>(null);
  const [logicEditorSuggest, setLogicEditorSuggest] = useState<LogicEditorSuggestState>(null);
  const [locatorLoopBuilder, setLocatorLoopBuilder] = useState<LocatorLoopBuilderState>({
    action: "getText",
    afterActions: [
      makeLocatorLoopAction("log", {
        logMessage: '"Collected items: " + items',
      }),
    ],
    attributeName: "class",
    beforeActions: [
      makeLocatorLoopAction("createList", {
        listVariable: "items",
      }),
    ],
    countValue: "5",
    countVariable: "count",
    createCountVariable: false,
    logEach: true,
    loopActions: [
      makeLocatorLoopAction("getText", {
        locatorVariable: "locator",
        outputVariable: "itemText",
      }),
      makeLocatorLoopAction("addToList", {
        listVariable: "items",
        valueExpression: "itemText",
      }),
    ],
    outputVariable: "itemText",
    propertyName: "innerText",
    waitMs: "",
  });
  const [locatorLoopCreateModalOpen, setLocatorLoopCreateModalOpen] = useState(false);
  const [locatorLoopCreateModalTarget, setLocatorLoopCreateModalTarget] = useState<{
    actionId: string;
    phase: LocatorLoopBuilderPhase;
  } | null>(null);
  const [testDataOpen, setTestDataOpen] = useState(false);
  const [testDataSaving, setTestDataSaving] = useState(false);
  const [testDataError, setTestDataError] = useState("");
  const [parameterDrafts, setParameterDrafts] = useState<ScenarioParameter[]>([]);
  const [testCaseDrafts, setTestCaseDrafts] = useState<ScenarioTestCase[]>([]);
  const targetInitializedForScenario = useRef<string | null>(null);
  const companionCursorRef = useRef(0);
  const companionPlaybackEventIdsRef = useRef<Set<string>>(new Set());
  const ignoredRecorderStepIdsRef = useRef<Set<string>>(new Set());
  const runModalDismissedRef = useRef(false);
  const timelineStepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const actionCommandRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const commandParameterTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const logicEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const livePreviewImageRef = useRef<HTMLImageElement | null>(null);
  const livePreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const livePreviewSocketRef = useRef<WebSocket | null>(null);
  const livePreviewFrameObjectUrlRef = useRef("");
  const liveInspectorTimerRef = useRef<number | null>(null);
  const liveInspectorAbortRef = useRef<AbortController | null>(null);
  const livePreviewWheelDeltaRef = useRef<{
    deltaX: number;
    deltaY: number;
    point: { x: number; y: number } | null;
  }>({ deltaX: 0, deltaY: 0, point: null });
  const livePreviewWheelTimerRef = useRef<number | null>(null);
  const livePreviewWheelInFlightRef = useRef(false);
  const livePreviewSliderTimerRef = useRef<number | null>(null);
  const livePreviewKnownTabIdsRef = useRef<string[]>([]);
  const livePreviewTabNoticeTimerRef = useRef<number | null>(null);

  const activeLivePreviewSize =
    LIVE_PREVIEW_SIZES.find((item) => item.key === livePreviewSize) ??
    LIVE_PREVIEW_SIZES[0];
  const livePreviewWorkspaceColumns =
    livePreviewSize === "full"
      ? "xl:grid-cols-1"
      : livePreviewSize === "large"
        ? "xl:grid-cols-[minmax(0,1fr)_280px]"
        : "xl:grid-cols-[minmax(0,1fr)_380px]";

  useEffect(() => {
    setBrowserSessionState(browserSessionStateFor(session));
  }, [session?.sessionId, session?.status]);

  useEffect(() => {
    if (verifyPicking) {
      setRecorderState("verifyingTarget");
    } else if (recordingPaused) {
      setRecorderState("paused");
    } else if (recording) {
      setRecorderState("recording");
    } else if (recorderState !== "selectingTarget") {
      setRecorderState("idle");
    }
  }, [recorderState, recording, recordingPaused, verifyPicking]);

  useEffect(() => {
    if (runStatus === "running") setPlaybackState("running");
    else if (runStatus === "failed") setPlaybackState("failed");
    else if (runStatus === "completed") setPlaybackState("completed");
    else if (!playbackBusy) setPlaybackState("idle");
  }, [playbackBusy, runStatus]);

  useEffect(() => {
    setLivePreviewFailed(false);
    setLivePreviewTick(Date.now());
    if (!session?.liveViewUrl || !session.sessionId || workspaceTab !== "browser") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLivePreviewTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [session?.liveViewUrl, session?.sessionId, workspaceTab]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | null = null;

    const clearFrameObjectUrl = () => {
      if (livePreviewFrameObjectUrlRef.current) {
        URL.revokeObjectURL(livePreviewFrameObjectUrlRef.current);
        livePreviewFrameObjectUrlRef.current = "";
      }
      setLivePreviewStreamFrameSrc("");
    };

    const closeSocket = () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const socket = livePreviewSocketRef.current;
      livePreviewSocketRef.current = null;
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };

    const connect = () => {
      if (
        cancelled ||
        workspaceTab !== "browser" ||
        !session?.sessionId ||
        !session.liveViewUrl ||
        !isCompanionPreviewSession(session)
      ) {
        return;
      }

      try {
        const socket = new WebSocket(companionPreviewStreamUrl(session));
        socket.binaryType = "arraybuffer";
        livePreviewSocketRef.current = socket;

        socket.onopen = () => {
          if (cancelled) return;
          setLivePreviewStreamConnected(true);
          setLivePreviewFailed(false);
          socket.send(JSON.stringify({ type: "ping" }));
        };

        socket.onmessage = (event) => {
          if (cancelled) return;
          if (typeof event.data === "string") {
            try {
              const data = JSON.parse(event.data) as {
                activeTabId?: string | null;
                error?: string;
                scroll?: { maxY?: number; y?: number };
                tabs?: CompanionPreviewTab[];
                type?: string;
                url?: string;
              };
              if (data.error) {
                setLivePreviewFailed(true);
                return;
              }
              if (data.url || data.tabs || data.activeTabId !== undefined) {
                setSession((current) =>
                  patchCompanionSession(current, {
                    activeTabId: data.activeTabId,
                    tabs: data.tabs,
                    url: data.url,
                  }),
                );
              }
              if (data.scroll) {
                setLivePreviewScroll({
                  maxY: Math.max(0, Number(data.scroll.maxY ?? 0)),
                  y: Math.max(0, Number(data.scroll.y ?? 0)),
                });
              }
            } catch {
              // Ignore non-JSON status frames.
            }
            return;
          }

          const blob =
            event.data instanceof Blob
              ? event.data
              : new Blob([event.data], { type: "image/jpeg" });
          const nextUrl = URL.createObjectURL(blob);
          const previousUrl = livePreviewFrameObjectUrlRef.current;
          livePreviewFrameObjectUrlRef.current = nextUrl;
          setLivePreviewStreamFrameSrc(nextUrl);
          setLivePreviewFailed(false);
          if (previousUrl) {
            window.setTimeout(() => URL.revokeObjectURL(previousUrl), 250);
          }
        };

        socket.onclose = () => {
          if (livePreviewSocketRef.current === socket) {
            livePreviewSocketRef.current = null;
          }
          if (cancelled) return;
          setLivePreviewStreamConnected(false);
          setLivePreviewTick(Date.now());
          reconnectTimer = window.setTimeout(connect, 1000);
        };

        socket.onerror = () => {
          if (cancelled) return;
          setLivePreviewStreamConnected(false);
          setLivePreviewFailed(true);
        };
      } catch {
        setLivePreviewStreamConnected(false);
        setLivePreviewTick(Date.now());
        reconnectTimer = window.setTimeout(connect, 1500);
      }
    };

    closeSocket();
    clearFrameObjectUrl();
    connect();

    return () => {
      cancelled = true;
      closeSocket();
      clearFrameObjectUrl();
      setLivePreviewStreamConnected(false);
    };
  }, [session?.liveViewUrl, session?.sessionId, workspaceTab]);

  useEffect(() => {
    const hasUsableCompanionPreview =
      session?.sessionId &&
      session.liveViewUrl &&
      isCompanionPreviewSession(session) &&
      session.status !== "stopped" &&
      session.status !== "failed";
    if (workspaceTab !== "browser" || hasUsableCompanionPreview) return;

    let cancelled = false;

    const reconnectCompanionPreview = async () => {
      try {
        const response = await fetch(`${localAgentUrl}/automation/browser`, {
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = await readJsonResponse<CompanionBrowserResponse>(response, {});
        const restoredSession = companionSessionMetadata(
          data,
          data.currentUrl || data.url || targetUrl,
        );

        if (cancelled || !restoredSession?.sessionId) return;

        setSession(restoredSession);
        setRecordingSessionId(
          data.status === "recording" ? restoredSession.sessionId : "",
        );
        setLivePreviewFailed(false);
        setLivePreviewTick(Date.now());
      } catch {
        // Companion may be closed; leave the empty Browser placeholder visible.
      }
    };

    void reconnectCompanionPreview();

    return () => {
      cancelled = true;
    };
  }, [session, targetUrl, workspaceTab]);

  useEffect(() => {
    setLiveInspectorResult(null);
    setLiveInspectorSelected(null);
    liveInspectorAbortRef.current?.abort();
    if (liveInspectorTimerRef.current) {
      window.clearTimeout(liveInspectorTimerRef.current);
      liveInspectorTimerRef.current = null;
    }
    if (livePreviewWheelTimerRef.current) {
      window.clearInterval(livePreviewWheelTimerRef.current);
      livePreviewWheelTimerRef.current = null;
    }
    if (livePreviewSliderTimerRef.current) {
      window.clearTimeout(livePreviewSliderTimerRef.current);
      livePreviewSliderTimerRef.current = null;
    }
    livePreviewWheelDeltaRef.current = { deltaX: 0, deltaY: 0, point: null };
    livePreviewWheelInFlightRef.current = false;
  }, [session?.sessionId, workspaceTab]);

  const scenarioMetadata = useMemo(() => scenarioMetadataRecord(scenario), [scenario]);
  const scenarioMetadataBaseUrl = useMemo(
    () => scenarioBaseUrlFromMetadata(scenarioMetadata),
    [scenarioMetadata],
  );
  const activeBaseUrl = useMemo(
    () =>
      scenarioMetadataBaseUrl ||
      runConfig.environments.find((environment) => environment.baseUrl.trim())?.baseUrl.trim() ||
      "",
    [runConfig.environments, scenarioMetadataBaseUrl],
  );
  const scenarioName = scenario?.name || "Untitled Scenario";
  const previewTabs = useMemo(() => session?.tabs ?? [], [session?.tabs]);
  const rawPreviewAddress = session?.currentUrl || targetUrl;
  const activePreviewTab =
    previewTabs.find((tab) => tab.id === session?.activeTabId || tab.active) ??
    previewTabs[0] ??
    null;
  const previewTabCount = Math.max(previewTabs.length, session?.liveViewUrl ? 1 : 0);
  const canControlLiveBrowser = Boolean(
    session?.sessionId &&
      session.liveViewUrl &&
      isCompanionPreviewSession(session) &&
      workspaceTab === "browser",
  );
  const resolveWorkspaceUrl = useCallback(
    (value: string) => {
      const resolved = resolvedBaseUrlTemplate(value, activeBaseUrl);
      if (!resolved || hasTemplateToken(resolved)) return "";
      return normalizeUrl(resolved);
    },
    [activeBaseUrl],
  );
  const previewAddress = resolveWorkspaceUrl(rawPreviewAddress) || rawPreviewAddress;

  useEffect(() => {
    setBrowserAddressDraft(previewAddress);
  }, [previewAddress]);

  useEffect(() => {
    return () => {
      if (livePreviewTabNoticeTimerRef.current) {
        window.clearTimeout(livePreviewTabNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    livePreviewKnownTabIdsRef.current = previewTabs.map((tab) => tab.id);
    setLivePreviewTabNotice(null);
    if (livePreviewTabNoticeTimerRef.current) {
      window.clearTimeout(livePreviewTabNoticeTimerRef.current);
      livePreviewTabNoticeTimerRef.current = null;
    }
  }, [session?.sessionId]);

  useEffect(() => {
    const previousTabIds = livePreviewKnownTabIdsRef.current;
    const nextTabIds = previewTabs.map((tab) => tab.id);
    const newTabs =
      previousTabIds.length > 0
        ? previewTabs.filter((tab) => !previousTabIds.includes(tab.id))
        : [];

    if (newTabs.length > 0) {
      const newestTab =
        newTabs.find((tab) => tab.id === session?.activeTabId) ?? newTabs[newTabs.length - 1];
      setLivePreviewTabNotice({
        label: livePreviewTabLabel(newestTab),
        tabId: newestTab.id,
      });
      if (livePreviewTabNoticeTimerRef.current) {
        window.clearTimeout(livePreviewTabNoticeTimerRef.current);
      }
      livePreviewTabNoticeTimerRef.current = window.setTimeout(() => {
        setLivePreviewTabNotice((current) =>
          current?.tabId === newestTab.id ? null : current,
        );
        livePreviewTabNoticeTimerRef.current = null;
      }, 3600);
    }

    livePreviewKnownTabIdsRef.current = nextTabIds;
  }, [previewTabs, session?.activeTabId]);

  const finalizedSteps = useMemo(() => normalizeSteps(scenario?.steps), [scenario?.steps]);
  const scenarioSteps = finalizedSteps;
  const liveSteps = useMemo(
    () => events.map(eventToStep).filter(Boolean) as AutomationStep[],
    [events],
  );
  const visibleSteps = useMemo(
    () => mergeStepsById([...scenarioSteps, ...liveSteps]),
    [scenarioSteps, liveSteps],
  );
  const inferredParameterNames = useMemo(
    () => inferParameterNamesFromSteps(visibleSteps),
    [visibleSteps],
  );
  const scenarioParameters = useMemo(
    () =>
      mergeParametersWithInferred(
        normalizeScenarioParameters(scenarioMetadata.automationParameters),
        inferredParameterNames,
      ),
    [inferredParameterNames, scenarioMetadata],
  );
  const scenarioTestCases = useMemo(
    () => normalizeScenarioTestCases(scenarioMetadata.testCases),
    [scenarioMetadata],
  );
  const enabledTestCases = useMemo(
    () => scenarioTestCases.filter((testCase) => testCase.enabled),
    [scenarioTestCases],
  );
  const selectedScenarioStep = visibleSteps.find((step) => step.id === selectedStepId) ?? null;
  const selectedActionCommand = actionCommandEditor
    ? actionStepCommands[actionCommandEditor.actionStepId]?.find(
        (step) => step.id === actionCommandEditor.stepId,
      ) ?? null
    : null;
  const sourceSelectedStep = selectedActionCommand ?? selectedScenarioStep;
  const selectedStep = drawerOpen && commandPromptDraft ? commandPromptDraft : sourceSelectedStep;
  const selectedStepAmbiguity = selectedStep ? stepAmbiguity(selectedStep) : null;
  const selectedStepAction = selectedStep ? displayAction(selectedStep.action) : "";
  const selectedStepShowsLocatorDiagnostics = stepShowsLocatorDiagnostics(selectedStep);
  const selectedStepQuality = selectedStepShowsLocatorDiagnostics && selectedStep ? locatorQualityForStep(selectedStep) : null;
  const selectedCommandDefinition =
    selectedStepAction === "action"
      ? actionCommandDefinition
      : commandDefinitionForAction(selectedStepAction);
  const selectedCommandSchemaParameters =
    selectedStep && selectedCommandDefinition
      ? selectedCommandDefinition.inputs.filter((parameter) =>
          shouldRenderCommandSchemaParameter(selectedStepAction, parameter),
        )
      : [];
  const selectedStepParameterName = selectedStep ? exactParameterNameFromText(selectedStep.inputValue) : "";
  const selectedStepParameterPreviewData = dataForTestCase(
    enabledTestCases[0] ?? scenarioTestCases[0] ?? null,
    scenarioParameters,
  );
  const selectedStepParameterPreview =
    selectedStepParameterName && scenarioParameters.some((parameter) => parameter.name === selectedStepParameterName)
      ? selectedStepParameterPreviewData[selectedStepParameterName] ?? ""
      : "";
  const selectedStepValueSource = selectedStep ? phaseValueSource(selectedStep) : "static";
  const selectedStepValueReference = selectedStep ? phaseValueReference(selectedStep) : "";
  const selectedStepExpression = selectedStep ? phaseExpression(selectedStep) : "";
  const selectedStepOutputVariable = selectedStep ? phaseOutputVariable(selectedStep) : "";
  const selectedCommandCanSaveOutput = commandShowsOutputCapture(selectedCommandDefinition);
  const selectedCommandOutputDefaultName = commandOutputDefaultName(selectedCommandDefinition);
  const selectedCommandOutputTypeLabel = commandOutputTypeLabel(selectedCommandDefinition);
  const selectedCommandEditorUxKind = commandEditorUxKind(selectedCommandDefinition);
  const selectedCommandHasAdvancedRuntimeInput = commandHasAdvancedRuntimeInput(selectedStepAction);
  const selectedCommandUsesLogicIde = isLogicIdeCommand(selectedStepAction);
  const selectedLogicDslValidation = useMemo(
    () => validateLogicDsl(selectedStep && selectedCommandUsesLogicIde ? logicDslValue(selectedStep) : ""),
    [selectedCommandUsesLogicIde, selectedStep],
  );
  const variablePickerItems = useMemo<VariablePickerItem[]>(() => {
    const byName = new Map<string, VariablePickerItem>();
    for (const parameter of scenarioParameters) {
      if (!parameter.name || byName.has(parameter.name)) continue;
      byName.set(parameter.name, {
        detail: `Scenario parameter${parameter.type ? ` (${parameter.type})` : ""}`,
        name: parameter.name,
        source: "scenarioParameter",
      });
    }
    const commandSteps = [
      ...visibleSteps,
      ...Object.values(actionStepCommands).flat(),
    ];
    for (const step of commandSteps) {
      const variableName = phaseOutputVariable(step);
      const definition = commandDefinitionForAction(displayAction(step.action));
      if (variableName && !byName.has(variableName)) {
        byName.set(variableName, {
          detail: `Command output${definition?.label ? ` from ${definition.label}` : ""}`,
          name: variableName,
          source: "commandOutput",
        });
      }
      if (!isLogicIdeCommand(displayAction(step.action))) continue;
      for (const variable of extractLogicDslVariables(logicDslValue(step))) {
        const existing = byName.get(variable.name);
        if (existing && existing.source !== "scenarioParameter") continue;
        byName.set(variable.name, {
          detail: `${variable.detail}${definition?.label ? ` from ${definition.label}` : ""}`,
          name: variable.name,
          source: "logicVariable",
        });
      }
    }
    return Array.from(byName.values()).sort(
      (left, right) =>
        variablePickerSourcePriority(left.source) -
          variablePickerSourcePriority(right.source) ||
        left.name.localeCompare(right.name),
    );
  }, [actionStepCommands, scenarioParameters, visibleSteps]);
  const compareActualVariableItems = useMemo(
    () =>
      variablePickerItems
        .slice()
        .sort(
          (left, right) =>
            variablePickerSourcePriority(left.source) -
              variablePickerSourcePriority(right.source) ||
            left.name.localeCompare(right.name),
        ),
    [variablePickerItems],
  );
  const selectedStepVariableItem = selectedStepParameterName
    ? variablePickerItems.find((item) => item.name === selectedStepParameterName)
    : undefined;
  const selectedStepDataValueItems: VariablePickerItem[] = isCompareCommandAction(selectedStepAction)
    ? compareActualVariableItems
    : variablePickerItems;
  const runtimeVariableNamesForSubstitution = useMemo(
    () =>
      new Set(
        variablePickerItems
          .filter((item) => item.source !== "scenarioParameter")
          .map((item) => item.name),
      ),
    [variablePickerItems],
  );
  const locatorLoopPreview = useMemo(
    () => buildLocatorLoopDsl(locatorLoopBuilder),
    [locatorLoopBuilder],
  );
  const updateLocatorLoopBuilderAction = (
    phase: LocatorLoopBuilderPhase,
    actionId: string,
    updates: Partial<LocatorLoopBuilderAction>,
  ) => {
    const key = locatorLoopPhaseKey(phase);
    setLocatorLoopBuilder((current) => ({
      ...current,
      [key]: current[key].map((action) =>
        action.id === actionId ? { ...action, ...updates } : action,
      ),
    }));
  };
  const addLocatorLoopBuilderAction = (
    phase: LocatorLoopBuilderPhase,
    action: LocatorLoopBuilderActionKind = phase === "inside" ? "getText" : phase === "before" ? "createList" : "log",
  ) => {
    const key = locatorLoopPhaseKey(phase);
    setLocatorLoopBuilder((current) => ({
      ...current,
      [key]: [...current[key], makeLocatorLoopAction(action)],
    }));
  };
  const removeLocatorLoopBuilderAction = (phase: LocatorLoopBuilderPhase, actionId: string) => {
    const key = locatorLoopPhaseKey(phase);
    setLocatorLoopBuilder((current) => ({
      ...current,
      [key]: current[key].filter((action) => action.id !== actionId),
    }));
  };
  const renderLocatorLoopBuilderActionFields = (
    phase: LocatorLoopBuilderPhase,
    action: LocatorLoopBuilderAction,
  ) => {
    const needsOutput = ["getText", "getAttribute", "getProperty", "joinList", "uniqueList", "sortList", "countListItems", "getListItem"].includes(action.action);
    const needsList = ["addToList", "clearList", "countListItems", "createList", "getListItem", "joinList", "sortList", "uniqueList"].includes(action.action);
    return (
      <>
        {isLocatorLoopWebAction(action.action) ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Locator variable
            <select
              value={action.locatorVariable}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__create__") {
                  updateLocatorLoopBuilderAction(phase, action.id, {
                    createLocatorVariable: true,
                    locatorVariable: action.locatorVariable || `${action.action}Locator`,
                  });
                  setLocatorLoopCreateModalTarget({ actionId: action.id, phase });
                  setLocatorLoopCreateModalOpen(true);
                  return;
                }
                updateLocatorLoopBuilderAction(phase, action.id, {
                  createLocatorVariable: false,
                  locatorVariable: value,
                  locatorValue: "",
                });
              }}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            >
              <option value="">Select variable...</option>
              {action.locatorVariable && !variablePickerItems.some((item) => item.name === action.locatorVariable) ? (
                <option value={action.locatorVariable}>
                  {action.locatorVariable}
                  {action.createLocatorVariable ? " - New locator variable" : ""}
                </option>
              ) : null}
              {variablePickerItems.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} - {item.detail}
                </option>
              ))}
              <option value="__create__">+ Create locator variable</option>
            </select>
          </label>
        ) : null}
        {isLocatorLoopWebAction(action.action) && action.createLocatorVariable ? (
          <button
            type="button"
            onClick={() => {
              setLocatorLoopCreateModalTarget({ actionId: action.id, phase });
              setLocatorLoopCreateModalOpen(true);
            }}
            className="self-end rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-left text-xs font-semibold text-sky-900 transition hover:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-100"
          >
            Edit locator: {action.locatorVariable || "locator"}
          </button>
        ) : null}
        {action.action === "getAttribute" ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Attribute
            <input
              list="locator-loop-attribute-options"
              value={action.attributeName}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { attributeName: event.target.value })}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {action.action === "getProperty" ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Property
            <input
              list="locator-loop-property-options"
              value={action.propertyName}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { propertyName: event.target.value })}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {needsList ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            List variable
            <input
              value={action.listVariable}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { listVariable: event.target.value })}
              placeholder="items"
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {["addToList", "getListItem"].includes(action.action) ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            {action.action === "getListItem" ? "Index" : "Value/expression"}
            <input
              value={action.valueExpression}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { valueExpression: event.target.value })}
              placeholder={action.action === "getListItem" ? "0" : "itemText"}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {["sortList", "uniqueList"].includes(action.action) ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Field
            <input
              value={action.fieldName}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { fieldName: event.target.value })}
              placeholder="Optional"
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {action.action === "sortList" ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Sort
            <select
              value={action.sortOrder}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { sortOrder: event.target.value as "asc" | "desc" })}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        ) : null}
        {action.action === "joinList" ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Separator
            <input
              value={action.separator}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { separator: event.target.value })}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {needsOutput ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Output variable
            <input
              value={action.outputVariable}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { outputVariable: event.target.value })}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {action.action === "wait" || ["click", "getAttribute", "getProperty", "getText", "hover", "verifyVisible"].includes(action.action) ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100">
            Wait ms
            <input
              type="number"
              min="0"
              step="100"
              value={action.waitMs}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { waitMs: event.target.value })}
              placeholder={action.action === "wait" ? "1000" : "0"}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
        {action.action === "log" ? (
          <label className="text-[11px] font-semibold text-sky-900 dark:text-sky-100 sm:col-span-2">
            Message/expression
            <input
              value={action.logMessage}
              onChange={(event) => updateLocatorLoopBuilderAction(phase, action.id, { logMessage: event.target.value })}
              placeholder={'"Items: " + items'}
              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
        ) : null}
      </>
    );
  };
  const renderLocatorLoopBuilderSection = (
    phase: LocatorLoopBuilderPhase,
    title: string,
    description: string,
    actions: LocatorLoopBuilderAction[],
  ) => (
    <div className="grid gap-2 rounded-xl border border-sky-200 bg-white/70 p-2 dark:border-sky-500/30 dark:bg-zinc-950/70">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h6 className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-900 dark:text-sky-100">
            {title}
          </h6>
          <p className="text-[11px] font-medium text-sky-700 dark:text-sky-200">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => addLocatorLoopBuilderAction(phase)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-300 bg-sky-700 text-base font-bold leading-none text-white transition hover:bg-sky-800"
          title={`Add ${title.toLowerCase()} action`}
        >
          +
        </button>
      </div>
      {actions.length ? (
        <div className="grid gap-2">
          {actions.map((action, index) => (
            <div key={action.id} className="grid gap-2 rounded-lg border border-sky-100 bg-sky-50/70 p-2 dark:border-sky-500/20 dark:bg-sky-500/10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-sky-900 dark:bg-zinc-950 dark:text-sky-100">
                  {index + 1}
                </span>
                <select
                  value={action.action}
                  onChange={(event) =>
                    updateLocatorLoopBuilderAction(phase, action.id, {
                      ...makeLocatorLoopAction(event.target.value as LocatorLoopBuilderActionKind),
                      id: action.id,
                    })
                  }
                  className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                >
                  {locatorLoopBuilderOptionGroups
                    .filter((group) => phase === "inside" || group !== "Web")
                    .map((group) => (
                    <optgroup key={group} label={group}>
                      {locatorLoopBuilderActionOptions
                        .filter((option) => option.group === group)
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeLocatorLoopBuilderAction(phase, action.id)}
                  className="rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-xs font-bold text-rose-700 transition hover:border-rose-400 dark:border-rose-500/30 dark:bg-zinc-950 dark:text-rose-200"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {renderLocatorLoopBuilderActionFields(phase, action)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-sky-200 px-3 py-2 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:text-sky-200">
          No actions in this section.
        </p>
      )}
    </div>
  );
  const locatorLoopCreateModalAction =
    locatorLoopCreateModalTarget
      ? locatorLoopBuilder[locatorLoopPhaseKey(locatorLoopCreateModalTarget.phase)].find(
          (action) => action.id === locatorLoopCreateModalTarget.actionId,
        ) ?? null
      : null;
  const logicEditorSuggestions = useMemo<LogicEditorSuggestion[]>(() => {
    const builtIns: LogicEditorSuggestion[] = [
      { detail: "Run environment name", insertText: logicVariableToken("env"), label: "$env", source: "builtin" },
      { detail: "desktop, tablet, or phone", insertText: logicVariableToken("viewport"), label: "$viewport", source: "builtin" },
      { detail: "Viewport width", insertText: logicVariableToken("width"), label: "$width", source: "builtin" },
      { detail: "Viewport height", insertText: logicVariableToken("height"), label: "$height", source: "builtin" },
      { detail: "Current browser URL", insertText: logicVariableToken("currentUrl"), label: "$currentUrl", source: "builtin" },
      { detail: "Current page title", insertText: logicVariableToken("title"), label: "$title", source: "builtin" },
      { detail: "Browser name", insertText: logicVariableToken("browser"), label: "$browser", source: "builtin" },
      { detail: "OS/platform", insertText: logicVariableToken("platform"), label: "$platform", source: "builtin" },
      { detail: "Current loop item", insertText: logicVariableToken("item"), label: "$item", source: "builtin" },
      { detail: "Current table/test row", insertText: logicVariableToken("row"), label: "$row", source: "builtin" },
      { detail: "Current map key", insertText: logicVariableToken("key"), label: "$key", source: "builtin" },
      { detail: "Current map value", insertText: logicVariableToken("value"), label: "$value", source: "builtin" },
      { detail: "Zero-based loop index", insertText: logicVariableToken("loop.index"), label: "$loop.index", source: "builtin" },
      { detail: "One-based loop number", insertText: logicVariableToken("loop.number"), label: "$loop.number", source: "builtin" },
    ];
    const variables = variablePickerItems.map<LogicEditorSuggestion>((item) => ({
      detail: item.detail,
      insertText: logicVariableToken(item.name),
      label: `$${item.name}`,
      source: item.source,
    }));
    const helpers: LogicEditorSuggestion[] = [
      { detail: "CSS locator", insertText: 'css("")', label: 'css("")', source: "locator" },
      { detail: "XPath locator", insertText: 'xpath("")', label: 'xpath("")', source: "locator" },
      { detail: "Visible text locator", insertText: 'text("")', label: 'text("")', source: "locator" },
      { detail: "Role locator", insertText: 'role("button", "")', label: 'role("button", "")', source: "locator" },
      { detail: "Test id locator", insertText: 'testid("")', label: 'testid("")', source: "locator" },
      { detail: "Label locator", insertText: 'label("")', label: 'label("")', source: "locator" },
    ];
    const snippets: LogicEditorSuggestion[] = [
      {
        detail: "Desktop / phone branch",
        insertText: [
          'if {{$viewport}} == "desktop" {',
          '  log "Desktop flow"',
          '} else {',
          '  log "Mobile/tablet flow"',
          '}',
        ].join("\n"),
        label: "if desktop else",
        source: "snippet",
      },
      {
        detail: "Loop a list variable",
        insertText: [
          "for item in {{$items}} {",
          '  log "Item: " + item',
          "}",
        ].join("\n"),
        label: "for item in list",
        source: "snippet",
      },
    ];
    return [...variables, ...builtIns, ...helpers, ...snippets];
  }, [variablePickerItems]);
  const visibleLogicEditorSuggestions = useMemo(() => {
    if (!logicEditorSuggest) return [];
    const query = logicEditorSuggest.query.trim().toLowerCase();
    const textarea = logicEditorTextareaRef.current;
    const before = textarea?.value.slice(0, textarea.selectionStart ?? 0) ?? "";
    const locatorMode =
      /\b(css|xpath|text|role|testid|label)\(\"[^\"]*$/.test(before) ||
      /\b(click|hover|type|fill|getText|getAttribute|getProperty|verifyVisible)\s+$/.test(before);
    return logicEditorSuggestions
      .filter((item) => {
        if (locatorMode) return item.source === "locator" || item.source === "snippet";
        if (!query) return item.source !== "snippet";
        return `${item.label} ${item.detail}`.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftLabel = left.label.toLowerCase().replace(/^\$/, "");
        const rightLabel = right.label.toLowerCase().replace(/^\$/, "");
        const leftExact = query && leftLabel === query ? 0 : 1;
        const rightExact = query && rightLabel === query ? 0 : 1;
        if (leftExact !== rightExact) return leftExact - rightExact;
        const leftStarts = query && leftLabel.startsWith(query) ? 0 : 1;
        const rightStarts = query && rightLabel.startsWith(query) ? 0 : 1;
        if (leftStarts !== rightStarts) return leftStarts - rightStarts;
        const sourceOrder = logicSuggestionSourcePriority(left.source) - logicSuggestionSourcePriority(right.source);
        if (sourceOrder !== 0) return sourceOrder;
        return left.label.localeCompare(right.label);
      })
      .slice(0, 12);
  }, [logicEditorSuggest, logicEditorSuggestions]);
  const selectedStepHasAdvancedRuntimeConfig =
    selectedStepValueSource !== "static" ||
    Boolean(selectedStepExpression || textValue(selectedStep?.options?.valueReference));
  const selectedStepFailureBehavior = selectedStep
    ? phaseFailureBehavior(selectedStep)
    : {
        continueOnFailure: false,
        recoveryActionId: "",
        retryCount: 0,
        screenshotOnFailure: true,
        stopOnFailure: true,
        timeoutMs: 30000,
      };
  const activeLiveInspectorResult = liveInspectorSelected ?? liveInspectorResult;
  const activeLiveInspectorLocator = rankedLocators(
    activeLiveInspectorResult?.locatorCandidates ?? [],
  )[0];
  const customSnippetCommandDefinitions = useMemo(
    () =>
      customSnippetCommands
        .map(customSnippetCommandDefinition)
        .filter((command): command is AutomationCommandDefinition => Boolean(command)),
    [customSnippetCommands],
  );
  const libraryCommandDefinitions = useMemo(
    () => [
      ...customSnippetCommandDefinitions,
      ...AUTOMATION_COMMAND_CATALOG.filter((command) => command.visibleInLibrary !== false),
    ],
    [customSnippetCommandDefinitions],
  );
  const liveCommandSearch = liveCommandMenu?.query.trim().toLowerCase() ?? "";
  const liveCommandResults = useMemo(() => {
    const visibleCommands = libraryCommandDefinitions;
    if (!liveCommandSearch) return visibleCommands;
    return visibleCommands.filter((command) => {
      const haystack = [
        command.action,
        command.domain,
        command.label,
        command.normalizedAction,
        ...command.aliases,
      ]
        .join(" ")
        .toLowerCase();
      return liveCommandSearch
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack.includes(token));
    });
  }, [libraryCommandDefinitions, liveCommandSearch]);
  const liveCommandResultsByDomain = useMemo(
    () =>
      liveCommandResults.reduce<Record<string, AutomationCommandDefinition[]>>(
        (groups, command) => ({
          ...groups,
          [commandLibraryGroupLabel(command)]: [...(groups[commandLibraryGroupLabel(command)] ?? []), command],
        }),
        {},
      ),
    [liveCommandResults],
  );
  const commandInsertSearch = commandInsertMenu?.query.trim().toLowerCase() ?? "";
  const commandInsertResults = useMemo(() => {
    const visibleCommands = [
      ...libraryCommandDefinitions,
      actionCommandDefinition,
    ];
    if (!commandInsertSearch) return visibleCommands;
    const tokens = commandInsertSearch.split(/\s+/).filter(Boolean);
    return visibleCommands.filter((command) => {
      const haystack = [
        command.action,
        command.category,
        command.description,
        command.domain,
        command.label,
        command.normalizedAction,
        command.runtimeAction,
        command.runtimeHandler,
        ...command.aliases,
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [commandInsertSearch, libraryCommandDefinitions]);
  const commandInsertResultsByDomain = useMemo(
    () =>
      commandInsertResults.reduce<Record<string, AutomationCommandDefinition[]>>(
        (groups, command) => ({
          ...groups,
          [commandLibraryGroupLabel(command)]: [...(groups[commandLibraryGroupLabel(command)] ?? []), command],
        }),
        {},
      ),
    [commandInsertResults],
  );
  const selectedSteps = visibleSteps.filter((step) => selectedStepIds.has(step.id));
  const timelineStepIds = useMemo(
    () => visibleSteps.map((step) => step.id).filter(Boolean) as string[],
    [visibleSteps],
  );
  const allTimelineStepsSelected = timelineStepIds.length > 0 && timelineStepIds.every((id) => selectedStepIds.has(id));
  const someTimelineStepsSelected = timelineStepIds.some((id) => selectedStepIds.has(id));
  const actionModalSelectedIds = useMemo(
    () => new Set(actionModalStepIds.length ? actionModalStepIds : Array.from(selectedStepIds)),
    [actionModalStepIds, selectedStepIds],
  );
  const actionModalSourceSteps = actionModalTimelineSteps.length ? actionModalTimelineSteps : visibleSteps;
  const actionModalSelectedSteps = actionModalSourceSteps.filter(
    (step) => step.id && actionModalSelectedIds.has(step.id),
  );
  const locatorFlyoutStep = locatorFlyout?.actionStepId
    ? actionStepCommands[locatorFlyout.actionStepId]?.find((step) => step.id === locatorFlyout.stepId) ?? null
    : visibleSteps.find((step) => step.id === locatorFlyout?.stepId) ?? null;
  const locatorFlyoutQuality = locatorFlyoutStep ? locatorQualityForStep(locatorFlyoutStep) : null;
  const recordingActive = recorderState === "recording";
  const healingEventsByStepId = useMemo(() => {
    const byStep = new Map<string, HealingReviewEvent[]>();
    for (const event of healingEvents) {
      const key = event.stepId || event.commandId;
      if (!key) continue;
      byStep.set(key, [...(byStep.get(key) ?? []), event]);
    }
    return byStep;
  }, [healingEvents]);

  useEffect(() => {
    if (!drawerOpen || !sourceSelectedStep) {
      setCommandPromptDraft(null);
      return;
    }
    setCommandPromptDraft((current) =>
      current?.id === sourceSelectedStep.id ? current : sourceSelectedStep,
    );
  }, [drawerOpen, sourceSelectedStep]);

  const appendLog = useCallback((message: string) => {
    setLogs((current) => [...current.slice(-50), message]);
  }, []);

  useEffect(() => {
    setCustomSnippetCommands(loadCustomSnippetCommands(projectKey));
  }, [projectKey]);

  const commandConsoleLabel = useCallback(
    (step: AutomationStep, fallbackIndex: number) =>
      step.commandText || readableStepLabel(step) || `Command ${fallbackIndex + 1}`,
    [],
  );

  const liveRunRowForStep = useCallback(
    (step: AutomationStep, index: number, runId?: string | null): LiveRunReportRow => ({
      action: displayAction(step.action),
      details: [],
      index,
      label: commandConsoleLabel(step, index),
      parentActionId: textValue(step.options?.sourceActionId) || null,
      parentActionName: textValue(step.options?.sourceActionName) || null,
      runId: runId ?? null,
      status: "queued",
      stepId: step.id ?? null,
    }),
    [commandConsoleLabel],
  );

  const openLiveRunReport = useCallback(
    (
      steps: AutomationStep[],
      metadata: {
        browserMode?: string;
        device?: string;
        environment?: string;
        runId?: string | null;
        status?: LiveRunReport["status"];
        title: string;
      },
    ) => {
      const now = new Date().toISOString();
      setLiveRunReport({
        browserMode: metadata.browserMode,
        device: metadata.device,
        environment: metadata.environment,
        open: true,
        rows: steps.map((step, index) => liveRunRowForStep(step, index, metadata.runId)),
        runId: metadata.runId ?? null,
        startedAt: now,
        status: metadata.status ?? "queued",
        title: metadata.title,
      });
    },
    [liveRunRowForStep],
  );

  const updateLiveRunReportRows = useCallback(
    (
      steps: AutomationStep[],
      updates: Array<{
        details?: string[];
        index?: number;
        message?: string;
        outputSummary?: string;
        runId?: string | null;
        status: LiveRunReportRowStatus;
        stepId?: string | null;
      }>,
      reportStatus?: LiveRunReport["status"],
    ) => {
      if (!updates.length && !reportStatus) return;
      const now = new Date().toISOString();
      setLiveRunReport((current) => {
        if (!current?.open) return current;
        const rows = current.rows.map((row) => {
          const update = updates.find((item) => {
            if (item.stepId && row.stepId && item.stepId === row.stepId) return true;
            return typeof item.index === "number" && item.index === row.index;
          });
          if (!update) return row;
          return {
            ...row,
            details: update.details ?? row.details,
            endedAt: ["passed", "failed", "skipped"].includes(update.status) ? now : row.endedAt,
            message: update.message ?? row.message,
            outputSummary: update.outputSummary ?? row.outputSummary,
            runId: update.runId ?? row.runId,
            startedAt: update.status === "running" ? row.startedAt ?? now : row.startedAt,
            status: update.status,
          };
        });
        return {
          ...current,
          completedAt: reportStatus === "passed" || reportStatus === "failed" || reportStatus === "cancelled"
            ? now
            : current.completedAt,
          rows,
          status: reportStatus ?? current.status,
        };
      });
    },
    [],
  );

  const setCommandStatus = useCallback(
    (
      step: AutomationStep | undefined,
      status: CommandRunState["status"],
      message: string,
      runId?: string | null,
      suggestion?: string,
    ) => {
      if (!step?.id) return;
      setCommandRunStates((current) => ({
        ...current,
        [step.id as string]: {
          message,
          runId: runId ?? null,
          status,
          suggestion,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [],
  );

  const logCommandRunStarted = useCallback(
    (steps: AutomationStep[], runId: string | null, prefix = "Running command") => {
      updateLiveRunReportRows(
        steps,
        steps.map((step, index) => ({
          index,
          message: "Running",
          runId,
          status: "running" as const,
          stepId: step.id ?? null,
        })),
        "running",
      );
      steps.forEach((step, index) => {
        const label = commandConsoleLabel(step, index);
        setCommandStatus(step, "running", "Running", runId);
        appendLog(`${prefix} ${index + 1}/${steps.length}: ${label}`);
      });
    },
    [appendLog, commandConsoleLabel, setCommandStatus, updateLiveRunReportRows],
  );

  const applyCompanionCommandResults = useCallback(
    (steps: AutomationStep[], results: CompanionStepResult[] | undefined, runId: string | null) => {
      if (!results?.length) {
        updateLiveRunReportRows(
          steps,
          steps.map((step, index) => ({
            index,
            message: "Passed",
            runId,
            status: "passed" as const,
            stepId: step.id ?? null,
          })),
          "passed",
        );
        steps.forEach((step, index) => {
          const label = commandConsoleLabel(step, index);
          setCommandStatus(step, "passed", "Passed", runId);
          appendLog(`Command ${index + 1}/${steps.length} passed: ${label}`);
        });
        return;
      }

      let sawFailure = false;
      const resolvedStepIds = new Set<string>();
      const resolvedIndexes = new Set<number>();
      for (const result of results) {
        const index = typeof result.index === "number" ? result.index : -1;
        const step =
          (result.stepId
            ? steps.find((item) => item.id === result.stepId)
            : null) ??
          (index >= 0 ? steps[index] : undefined);
        if (result.stepId) resolvedStepIds.add(result.stepId);
        if (step?.id) resolvedStepIds.add(step.id);
        if (index >= 0) resolvedIndexes.add(index);
        const displayIndex = index >= 0 ? index + 1 : step ? steps.indexOf(step) + 1 : 0;
        const label = step
          ? commandConsoleLabel(step, Math.max(0, displayIndex - 1))
          : `Command ${displayIndex || "?"}`;

        if (result.status === "failed") {
          sawFailure = true;
          const error = result.error || "Command failed.";
          const outputLine = commandConsoleOutputLineForStep(step, result.output);
          const detailLines = commandConsoleDetailLinesForStep(step, result.output);
          updateLiveRunReportRows(
            steps,
            [{
              details: detailLines,
              index,
              message: error,
              outputSummary: outputLine,
              runId,
              status: "failed",
              stepId: result.stepId ?? step?.id ?? null,
            }],
            "failed",
          );
          setCommandStatus(step, "failed", error, runId);
          appendLog(`Command ${displayIndex || "?"}/${steps.length} failed: ${label}. ${error}`);
          if (outputLine) appendLog(outputLine);
          for (const detailLine of detailLines) {
            appendLog(detailLine);
          }
          continue;
        }

        const outputLine = commandConsoleOutputLineForStep(step, result.output);
        const detailLines = commandConsoleDetailLinesForStep(step, result.output);
        updateLiveRunReportRows(
          steps,
          [{
            details: detailLines,
            index,
            message: "Passed",
            outputSummary: outputLine,
            runId,
            status: "passed",
            stepId: result.stepId ?? step?.id ?? null,
          }],
        );
        setCommandStatus(step, "passed", "Passed", runId);
        appendLog(`Command ${displayIndex || "?"}/${steps.length} passed: ${label}`);
        if (outputLine) appendLog(outputLine);
        for (const detailLine of detailLines) {
          appendLog(detailLine);
        }
      }
      if (sawFailure) {
        const unresolvedUpdates = steps
          .map((step, index) => ({ step, index }))
          .filter(({ step, index }) => !resolvedIndexes.has(index) && !(step.id && resolvedStepIds.has(step.id)))
          .map(({ step, index }) => {
            setCommandStatus(step, "failed", "Not run because an earlier command failed.", runId);
            return {
              index,
              message: "Not run because an earlier command failed.",
              runId,
              status: "skipped" as const,
              stepId: step.id ?? null,
            };
          });
        if (unresolvedUpdates.length) {
          updateLiveRunReportRows(steps, unresolvedUpdates);
          appendLog(
            `${unresolvedUpdates.length} command${unresolvedUpdates.length === 1 ? "" : "s"} not run because an earlier command failed.`,
          );
        }
      } else {
        updateLiveRunReportRows(steps, [], "passed");
      }
    },
    [appendLog, commandConsoleLabel, setCommandStatus, updateLiveRunReportRows],
  );

  const applyCompanionPlaybackEvents = useCallback(
    (steps: AutomationStep[], events: CompanionPlaybackEvent[] | undefined, runId: string | null) => {
      if (!events?.length) return;
      for (const event of events) {
        if (runId && event.runId && event.runId !== runId) continue;
        const eventKey = event.id || `${event.type}:${event.runId || ""}:${event.index ?? ""}:${event.stepId || ""}:${event.timestamp || ""}`;
        if (companionPlaybackEventIdsRef.current.has(eventKey)) continue;
        companionPlaybackEventIdsRef.current.add(eventKey);
        const index = typeof event.index === "number" ? event.index : -1;
        const step =
          (event.stepId ? steps.find((item) => item.id === event.stepId) : null) ??
          (index >= 0 ? steps[index] : undefined);
        const outputLine = commandConsoleOutputLineForStep(step, event.output);
        const detailLines = commandConsoleDetailLinesForStep(step, event.output);
        if (event.type === "run:start") {
          updateLiveRunReportRows(steps, [], "running");
          continue;
        }
        if (event.type === "run:success") {
          updateLiveRunReportRows(steps, [], "passed");
          continue;
        }
        if (event.type === "run:failed") {
          updateLiveRunReportRows(steps, [], "failed");
          continue;
        }
        if (event.type === "step:start") {
          updateLiveRunReportRows(steps, [{
            index,
            message: "Running",
            runId,
            status: "running",
            stepId: event.stepId ?? step?.id ?? null,
          }], "running");
          if (step) setCommandStatus(step, "running", "Running", runId);
          continue;
        }
        if (event.type === "step:success") {
          updateLiveRunReportRows(steps, [{
            details: detailLines,
            index,
            message: "Passed",
            outputSummary: outputLine,
            runId,
            status: "passed",
            stepId: event.stepId ?? step?.id ?? null,
          }]);
          if (step) setCommandStatus(step, "passed", "Passed", runId);
          continue;
        }
        if (event.type === "step:failed") {
          updateLiveRunReportRows(steps, [{
            details: detailLines,
            index,
            message: event.error || "Command failed.",
            outputSummary: outputLine,
            runId,
            status: "failed",
            stepId: event.stepId ?? step?.id ?? null,
          }], "failed");
          if (step) setCommandStatus(step, "failed", event.error || "Failed", runId);
        }
      }
    },
    [setCommandStatus, updateLiveRunReportRows],
  );

  const startCompanionPlaybackEventPolling = useCallback(
    (sessionId: string, runId: string | null, steps: AutomationStep[]) => {
      if (!sessionId) return () => undefined;
      let stopped = false;
      const poll = () => {
        if (stopped) return;
        const params = new URLSearchParams({ sessionId });
        void companionBrowserRequest(undefined, params)
          .then((data) => {
            companionCursorRef.current = data.cursor ?? companionCursorRef.current;
            applyCompanionPlaybackEvents(steps, data.playbackEvents, runId);
            if (data.url) {
              setSession((current) =>
                isCompanionPreviewSession(current)
                  ? companionSessionMetadata(data, data.url || current?.currentUrl || targetUrl)
                  : current,
              );
            }
          })
          .catch(() => undefined);
      };
      poll();
      const intervalId = window.setInterval(poll, 350);
      return () => {
        stopped = true;
        window.clearInterval(intervalId);
      };
    },
    [applyCompanionPlaybackEvents, targetUrl],
  );

  useEffect(() => {
    if (!timelineMenu) return;
    const close = () => setTimelineMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [timelineMenu]);

  useEffect(() => {
    if (!locatorFlyout) return;
    const close = () => setLocatorFlyout(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [locatorFlyout]);

  useEffect(() => {
    if (!liveCommandMenu) return;
    const close = () => setLiveCommandMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [liveCommandMenu]);

  useEffect(() => {
    if (!scenario || targetInitializedForScenario.current === scenarioId) return;
    targetInitializedForScenario.current = scenarioId;
    const savedUrl = lastNavigationUrl(finalizedSteps, activeBaseUrl) || activeBaseUrl;
    if (savedUrl) setTargetUrl(cleanUrlAuth(savedUrl));
  }, [activeBaseUrl, finalizedSteps, scenario, scenarioId]);

  useEffect(() => {
    if (!liveSteps.length) return;
    const draftScenario = draftScenarioForVisibleSteps(projectKey, scenarioId, scenario, visibleSteps);
    writeDraftCache(projectKey, scenarioId, draftScenario);
  }, [liveSteps.length, projectKey, scenario, scenarioId, visibleSteps]);

  const persistSteps = useCallback(
    async (
      steps: AutomationStep[],
      options: { skipUndo?: boolean; throwOnError?: boolean } = {},
    ) => {
      const nextSteps = cloneAutomationSteps(steps);
      if (!options.skipUndo) {
        const currentSteps = cloneAutomationSteps(visibleSteps);
        if (timelineStepsSignature(currentSteps) !== timelineStepsSignature(nextSteps)) {
          const snapshot: TimelineUndoSnapshot = {
            selectedStepId,
            selectedStepIds: Array.from(selectedStepIds),
            steps: currentSteps,
          };
          setUndoStack((current) => {
            const last = current.at(-1);
            if (last && timelineStepsSignature(last.steps) === timelineStepsSignature(snapshot.steps)) {
              return current;
            }
            return [...current.slice(-24), snapshot];
          });
        }
      }

      const nextScenario = draftScenarioForVisibleSteps(projectKey, scenarioId, scenario, nextSteps);
      setScenario(nextScenario);
      writeDraftCache(projectKey, scenarioId, nextScenario);
      await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/scenarios/${encodeURIComponent(scenarioId)}`,
        {
          body: JSON.stringify({ steps: nextSteps }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      )
        .then(async (response) => {
          const data = await readJsonResponse<{
            error?: string;
            scenario?: AutomationScenario;
          }>(response, {});
          if (!response.ok) throw new Error(data.error || "Could not save commands.");
          if (data.scenario) {
            setScenario(data.scenario);
            clearDraftCache(projectKey, scenarioId);
          }
        })
        .catch((error) => {
          appendLog(error instanceof Error ? error.message : "Could not save commands.");
          if (options.throwOnError) {
            throw error;
          }
        });
    },
    [appendLog, projectKey, scenario, scenarioId, selectedStepId, selectedStepIds, visibleSteps],
  );

  const fetchLatestScenarioSteps = useCallback(async () => {
    const response = await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/scenarios/${encodeURIComponent(scenarioId)}`,
      { cache: "no-store" },
    );
    const data = await readJsonResponse<{
      error?: string;
      scenario?: AutomationScenario;
    }>(response, {});
    if (!response.ok || !data.scenario) {
      throw new Error(data.error || "Could not load latest scenario.");
    }
    setScenario(data.scenario);
    clearDraftCache(projectKey, scenarioId);
    return normalizeSteps(data.scenario.steps);
  }, [projectKey, scenarioId]);

  const readLatestScenarioSteps = useCallback(async () => {
    const response = await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/scenarios/${encodeURIComponent(scenarioId)}`,
      { cache: "no-store" },
    );
    const data = await readJsonResponse<{
      error?: string;
      scenario?: AutomationScenario;
    }>(response, {});
    if (!response.ok || !data.scenario) {
      throw new Error(data.error || "Could not load latest scenario.");
    }
    return normalizeSteps(data.scenario.steps);
  }, [projectKey, scenarioId]);

  const runtimeScenarioSteps = useCallback(async () => {
    let latestSteps: AutomationStep[] = [];
    try {
      latestSteps = await readLatestScenarioSteps();
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not load latest saved commands.");
    }
    return mergeStepsById([...scenarioSteps, ...liveSteps, ...latestSteps]);
  }, [appendLog, liveSteps, readLatestScenarioSteps, scenarioSteps]);

  const persistRecorderEvents = useCallback(
    (recorderEvents: RecorderEvent[]) => {
      const recordedSteps = recorderEvents
        .map(eventToStep)
        .filter(Boolean) as AutomationStep[];
      if (!recordedSteps.length) return;
      const nextSteps = withoutAdjacentDuplicateNavigations(
        mergeStepsById([...scenarioSteps, ...liveSteps, ...recordedSteps]),
      );
      void persistSteps(nextSteps, { skipUndo: true }).catch((error) => {
        appendLog(error instanceof Error ? error.message : "Could not persist recorded commands.");
      });
    },
    [appendLog, liveSteps, persistSteps, scenarioSteps],
  );

  const undoLastTimelineChange = useCallback(async () => {
    const snapshot = undoStack.at(-1);
    if (!snapshot) {
      appendLog("Nothing to undo.");
      return;
    }
    setBusy(true);
    try {
      await persistSteps(snapshot.steps, { skipUndo: true, throwOnError: true });
      setUndoStack((current) => current.slice(0, -1));
      setEvents([]);
      const restoredIds = new Set(snapshot.steps.map((step) => step.id));
      const nextSelectedIds = snapshot.selectedStepIds.filter((id) => restoredIds.has(id));
      const nextSelectedStepId =
        snapshot.selectedStepId && restoredIds.has(snapshot.selectedStepId)
          ? snapshot.selectedStepId
          : nextSelectedIds[0] ?? null;
      setSelectedStepIds(new Set(nextSelectedIds));
      setSelectedStepId(nextSelectedStepId);
      if (!nextSelectedStepId) setDrawerOpen(false);
      appendLog("Undid last timeline change.");
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not undo last change.");
    } finally {
      setBusy(false);
    }
  }, [appendLog, persistSteps, undoStack]);

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") {
        return;
      }
      const target = event.target;
      const editable =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (editable) return;
      event.preventDefault();
      void undoLastTimelineChange();
    };
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoLastTimelineChange]);

  const persistScenarioMetadata = useCallback(
    async (metadataUpdate: Record<string, unknown>) => {
      const nextMetadata = { ...scenarioMetadataRecord(scenario), ...metadataUpdate };
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/scenarios/${encodeURIComponent(scenarioId)}`,
        {
          body: JSON.stringify({ metadata: nextMetadata }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const data = await readJsonResponse<{
        error?: string;
        scenario?: AutomationScenario;
      }>(response, {});
      if (!response.ok || !data.scenario) {
        throw new Error(data.error || "Could not save test data.");
      }
      setScenario(data.scenario);
      clearDraftCache(projectKey, scenarioId);
      return data.scenario;
    },
    [projectKey, scenario, scenarioId],
  );

  const openTestData = () => {
    const parameters = scenarioParameters;
    setParameterDrafts(parameters);
    setTestCaseDrafts(
      scenarioTestCases.length
        ? scenarioTestCases
        : [
            {
              data: defaultParameterData(parameters),
              enabled: true,
              expectedResult: "",
              id: makeTestCaseId(),
              name: "Test Case 1",
              priority: "medium",
              tags: [],
            },
          ],
    );
    setTestDataError("");
    setTestDataOpen(true);
  };

  const saveTestData = async () => {
    const { parameters, testCases } = normalizedTestDataDrafts(parameterDrafts, testCaseDrafts);
    if (!parameters.length && testCaseDrafts.length) {
      setTestDataError("Add at least one parameter before saving test cases.");
      return;
    }
    setTestDataSaving(true);
    setTestDataError("");
    try {
      await persistScenarioMetadata({
        automationParameters: parameters,
        testCases,
      });
      setTestDataOpen(false);
      appendLog(`Saved ${testCases.length} test case${testCases.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setTestDataError(error instanceof Error ? error.message : "Could not save test data.");
    } finally {
      setTestDataSaving(false);
    }
  };

  const createSession = useCallback(async (
    targetUrlOverride?: string,
    options: {
      browserMode?: RunBrowserMode;
      environment?: RunEnvironmentDraft | null;
      viewport?: RunViewport | null;
    } = {},
  ) => {
    const url = normalizeUrl(targetUrlOverride || targetUrl);
    const targetAuth = authFromUrl(url);
    const navigationUrl = cleanUrlAuth(url);
    const httpCredentials =
      options.environment?.basicAuthEnabled &&
      options.environment.username.trim()
        ? {
            password: options.environment.password,
            username: options.environment.username,
          }
        : targetAuth;
    const selectedBrowserMode = options.browserMode ?? browserMode;
    const response = await fetch("/api/automation/sessions", {
      body: JSON.stringify({
        httpCredentials,
        projectKey,
        provider:
          privateConnectorEnabled && shouldUsePrivateConnector(navigationUrl)
            ? "optional_local_connector"
            : undefined,
        scenarioId,
        browserMode: selectedBrowserMode,
        headless: selectedBrowserMode === "headless",
        targetUrl: navigationUrl,
        viewport: options.viewport ?? null,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = await readJsonResponse<{
      error?: string;
      sessionMetadata?: BrokerSessionMetadata;
    }>(response, {});
    const sessionMetadata = normalizeBrokerSessionMetadata(data.sessionMetadata);
    if (!response.ok || !sessionMetadata?.sessionId) {
      throw new Error(data.error || "Could not start browser session.");
    }
    setSession(sessionMetadata);
    appendLog(`Browser session ${sessionMetadata.status || "requested"}`);
    return sessionMetadata;
  }, [appendLog, browserMode, projectKey, scenarioId, targetUrl]);

  const closeSession = useCallback(
    async (reason = "Browser session closed") => {
      if (!session?.sessionId) return;
      const sessionId = session.sessionId;
      const isCompanionSession = isCompanionPreviewSession(session);
      setSession(null);
      setVerifyPicking(false);
      setRunStatus("idle");
      try {
        if (isCompanionSession) {
          await companionBrowserRequest({
            body: JSON.stringify({
              action: "stop",
              sessionId,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }).catch(() => undefined);
        } else {
          await fetch(`/api/automation/sessions/${encodeURIComponent(sessionId)}`, {
            method: "DELETE",
          });
        }
        appendLog(reason);
      } catch (error) {
        appendLog(error instanceof Error ? error.message : "Could not close browser session.");
      }
    },
    [appendLog, session],
  );

  const closeSessionById = useCallback(
    async (sessionId: string, reason = "Browser session closed") => {
      if (!sessionId) return;
      setSession((current) => (current?.sessionId === sessionId ? null : current));
      setVerifyPicking(false);
      setRunStatus("idle");
      try {
        await fetch(`/api/automation/sessions/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        });
        appendLog(reason);
      } catch (error) {
        appendLog(error instanceof Error ? error.message : "Could not close browser session.");
      }
    },
    [appendLog],
  );

  const setSessionRecorderMode = async (sessionId: string, mode: "off" | "record" | "verify") => {
    if (session?.sessionId === sessionId && isCompanionPreviewSession(session)) {
      if (mode === "off") {
        setSession((current) =>
          current && isCompanionPreviewSession(current)
            ? {
                ...current,
                metadata: {
                  ...(current.metadata ?? {}),
                  recorderMode: "off",
                },
                status: current.status === "recording" ? "previewing" : current.status,
              }
            : current,
        );
        return session;
      }
      const data = await companionBrowserRequest({
        body: JSON.stringify({
          action: mode === "record" ? "resume" : "start",
          sessionId,
          startUrl: cleanUrlAuth(targetUrl),
          viewport: viewportForRunConfig(runConfig),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionMetadata = companionSessionMetadata(data, data.url || targetUrl);
      if (!sessionMetadata?.sessionId) {
        throw new Error(data.error || "CaseForge Companion did not return a browser session.");
      }
      setSession(sessionMetadata);
      return sessionMetadata;
    }
    const response = await fetch(`/api/automation/sessions/${encodeURIComponent(sessionId)}/recorder-mode`, {
      body: JSON.stringify({ mode }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = await readJsonResponse<{
      error?: string;
      sessionMetadata?: BrokerSessionMetadata;
    }>(response, {});
    const sessionMetadata = normalizeBrokerSessionMetadata(data.sessionMetadata, sessionId);
    if (!response.ok || !sessionMetadata?.sessionId) {
      throw new Error(data.error || "Could not update recorder mode.");
    }
    setSession(sessionMetadata);
    return sessionMetadata;
  };

  const startVerifyCapture = async () => {
    setBusy(true);
    try {
      const url = resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl);
      if (shouldUseLegacyDesktopBridge(url)) {
        if (!isUsableBrokerSession(session) || !isCompanionPreviewSession(session)) {
          appendLog("Start Live Preview or Recorder before adding a verification in Companion.");
          return;
        }
        setRecordingSessionId(session.sessionId);
        setVerifyPicking(true);
        setRecorderState("verifyingTarget");
        appendLog("Verify mode is attached to the current Companion session. Use Live Inspector to choose a target, then add an assertion command.");
        return;
      }
      const activeSession = isUsableBrokerSession(session) ? session : await createSession(url);
      if (!activeSession.sessionId) throw new Error("Browser session was not created.");
      setProviderEventCaptureAfter(new Date().toISOString());
      setRecordingSessionId(activeSession.sessionId);
      setVerifyPicking(true);
      setRecorderState("verifyingTarget");
      await setSessionRecorderMode(activeSession.sessionId, "verify");
      appendLog("Verify mode started. Move over the browser, then click the element to verify.");
    } catch (error) {
      setVerifyPicking(false);
      setRecorderState(recording ? "recording" : "idle");
      appendLog(error instanceof Error ? error.message : "Could not start verify mode.");
    } finally {
      setBusy(false);
    }
  };

  const cancelVerifyCapture = async () => {
    const sessionId = recordingSessionId || session?.sessionId;
    setVerifyPicking(false);
    setRecorderState(recording ? "recording" : "idle");
    if (!recording) {
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
    }
    if (sessionId) {
      await setSessionRecorderMode(sessionId, recording ? "record" : "off").catch(() => undefined);
    }
    appendLog("Verify mode cancelled.");
  };

  const openBrowser = async () => {
    if (recordingActive) return;
    setBusy(true);
    const url = cleanUrlAuth(targetUrl);
    try {
      const useLegacyBridge = shouldUseLegacyDesktopBridge(url);
      if (!useLegacyBridge) {
        const navigateStep = makeNavigateStep(url);
        if (!visibleSteps.some((step) => step.action === "navigate" && step.target.value === url)) {
          void persistSteps([...finalizedSteps, navigateStep]);
        }
        if (session?.sessionId) {
          await closeSession("Previous browser session closed.");
        }
        await createSession(url, {
          browserMode: runConfig.browserMode,
          viewport: viewportForRunConfig(runConfig),
        });
        return;
      }
      const data = await companionBrowserRequest({
        body: JSON.stringify({
          action: "start",
          httpCredentials: authFromUrl(targetUrl),
          scenarioId,
          startUrl: url,
          viewport: viewportForRunConfig(runConfig),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!data.sessionId) {
        throw new Error(data.error || "CaseForge Companion did not return a browser session.");
      }
      companionCursorRef.current = data.cursor ?? 0;
      setRecording(true);
      setRecordingPaused(false);
      setRecordingSessionId(data.sessionId);
      setSession(companionSessionMetadata(data, url));
      setLivePreviewFailed(false);
      setEvents(companionCommandsToRecorderEvents(data.commands));
      if (data.logs) setLogs(data.logs.slice(-50));
      appendLog(`CaseForge Companion opened ${url}`);
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not open browser.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    setBusy(true);
    try {
      const url = cleanUrlAuth(targetUrl);
      if (!shouldUseLegacyDesktopBridge(url)) {
        if (recordingActive) {
          let recordedEvents = events;
          const stoppedSessionId = recordingSessionId || session?.sessionId || "";
          if (stoppedSessionId) {
            await setSessionRecorderMode(stoppedSessionId, "off").catch(() => undefined);
            recordedEvents = mergeRecorderEvents([
              ...recordedEvents,
              ...(await fetchSessionRecorderEvents(stoppedSessionId)),
            ]);
          }
          const recordedSteps = recordedEvents.map(eventToStep).filter(Boolean) as AutomationStep[];
          const nextSteps = withoutAdjacentDuplicateNavigations(mergeStepsById([...finalizedSteps, ...recordedSteps]));
          if (recordedSteps.length) {
            const selectedActionSteps = actionCandidateSteps(nextSteps).filter((step) =>
              recordedSteps.some((recordedStep) => recordedStep.id === step.id),
            );
            const stepIds = selectedActionSteps.map((step) => step.id).filter(Boolean) as string[];
            await persistSteps(nextSteps);
            if (stepIds.length) {
              setSelectedStepIds(new Set(stepIds));
              setSelectedStepId(stepIds[0] ?? null);
              setDrawerOpen(false);
              setActionName("");
              setActionDescription("");
              setActionModalStepIds(stepIds);
              setActionModalTimelineSteps(nextSteps);
              setActionModalError("");
              setActionModalOpen(true);
            }
          }
          setRecording(false);
          setRecordingPaused(false);
          setVerifyPicking(false);
          setRecordingSessionId(null);
          setProviderEventCaptureAfter(null);
          setEvents([]);
          await closeSessionById(
            stoppedSessionId,
            recordedSteps.length
              ? `Recording stopped. Saved ${recordedSteps.length} new command${
                  recordedSteps.length === 1 ? "" : "s"
                }. Name the Action before running. Browser closed.`
              : "Recording stopped. Browser closed.",
          );
          return;
        }
        setRecording(true);
        setRecordingPaused(false);
        ignoredRecorderStepIdsRef.current = new Set();
        appendLog("Starting recording...");
        const activeSession = isUsableBrokerSession(session)
          ? session
          : await createSession(undefined, {
              browserMode: runConfig.browserMode,
              viewport: viewportForRunConfig(runConfig),
            });
        if (!activeSession.sessionId) throw new Error("Browser session was not created.");
        setProviderEventCaptureAfter(new Date().toISOString());
        setRecordingSessionId(activeSession.sessionId);
        await setSessionRecorderMode(activeSession.sessionId, "record");
        appendLog("Recording started");
        return;
      }

      const nextRecording = !recordingActive;
      if (nextRecording) {
        setRecording(true);
        setRecordingPaused(false);
        appendLog("Starting recording...");
        const data = await companionBrowserRequest({
          body: JSON.stringify({
            action: "start",
            httpCredentials: authFromUrl(targetUrl),
            scenarioId,
            startUrl: url,
            viewport: viewportForRunConfig(runConfig),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!data.sessionId) {
          throw new Error(data.error || "CaseForge Companion did not return a browser session.");
        }
        companionCursorRef.current = data.cursor ?? 0;
        setRecordingSessionId(data.sessionId);
        setSession(companionSessionMetadata(data, url));
        setLivePreviewFailed(false);
        setProviderEventCaptureAfter(null);
        setEvents(companionCommandsToRecorderEvents(data.commands));
        if (data.logs) setLogs(data.logs.slice(-50));
        appendLog("Recording started in CaseForge Companion.");
        return;
      }

      const data = await companionBrowserRequest({
        body: JSON.stringify({
          action: "stop",
          sessionId: recordingSessionId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const recordedEvents = mergeRecorderEvents([
        ...events,
        ...companionCommandsToRecorderEvents(data.commands),
      ]);
      const recordedSteps = recordedEvents.map(eventToStep).filter(Boolean) as AutomationStep[];
      const nextSteps = withoutAdjacentDuplicateNavigations(mergeStepsById([...finalizedSteps, ...recordedSteps]));
      if (recordedSteps.length) {
        const selectedActionSteps = actionCandidateSteps(nextSteps).filter((step) =>
          recordedSteps.some((recordedStep) => recordedStep.id === step.id),
        );
        const stepIds = selectedActionSteps.map((step) => step.id).filter(Boolean) as string[];
        await persistSteps(nextSteps);
        if (stepIds.length) {
          setSelectedStepIds(new Set(stepIds));
          setSelectedStepId(stepIds[0] ?? null);
          setDrawerOpen(false);
          setActionName("");
          setActionDescription("");
          setActionModalStepIds(stepIds);
          setActionModalTimelineSteps(nextSteps);
          setActionModalError("");
          setActionModalOpen(true);
        }
      }
      setRecording(false);
      setRecordingPaused(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      setEvents([]);
      if (data.logs) setLogs(data.logs.slice(-50));
      appendLog(
        recordedSteps.length
          ? `Recording stopped. Saved ${recordedSteps.length} command${
              recordedSteps.length === 1 ? "" : "s"
            }.`
          : "Recording stopped.",
      );
    } catch (error) {
      setRecording(false);
      setRecordingPaused(false);
      setVerifyPicking(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      appendLog(error instanceof Error ? error.message : "Recording failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveLiveCommands = () => {
    const nextSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    void persistSteps(nextSteps);
    setEvents([]);
    appendLog(`Saved ${nextSteps.length} command${nextSteps.length === 1 ? "" : "s"}`);
  };

  const resetCommandPromptState = () => {
    setDrawerOpen(false);
    setCommandPromptDraft(null);
    setActionCommandEditor(null);
    setCommandPromptError("");
    setCommandPromptSaving(false);
    setLocatorDiagnosticsOpen(false);
    setLocatorTestResult("");
    setLocatorFlyout(null);
    setTimelineMenu(null);
    setCommandInsertMenu(null);
    setSelectedStepId(null);
  };

  const closeCommandPrompt = (event?: MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    resetCommandPromptState();
  };

  const resetActionModalState = () => {
    setActionModalOpen(false);
    setActionName("");
    setActionDescription("");
    setActionModalStepIds([]);
    setActionModalTimelineSteps([]);
    setActionModalError("");
  };

  const addStep = () => {
    const step = makeManualStep(visibleSteps.length + 1);
    void persistSteps([...finalizedSteps, step]);
    setActionCommandEditor(null);
    setCommandPromptError("");
    setSelectedStepId(step.id);
    setSelectedStepIds(new Set([step.id]));
    setDrawerOpen(true);
  };

  const insertWaitAfter = (stepId?: string) => {
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const waitStep = makeWaitStep();
    const index = stepId ? timelineSteps.findIndex((step) => step.id === stepId) : -1;
    const insertAt = index >= 0 ? index + 1 : timelineSteps.length;
    void persistSteps([
      ...timelineSteps.slice(0, insertAt),
      waitStep,
      ...timelineSteps.slice(insertAt),
    ]);
    setActionCommandEditor(null);
    setCommandPromptError("");
    setSelectedStepId(waitStep.id);
    setSelectedStepIds(new Set([waitStep.id]));
    setDrawerOpen(true);
    setLocatorDiagnosticsOpen(false);
  };

  const updateActionCommand = (
    editor: { actionId: string; actionStepId: string; stepId: string },
    update: (step: AutomationStep) => AutomationStep,
  ) => {
    const commands = actionStepCommands[editor.actionStepId] ?? [];
    const currentCommand = commands.find((command) => command.id === editor.stepId);
    if (!currentCommand) return;
    const nextCommandRaw = update(currentCommand);
    const commandText =
      nextCommandRaw.commandText && nextCommandRaw.commandText !== currentCommand.commandText
        ? nextCommandRaw.commandText
        : defaultCommandTextForStep(nextCommandRaw);
    const nextCommand = withLocatorQuality({ ...nextCommandRaw, commandText });
    const nextCommands = commands.map((command) =>
      command.id === editor.stepId ? nextCommand : command,
    );
    setActionStepCommands((current) => ({
      ...current,
      [editor.actionStepId]: nextCommands,
    }));
    void fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
        editor.actionId,
      )}/steps/${encodeURIComponent(editor.stepId)}`,
      {
        body: JSON.stringify({
          action: nextCommand.action,
          assertionType: nextCommand.assertionType,
          commandText: nextCommand.commandText,
          description: nextCommand.description,
          expectedValue: nextCommand.expectedValue,
          inputValue: nextCommand.inputValue,
          locatorCandidates: nextCommand.locatorCandidates,
          options: nextCommand.options,
          target: nextCommand.target,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    )
      .then(async (response) => {
        const data = await readJsonResponse<{
          action?: { steps?: AutomationStep[] };
          error?: string;
        }>(response, {});
        if (!response.ok || !data.action) {
          throw new Error(data.error || "Could not save command.");
        }
        setActionStepCommands((current) => ({
          ...current,
          [editor.actionStepId]: normalizeSteps(data.action?.steps ?? []),
        }));
      })
      .catch((error) => {
        appendLog(error instanceof Error ? error.message : "Could not save command.");
      });
  };

  const updateStep = (stepId: string, update: (step: AutomationStep) => AutomationStep) => {
    setCommandPromptError("");
    if (drawerOpen && commandPromptDraft?.id === stepId) {
      setCommandPromptDraft((current) => {
        if (!current || current.id !== stepId) return current;
        const nextStep = update(current);
        const commandText =
          nextStep.commandText && nextStep.commandText !== current.commandText
            ? nextStep.commandText
            : defaultCommandTextForStep(nextStep);
        return withLocatorQuality({ ...nextStep, commandText });
      });
      return;
    }
    if (actionCommandEditor?.stepId === stepId) {
      updateActionCommand(actionCommandEditor, update);
      return;
    }
    const sourceSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    void persistSteps(
      sourceSteps.map((step) => {
        if (step.id !== stepId) return step;
        const nextStep = update(step);
        const commandText =
          nextStep.commandText && nextStep.commandText !== step.commandText
            ? nextStep.commandText
            : defaultCommandTextForStep(nextStep);
        return withLocatorQuality({ ...nextStep, commandText });
      }),
    );
  };

  const updateCommandSchemaParameter = (
    stepId: string,
    parameter: AutomationCommandParameterDefinition,
    rawValue: unknown,
  ) => {
    updateStep(stepId, (step) => {
      const action = displayAction(step.action);
      const primaryParameter = primaryValueParameterForCommand(action);
      const options = {
        ...step.options,
        [parameter.name]: rawValue,
      };
      if (parameter.name === "locator") {
        const value = String(rawValue ?? "");
        return {
          ...step,
          options,
          target: {
            ...step.target,
            locatorType: inferLocatorTypeFromValue(value, step.target.locatorType),
            value,
          },
        };
      }
      if (primaryParameter?.name === parameter.name) {
        const value = String(rawValue ?? "");
        return {
          ...step,
          inputValue: value,
          options: {
            ...options,
            actual: isCompareCommandAction(action) && parameter.name === "actual" ? value : options.actual,
            parameterName: exactParameterNameFromText(value) || undefined,
          },
        };
      }
      if (isCompareCommandAction(action) && parameter.name === "actual") {
        const value = String(rawValue ?? "");
        return {
          ...step,
          inputValue: value,
          options: {
            ...options,
            actual: value,
            parameterName: exactParameterNameFromText(value) || undefined,
          },
        };
      }
      if (parameter.name === "expected" || parameter.name === "expectedText") {
        return {
          ...step,
          expectedValue: String(rawValue ?? ""),
          options,
        };
      }
      return {
        ...step,
        options,
      };
    });
  };

  const saveSelectedJavaScriptSnippetAsCommand = () => {
    if (!selectedStep || selectedStepAction !== "runJavaScriptSnippet") return;
    const script =
      typeof selectedStep.options?.script === "string"
        ? selectedStep.options.script.trim()
        : textValue(selectedStep.inputValue);
    if (!script) {
      setCommandPromptError("Add JavaScript before saving this snippet as a command.");
      return;
    }
    const defaultName =
      selectedStep.commandText && !/^Run JavaScript Snippet/i.test(selectedStep.commandText)
        ? selectedStep.commandText.replace(/\s*->\s*.+$/, "").trim()
        : "Custom JavaScript Command";
    const enteredName =
      typeof window !== "undefined"
        ? window.prompt("Custom command name", defaultName)
        : defaultName;
    const label = textValue(enteredName);
    if (!label) return;
    const enteredDescription =
      typeof window !== "undefined"
        ? window.prompt("Description", selectedStep.description || `Runs ${label}.`)
        : selectedStep.description || `Runs ${label}.`;
    const description = textValue(enteredDescription);
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "custom-js";
    const command: CustomSnippetCommand = {
      description,
      failIfEmpty: Boolean(selectedStep.options?.failIfEmpty),
      id: `${slug}-${Date.now().toString(36)}`,
      label,
      logOutputToConsole: selectedStep.options?.logOutputToConsole === undefined
        ? true
        : Boolean(selectedStep.options.logOutputToConsole),
      outputFormat: textValue(selectedStep.options?.outputFormat) || "auto",
      outputVariableName: phaseOutputVariable(selectedStep),
      script,
      timeoutMs: Number(selectedStep.options?.timeoutMs) || 5000,
      updatedAt: new Date().toISOString(),
    };
    setCustomSnippetCommands((current) => {
      const next = [...current.filter((item) => item.label.toLowerCase() !== label.toLowerCase()), command]
        .sort((left, right) => left.label.localeCompare(right.label));
      saveCustomSnippetCommands(projectKey, next);
      return next;
    });
    setCommandPromptError("");
    appendLog(`${label} saved as a custom command for this project.`);
  };

  const insertVariableIntoCommandParameter = (
    stepId: string,
    parameter: AutomationCommandParameterDefinition,
    currentValue: unknown,
    variableName: string,
    refKey: string,
  ) => {
    const token = parameterToken(variableName);
    const source = String(currentValue ?? "");
    const textarea = commandParameterTextareaRefs.current[refKey];
    const start = textarea?.selectionStart ?? source.length;
    const end = textarea?.selectionEnd ?? source.length;
    const before = source.slice(0, start);
    const after = source.slice(end);
    const needsLeadingSpace =
      before.length > 0 &&
      !/\s$/.test(before) &&
      !["`", "'", '"', "(", "{", "[", ":"].includes(before.slice(-1));
    const needsTrailingSpace =
      after.length > 0 &&
      !/^\s/.test(after) &&
      !["`", "'", '"', ")", "}", "]", ",", ";", "."].includes(after.slice(0, 1));
    const inserted = `${needsLeadingSpace ? " " : ""}${token}${needsTrailingSpace ? " " : ""}`;
    const nextValue = `${before}${inserted}${after}`;
    updateCommandSchemaParameter(stepId, parameter, nextValue);
    window.setTimeout(() => {
      const node = commandParameterTextareaRefs.current[refKey];
      if (!node) return;
      const cursor = before.length + inserted.length;
      node.focus();
      node.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const updateLogicDsl = (stepId: string, value: string) => {
    updateStep(stepId, (step) => ({
      ...step,
      inputValue: value,
      options: {
        ...step.options,
        dsl: value,
      },
    }));
  };

  const updateLogicEditorSuggest = (value: string, cursor: number) => {
    setLogicEditorSuggest(logicSuggestionTrigger(value, cursor));
  };

  const insertLogicSuggestion = (suggestion: LogicEditorSuggestion) => {
    if (!selectedStep?.id) return;
    const textarea = logicEditorTextareaRef.current;
    const source = logicDslValue(selectedStep);
    const cursor = textarea?.selectionStart ?? source.length;
    const activeSuggestion = logicEditorSuggest || logicSuggestionTrigger(source, cursor);
    const start = activeSuggestion?.start ?? cursor;
    const end = activeSuggestion?.end ?? cursor;
    const before = source.slice(0, start);
    const after = source.slice(end);
    const text = suggestion.insertText;
    const nextValue = `${before}${text}${after}`;
    updateLogicDsl(selectedStep.id, nextValue);
    setLogicEditorSuggest(null);
    window.setTimeout(() => {
      const node = logicEditorTextareaRef.current;
      if (!node) return;
      const quoteIndex = text.indexOf('""');
      const nextCursor = quoteIndex >= 0 ? before.length + quoteIndex + 1 : before.length + text.length;
      node.focus();
      node.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  const convertStepValueToParameter = async (step: AutomationStep) => {
    const currentValue = textValue(step.inputValue);
    const existingName = exactParameterNameFromText(currentValue);
    const suggestedName =
      existingName ||
      textValue(step.target?.displayName || step.element?.labelText || step.element?.placeholder || "value")
        .replace(/[^a-zA-Z0-9]+(.)/g, (_match, char: string) => char.toUpperCase())
        .replace(/^[^a-zA-Z_]+/, "")
        .replace(/^./, (char) => char.toLowerCase()) ||
      "value";
    const enteredName =
      typeof window !== "undefined"
        ? window.prompt("Parameter name", suggestedName)
        : suggestedName;
    const parameterName = textValue(enteredName).replace(/[{}\s]/g, "");
    if (!parameterName) return;
    const currentParameters = mergeParametersWithInferred(scenarioParameters, [parameterName]).map((parameter) =>
      parameter.name === parameterName
        ? {
            ...parameter,
            defaultValue: parameter.defaultValue || (existingName ? "" : currentValue),
            required: true,
          }
        : parameter,
    );
    const currentTestCases = scenarioTestCases.length
      ? scenarioTestCases.map((testCase) => ({
          ...testCase,
          data: {
            ...testCase.data,
            [parameterName]: testCase.data?.[parameterName] ?? (existingName ? "" : currentValue),
          },
        }))
      : [];
    updateStep(step.id, (current) => ({
      ...current,
      inputValue: parameterToken(parameterName),
      options: {
        ...current.options,
        isResolvedAtRuntime: true,
        isSecret: false,
        parameterName,
        valueReference: parameterName,
        valueSource: "testData",
        valueType: "testData",
      },
    }));
    try {
      await persistScenarioMetadata({
        automationParameters: currentParameters,
        testCases: currentTestCases,
      });
      appendLog(`Converted value to required scenario parameter {{${parameterName}}}.`);
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not save parameter.");
    }
  };

  const saveCommandPrompt = async () => {
    if (!selectedStep) {
      setCommandPromptError("Select a command before saving.");
      return false;
    }
    const validation = validateCommandPromptStep(selectedStep);
    if (!validation.ok) {
      setCommandPromptError(validation.message || "Fix the highlighted command field.");
      return false;
    }

    const commandText = selectedStep.commandText || readableStepLabel(selectedStep);
    const nextCommand = withLocatorQuality({
      ...selectedStep,
      commandText,
      description: selectedStep.description || commandText,
    });

    setCommandPromptSaving(true);
    setCommandPromptError("");
    try {
      if (actionCommandEditor) {
        const response = await fetch(
          `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
            actionCommandEditor.actionId,
          )}/steps/${encodeURIComponent(actionCommandEditor.stepId)}`,
          {
            body: JSON.stringify({
              action: nextCommand.action,
              assertionType: nextCommand.assertionType,
              commandText: nextCommand.commandText,
              description: nextCommand.description,
              expectedValue: nextCommand.expectedValue,
              inputValue: nextCommand.inputValue,
              locatorCandidates: nextCommand.locatorCandidates,
              options: nextCommand.options,
              target: nextCommand.target,
            }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
        );
        const data = await readJsonResponse<{
          action?: { steps?: AutomationStep[] };
          error?: string;
        }>(response, {});
        if (!response.ok || !data.action) {
          throw new Error(data.error || "Could not save command.");
        }
        setActionStepCommands((current) => ({
          ...current,
          [actionCommandEditor.actionStepId]: normalizeSteps(data.action?.steps ?? []),
        }));
        return true;
      }

      const sourceSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
      const nextSteps = sourceSteps.some((step) => step.id === nextCommand.id)
        ? sourceSteps.map((step) => (step.id === nextCommand.id ? nextCommand : step))
        : [...sourceSteps, nextCommand];
      await persistSteps(nextSteps, { throwOnError: true });
      setEvents([]);
      setSelectedStepId(nextCommand.id);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save command.";
      setCommandPromptError(message);
      appendLog(message);
      return false;
    } finally {
      setCommandPromptSaving(false);
    }
  };

  const saveOpenCommandPromptDraft = async () => {
    if (!drawerOpen || !commandPromptDraft) return true;
    return saveCommandPrompt();
  };

  const activeRunTestData = () => {
    if (testDataOpen) {
      const { parameters, testCases } = normalizedTestDataDrafts(parameterDrafts, testCaseDrafts);
      if (parameters.length) {
        return {
          parameters,
          testCases: testCases.filter((testCase) => testCase.enabled),
        };
      }
    }
    return {
      parameters: scenarioParameters,
      testCases: enabledTestCases,
    };
  };

  const openRuntimeModal = (mode: "record" | "run") => {
    runModalDismissedRef.current = false;
    setRunModalMode(mode);
    setRunConfig((current) => {
      const firstEnvironment = environmentDraftFromUrl(targetUrl);
      return {
        ...current,
        browserMode,
        environments: current.environments.length
          ? current.environments.map((environment, index) =>
              index === 0
                ? {
                    ...environment,
                    baseUrl: environment.baseUrl.trim() || firstEnvironment.baseUrl,
                    basicAuthEnabled:
                      environment.basicAuthEnabled || firstEnvironment.basicAuthEnabled,
                    name: environment.name.trim() || firstEnvironment.name,
                    password: environment.password || firstEnvironment.password,
                    username: environment.username || firstEnvironment.username,
                  }
                : environment,
            )
          : [firstEnvironment],
      };
    });
    setRunModalError("");
    setRunModalOpen(true);
  };

  const dismissRunModal = () => {
    runModalDismissedRef.current = true;
    setRunModalError("");
    setRunModalOpen(false);
  };

  const openRunModal = () => openRuntimeModal("run");

  const openRecordModal = () => openRuntimeModal("record");

  const inspectLivePoint = useCallback(async (x: number, y: number) => {
    if (!session?.sessionId || !session.liveViewUrl) return;
    liveInspectorAbortRef.current?.abort();
    const controller = new AbortController();
    liveInspectorAbortRef.current = controller;
    setLiveInspectorBusy(true);
    try {
      const inspectUrl = isCompanionPreviewSession(session)
        ? companionPreviewUrl(session, "inspect")
        : `/api/automation/sessions/${encodeURIComponent(session.sessionId)}/inspect`;
      const response = await fetch(
        inspectUrl,
        {
          body: JSON.stringify({ x, y }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: controller.signal,
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: LiveInspectorResult;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not inspect live browser point.");
      }
      setLiveInspectorResult(data.result ?? null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      appendLog(error instanceof Error ? error.message : "Could not inspect live browser point.");
    } finally {
      if (liveInspectorAbortRef.current === controller) {
        setLiveInspectorBusy(false);
      }
    }
  }, [appendLog, session?.liveViewUrl, session?.sessionId]);

  const clientPointToBrowserPoint = useCallback((clientX: number, clientY: number) => {
    const media = livePreviewImageRef.current;
    if (!media) return null;
    const naturalWidth = media.naturalWidth || 1280;
    const naturalHeight = media.naturalHeight || 720;
    const rect = media.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    if (
      localX < 0 ||
      localY < 0 ||
      localX > rect.width ||
      localY > rect.height
    ) {
      return null;
    }
    return {
      x: Math.round((localX / Math.max(rect.width, 1)) * naturalWidth),
      y: Math.round((localY / Math.max(rect.height, 1)) * naturalHeight),
    };
  }, []);

  const mediaPointerToBrowserPoint = useCallback((event: MouseEvent<HTMLElement>) => {
    return clientPointToBrowserPoint(event.clientX, event.clientY);
  }, [clientPointToBrowserPoint]);

  const handleLiveInspectorMove = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!liveInspectorEnabled || !session?.sessionId || workspaceTab !== "browser") return;
    if (liveCommandMenu) return;
    const point = mediaPointerToBrowserPoint(event);
    if (!point) {
      setLiveInspectorResult(null);
      return;
    }
    if (liveInspectorTimerRef.current) {
      window.clearTimeout(liveInspectorTimerRef.current);
    }
    liveInspectorTimerRef.current = window.setTimeout(() => {
      void inspectLivePoint(point.x, point.y);
    }, 180);
  }, [
    inspectLivePoint,
    liveInspectorEnabled,
    liveCommandMenu,
    mediaPointerToBrowserPoint,
    session?.sessionId,
    workspaceTab,
  ]);

  const requestLivePreviewScroll = useCallback(async (
    deltaX: number,
    deltaY: number,
    point?: { x: number; y: number } | null,
    targetY?: number,
  ) => {
    if (
      !session?.sessionId ||
      workspaceTab !== "browser" ||
      liveCommandMenu ||
      !isCompanionPreviewSession(session)
    ) {
      return;
    }

    const socket = livePreviewSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        deltaX,
        deltaY,
        targetY,
        type: targetY === undefined ? "scroll" : "scrollTo",
        x: point?.x,
        y: point?.y,
      }));
      return;
    }

    await fetch(companionPreviewUrl(session, "scroll"), {
      body: JSON.stringify({
        deltaX,
        deltaY,
        targetY,
        x: point?.x,
        y: point?.y,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          activeTabId?: string | null;
          error?: string;
          scroll?: { maxY?: number; y?: number };
          tabs?: CompanionPreviewTab[];
          url?: string;
        };
        if (!response.ok) throw new Error(data.error || "Could not scroll live preview.");
        if (data.url || data.tabs || data.activeTabId !== undefined) {
          setSession((current) =>
            patchCompanionSession(current, {
              activeTabId: data.activeTabId,
              tabs: data.tabs,
              url: data.url,
            }),
          );
        }
        if (data.scroll) {
          setLivePreviewScroll({
            maxY: Math.max(0, Number(data.scroll.maxY ?? 0)),
            y: Math.max(0, Number(data.scroll.y ?? 0)),
          });
        }
        setLivePreviewTick(Date.now());
      })
      .catch((error) => {
        appendLog(error instanceof Error ? error.message : "Could not scroll live preview.");
      });
  }, [
    appendLog,
    liveCommandMenu,
    session,
    workspaceTab,
  ]);

  const requestLivePreviewInteraction = useCallback(async (
    type: "click" | "doubleClick" | "key" | "rightClick",
    point?: { x: number; y: number } | null,
    keyData?: {
      altKey?: boolean;
      ctrlKey?: boolean;
      key?: string;
      metaKey?: boolean;
      text?: string;
    },
  ) => {
    if (
      !session?.sessionId ||
      workspaceTab !== "browser" ||
      liveCommandMenu ||
      !isCompanionPreviewSession(session)
    ) {
      return;
    }

    const payload = {
      ...(keyData ?? {}),
      type,
      x: point?.x,
      y: point?.y,
    };
    await fetch(companionPreviewUrl(session, "interact"), {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          activeTabId?: string | null;
          error?: string;
          scroll?: { maxY?: number; y?: number };
          tabs?: CompanionPreviewTab[];
          url?: string;
        };
        if (!response.ok) {
          throw new Error(
            data.error ||
              "Could not interact with live preview. Restart or update CaseForge Companion, then try again.",
          );
        }
        if (data.url || data.tabs || data.activeTabId !== undefined) {
          setSession((current) =>
            patchCompanionSession(current, {
              activeTabId: data.activeTabId,
              tabs: data.tabs,
              url: data.url,
            }),
          );
        }
        if (data.scroll) {
          setLivePreviewScroll({
            maxY: Math.max(0, Number(data.scroll.maxY ?? 0)),
            y: Math.max(0, Number(data.scroll.y ?? 0)),
          });
        }
        setLivePreviewTick(Date.now());
      })
      .catch((error) => {
        appendLog(error instanceof Error ? error.message : "Could not interact with live preview.");
      });
  }, [
    appendLog,
    liveCommandMenu,
    session,
    workspaceTab,
  ]);

  const requestLiveBrowserCommand = useCallback(async (
    command: "back" | "forward" | "reload" | "navigate" | "newTab" | "closeTab",
    url?: string,
  ) => {
    if (!session?.sessionId || !canControlLiveBrowser) {
      appendLog("Start a Companion Live Preview before using browser controls.");
      return false;
    }
    const commandUrl =
      (command === "navigate" || command === "newTab") && url
        ? resolveWorkspaceUrl(url)
        : url;
    if ((command === "navigate" || command === "newTab") && !commandUrl) {
      appendLog("Navigation URL still contains an unresolved variable. Set the Base URL first.");
      return false;
    }

    setBrowserNavBusy(true);
    try {
      const socket = livePreviewSocketRef.current;
      if (
        command !== "closeTab" &&
        socket?.readyState === WebSocket.OPEN
      ) {
        socket.send(JSON.stringify({
          command,
          type: "browserCommand",
          url: commandUrl,
        }));
        setLivePreviewFailed(false);
        setLivePreviewTick(Date.now());
        if (command === "newTab") setLivePreviewTabsExpanded(true);
        window.setTimeout(() => setBrowserNavBusy(false), 700);
        return true;
      }

      const response = await fetch(`${localAgentUrl}/automation/browser`, {
        body: JSON.stringify({
          action: command === "closeTab" ? "closePage" : "browserCommand",
          command,
          sessionId: session.sessionId,
          url: commandUrl,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readJsonResponse<CompanionBrowserResponse & { closed?: boolean }>(
        response,
        {},
      );
      if (!response.ok) {
        throw new Error(data.error || "Could not control Live Preview browser.");
      }
      if (data.status === "stopped") {
        setSession(null);
        setRecording(false);
        setRecordingSessionId("");
      } else {
        setSession((current) =>
          companionSessionMetadata(
            data,
            data.currentUrl || data.url || current?.currentUrl || browserAddressDraft || targetUrl,
          ) ?? current,
        );
      }
      setLivePreviewFailed(false);
      setLivePreviewTick(Date.now());
      if (command === "newTab") setLivePreviewTabsExpanded(true);
      return true;
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not control Live Preview browser.");
      return false;
    } finally {
      setBrowserNavBusy(false);
    }
  }, [
    appendLog,
    browserAddressDraft,
    canControlLiveBrowser,
    resolveWorkspaceUrl,
    session?.sessionId,
    targetUrl,
  ]);

  const submitLiveBrowserAddress = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUrl = resolveWorkspaceUrl(browserAddressDraft);
    if (!nextUrl) {
      appendLog("Navigation URL still contains an unresolved variable. Set the Base URL first.");
      return;
    }
    setBrowserAddressDraft(nextUrl);
    void requestLiveBrowserCommand("navigate", nextUrl);
  }, [appendLog, browserAddressDraft, requestLiveBrowserCommand, resolveWorkspaceUrl]);

  const switchLivePreviewTab = useCallback(async (tabId: string) => {
    if (
      !tabId ||
      !session?.sessionId ||
      workspaceTab !== "browser" ||
      !isCompanionPreviewSession(session)
    ) {
      return;
    }
    try {
      const response = await fetch(`${localAgentUrl}/automation/browser`, {
        body: JSON.stringify({
          action: "switchTab",
          sessionId: session.sessionId,
          tabId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readJsonResponse<CompanionBrowserResponse>(response, {});
      if (!response.ok) {
        throw new Error(data.error || "Could not switch Live Preview tab.");
      }
      setSession((current) =>
        companionSessionMetadata(
          data,
          data.currentUrl || data.url || current?.currentUrl || targetUrl,
        ) ?? current,
      );
      setLivePreviewTick(Date.now());
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not switch Live Preview tab.");
    }
  }, [appendLog, session, targetUrl, workspaceTab]);

  const startLivePreviewWheelPump = useCallback(() => {
    if (
      !session?.sessionId ||
      workspaceTab !== "browser" ||
      liveCommandMenu ||
      !isCompanionPreviewSession(session)
    ) {
      return;
    }

    if (livePreviewWheelTimerRef.current) return;

    livePreviewWheelTimerRef.current = window.setInterval(() => {
      if (livePreviewWheelInFlightRef.current) return;
      const next = livePreviewWheelDeltaRef.current;
      const hasDelta = Math.abs(next.deltaX) >= 0.5 || Math.abs(next.deltaY) >= 0.5;
      if (!hasDelta) {
        if (livePreviewWheelTimerRef.current) {
          window.clearInterval(livePreviewWheelTimerRef.current);
          livePreviewWheelTimerRef.current = null;
        }
        return;
      }

      livePreviewWheelDeltaRef.current = { deltaX: 0, deltaY: 0, point: null };
      livePreviewWheelInFlightRef.current = true;
      void requestLivePreviewScroll(next.deltaX, next.deltaY, next.point)
        .finally(() => {
          livePreviewWheelInFlightRef.current = false;
        });
    }, 16);
  }, [
    liveCommandMenu,
    requestLivePreviewScroll,
    session,
    workspaceTab,
  ]);

  const queueLivePreviewWheel = useCallback((
    deltaX: number,
    deltaY: number,
    point: { x: number; y: number } | null,
  ) => {
    livePreviewWheelDeltaRef.current = {
      deltaX: livePreviewWheelDeltaRef.current.deltaX + deltaX,
      deltaY: livePreviewWheelDeltaRef.current.deltaY + deltaY,
      point,
    };
    setLivePreviewScroll((current) => ({
      maxY: current.maxY,
      y: Math.min(Math.max(0, current.maxY || 0), Math.max(0, current.y + deltaY)),
    }));
    setLivePreviewTick(Date.now());
    startLivePreviewWheelPump();
  }, [startLivePreviewWheelPump]);

  const handleLivePreviewWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (
      !session?.sessionId ||
      workspaceTab !== "browser" ||
      liveCommandMenu ||
      !isCompanionPreviewSession(session)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, [
    liveCommandMenu,
    session,
    workspaceTab,
  ]);

  useEffect(() => {
    const container = livePreviewContainerRef.current;
    if (
      !container ||
      !session?.sessionId ||
      workspaceTab !== "browser" ||
      liveCommandMenu ||
      !isCompanionPreviewSession(session)
    ) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const point =
        clientPointToBrowserPoint(event.clientX, event.clientY) ?? {
          x: Math.round(activeLivePreviewSize.viewport.width / 2),
          y: Math.round(activeLivePreviewSize.viewport.height / 2),
        };
      const deltaScale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? activeLivePreviewSize.viewport.height
            : 1;
      const deltaX = event.deltaX * deltaScale;
      const deltaY = event.deltaY * deltaScale;
      queueLivePreviewWheel(deltaX, deltaY, point);
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [
    activeLivePreviewSize.viewport.height,
    activeLivePreviewSize.viewport.width,
    clientPointToBrowserPoint,
    liveCommandMenu,
    queueLivePreviewWheel,
    session,
    workspaceTab,
  ]);

  const handleLivePreviewSliderChange = useCallback((value: number) => {
    const targetY = Math.max(0, value);
    setLivePreviewScroll((current) => ({
      maxY: current.maxY,
      y: Math.min(Math.max(0, current.maxY || targetY), targetY),
    }));
    if (livePreviewSliderTimerRef.current) {
      window.clearTimeout(livePreviewSliderTimerRef.current);
    }
    livePreviewSliderTimerRef.current = window.setTimeout(() => {
      livePreviewSliderTimerRef.current = null;
      requestLivePreviewScroll(0, 0, null, targetY);
    }, 55);
  }, [requestLivePreviewScroll]);

  const handleLivePreviewKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (
      !session?.sessionId ||
      workspaceTab !== "browser" ||
      liveCommandMenu ||
      !isCompanionPreviewSession(session)
    ) {
      return;
    }

    if (!liveInspectorEnabled) {
      event.preventDefault();
      event.stopPropagation();
      const text =
        event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
          ? event.key
          : undefined;
      void requestLivePreviewInteraction("key", null, {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        text,
      });
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      requestLivePreviewScroll(0, 0, null, 0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      requestLivePreviewScroll(0, 0, null, livePreviewScroll.maxY || activeLivePreviewSize.viewport.height);
      return;
    }

    const keyboardScrollMap: Record<string, number> = {
      " ": activeLivePreviewSize.viewport.height * 0.78,
      ArrowDown: 120,
      ArrowUp: -120,
      PageDown: activeLivePreviewSize.viewport.height * 0.78,
      PageUp: activeLivePreviewSize.viewport.height * -0.78,
    };
    const deltaY = keyboardScrollMap[event.key];
    if (deltaY === undefined) return;

    event.preventDefault();
    requestLivePreviewScroll(0, deltaY, {
      x: Math.round(activeLivePreviewSize.viewport.width / 2),
      y: Math.round(activeLivePreviewSize.viewport.height / 2),
    });
  }, [
    activeLivePreviewSize.viewport.height,
    activeLivePreviewSize.viewport.width,
    liveCommandMenu,
    livePreviewScroll.maxY,
    liveInspectorEnabled,
    requestLivePreviewInteraction,
    requestLivePreviewScroll,
    session,
    workspaceTab,
  ]);

  const handleLiveInspectorClick = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const point = mediaPointerToBrowserPoint(event);
    if (point) void requestLivePreviewInteraction("click", point);
  }, [
    mediaPointerToBrowserPoint,
    requestLivePreviewInteraction,
  ]);

  const handleLivePreviewDoubleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const point = mediaPointerToBrowserPoint(event);
    if (point) void requestLivePreviewInteraction("doubleClick", point);
  }, [mediaPointerToBrowserPoint, requestLivePreviewInteraction]);

  const liveInspectorSnapshot = (result: LiveInspectorResult) => {
    const element = (result.element ?? {}) as Record<string, unknown>;
    const candidates = rankedLocators(result.locatorCandidates ?? []);
    const bestLocator = candidates[0];
    const directLabel = textValue(
      element.label ||
        element.ariaLabel ||
        element.labelText ||
        element.placeholder ||
        element.title ||
        element.text,
    );
    const tag = textValue(element.tag).toLowerCase();
    const role = textValue(element.role).toLowerCase();
    const inputType = textValue(element.inputType).toLowerCase();
    const genericLabel =
      tag === "select" || role === "combobox"
        ? "Dropdown"
        : inputType === "password"
          ? "Password field"
          : inputType === "email"
            ? "Email field"
            : inputType === "checkbox" || role === "checkbox"
              ? "Checkbox"
              : inputType === "radio" || role === "radio"
                ? "Radio button"
                : tag === "input" || tag === "textarea" || role === "textbox"
                  ? "Text field"
                  : role === "button" || tag === "button"
                    ? "Button"
                    : role === "link" || tag === "a"
                      ? "Link"
                      : "Element";
    const label =
      directLabel && !isGenericElementLabel(directLabel)
        ? elementName(element as AutomationStep["element"], directLabel)
        : genericLabel;
    const elementKind = textValue(
      element.elementKind || element.inputType || element.role || element.tag || "element",
    );
    return {
      bestLocator,
      candidates,
      label,
      snapshot: {
        ...element,
        elementKind,
        label,
        locatorCandidates: candidates,
        pageUrl: result.page?.url,
        text: textValue(element.text || element.label),
        type: elementKind,
      },
      targetValue: bestLocator?.value || label,
    };
  };

  const openLiveCommandMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!liveInspectorEnabled) {
      const point = mediaPointerToBrowserPoint(event);
      if (point) void requestLivePreviewInteraction("rightClick", point);
      return;
    }
    if (workspaceTab !== "browser") return;
    const result = liveInspectorResult?.element
      ? liveInspectorResult
      : activeLiveInspectorResult?.element
        ? activeLiveInspectorResult
        : null;
    const point = mediaPointerToBrowserPoint(event);
    if (!result?.element) {
      if (point) void inspectLivePoint(point.x, point.y);
      appendLog("Hover an element until the live inspector detects it, then right-click to author a command.");
      return;
    }
    setLiveInspectorSelected(result);
    setLiveCommandMenu({
      query: "",
      result,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 420)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 480)),
    });
  }, [
    activeLiveInspectorResult,
    appendLog,
    inspectLivePoint,
    liveInspectorEnabled,
    liveInspectorResult,
    mediaPointerToBrowserPoint,
    requestLivePreviewInteraction,
    workspaceTab,
  ]);

  const insertLivePreviewCommand = async (command: AutomationCommandDefinition) => {
    if (command.category === "custom.javascript") {
      const nextCommand = makeCommandLibraryStep(command, targetUrl);
      const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
      const selectedIndex = selectedStepId ? timelineSteps.findIndex((step) => step.id === selectedStepId) : -1;
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : timelineSteps.length;
      await persistSteps([
        ...timelineSteps.slice(0, insertAt),
        nextCommand,
        ...timelineSteps.slice(insertAt),
      ]);
      setSelectedStepId(nextCommand.id);
      setSelectedStepIds(new Set([nextCommand.id]));
      setDrawerOpen(true);
      setCommandPromptError("");
      setLiveCommandMenu(null);
      appendLog(`${command.label} added to the script from custom commands.`);
      return;
    }
    const result = liveCommandMenu?.result ?? activeLiveInspectorResult;
    if (!result?.element) return;
    const normalizedAction = normalizeAutomationAction(command.normalizedAction || command.action);
    const { bestLocator, candidates, label, snapshot, targetValue } = liveInspectorSnapshot(result);
    const needsValue = ["fill", "select", "type"].includes(normalizedAction);
    const adapterPending = !(command.executable && command.domain === "web");
    const draftCommand: AutomationStep = {
      action: normalizedAction,
      commandText: "",
      description: "",
      element: snapshot as AutomationStep["element"],
      expectedValue: normalizedAction === "assert" ? textValue(snapshot.text) : "",
      id: `step_${crypto.randomUUID().replace(/-/g, "")}`,
      inputValue:
        normalizedAction === "navigate"
          ? resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl)
          : normalizedAction === "press"
            ? "Enter"
            : "",
      locatorCandidates: candidates,
      options: {
        adapterPending,
        insertedFromLivePreview: true,
        outputVariableName: commandShowsOutputCapture(command)
          ? commandOutputDefaultName(command)
          : undefined,
        valueRequired: needsValue,
      },
      target: {
        displayName: label,
        elementKind: textValue(snapshot.elementKind || "element"),
        locatorType: locatorType(bestLocator),
        type: "smart",
        value: targetValue,
      },
    };
    const commandText =
      commandShowsOutputCapture(command)
        ? commandPhraseForStep(draftCommand, command)
        : liveCommandText(normalizedAction, label, command);
    const nextCommand: AutomationStep = withLocatorQuality({
      ...draftCommand,
      commandText,
      description: commandText,
    });
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const selectedIndex = selectedStepId ? timelineSteps.findIndex((step) => step.id === selectedStepId) : -1;
    const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : timelineSteps.length;
    await persistSteps([
      ...timelineSteps.slice(0, insertAt),
      nextCommand,
      ...timelineSteps.slice(insertAt),
    ]);
    setSelectedStepId(nextCommand.id);
    setSelectedStepIds(new Set([nextCommand.id]));
    setDrawerOpen(true);
    setCommandPromptError("");
    setLiveCommandMenu(null);
    appendLog(
      adapterPending
        ? `${command.label} added to the script. Execution adapter is pending.`
        : `${command.label} added to the script from live preview.`,
    );
  };

  const liveInspectorOverlayStyle = (result: LiveInspectorResult | null) => {
    const container = livePreviewContainerRef.current;
    if (!container || !result?.bounds) return undefined;
    const media = livePreviewImageRef.current;
    if (!media) return undefined;
    const viewport = result.page?.viewport ?? {};
    const viewportWidth = Number(viewport.width ?? 1280) || 1280;
    const viewportHeight = Number(viewport.height ?? 720) || 720;
    const containerRect = container.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    const bounds = numericRect(result.bounds);
    const rawWidth = (bounds.width / viewportWidth) * mediaRect.width;
    const rawHeight = (bounds.height / viewportHeight) * mediaRect.height;
    const width = Math.max(10, rawWidth);
    const height = Math.max(10, rawHeight);
    const left =
      mediaRect.left -
      containerRect.left +
      container.scrollLeft +
      (bounds.x / viewportWidth) * mediaRect.width -
      Math.max(0, width - rawWidth) / 2;
    const top =
      mediaRect.top -
      containerRect.top +
      container.scrollTop +
      (bounds.y / viewportHeight) * mediaRect.height -
      Math.max(0, height - rawHeight) / 2;
    return {
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
    };
  };

  const renderLiveInspectorOverlay = () => {
    if (!liveInspectorEnabled) return null;
    const result = activeLiveInspectorResult;
    const element = result?.element;
    const overlayStyle = liveInspectorOverlayStyle(result);
    const label = elementName(
      element as AutomationStep["element"],
      textValue(element?.elementKind || "Element"),
      result?.page?.url,
    );
    const actions = (result?.suggestedActions ?? []).slice(0, 4);

    return (
      <>
        {overlayStyle && element ? (
          <div
            className={`pointer-events-none absolute z-20 rounded-sm border-2 ${
              liveInspectorSelected
                ? "border-emerald-300 bg-emerald-300/20"
                : "border-sky-300 bg-sky-300/20"
            } shadow-[0_0_0_9999px_rgba(2,6,23,0.14)]`}
            style={overlayStyle}
          />
        ) : null}
        <div className="pointer-events-none absolute bottom-4 left-4 z-30 max-w-[min(420px,calc(100%-2rem))] rounded-2xl border border-zinc-700 bg-zinc-950/90 p-3 text-left text-xs text-zinc-100 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold uppercase tracking-[0.14em] text-sky-200">
                {liveInspectorSelected ? "Selected Element" : "Live Inspector"}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {element ? label : liveInspectorBusy ? "Inspecting..." : "Hover over the browser preview"}
              </p>
            </div>
            {liveInspectorSelected ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setLiveInspectorSelected(null);
                }}
                className="pointer-events-auto rounded-lg border border-zinc-700 px-2 py-1 font-semibold text-zinc-200 hover:bg-zinc-900"
              >
                Clear
              </button>
            ) : null}
          </div>
          {element ? (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-semibold text-sky-100">
                  {textValue(element.elementKind || element.tag || "element")}
                </span>
                {textValue(element.role) ? (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-200">
                    role: {textValue(element.role)}
                  </span>
                ) : null}
                {element.modal ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-100">
                    modal
                  </span>
                ) : null}
                {actions.map((action) => (
                  <span key={action} className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-200">
                    {commandDefinitionForAction(action)?.label || action}
                  </span>
                ))}
              </div>
              {activeLiveInspectorLocator ? (
                <p className="mt-2 break-all font-mono text-[11px] text-zinc-300">
                  {locatorType(activeLiveInspectorLocator)}={activeLiveInspectorLocator.value}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-zinc-400">
                Click the preview to lock this element for command authoring.
              </p>
            </>
          ) : null}
        </div>
      </>
    );
  };

  const renderLivePreviewScrollControls = () => {
    if (!session?.sessionId || !isCompanionPreviewSession(session)) return null;
    const scrollMax = Math.max(1, livePreviewScroll.maxY || activeLivePreviewSize.viewport.height);
    const scrollValue = Math.min(scrollMax, Math.max(0, livePreviewScroll.y));
    return (
      <div
        className="absolute right-1 top-16 z-30 flex h-[calc(100%-7rem)] w-5 flex-col items-center rounded-full bg-zinc-950/20 py-1 opacity-60 transition hover:bg-zinc-950/70 hover:opacity-100"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => requestLivePreviewScroll(0, 0, null, 0)}
          className="h-5 w-4 rounded-full text-[9px] font-bold leading-none text-zinc-100 hover:bg-zinc-800"
          title="Go to top of browser page"
        >
          T
        </button>
        <button
          type="button"
          onClick={() => requestLivePreviewScroll(0, -520)}
          className="h-5 w-4 rounded-full text-[10px] font-bold leading-none text-zinc-100 hover:bg-zinc-800"
          title="Scroll page up"
        >
          ^
        </button>
        <input
          type="range"
          min={0}
          max={scrollMax}
          value={scrollValue}
          onChange={(event) => handleLivePreviewSliderChange(Number(event.currentTarget.value))}
          className="min-h-0 flex-1 w-3 accent-emerald-400 [writing-mode:vertical-rl]"
          title="Drag to scroll the browser page"
        />
        <button
          type="button"
          onClick={() => requestLivePreviewScroll(0, 520)}
          className="h-5 w-4 rounded-full text-[10px] font-bold leading-none text-zinc-100 hover:bg-zinc-800"
          title="Scroll page down"
        >
          v
        </button>
        <button
          type="button"
          onClick={() => requestLivePreviewScroll(0, 0, null, scrollMax)}
          className="h-5 w-4 rounded-full text-[9px] font-bold leading-none text-zinc-100 hover:bg-zinc-800"
          title="Go to bottom of browser page"
        >
          B
        </button>
      </div>
    );
  };

  const resolveGlowCartDemoUrl = async () => {
    const configuredUrl = process.env.NEXT_PUBLIC_GLOWCART_DEMO_URL?.trim();
    if (configuredUrl) return normalizeUrl(configuredUrl);

    try {
      const response = await fetch(`${localAgentUrl}/demo/glowcart/start`, {
        method: "POST",
      });
      const data = await readJsonResponse<{ error?: string; url?: string }>(
        response,
        {},
      );
      if (!response.ok || !data.url) {
        throw new Error(data.error || "CaseForge Companion could not start GlowCart.");
      }
      return normalizeUrl(data.url);
    } catch (error) {
      throw new Error(companionOfflineMessage(error));
    }
  };

  const startHiddenLivePreview = async (
    previewUrl: string,
    sizeKey: LivePreviewSizeKey,
  ) => {
    const previewSize =
      LIVE_PREVIEW_SIZES.find((item) => item.key === sizeKey) ??
      LIVE_PREVIEW_SIZES[0];
    const data = await companionBrowserRequest({
      body: JSON.stringify({
        action: "start",
        browserMode: "headless",
        headless: true,
        livePreviewOnly: true,
        recorderMode: "off",
        scenarioId,
        startUrl: previewUrl,
        viewport: previewSize.viewport,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!data.sessionId) {
      throw new Error(data.error || "CaseForge Companion did not return a Live Preview session.");
    }
    let sessionData = data;
    try {
      const navigatedData = await companionBrowserRequest({
        body: JSON.stringify({
          action: "browserCommand",
          command: "navigate",
          sessionId: data.sessionId,
          url: previewUrl,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (navigatedData.sessionId) {
        sessionData = navigatedData;
      }
    } catch (error) {
      appendLog(
        error instanceof Error
          ? `GlowCart preview opened, but navigation refresh failed: ${error.message}`
          : "GlowCart preview opened, but navigation refresh failed.",
      );
    }
    companionCursorRef.current = sessionData.cursor ?? 0;
    setRecording(false);
    setRecordingPaused(false);
    setRecordingSessionId(sessionData.sessionId || data.sessionId);
    setProviderEventCaptureAfter(null);
    setSession(companionSessionMetadata(sessionData, previewUrl));
    setLivePreviewFailed(false);
    setBrowserAddressDraft(previewUrl);
    setLivePreviewTick(Date.now());
    setEvents(companionCommandsToRecorderEvents(sessionData.commands));
    if (sessionData.logs) setLogs(sessionData.logs.slice(-50));
    return previewSize;
  };

  const prepareGlowCartDemoAuthoring = async () => {
    if (busy) return;
    setBusy(true);
    setGlowCartPreparing(true);
    setWorkspaceTab("browser");
    setAuthoringPreviewError("");
    try {
      const demoUrl = await resolveGlowCartDemoUrl();
      const demoEnvironment = environmentDraftFromUrl(demoUrl);
      setTargetUrl(demoUrl);
      setAuthoringPreviewUrl(demoUrl);
      setRunConfig({
        ...defaultRunConfig(demoUrl),
        browserMode,
        environments: [
          {
            ...demoEnvironment,
            name: "GlowCart Demo",
          },
        ],
      });
      setRunModalError("");
      appendLog(`GlowCart demo selected at ${demoUrl}. Starting hidden Live Preview session.`);
      const previewSize = await startHiddenLivePreview(demoUrl, livePreviewSize);
      appendLog(`Hidden Live Preview started at ${demoUrl} (${previewSize.label}). Right-click elements to add commands, then use Run when ready.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "CaseForge Companion could not start GlowCart.";
      setAuthoringPreviewError(message);
      appendLog(message);
    } finally {
      setGlowCartPreparing(false);
      setBusy(false);
    }
  };

  useEffect(() => {
    const handleGlowCartDemoClick = (event: globalThis.MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const actionButton = target?.closest('[data-live-preview-action="glowcart-demo"]');
      if (!actionButton) return;
      event.preventDefault();
      void prepareGlowCartDemoAuthoring();
    };

    document.addEventListener("click", handleGlowCartDemoClick);
    return () => document.removeEventListener("click", handleGlowCartDemoClick);
  }, [prepareGlowCartDemoAuthoring]);

  const cycleLivePreviewSize = async () => {
    if (busy) return;
    const previewUrl = resolveWorkspaceUrl(authoringPreviewUrl || targetUrl);
    if (!previewUrl || !isCompanionPreviewSession(session)) {
      appendLog("Start a Live Preview session before changing preview size.");
      return;
    }
    const currentIndex = Math.max(
      0,
      LIVE_PREVIEW_SIZES.findIndex((item) => item.key === livePreviewSize),
    );
    const nextPreviewSize =
      LIVE_PREVIEW_SIZES[(currentIndex + 1) % LIVE_PREVIEW_SIZES.length];
    setBusy(true);
    setAuthoringPreviewError("");
    try {
      setLivePreviewSize(nextPreviewSize.key);
      const previewSize = await startHiddenLivePreview(previewUrl, nextPreviewSize.key);
      appendLog(
        `Live Preview size changed to ${previewSize.label} (${previewSize.viewport.width} x ${previewSize.viewport.height}).`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not change Live Preview size.";
      setAuthoringPreviewError(message);
      appendLog(message);
    } finally {
      setBusy(false);
    }
  };

  const updateRunEnvironment = (
    environmentId: string,
    update: Partial<RunEnvironmentDraft>,
  ) => {
    setRunConfig((current) => ({
      ...current,
      environments: current.environments.map((environment) =>
        environment.id === environmentId
          ? { ...environment, ...update }
          : environment,
      ),
    }));
  };

  const addRunEnvironment = () => {
    setRunConfig((current) => ({
      ...current,
      environments: [
        ...current.environments,
        makeEmptyEnvironmentDraft(current.environments.length + 1),
      ],
    }));
  };

  const removeRunEnvironment = (environmentId: string) => {
    setRunConfig((current) => ({
      ...current,
      environments:
        current.environments.length <= 1
          ? current.environments
          : current.environments.filter((environment) => environment.id !== environmentId),
    }));
  };

  const selectedRunEnvironments = (config: RunConfig) =>
    config.environments
      .filter((environment) => environment.enabled && environment.baseUrl.trim())
      .map((environment) => {
        const urlAuth = authFromUrl(environment.baseUrl);
        return {
          ...environment,
          baseUrl: cleanUrlAuth(environment.baseUrl),
          basicAuthEnabled: environment.basicAuthEnabled || Boolean(urlAuth),
          password: environment.password || urlAuth?.password || "",
          username: environment.username || urlAuth?.username || "",
        };
      });

  const startRecordingFromConfig = async (config: RunConfig) => {
    setBusy(true);
    try {
      const environments = selectedRunEnvironments(config);
      if (!environments.length) {
        setRunModalError("Select an environment with a URL.");
        return;
      }
      const environment = environments[0];
      if (environment.basicAuthEnabled && !environment.username.trim()) {
        setRunModalError("Enter the Basic Auth username.");
        return;
      }
      const viewport = viewportForRunConfig(config);
      const url = normalizeUrl(environment.baseUrl);
      setTargetUrl(url);
      const useLegacyBridge = shouldUseLegacyDesktopBridge(url);
      const reusableSession = isUsableBrokerSession(session) ? session : null;
      const canPromoteCompanionPreview =
        useLegacyBridge &&
        isCompanionPreviewSession(reusableSession) &&
        Boolean(reusableSession?.sessionId);
      if (!useLegacyBridge) {
        const navigateStep = makeNavigateStep(url);
        if (!visibleSteps.some((step) => step.action === "navigate" && step.target.value === url)) {
          void persistSteps([...scenarioSteps, navigateStep]);
        }
      }
      if (!useLegacyBridge && reusableSession?.sessionId) {
        setRecording(true);
        setRecordingPaused(false);
        setRecorderState("recording");
        setRecordingSessionId(reusableSession.sessionId);
        setProviderEventCaptureAfter(new Date().toISOString());
        await setSessionRecorderMode(reusableSession.sessionId, "record");
        setRunModalOpen(false);
        appendLog("Recording attached to the current browser session.");
        return;
      }
      setRecording(true);
      setRecordingPaused(false);
      setRecorderState("recording");
      ignoredRecorderStepIdsRef.current = new Set();
      appendLog(`Opening recorder at ${url}`);
      if (useLegacyBridge) {
        if (canPromoteCompanionPreview && session?.sessionId) {
          const data = await companionBrowserRequest({
            body: JSON.stringify({
              action: "mode",
              mode: "record",
              sessionId: session.sessionId,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          if (!data.sessionId) {
            throw new Error(data.error || "CaseForge Companion did not return a browser session.");
          }
          companionCursorRef.current = data.cursor ?? companionCursorRef.current;
          setRecordingSessionId(data.sessionId);
          setSession(companionSessionMetadata(data, data.url || url));
          setLivePreviewFailed(false);
          setProviderEventCaptureAfter(null);
          if (data.logs) setLogs(data.logs.slice(-50));
          setRunModalOpen(false);
          appendLog("Recording started in the current CaseForge Companion Live Preview.");
          return;
        }
        if (reusableSession?.sessionId && !isCompanionPreviewSession(reusableSession)) {
          throw new Error("The active browser session is not a Companion session. End it before starting private/local recording.");
        }
        const data = await companionBrowserRequest({
          body: JSON.stringify({
            action: "start",
            httpCredentials:
              environment.basicAuthEnabled && environment.username.trim()
                ? {
                    password: environment.password,
                    username: environment.username,
                  }
                : authFromUrl(environment.baseUrl),
            scenarioId,
            startUrl: url,
            viewport,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!data.sessionId) {
          throw new Error(data.error || "CaseForge Companion did not return a browser session.");
        }
        companionCursorRef.current = data.cursor ?? 0;
        setRecordingSessionId(data.sessionId);
        setSession(companionSessionMetadata(data, url));
        setLivePreviewFailed(false);
        setProviderEventCaptureAfter(null);
        setEvents(companionCommandsToRecorderEvents(data.commands));
        if (data.logs) setLogs(data.logs.slice(-50));
        setRunModalOpen(false);
        appendLog(`Recording started in CaseForge Companion on ${deviceLabelForRunConfig(config)}.`);
        return;
      }
      const activeSession = await createSession(url, {
        browserMode: config.browserMode,
        environment,
        viewport,
      });
      if (!activeSession.sessionId) throw new Error("Browser session was not created.");
      setProviderEventCaptureAfter(new Date().toISOString());
      setRecordingSessionId(activeSession.sessionId);
      await setSessionRecorderMode(activeSession.sessionId, "record");
      setRunModalOpen(false);
      appendLog("Recording started");
    } catch (error) {
      setRecording(false);
      setRecordingPaused(false);
      setRecorderState("idle");
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      appendLog(error instanceof Error ? error.message : "Could not start recording.");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async (config: RunConfig = runConfig) => {
    await startRecordingFromConfig(config);
  };

  const pauseRecording = async () => {
    const sessionId = recordingSessionId || session?.sessionId;
    if (!recording || !sessionId) return;
    if (!shouldUseLegacyDesktopBridge(resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl))) {
      await setSessionRecorderMode(sessionId, "off");
    }
    setRecordingPaused(true);
    setRecorderState("paused");
    appendLog("Recording paused.");
  };

  const resumeRecording = async () => {
    const sessionId = recordingSessionId || session?.sessionId;
    if (!recording || !sessionId) return;
    if (!shouldUseLegacyDesktopBridge(resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl))) {
      await setSessionRecorderMode(sessionId, "record");
    }
    setRecordingPaused(false);
    setRecorderState("recording");
    appendLog("Recording resumed.");
  };

  const stopRecording = async () => {
    if (!recording && !verifyPicking) return;
    if (verifyPicking && !recording) {
      await cancelVerifyCapture();
      return;
    }
    await toggleRecording();
    setRecorderState("idle");
  };

  const enterTargetSelectionMode = () => {
    setRecorderState("selectingTarget");
  };

  const exitTargetSelectionMode = () => {
    setRecorderState(recordingPaused ? "paused" : recording ? "recording" : "idle");
  };

  const enterVerifyMode = async () => {
    await startVerifyCapture();
  };

  const exitVerifyMode = async () => {
    await cancelVerifyCapture();
  };

  const resumeRunParameterContext = () => {
    const runTestData = activeRunTestData();
    const testCase = runTestData.testCases[0] ?? null;
    return {
      parameterData: testCase
        ? dataForTestCase(testCase, runTestData.parameters)
        : defaultParameterData(runTestData.parameters),
      testCase,
    };
  };

  const currentStepForRun = (step: AutomationStep) =>
    drawerOpen && commandPromptDraft?.id === step.id ? commandPromptDraft : step;

  const handleCommandPromptDone = async () => {
    const saved = await saveCommandPrompt();
    if (saved) closeCommandPrompt();
  };

  const addCustomLocatorCandidate = (
    stepId: string,
    locator: { type: string; value: string },
  ) => {
    const type = normalizeLocatorType(locator.type);
    const value = locator.value.trim();
    if (!value) return;
    updateStep(stepId, (step) => {
      const existing = rankedLocators(step.locatorCandidates);
      const hasCandidate = existing.some(
        (candidate) => locatorType(candidate) === type && candidate.value === value,
      );
      return {
        ...step,
        locatorCandidates: hasCandidate
          ? existing
          : [
              ...existing,
              {
                isUnique: false,
                metadata: { custom: true },
                score: type === "xpath" || type === "css" ? 45 : 60,
                source: "manual",
                strategy: type,
                value,
              },
            ],
      };
    });
  };

  const resolveStepAmbiguity = (stepId: string, previewIndex: number) => {
    const step =
      visibleSteps.find((item) => item.id === stepId) ??
      Object.values(actionStepCommands)
        .flat()
        .find((item) => item.id === stepId);
    const ambiguity = step ? stepAmbiguity(step) : null;
    if (!step || !ambiguity) return;
    const locator = locatorFromAmbiguityCandidate(ambiguity.candidate);
    updateStep(stepId, (current) => {
      const currentAmbiguity =
        current.options?.ambiguity && typeof current.options.ambiguity === "object"
          ? (current.options.ambiguity as Record<string, unknown>)
          : {};
      const candidate = ambiguity.candidate ?? currentAmbiguity.candidate ?? {
        strategy: locator.locatorType,
        value: locator.value,
      };
      return {
        ...current,
        options: {
          ...current.options,
          ambiguity: {
            ...currentAmbiguity,
            candidate,
            matchCount: ambiguity.matchCount,
            previews: ambiguity.previews,
            readabilityScore: ambiguity.quality.readability,
            resolutionMethod: "index",
            selectedIndex: previewIndex,
            stabilityScore: ambiguity.quality.stability,
            uniquenessScore: ambiguity.quality.uniqueness,
          },
        },
        target: {
          ...current.target,
          locatorType: locator.locatorType,
          type: "smart",
          value: locator.value || current.target.value,
        },
      };
    });
    appendLog(`Resolved duplicate locator with instance ${previewIndex + 1}.`);
  };

  const applyRuntimeAmbiguityToLocalState = (
    ambiguity: PendingAmbiguity,
    selectedIndex: number,
  ) => {
    const locator = locatorFromAmbiguityCandidate(ambiguity.locator);
    const updateCommand = (command: AutomationStep): AutomationStep => {
      const currentAmbiguity =
        command.options?.ambiguity && typeof command.options.ambiguity === "object"
          ? (command.options.ambiguity as Record<string, unknown>)
          : {};
      const nextCommand = {
        ...command,
        options: {
          ...command.options,
          ambiguity: {
            ...currentAmbiguity,
            candidate: ambiguity.locator,
            matchCount: ambiguity.matchCount,
            previews: ambiguity.previews ?? [],
            resolutionMethod: "index",
            selectedIndex,
          },
        },
        target: {
          ...command.target,
          locatorType: locator.locatorType,
          type: "smart" as const,
          value: locator.value || command.target.value,
        },
      };
      return { ...nextCommand, commandText: readableStepLabel(nextCommand) };
    };

    setActionStepCommands((current) => {
      const next: Record<string, AutomationStep[]> = {};
      for (const [actionStepId, commands] of Object.entries(current)) {
        next[actionStepId] = commands.map((command) =>
          command.id === ambiguity.stepId ? updateCommand(command) : command,
        );
      }
      return next;
    });

    if (!ambiguity.actionId && ambiguity.stepId) {
      void persistSteps(
        mergeStepsById([...finalizedSteps, ...liveSteps]).map((step) =>
          step.id === ambiguity.stepId ? updateCommand(step) : step,
        ),
      );
    }
  };

  const persistRuntimeAmbiguity = async (
    ambiguity: PendingAmbiguity,
    selectedIndex: number,
  ) => {
    if (!ambiguity.stepId) return;
    const locator = locatorFromAmbiguityCandidate(ambiguity.locator);
    const applyToCommand = (command: AutomationStep): AutomationStep => {
      const currentAmbiguity =
        command.options?.ambiguity && typeof command.options.ambiguity === "object"
          ? (command.options.ambiguity as Record<string, unknown>)
          : {};
      const nextCommand = {
        ...command,
        options: {
          ...command.options,
          ambiguity: {
            ...currentAmbiguity,
            candidate: ambiguity.locator,
            matchCount: ambiguity.matchCount,
            previews: ambiguity.previews ?? [],
            resolutionMethod: "index",
            selectedIndex,
          },
        },
        target: {
          ...command.target,
          locatorType: locator.locatorType,
          type: "smart" as const,
          value: locator.value || command.target.value,
        },
      };
      return { ...nextCommand, commandText: readableStepLabel(nextCommand) };
    };

    if (ambiguity.actionId) {
      const currentCommands =
        Object.values(actionStepCommands)
          .flat()
          .find((command) => command.id === ambiguity.stepId) ?? null;
      const nextCommand = applyToCommand(
        currentCommands ?? {
          action: "click",
          description: ambiguity.description || "Resolved command",
          id: ambiguity.stepId,
          target: {
            locatorType: locator.locatorType,
            type: "smart",
            value: locator.value,
          },
        },
      );
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
          ambiguity.actionId,
        )}/steps/${encodeURIComponent(ambiguity.stepId)}`,
        {
          body: JSON.stringify({
            commandText: nextCommand.commandText,
            description: nextCommand.description,
            options: nextCommand.options,
            target: nextCommand.target,
          }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const data = await readJsonResponse<{
        action?: { steps?: AutomationStep[] };
        error?: string;
      }>(response, {});
      if (!response.ok || !data.action) {
        throw new Error(data.error || "Could not save locator choice.");
      }
      const nextCommands = normalizeSteps(data.action.steps ?? []);
      setActionStepCommands((current) => {
        const next = { ...current };
        for (const actionStepId of Object.keys(next)) {
          if (next[actionStepId]?.some((command) => command.id === ambiguity.stepId)) {
            next[actionStepId] = nextCommands;
          }
        }
        return next;
      });
      return;
    }

    const sourceSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    await persistSteps(
      sourceSteps.map((step) => (step.id === ambiguity.stepId ? applyToCommand(step) : step)),
      { throwOnError: true },
    );
  };

  const resolveRuntimeAmbiguity = async (
    ambiguity: PendingAmbiguity,
    selectedIndex: number,
  ) => {
    try {
      applyRuntimeAmbiguityToLocalState(ambiguity, selectedIndex);
      await persistRuntimeAmbiguity(ambiguity, selectedIndex);
      const response = await fetch(
        `/api/automation/sessions/${encodeURIComponent(ambiguity.sessionId)}/resolve-ambiguity`,
        {
          body: JSON.stringify({
            resolutionMethod: "index",
            runId: ambiguity.runId,
            selectedIndex,
            stepId: ambiguity.stepId,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await readJsonResponse<{ error?: string }>(response, {});
      if (!response.ok) throw new Error(data.error || "Could not continue run.");
      setPendingAmbiguity(null);
      appendLog(`Selected instance ${selectedIndex + 1}; continuing run.`);
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not continue run.");
    }
  };

  const removeLiveEventsForStepIds = (stepIds: Set<string>) => {
    setEvents((current) =>
      current.filter((event) => {
        const step = eventToStep(event);
        const eventIds = [event.id, step?.id].filter(Boolean) as string[];
        const shouldRemove = eventIds.some((id) => stepIds.has(id));
        if (shouldRemove) {
          for (const id of eventIds) ignoredRecorderStepIdsRef.current.add(id);
        }
        return !shouldRemove;
      }),
    );
  };

  const deleteStep = (stepId: string) => {
    void persistSteps(finalizedSteps.filter((step) => step.id !== stepId));
    removeLiveEventsForStepIds(new Set([stepId]));
    setExpandedActionStepIds((current) => {
      const next = new Set(current);
      next.delete(stepId);
      return next;
    });
    setActionStepCommands((current) => {
      const next = { ...current };
      delete next[stepId];
      return next;
    });
    setSelectedStepIds((current) => {
      const next = new Set(current);
      next.delete(stepId);
      return next;
    });
    if (selectedStepId === stepId) {
      setSelectedStepId(null);
      setDrawerOpen(false);
    }
  };

  const timelineSelectionFor = (stepId: string) => {
    const selectedIds = selectedStepIds.has(stepId) ? selectedStepIds : new Set([stepId]);
    return mergeStepsById([...finalizedSteps, ...liveSteps]).filter((step) => selectedIds.has(step.id));
  };

  const deleteTimelineSelection = (stepId: string) => {
    const selectedIds = new Set(timelineSelectionFor(stepId).map((step) => step.id));
    if (!selectedIds.size) return;
    const deletedSavedCount = finalizedSteps.filter((step) => selectedIds.has(step.id)).length;
    if (deletedSavedCount) {
      void persistSteps(finalizedSteps.filter((step) => !selectedIds.has(step.id)));
    }
    removeLiveEventsForStepIds(selectedIds);
    setSelectedStepIds(new Set());
    if (selectedStepId && selectedIds.has(selectedStepId)) {
      setSelectedStepId(null);
      setDrawerOpen(false);
    }
    appendLog(`Deleted ${selectedIds.size} command${selectedIds.size === 1 ? "" : "s"}.`);
  };

  const moveTimelineActionToBin = async (step: AutomationStep) => {
    const actionId = step.target?.value;
    if (step.action !== "action" || !actionId) {
      deleteTimelineSelection(step.id);
      return;
    }
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const nextSteps = timelineSteps.filter((item) => item.id !== step.id);
    try {
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(actionId)}`,
        { method: "DELETE" },
      );
      const data = await readJsonResponse<{ error?: string }>(response, {});
      if (!response.ok) throw new Error(data.error || "Could not move action to recycle bin.");
      await persistSteps(nextSteps, { throwOnError: true });
      setEvents((current) => current.filter((event) => event.id !== step.id));
      setSelectedStepIds(new Set());
      setActionStepCommands((current) => {
        const next = { ...current };
        delete next[step.id];
        return next;
      });
      if (selectedStepId === step.id) {
        setSelectedStepId(null);
        setDrawerOpen(false);
      }
      appendLog(`Moved action "${step.target.displayName || step.commandText || "Action"}" to recycle bin.`);
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not move action to recycle bin.");
    }
  };

  const duplicateTimelineSelection = (stepId: string) => {
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const selectedIds = new Set(timelineSelectionFor(stepId).map((step) => step.id));
    if (!selectedIds.size) return;
    const lastSelectedIndex = timelineSteps.reduce(
      (lastIndex, step, index) => (selectedIds.has(step.id) ? index : lastIndex),
      -1,
    );
    const duplicates = timelineSteps
      .filter((step) => selectedIds.has(step.id))
      .map((step) =>
        withLocatorQuality({
          ...step,
          id: makeStepId(),
          status: "pending",
        }),
      );
    const insertAt = lastSelectedIndex >= 0 ? lastSelectedIndex + 1 : timelineSteps.length;
    const nextSteps = [
      ...timelineSteps.slice(0, insertAt),
      ...duplicates,
      ...timelineSteps.slice(insertAt),
    ];
    void persistSteps(nextSteps);
    setSelectedStepIds(new Set(duplicates.map((step) => step.id)));
    setSelectedStepId(duplicates[0]?.id ?? null);
    appendLog(`Duplicated ${duplicates.length} command${duplicates.length === 1 ? "" : "s"}.`);
  };

  const renameTimelineStep = (stepId: string) => {
    const step = visibleSteps.find((item) => item.id === stepId);
    if (!step || typeof window === "undefined") return;
    const nextName = window.prompt("Rename command", step.commandText || readableStepLabel(step));
    if (!nextName?.trim()) return;
    void persistSteps(
      mergeStepsById([...finalizedSteps, ...liveSteps]).map((current) =>
        current.id === step.id
          ? withLocatorQuality({
              ...current,
              commandText: nextName.trim(),
              description: nextName.trim(),
              target: {
                ...current.target,
                displayName:
                  current.action === "action"
                    ? nextName.trim().replace(/^Action:\s*/i, "")
                    : current.target.displayName,
              },
            })
          : current,
      ),
    );
    appendLog("Renamed command.");
  };

  const contextMenuPosition = (event: MouseEvent, isAction = false) => {
    const estimatedWidth = 224;
    const estimatedHeight = isAction ? 420 : 390;
    if (typeof window === "undefined") {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - estimatedWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - estimatedHeight - 8)),
    };
  };

  const openTimelineContextMenu = (event: MouseEvent, step: AutomationStep) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedStepIds.has(step.id)) {
      setSelectedStepIds(new Set([step.id]));
    }
    setSelectedStepId(step.id);
    setTimelineSelectionAnchorId(step.id);
    setTimelineMenu({ stepId: step.id, ...contextMenuPosition(event, step.action === "action") });
  };

  const openActionCommandContextMenu = (
    event: MouseEvent,
    actionStep: AutomationStep,
    command: AutomationStep,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (command.id) {
      const selectionKey = actionCommandSelectionKey(actionStep.id, command.id);
      if (!selectedActionCommandKeys.has(selectionKey)) {
        setSelectedActionCommandKeys(new Set([selectionKey]));
      }
      setActionCommandSelectionAnchorKey(selectionKey);
    }
    setActionCommandEditor({
      actionId: actionStep.target.value,
      actionStepId: actionStep.id,
      stepId: command.id,
    });
    setSelectedStepId(command.id);
    setTimelineMenu({
      actionStepId: actionStep.id,
      stepId: command.id,
      ...contextMenuPosition(event, command.action === "action"),
    });
  };

  const openCommandInsertLibrary = (position: "before" | "after") => {
    if (!timelineMenu) return;
    const actionStep = timelineMenu.actionStepId
      ? visibleSteps.find((step) => step.id === timelineMenu.actionStepId) ?? null
      : null;
    const pickerWidth = 440;
    const pickerHeight = 560;
    const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    setCommandInsertMenu({
      actionId: actionStep?.target?.value ?? null,
      actionStepId: timelineMenu.actionStepId ?? null,
      anchorStepId: timelineMenu.stepId,
      position,
      query: "",
      x: Math.max(12, Math.min(timelineMenu.x, viewportWidth - pickerWidth - 12)),
      y: Math.max(12, Math.min(timelineMenu.y, viewportHeight - pickerHeight - 12)),
    });
    setTimelineMenu(null);
  };

  const insertTimelineCommandFromLibrary = async (
    target: NonNullable<CommandInsertMenu>,
    command: AutomationStep,
  ) => {
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const anchorIndex = timelineSteps.findIndex((step) => step.id === target.anchorStepId);
    const insertAt =
      anchorIndex >= 0
        ? anchorIndex + (target.position === "after" ? 1 : 0)
        : timelineSteps.length;
    await persistSteps(
      [
        ...timelineSteps.slice(0, insertAt),
        command,
        ...timelineSteps.slice(insertAt),
      ],
      { throwOnError: true },
    );
    setEvents([]);
    setActionCommandEditor(null);
    setCommandPromptDraft(command);
    setSelectedStepId(command.id);
    setSelectedStepIds(new Set([command.id]));
    setCommandPromptError("");
    setLocatorDiagnosticsOpen(false);
    setDrawerOpen(true);
  };

  const insertActionCommandFromLibrary = async (
    target: NonNullable<CommandInsertMenu>,
    command: AutomationStep,
  ) => {
    if (!target.actionStepId || !target.actionId) {
      throw new Error("Action target was not found.");
    }
    const commands = actionStepCommands[target.actionStepId] ?? [];
    const anchorIndex = commands.findIndex((step) => step.id === target.anchorStepId);
    const targetIndex =
      anchorIndex >= 0
        ? anchorIndex + (target.position === "after" ? 1 : 0)
        : commands.length;
    const afterStepId = targetIndex > 0 ? commands[targetIndex - 1]?.id ?? null : null;
    const previousCommandIds = new Set(commands.map((step) => step.id).filter(Boolean));

    const response = await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
        target.actionId,
      )}/steps`,
      {
        body: JSON.stringify({
          afterStepId,
          step: command,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const data = await readJsonResponse<{
      action?: { steps?: AutomationStep[] };
      error?: string;
    }>(response, {});
    if (!response.ok || !data.action) {
      throw new Error(data.error || "Could not insert command into action.");
    }

    let nextCommands = normalizeSteps(data.action.steps ?? []);
    let insertedCommand =
      nextCommands.find((step) => step.id && !previousCommandIds.has(step.id)) ??
      nextCommands[targetIndex];
    if (
      insertedCommand?.id &&
      targetIndex < nextCommands.length &&
      nextCommands.findIndex((step) => step.id === insertedCommand?.id) !== targetIndex
    ) {
      const reordered = nextCommands.filter((step) => step.id !== insertedCommand?.id);
      reordered.splice(targetIndex, 0, insertedCommand);
      const reorderResponse = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
          target.actionId,
        )}`,
        {
          body: JSON.stringify({
            stepIds: reordered.map((step) => step.id).filter(Boolean),
          }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const reorderData = await readJsonResponse<{
        action?: { steps?: AutomationStep[] };
        error?: string;
      }>(reorderResponse, {});
      if (!reorderResponse.ok || !reorderData.action) {
        throw new Error(reorderData.error || "Could not place command in action.");
      }
      nextCommands = normalizeSteps(reorderData.action.steps ?? []);
      insertedCommand =
        nextCommands.find((step) => step.id === insertedCommand?.id) ??
        nextCommands[targetIndex];
    }

    setActionStepCommands((current) => ({
      ...current,
      [target.actionStepId as string]: nextCommands,
    }));
    setExpandedActionStepIds((current) => new Set(current).add(target.actionStepId as string));
    if (insertedCommand?.id) {
      setActionCommandEditor({
        actionId: target.actionId,
        actionStepId: target.actionStepId,
        stepId: insertedCommand.id,
      });
      setSelectedStepId(insertedCommand.id);
      setSelectedActionCommandKeys(
        new Set([actionCommandSelectionKey(target.actionStepId, insertedCommand.id)]),
      );
      setCommandPromptDraft(insertedCommand);
    }
    setCommandPromptError("");
    setLocatorDiagnosticsOpen(false);
    setDrawerOpen(true);
  };

  const insertCommandFromLibrary = async (command: AutomationCommandDefinition) => {
    const target = commandInsertMenu;
    if (!target) return;
    const draftCommand = makeCommandLibraryStep(command, targetUrl);
    setCommandInsertMenu(null);
    try {
      if (target.actionStepId) {
        await insertActionCommandFromLibrary(target, draftCommand);
      } else {
        await insertTimelineCommandFromLibrary(target, draftCommand);
      }
      appendLog(
        `${command.label} inserted ${target.position} the selected command${
          target.actionStepId ? " inside the action" : ""
        }.`,
      );
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not insert command.");
    }
  };

  const openLocatorFlyout = (
    event: MouseEvent,
    step: AutomationStep,
    actionStep?: AutomationStep,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (actionStep?.target?.value) {
      setActionCommandEditor({
        actionId: actionStep.target.value,
        actionStepId: actionStep.id,
        stepId: step.id,
      });
    } else {
      setActionCommandEditor(null);
    }
    setSelectedStepId(step.id);
    const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
    const flyoutWidth = 360;
    const flyoutHeight = 420;
    const margin = 12;
    setLocatorFlyout({
      actionStepId: actionStep?.id,
      stepId: step.id,
      x: Math.min(Math.max(event.clientX, margin), Math.max(margin, viewportWidth - flyoutWidth - margin)),
      y: Math.min(Math.max(event.clientY, margin), Math.max(margin, viewportHeight - flyoutHeight - margin)),
    });
  };

  const reorderTimelineStep = (dragStepId: string, dropStepId: string) => {
    if (dragStepId === dropStepId) return;
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const fromIndex = timelineSteps.findIndex((step) => step.id === dragStepId);
    const toIndex = timelineSteps.findIndex((step) => step.id === dropStepId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextSteps = [...timelineSteps];
    const [moved] = nextSteps.splice(fromIndex, 1);
    nextSteps.splice(toIndex, 0, moved);
    void persistSteps(nextSteps);
    setEvents([]);
    setSelectedStepId(dragStepId);
    setSelectedStepIds(new Set([dragStepId]));
    appendLog("Command order updated.");
  };

  const reorderActionCommand = (
    actionStep: AutomationStep,
    dragCommandId: string,
    dropCommandId: string,
  ) => {
    if (!actionStep.target?.value || dragCommandId === dropCommandId) return;
    const commands = actionStepCommands[actionStep.id] ?? [];
    const fromIndex = commands.findIndex((command) => command.id === dragCommandId);
    const toIndex = commands.findIndex((command) => command.id === dropCommandId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextCommands = [...commands];
    const [moved] = nextCommands.splice(fromIndex, 1);
    nextCommands.splice(toIndex, 0, moved);
    setActionStepCommands((current) => ({
      ...current,
      [actionStep.id]: nextCommands,
    }));
    void fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
        actionStep.target.value,
      )}`,
      {
        body: JSON.stringify({
          stepIds: nextCommands.map((command) => command.id).filter(Boolean),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    )
      .then(async (response) => {
        const data = await readJsonResponse<{
          action?: { steps?: AutomationStep[] };
          error?: string;
        }>(response, {});
        if (!response.ok || !data.action) {
          throw new Error(data.error || "Could not reorder action commands.");
        }
        setActionStepCommands((current) => ({
          ...current,
          [actionStep.id]: normalizeSteps(data.action?.steps ?? []),
        }));
        appendLog("Action command order updated.");
      })
      .catch((error) => {
        appendLog(error instanceof Error ? error.message : "Could not reorder action commands.");
      });
  };

  const canMoveTimelineStepIntoAction = (actionStep: AutomationStep, sourceStepId?: string | null) => {
    if (!actionStep.target?.value || !sourceStepId || actionStep.id === sourceStepId) return false;
    const sourceIndex = visibleSteps.findIndex((step) => step.id === sourceStepId);
    const sourceStep = sourceIndex >= 0 ? visibleSteps[sourceIndex] : null;
    if (!sourceStep || isScenarioInitStep(sourceStep, sourceIndex)) return false;
    if (sourceStep.action === "action" && sourceStep.target?.value === actionStep.target.value) return false;
    return true;
  };

  const moveTimelineStepIntoAction = async (
    actionStep: AutomationStep,
    sourceStepId: string,
    insertIndex?: number,
  ) => {
    if (!canMoveTimelineStepIntoAction(actionStep, sourceStepId)) return;
    const sourceStep = visibleSteps.find((step) => step.id === sourceStepId);
    if (!sourceStep || !actionStep.target?.value) return;
    const currentCommands = actionStepCommands[actionStep.id] ?? [];
    const targetIndex =
      typeof insertIndex === "number"
        ? Math.max(0, Math.min(insertIndex, currentCommands.length))
        : currentCommands.length;
    const afterStepId = targetIndex > 0 ? currentCommands[targetIndex - 1]?.id ?? null : null;
    const previousCommandIds = new Set(currentCommands.map((command) => command.id).filter(Boolean));

    try {
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
          actionStep.target.value,
        )}/steps`,
        {
          body: JSON.stringify({
            afterStepId,
            step: sourceStep,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await readJsonResponse<{
        action?: { steps?: AutomationStep[] };
        error?: string;
      }>(response, {});
      if (!response.ok || !data.action) {
        throw new Error(data.error || "Could not add command to action.");
      }

      let nextCommands = normalizeSteps(data.action.steps ?? []);
      const insertedCommand = nextCommands.find((command) => command.id && !previousCommandIds.has(command.id));
      if (
        insertedCommand?.id &&
        targetIndex < nextCommands.length &&
        nextCommands.findIndex((command) => command.id === insertedCommand.id) !== targetIndex
      ) {
        const reordered = nextCommands.filter((command) => command.id !== insertedCommand.id);
        reordered.splice(targetIndex, 0, insertedCommand);
        setActionStepCommands((current) => ({
          ...current,
          [actionStep.id]: reordered,
        }));
        const reorderResponse = await fetch(
          `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
            actionStep.target.value,
          )}`,
          {
            body: JSON.stringify({
              stepIds: reordered.map((command) => command.id).filter(Boolean),
            }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
        );
        const reorderData = await readJsonResponse<{
          action?: { steps?: AutomationStep[] };
          error?: string;
        }>(reorderResponse, {});
        if (!reorderResponse.ok || !reorderData.action) {
          throw new Error(reorderData.error || "Could not place command in action.");
        }
        nextCommands = normalizeSteps(reorderData.action.steps ?? []);
      }

      setActionStepCommands((current) => ({
        ...current,
        [actionStep.id]: nextCommands,
      }));
      setExpandedActionStepIds((current) => new Set(current).add(actionStep.id));
      await persistSteps(
        visibleSteps.filter((step) => step.id !== sourceStepId),
        { throwOnError: true },
      );
      setEvents([]);
      setSelectedStepId(actionStep.id);
      setSelectedStepIds(new Set([actionStep.id]));
      appendLog(
        targetIndex >= currentCommands.length
          ? `Added command to the bottom of ${actionStep.target.displayName || actionStep.commandText || "action"}.`
          : `Inserted command into ${actionStep.target.displayName || actionStep.commandText || "action"}.`,
      );
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not add command to action.");
    } finally {
      setDraggedStepId(null);
      setActionDropTarget(null);
    }
  };

  const moveActionCommandToTimeline = async (
    actionStepId: string,
    commandId: string,
    insertBeforeStepId?: string,
  ) => {
    const actionStep = visibleSteps.find((step) => step.id === actionStepId);
    if (!actionStep?.target?.value || !commandId) return;
    const commands = actionStepCommands[actionStepId] ?? [];
    const sourceCommand = commands.find((command) => command.id === commandId);
    if (!sourceCommand) return;

    const timelineSteps = mergeStepsById([...visibleSteps]);
    const requestedInsertAt = insertBeforeStepId
      ? timelineSteps.findIndex((step) => step.id === insertBeforeStepId)
      : -1;
    const insertAt = requestedInsertAt >= 0 ? requestedInsertAt : timelineSteps.length;
    const cleanedOptions = { ...(sourceCommand.options ?? {}) };
    delete cleanedOptions.sourceActionId;
    delete cleanedOptions.sourceActionName;
    const timelineCommand = withLocatorQuality({
      ...sourceCommand,
      id: makeStepId(),
      options: cleanedOptions,
      status: "pending",
    });
    const nextActionStep = {
      ...actionStep,
      options: {
        ...actionStep.options,
        stepCount: Math.max(0, commands.length - 1),
      },
    };
    const nextTimelineSteps = timelineSteps.map((step) =>
      step.id === actionStep.id ? nextActionStep : step,
    );
    nextTimelineSteps.splice(insertAt, 0, timelineCommand);

    try {
      await persistSteps(nextTimelineSteps, { throwOnError: true });
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
          actionStep.target.value,
        )}/steps/${encodeURIComponent(commandId)}`,
        { method: "DELETE" },
      );
      const data = await readJsonResponse<{
        action?: { steps?: AutomationStep[] };
        error?: string;
      }>(response, {});
      if (!response.ok || !data.action) {
        throw new Error(data.error || "Could not remove command from action.");
      }

      const nextCommands = normalizeSteps(data.action.steps ?? []);
      setActionStepCommands((current) => ({
        ...current,
        [actionStep.id]: nextCommands,
      }));
      setSelectedActionCommandKeys((current) => {
        const movedKey = actionCommandSelectionKey(actionStep.id, commandId);
        return new Set([...current].filter((key) => key !== movedKey));
      });
      setActionCommandEditor((current) =>
        current?.actionStepId === actionStep.id && current.stepId === commandId ? null : current,
      );
      setSelectedStepId(timelineCommand.id);
      setSelectedStepIds(new Set([timelineCommand.id]));
      setDrawerOpen(false);
      setEvents([]);
      appendLog(
        `Moved command out of ${actionStep.target.displayName || actionStep.commandText || "action"}.`,
      );
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not move command out of action.");
    } finally {
      setDraggedActionCommand(null);
      setActionDropTarget(null);
    }
  };

  const insertActionWaitAfter = (actionStep: AutomationStep, afterStepId?: string) => {
    if (!actionStep.target?.value) return;
    const waitStep = makeWaitStep();
    const commands = actionStepCommands[actionStep.id] ?? [];
    const afterIndex = afterStepId
      ? commands.findIndex((command) => command.id === afterStepId)
      : commands.length - 1;
    const insertAt = afterIndex >= 0 ? afterIndex + 1 : commands.length;
    setActionStepCommands((current) => ({
      ...current,
      [actionStep.id]: [
        ...commands.slice(0, insertAt),
        waitStep,
        ...commands.slice(insertAt),
      ],
    }));
    setActionCommandEditor({
      actionId: actionStep.target.value,
      actionStepId: actionStep.id,
      stepId: waitStep.id,
    });
    setSelectedStepId(waitStep.id);
    setLocatorDiagnosticsOpen(false);
    setDrawerOpen(true);
    void fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
        actionStep.target.value,
      )}/steps`,
      {
        body: JSON.stringify({
          afterStepId: afterStepId ?? null,
          step: waitStep,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    )
      .then(async (response) => {
        const data = await readJsonResponse<{
          action?: { steps?: AutomationStep[] };
          error?: string;
        }>(response, {});
        if (!response.ok || !data.action) {
          throw new Error(data.error || "Could not insert wait command.");
        }
        const nextCommands = normalizeSteps(data.action.steps ?? []);
        const savedWait =
          nextCommands.find(
            (command) =>
              command.action === "wait" &&
              command.commandText === waitStep.commandText &&
              command.inputValue === waitStep.inputValue,
          ) ?? nextCommands[insertAt];
        setActionStepCommands((current) => ({
          ...current,
          [actionStep.id]: nextCommands,
        }));
        if (savedWait?.id) {
          setActionCommandEditor({
            actionId: actionStep.target.value,
            actionStepId: actionStep.id,
            stepId: savedWait.id,
          });
          setSelectedStepId(savedWait.id);
        }
        appendLog("Inserted wait command into action.");
      })
      .catch((error) => {
        appendLog(error instanceof Error ? error.message : "Could not insert wait command.");
        setActionStepCommands((current) => ({
          ...current,
          [actionStep.id]: commands,
        }));
      });
  };

  const toggleStepSelection = (stepId: string, checked: boolean) => {
    setSelectedStepIds((current) => {
      const next = new Set(current);
      if (checked) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
    setSelectedStepId(stepId);
    setTimelineSelectionAnchorId(stepId);
  };

  const focusTimelineStep = (stepId: string) => {
    setSelectedStepId(stepId);
    window.requestAnimationFrame(() => timelineStepRefs.current[stepId]?.focus());
  };

  const selectTimelineRange = (anchorStepId: string, targetStepId: string) => {
    const anchorIndex = timelineStepIds.indexOf(anchorStepId);
    const targetIndex = timelineStepIds.indexOf(targetStepId);
    if (anchorIndex < 0 || targetIndex < 0) return;
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    setSelectedStepIds(new Set(timelineStepIds.slice(start, end + 1)));
  };

  const setAllTimelineStepsSelected = (checked: boolean) => {
    setSelectedStepIds(checked ? new Set(timelineStepIds) : new Set());
    const nextAnchor = checked ? timelineStepIds[0] ?? null : null;
    setSelectedStepId(nextAnchor);
    setTimelineSelectionAnchorId(nextAnchor);
    if (checked && nextAnchor) focusTimelineStep(nextAnchor);
  };

  const handleTimelineStepKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    step: AutomationStep,
    index: number,
  ) => {
    if (!timelineStepIds.length) return;
    if (event.target !== event.currentTarget) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setAllTimelineStepsSelected(true);
      appendLog(`Selected ${timelineStepIds.length} command${timelineStepIds.length === 1 ? "" : "s"}.`);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(timelineStepIds.length - 1, index + direction));
      const nextStepId = timelineStepIds[nextIndex];
      if (!nextStepId) return;
      if (event.shiftKey) {
        const anchorStepId =
          timelineSelectionAnchorId && timelineStepIds.includes(timelineSelectionAnchorId)
            ? timelineSelectionAnchorId
            : selectedStepId && timelineStepIds.includes(selectedStepId)
              ? selectedStepId
              : step.id;
        setTimelineSelectionAnchorId(anchorStepId);
        selectTimelineRange(anchorStepId, nextStepId);
      } else if (!event.ctrlKey && !event.metaKey) {
        setTimelineSelectionAnchorId(nextStepId);
        setSelectedStepIds((current) => (current.has(nextStepId) ? current : new Set()));
      }
      focusTimelineStep(nextStepId);
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      toggleStepSelection(step.id, !selectedStepIds.has(step.id));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openTimelineStep(step);
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && !recordingActive) {
      event.preventDefault();
      deleteTimelineSelection(step.id);
      return;
    }

    if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && step.action === "action") {
      event.preventDefault();
      const shouldExpand = event.key === "ArrowRight";
      setExpandedActionStepIds((current) => {
        const next = new Set(current);
        if (shouldExpand) next.add(step.id);
        else next.delete(step.id);
        return next;
      });
      if (shouldExpand) void loadActionStepCommands(step);
    }
  };

  const actionCommandKeysFor = (actionStepId: string) =>
    (actionStepCommands[actionStepId] ?? [])
      .map((command) => (command.id ? actionCommandSelectionKey(actionStepId, command.id) : ""))
      .filter(Boolean);

  const focusActionCommand = (selectionKey: string) => {
    window.requestAnimationFrame(() => actionCommandRefs.current[selectionKey]?.focus());
  };

  const toggleActionCommandSelection = (
    actionStep: AutomationStep,
    command: AutomationStep,
    checked: boolean,
  ) => {
    if (!command.id) return;
    const selectionKey = actionCommandSelectionKey(actionStep.id, command.id);
    setSelectedActionCommandKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(selectionKey);
      else next.delete(selectionKey);
      return next;
    });
    setActionCommandSelectionAnchorKey(selectionKey);
    setActionCommandEditor({
      actionId: actionStep.target.value,
      actionStepId: actionStep.id,
      stepId: command.id,
    });
    setSelectedStepId(command.id);
  };

  const selectActionCommandRange = (actionStepId: string, anchorKey: string, targetKey: string) => {
    const commandKeys = actionCommandKeysFor(actionStepId);
    const anchorIndex = commandKeys.indexOf(anchorKey);
    const targetIndex = commandKeys.indexOf(targetKey);
    if (anchorIndex < 0 || targetIndex < 0) return;
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    setSelectedActionCommandKeys((current) => {
      const next = new Set([...current].filter((key) => !key.startsWith(`${actionStepId}:`)));
      for (const key of commandKeys.slice(start, end + 1)) next.add(key);
      return next;
    });
  };

  const setAllActionCommandsSelected = (actionStep: AutomationStep, checked: boolean) => {
    const commandKeys = actionCommandKeysFor(actionStep.id);
    setSelectedActionCommandKeys((current) => {
      const next = new Set([...current].filter((key) => !key.startsWith(`${actionStep.id}:`)));
      if (checked) for (const key of commandKeys) next.add(key);
      return next;
    });
    const nextAnchor = checked ? commandKeys[0] ?? null : null;
    setActionCommandSelectionAnchorKey(nextAnchor);
    if (nextAnchor) focusActionCommand(nextAnchor);
  };

  const handleActionCommandKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    actionStep: AutomationStep,
    command: AutomationStep,
    index: number,
  ) => {
    if (!command.id || event.target !== event.currentTarget) return;
    const commandKeys = actionCommandKeysFor(actionStep.id);
    const selectionKey = actionCommandSelectionKey(actionStep.id, command.id);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setAllActionCommandsSelected(actionStep, true);
      appendLog(`Selected ${commandKeys.length} action command${commandKeys.length === 1 ? "" : "s"}.`);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(commandKeys.length - 1, index + direction));
      const nextKey = commandKeys[nextIndex];
      if (!nextKey) return;
      if (event.shiftKey) {
        const anchorKey =
          actionCommandSelectionAnchorKey && commandKeys.includes(actionCommandSelectionAnchorKey)
            ? actionCommandSelectionAnchorKey
            : selectionKey;
        setActionCommandSelectionAnchorKey(anchorKey);
        selectActionCommandRange(actionStep.id, anchorKey, nextKey);
      } else if (!event.ctrlKey && !event.metaKey) {
        setActionCommandSelectionAnchorKey(nextKey);
      }
      focusActionCommand(nextKey);
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      toggleActionCommandSelection(actionStep, command, !selectedActionCommandKeys.has(selectionKey));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openActionCommandPrompt(actionStep, command);
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && !recordingActive) {
      event.preventDefault();
      const selectedIds = [...selectedActionCommandKeys]
        .filter((key) => key.startsWith(`${actionStep.id}:`))
        .map((key) => key.slice(actionStep.id.length + 1));
      void deleteActionCommandsByIds(actionStep, selectedIds.includes(command.id) ? selectedIds : [command.id]);
    }
  };

  const fetchSessionRecorderEvents = async (sessionId: string) => {
    const response = await fetch(`/api/automation/sessions/${encodeURIComponent(sessionId)}/events`, {
      cache: "no-store",
    });
    const data = await readJsonResponse<{
      events?: ProviderSessionEvent[];
      error?: string;
    }>(response, {});
    if (!response.ok) throw new Error(data.error || "Could not read recorded commands.");
    const captureAfterMs = providerEventCaptureAfter ? Date.parse(providerEventCaptureAfter) : 0;
    return recorderEventsFromProviderEvents(data.events ?? [], captureAfterMs);
  };

  const loadActionStepCommands = async (step: AutomationStep) => {
    if (step.action !== "action" || !step.target?.value || actionStepCommands[step.id]) return;
    setLoadingActionStepIds((current) => new Set(current).add(step.id));
    try {
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(step.target.value)}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        action?: { steps?: AutomationStep[] };
        error?: string;
      }>(response, {});
      if (!response.ok || !data.action) throw new Error(data.error || "Could not open action commands.");
      setActionStepCommands((current) => ({
        ...current,
        [step.id]: normalizeSteps(data.action?.steps ?? []),
      }));
    } catch (error) {
      setExpandedActionStepIds((current) => {
        const next = new Set(current);
        next.delete(step.id);
        return next;
      });
      appendLog(error instanceof Error ? error.message : "Could not open action commands.");
    } finally {
      setLoadingActionStepIds((current) => {
        const next = new Set(current);
        next.delete(step.id);
        return next;
      });
    }
  };

  const jumpToLiveReportCommand = async (row: LiveRunReportRow) => {
    if (!row.stepId) return;
    const topLevelStep = visibleSteps.find((step) => step.id === row.stepId);
    if (topLevelStep) {
      setLiveRunReport((current) => current ? { ...current, open: false } : current);
      setActionCommandEditor(null);
      setSelectedStepIds(new Set([topLevelStep.id]));
      setTimelineSelectionAnchorId(topLevelStep.id);
      setSelectedStepId(topLevelStep.id);
      setDrawerOpen(true);
      window.requestAnimationFrame(() => {
        timelineStepRefs.current[topLevelStep.id]?.scrollIntoView({ block: "center", behavior: "smooth" });
        timelineStepRefs.current[topLevelStep.id]?.focus();
      });
      return;
    }

    const parentAction = visibleSteps.find(
      (step) =>
        step.action === "action" &&
        (step.target?.value === row.parentActionId ||
          step.id === row.parentActionId ||
          step.target?.displayName === row.parentActionName ||
          step.commandText === row.parentActionName),
    );
    if (!parentAction?.target?.value) {
      appendLog("Could not locate the command in the current timeline.");
      return;
    }

    setLiveRunReport((current) => current ? { ...current, open: false } : current);
    setExpandedActionStepIds((current) => new Set(current).add(parentAction.id));
    await loadActionStepCommands(parentAction);
    const selectionKey = actionCommandSelectionKey(parentAction.id, row.stepId);
    setSelectedActionCommandKeys(new Set([selectionKey]));
    setActionCommandSelectionAnchorKey(selectionKey);
    setActionCommandEditor({
      actionId: parentAction.target.value,
      actionStepId: parentAction.id,
      stepId: row.stepId,
    });
    setSelectedStepId(row.stepId);
    setDrawerOpen(true);
    window.requestAnimationFrame(() => {
      actionCommandRefs.current[selectionKey]?.scrollIntoView({ block: "center", behavior: "smooth" });
      actionCommandRefs.current[selectionKey]?.focus();
    });
  };

  const openTimelineStep = (step: AutomationStep) => {
    setActionCommandEditor(null);
    setSelectedStepId(step.id);
    setTimelineSelectionAnchorId(step.id);
    setCommandPromptError("");
    setLocatorTestResult("");
    setCustomLocatorValue("");
    setLocatorDiagnosticsOpen(false);
    if (step.action !== "action") {
      setDrawerOpen(true);
      return;
    }
    setDrawerOpen(false);
    setExpandedActionStepIds((current) => {
      const next = new Set(current);
      if (next.has(step.id)) next.delete(step.id);
      else next.add(step.id);
      return next;
    });
    void loadActionStepCommands(step);
  };

  const openActionCommandPrompt = (
    actionStep: AutomationStep,
    command: AutomationStep,
    openDiagnostics = false,
  ) => {
    if (!actionStep.target?.value || !command.id) return;
    setActionCommandEditor({
      actionId: actionStep.target.value,
      actionStepId: actionStep.id,
      stepId: command.id,
    });
    setSelectedStepId(command.id);
    setCommandPromptError("");
    setLocatorTestResult("");
    setCustomLocatorValue("");
    setLocatorDiagnosticsOpen(openDiagnostics);
    setDrawerOpen(true);
  };

  const testSelectedLocator = async () => {
    if (!selectedStep) return;
    if (!session?.sessionId) {
      setLocatorTestResult("Open a browser session to test this locator.");
      return;
    }
    const value = selectedStep.target?.value || "";
    if (!value.trim()) {
      setLocatorTestResult("Locator value is empty.");
      return;
    }
    const locatorType = inferLocatorTypeFromValue(value, selectedStep.target?.locatorType || "css");
    const testViaCompanion = async () => {
      const data = await companionBrowserRequest({
        body: JSON.stringify({
          command: "testLocator",
          locatorType,
          sessionId: session.sessionId,
          value,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const count = Number(data.result?.count ?? 0);
      setLocatorTestResult(`${count} match${count === 1 ? "" : "es"} in the active Live Preview browser.`);
      if (data.sessionId) {
        setSession((current) =>
          current?.sessionId === session.sessionId
            ? patchCompanionSession(current, data)
            : current,
        );
      }
    };
    try {
      setLocatorTestResult("Testing locator...");
      if (isCompanionPreviewSession(session)) {
        await testViaCompanion();
        return;
      }
      const response = await fetch(
        `/api/automation/sessions/${encodeURIComponent(session.sessionId)}/test-locator`,
        {
          body: JSON.stringify({
            locatorType,
            value,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await readJsonResponse<{
        error?: string;
        result?: { count?: number; previews?: Array<Record<string, unknown>> };
      }>(response, {});
      if (!response.ok) {
        if (response.status === 404 && /session not found/i.test(data.error || "")) {
          await testViaCompanion();
          return;
        }
        throw new Error(data.error || "Could not test locator.");
      }
      const count = Number(data.result?.count ?? 0);
      setLocatorTestResult(`${count} match${count === 1 ? "" : "es"} in the active browser.`);
    } catch (error) {
      setLocatorTestResult(error instanceof Error ? error.message : "Could not test locator.");
    }
  };

  const replaceStepLocator = (
    stepId: string,
    locator: { type?: string; value?: string },
    candidate?: AutomationLocatorCandidate,
  ) => {
    updateStep(stepId, (step) => {
      const metadata = candidate?.metadata ?? {};
      const nextOptions = { ...(step.options ?? {}) };
      if (Boolean(metadata.ambiguous) || Number(metadata.matchCount ?? 0) > 1) {
        nextOptions.ambiguity = {
          candidate: { strategy: locator.type || candidate?.type || candidate?.strategy || "css", value: locator.value || "" },
          matchCount: Number(metadata.matchCount ?? 0),
          previews: Array.isArray(metadata.previews)
            ? (metadata.previews as Array<Record<string, unknown>>)
            : [],
          readabilityScore:
            metadata.quality && typeof metadata.quality === "object"
              ? Number((metadata.quality as Record<string, unknown>).readability ?? 0)
              : 0,
          resolutionMethod: "needs_review",
          selectedIndex: undefined,
          stabilityScore:
            metadata.quality && typeof metadata.quality === "object"
              ? Number((metadata.quality as Record<string, unknown>).stability ?? 0)
              : 0,
          uniquenessScore:
            metadata.quality && typeof metadata.quality === "object"
              ? Number((metadata.quality as Record<string, unknown>).uniqueness ?? 0)
              : 0,
        };
      } else {
        delete nextOptions.ambiguity;
      }
      return {
        ...step,
        locatorCandidates:
          candidate || !locator.value
            ? step.locatorCandidates
            : [
                ...rankedLocators(step.locatorCandidates).filter(
                  (item) =>
                    locatorType(item) !== normalizeLocatorType(locator.type) ||
                    item.value !== locator.value,
                ),
                {
                  isUnique: false,
                  metadata: { custom: true },
                  score:
                    normalizeLocatorType(locator.type) === "xpath" ||
                    normalizeLocatorType(locator.type) === "css"
                      ? 45
                      : 60,
                  source: "manual",
                  strategy: normalizeLocatorType(locator.type),
                  value: locator.value,
                },
              ],
        options: nextOptions,
        target: {
          ...step.target,
          locatorType: normalizeLocatorType(locator.type || candidate?.type || candidate?.strategy),
          type: "smart",
          value: locator.value || "",
        },
      };
    });
    setLocatorTestResult("");
  };

  const deleteActionCommandsByIds = async (actionStep: AutomationStep, commandIds: string[]) => {
    const ids = Array.from(new Set(commandIds.filter(Boolean)));
    if (actionStep.action !== "action" || !actionStep.target?.value || !ids.length) return;
    try {
      let nextCommands = actionStepCommands[actionStep.id] ?? [];
      for (const commandId of ids) {
        const response = await fetch(
          `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(
            actionStep.target.value,
          )}/steps/${encodeURIComponent(commandId)}`,
          { method: "DELETE" },
        );
        const data = await readJsonResponse<{
          action?: { steps?: AutomationStep[] };
          error?: string;
        }>(response, {});
        if (!response.ok || !data.action) {
          throw new Error(data.error || "Could not delete command from action.");
        }
        nextCommands = normalizeSteps(data.action.steps ?? []);
      }
      setActionStepCommands((current) => ({
        ...current,
        [actionStep.id]: nextCommands,
      }));
      setSelectedActionCommandKeys((current) => {
        const deletedKeys = new Set(ids.map((id) => actionCommandSelectionKey(actionStep.id, id)));
        return new Set([...current].filter((key) => !deletedKeys.has(key)));
      });
      if (
        actionCommandEditor?.actionStepId === actionStep.id &&
        actionCommandEditor.stepId &&
        ids.includes(actionCommandEditor.stepId)
      ) {
        setActionCommandEditor(null);
        setDrawerOpen(false);
      }
      void persistSteps(
        finalizedSteps.map((step) =>
          step.id === actionStep.id
            ? {
                ...step,
                options: { ...step.options, stepCount: nextCommands.length },
              }
            : step,
        ),
      );
      appendLog(`Deleted ${ids.length} command${ids.length === 1 ? "" : "s"} from ${actionStep.target.displayName || "action"}.`);
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not delete command from action.");
    }
  };

  const deleteActionCommand = async (actionStep: AutomationStep, command: AutomationStep) => {
    if (!command.id) return;
    await deleteActionCommandsByIds(actionStep, [command.id]);
  };

  const deleteSelectedCommand = (event?: MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const editor = actionCommandEditor;
    const command = selectedStep;
    resetCommandPromptState();
    if (editor && command) {
      const actionStep = visibleSteps.find((step) => step.id === editor.actionStepId);
      if (actionStep) {
        void deleteActionCommand(actionStep, command);
      }
      return;
    }
    if (command) deleteStep(command.id);
  };

  const reviewHealingEvent = async (event: HealingReviewEvent, action: "accept" | "discard") => {
    try {
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/runs/${encodeURIComponent(
          event.runId,
        )}/healing-events/${encodeURIComponent(event.id)}`,
        {
          body: JSON.stringify({ action }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const data = await readJsonResponse<{
        error?: string;
        healingEvents?: HealingReviewEvent[];
      }>(response, {});
      if (!response.ok) throw new Error(data.error || "Could not update healing review.");
      const reviewStatus: HealingReviewEvent["status"] = action === "accept" ? "accepted" : "discarded";
      const nextEvents = data.healingEvents?.length
        ? data.healingEvents
        : healingEvents.map((item) =>
            item.id === event.id
              ? { ...item, status: reviewStatus }
              : item,
          );
      setHealingEvents(nextEvents);
      setSelectedHealingEvent(
        nextEvents.find((item) => item.id === event.id) ?? {
          ...event,
          status: reviewStatus,
        },
      );
      if (action === "accept" && event.stepId && event.healedLocator) {
        const locatorType =
          typeof event.healedLocator.type === "string"
            ? event.healedLocator.type
            : typeof event.healedLocator.strategy === "string"
              ? event.healedLocator.strategy
              : "css";
        const value = typeof event.healedLocator.value === "string" ? event.healedLocator.value : "";
        setActionStepCommands((current) => {
          const next: Record<string, AutomationStep[]> = {};
          for (const [actionStepId, commands] of Object.entries(current)) {
            next[actionStepId] = commands.map((command) =>
              command.id === event.stepId
                ? {
                    ...command,
                    target: {
                      ...command.target,
                      displayName: value || command.target.displayName,
                      locatorType,
                      type: "smart",
                      value,
                    },
                  }
                : command,
            );
          }
          return next;
        });
        await fetchLatestScenarioSteps().catch(() => undefined);
      }
      appendLog(action === "accept" ? "Accepted healed locator as primary." : "Discarded healed locator.");
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not update healing review.");
    }
  };

  const createActionFromTimelineSteps = async (input: {
    description?: string;
    name: string;
    openAfterCreate?: boolean;
    stepIds: string[];
    timelineSteps: AutomationStep[];
  }) => {
    await persistSteps(input.timelineSteps, { throwOnError: true });
    const response = await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/actions`,
      {
        body: JSON.stringify({
          description: input.description ?? "",
          name: input.name,
          scenarioId,
          stepIds: input.stepIds,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const data = await readJsonResponse<{
      action?: { id: string; name: string };
      error?: string;
    }>(response, {});
    if (!response.ok || !data.action) throw new Error(data.error || "Could not create action.");

    const selectedIds = new Set(input.stepIds);
    const firstSelectedIndex = input.timelineSteps.findIndex((step) => step.id && selectedIds.has(step.id));
    const actionStep = makeActionStep(data.action, selectedIds.size);
    const collapsedSteps =
      firstSelectedIndex >= 0
        ? [
            ...input.timelineSteps.slice(0, firstSelectedIndex).filter((step) => !step.id || !selectedIds.has(step.id)),
            actionStep,
            ...input.timelineSteps.slice(firstSelectedIndex).filter((step) => !step.id || !selectedIds.has(step.id)),
          ]
        : input.timelineSteps;
    await persistSteps(collapsedSteps, { throwOnError: true });
    setEvents([]);
    setActionStepCommands((current) => ({
      ...current,
      [actionStep.id]: input.timelineSteps.filter((step) => step.id && selectedIds.has(step.id)),
    }));
    if (input.openAfterCreate) {
      setExpandedActionStepIds((current) => new Set(current).add(actionStep.id));
      setSelectedStepIds(new Set([actionStep.id]));
      setSelectedStepId(actionStep.id);
      setDrawerOpen(false);
    }
    return { action: data.action, actionStep, collapsedSteps };
  };

  const promptForLooseAction = (timelineSteps: AutomationStep[]) => {
    const actionableSteps = actionCandidateSteps(timelineSteps);
    const firstLooseActionableStep = actionableSteps.find((step) => step.action !== "action");
    const firstLooseIndex = firstLooseActionableStep
      ? timelineSteps.findIndex((step) => step.id === firstLooseActionableStep.id)
      : -1;
    if (firstLooseIndex < 0) return false;
    const looseGroup: AutomationStep[] = [];
    for (const [offset, step] of timelineSteps.slice(firstLooseIndex).entries()) {
      const absoluteIndex = firstLooseIndex + offset;
      if (isScenarioInitStep(step, absoluteIndex)) continue;
      if (step.action === "action") break;
      looseGroup.push(step);
    }
    const stepIds = looseGroup.map((step) => step.id).filter(Boolean) as string[];
    if (!stepIds.length) return false;
    setSelectedStepIds(new Set(stepIds));
    setSelectedStepId(stepIds[0] ?? null);
    setDrawerOpen(false);
    setActionName("");
    setActionDescription("");
    setActionModalStepIds(stepIds);
    setActionModalTimelineSteps(timelineSteps);
    setActionModalError("");
    setActionModalOpen(true);
    return true;
  };

  const createAction = async () => {
    const name = actionName.trim();
    if (creatingAction) return;
    if (!name) {
      setActionModalError("Enter an action name.");
      return;
    }
    const timelineSteps = actionModalTimelineSteps.length
      ? actionModalTimelineSteps
      : mergeStepsById([...finalizedSteps, ...liveSteps]);
    const stepIds = actionModalStepIds.length
      ? actionModalStepIds
      : actionCandidateSteps(timelineSteps)
          .filter((step) => step.id && selectedStepIds.has(step.id))
          .map((step) => step.id)
          .filter(Boolean);
    const selectedIds = new Set(stepIds);
    const selectedCommands = timelineSteps.filter((step) => step.id && selectedIds.has(step.id));
    if (!selectedCommands.length) {
      setActionModalError("Select at least one command before creating an action.");
      return;
    }
    setCreatingAction(true);
    setActionModalError("");
    try {
      await createActionFromTimelineSteps({
        description: actionDescription.trim(),
        name,
        openAfterCreate: true,
        stepIds,
        timelineSteps,
      });
      resetActionModalState();
      appendLog(`Created reusable action ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create action.";
      setActionModalError(message);
      appendLog(message);
    } finally {
      setCreatingAction(false);
    }
  };

  const openCreateActionModal = () => {
    if (!selectedSteps.length) return;
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const stepIds = actionCandidateSteps(timelineSteps)
      .filter((step) => step.id && selectedStepIds.has(step.id))
      .map((step) => step.id)
      .filter(Boolean);
    if (!stepIds.length) {
      appendLog("The initial URL step is scenario setup. Select at least one workflow command for the Action.");
      return;
    }
    setActionName("");
    setActionDescription("");
    setActionModalStepIds(stepIds);
    setActionModalTimelineSteps(timelineSteps);
    setActionModalError("");
    setActionModalOpen(true);
  };

  const expandActionSteps = useCallback(
    async (
      steps: AutomationStep[],
      options: {
        selectedActionCommandKeys?: Set<string>;
        selectedActionStepIds?: Set<string>;
      } = {},
    ) => {
      const expanded: AutomationStep[] = [];
      const actions: Array<{ name: string; stepCount: number }> = [];
      for (const step of steps) {
        if (step.action !== "action" || !step.target?.value) {
          expanded.push(step);
          continue;
        }
        const response = await fetch(
          `/api/automation/projects/${encodeURIComponent(projectKey)}/actions/${encodeURIComponent(step.target.value)}`,
          { cache: "no-store" },
        );
        const data = await readJsonResponse<{
          action?: { steps?: AutomationStep[] };
          error?: string;
        }>(response, {});
        if (!response.ok || !data.action?.steps?.length) {
          throw new Error(data.error || `Could not load action ${step.target.displayName || step.target.value}.`);
        }
        const actionSteps = normalizeSteps(data.action.steps).map((actionCommand) => ({
          ...actionCommand,
          options: {
            ...actionCommand.options,
            sourceActionId: step.target.value,
            sourceActionName: step.target.displayName || step.commandText || step.target.value,
          },
        }));
        const scopedActionSteps =
          options.selectedActionStepIds?.has(step.id) && options.selectedActionCommandKeys?.size
            ? actionSteps.filter((actionCommand) =>
                actionCommand.id
                  ? options.selectedActionCommandKeys?.has(
                      actionCommandSelectionKey(step.id, actionCommand.id),
                    )
                  : false,
              )
            : actionSteps;
        if (!scopedActionSteps.length) {
          throw new Error(`Select at least one command from ${step.target.displayName || step.commandText || "action"}.`);
        }
        actions.push({
          name: step.target.displayName || step.commandText || step.target.value,
          stepCount: scopedActionSteps.length,
        });
        expanded.push(...scopedActionSteps);
      }
      return { actions, steps: expanded };
    },
    [projectKey],
  );

  const waitForRunEvent = useCallback(async (sessionId: string, runId: string) => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const seenProgressEvents = new Set<string>();
    while (Date.now() < deadline) {
      const response = await fetch(
        `/api/automation/sessions/${encodeURIComponent(sessionId)}/events`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        events?: ProviderSessionEvent[];
        error?: string;
      }>(response, {});
      if (!response.ok) throw new Error(data.error || "Could not read session events.");
      for (const event of data.events ?? []) {
        const eventRunId = typeof event.data?.runId === "string" ? event.data.runId : "";
        if (eventRunId === runId && event.type === "run:start") {
          setRunStatus("running");
          setFailedStepResult(null);
          const eventKey = event.id || `run:start:${runId}`;
          if (!seenProgressEvents.has(eventKey)) {
            seenProgressEvents.add(eventKey);
            const stepCount = typeof event.data?.stepCount === "number" ? event.data.stepCount : null;
            appendLog(
              stepCount
                ? `Worker started run (${stepCount} command${stepCount === 1 ? "" : "s"}).`
                : "Worker started run.",
            );
          }
        }
        if (
          eventRunId !== runId ||
          (
            event.type !== "step:start" &&
            event.type !== "step:success" &&
            event.type !== "step:failed" &&
            event.type !== "step.healed" &&
            event.type !== "step.heal_failed" &&
            event.type !== "step.heal_not_applicable" &&
            event.type !== "step.ambiguity_detected" &&
            event.type !== "step.ambiguity_resolved" &&
            event.type !== "step:self_healed"
          )
        ) {
          continue;
        }
        const eventKey =
          event.id ||
          `${event.type}:${String(event.data?.index ?? "")}:${String(event.data?.stepId ?? "")}`;
        if (seenProgressEvents.has(eventKey)) continue;
        seenProgressEvents.add(eventKey);
        const index =
          typeof event.data?.index === "number" ? event.data.index + 1 : "?";
        const description =
          typeof event.data?.description === "string"
            ? event.data.description
            : "Command";
        const healing = providerEventToHealingEvent(event);
        if (healing) {
          setHealingEvents((current) => mergeHealingEvents([...current, healing]));
        }
        const stepId = typeof event.data?.stepId === "string" ? event.data.stepId : "";
        if (event.type === "step:start") {
          updateLiveRunReportRows([], [{
            index: typeof event.data?.index === "number" ? event.data.index : undefined,
            message: "Running",
            runId,
            status: "running",
            stepId,
          }]);
          if (stepId) {
            setCommandRunStates((current) => ({
              ...current,
              [stepId]: {
                message: "Running",
                runId,
                status: "running",
                updatedAt: new Date().toISOString(),
              },
            }));
          }
          appendLog(`Step ${index} started: ${description}`);
        }
        if (event.type === "step:failed") {
          const result = stepResultFromEvent(event);
          if (result) {
            if (result.stepId) {
              setCommandRunStates((current) => ({
                ...current,
                [result.stepId as string]: {
                  message: result.errorMessage || "Failed",
                  runId: result.runId,
                  status: "failed",
                  suggestion: result.suggestion,
                  updatedAt: new Date().toISOString(),
                },
              }));
            }
            setFailedStepResult(result);
            setRunStatus("failed");
            if (result.stepId) {
              setSelectedStepId(result.stepId);
            }
          }
          const error =
            typeof event.data?.errorMessage === "string"
              ? event.data.errorMessage
              : typeof event.data?.error === "string"
                ? event.data.error
                : "Step failed.";
          const suggestion =
            typeof event.data?.suggestion === "string" ? event.data.suggestion : result?.suggestion || "";
          updateLiveRunReportRows([], [{
            index: typeof event.data?.index === "number" ? event.data.index : undefined,
            message: error,
            runId,
            status: "failed",
            stepId,
          }], "failed");
          appendLog(`Step ${index} failed: ${error}${suggestion ? ` ${suggestion}` : ""}`);
        }
        if (event.type === "step.healed" || event.type === "step:self_healed") {
          const label =
            typeof event.data?.label === "string"
              ? event.data.label
              : locatorText(
                  event.data?.healedLocator && typeof event.data.healedLocator === "object"
                    ? (event.data.healedLocator as Record<string, unknown>)
                    : null,
                );
          appendLog(`Step ${index} self-healed: ${label}`);
        }
        if (event.type === "step.heal_failed") appendLog(`Step ${index} healing failed.`);
        if (event.type === "step.heal_not_applicable") appendLog(`Step ${index} healing skipped by safety rules.`);
        if (event.type === "step.ambiguity_detected") {
          const matchCount = typeof event.data?.matchCount === "number" ? event.data.matchCount : "multiple";
          const stepId = typeof event.data?.stepId === "string" ? event.data.stepId : "";
          if (stepId) {
            setSelectedStepId(stepId);
            setDrawerOpen(true);
          }
          setPendingAmbiguity(pendingAmbiguityFromEvent(sessionId, event));
          appendLog(`Step ${index} needs locator choice (${matchCount} matches).`);
        }
        if (event.type === "step.ambiguity_resolved") {
          setPendingAmbiguity((current) =>
            current?.runId === runId && current?.stepId === event.data?.stepId ? null : current,
          );
          appendLog(`Step ${index} used the saved locator instance.`);
        }
        if (event.type === "step:success") {
          const result = stepResultFromEvent(event);
          const successStepId = result?.stepId || stepId;
          updateLiveRunReportRows([], [{
            index: typeof event.data?.index === "number" ? event.data.index : undefined,
            message: "Passed",
            runId,
            status: "passed",
            stepId: successStepId,
          }]);
          if (successStepId) {
            setCommandRunStates((current) => ({
              ...current,
              [successStepId]: {
                message: "Passed",
                runId,
                status: "passed",
                updatedAt: new Date().toISOString(),
              },
            }));
          }
          appendLog(`Step ${index} completed.`);
        }
      }
      const terminalEvent = (data.events ?? []).find((event) => {
        const eventRunId = typeof event.data?.runId === "string" ? event.data.runId : "";
        return eventRunId === runId && (event.type === "run:success" || event.type === "run:failed");
      });
      if (terminalEvent?.type === "run:success") {
        setRunStatus("completed");
        updateLiveRunReportRows([], [], "passed");
        return;
      }
      if (terminalEvent?.type === "run:failed") {
        setRunStatus("failed");
        updateLiveRunReportRows([], [], "failed");
        const error =
          typeof terminalEvent.data?.error === "string"
            ? terminalEvent.data.error
            : "Replay failed before recording could resume.";
        throw new Error(error);
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error("Replay timed out before recording could resume.");
  }, [appendLog, updateLiveRunReportRows]);

  const refreshPlaybackState = useCallback(async () => {
    const [jobsResponse, configResponse] = await Promise.all([
      fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/playback?scenarioId=${encodeURIComponent(scenarioId)}`,
        { cache: "no-store" },
      ),
      fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/playback/config?scenarioId=${encodeURIComponent(scenarioId)}`,
        { cache: "no-store" },
      ),
    ]);
    const jobsData = await readJsonResponse<{ jobs?: PlaybackJob[]; error?: string }>(jobsResponse, {});
    const configData = await readJsonResponse<{ config?: PlaybackConfig; error?: string }>(configResponse, {});
    if (jobsResponse.ok) setPlaybackJobs(jobsData.jobs ?? []);
    if (configResponse.ok && configData.config) {
      setPlaybackConfig({ ...defaultPlaybackConfig, ...configData.config });
    }
  }, [projectKey, scenarioId]);

  const playbackStepsForScope = (scope: PlaybackScope, anchorStep?: AutomationStep | null) => {
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const anchorId = anchorStep?.id || selectedStepId || "";
    const anchorIndex = anchorId ? timelineSteps.findIndex((step) => step.id === anchorId) : -1;
    if (scope === "selected") {
      const selected = timelineSteps.filter((step) => step.id && selectedStepIds.has(step.id));
      return selected.length ? selected : timelineSteps;
    }
    if (scope === "selectedToEnd" && anchorIndex >= 0) return timelineSteps.slice(anchorIndex);
    if (scope === "startToSelected" && anchorIndex >= 0) return timelineSteps.slice(0, anchorIndex + 1);
    if (scope === "singleCommand" && anchorStep) return timelineContextStepsForStep(anchorStep, timelineSteps);
    return timelineSteps;
  };

  const expectedUrlForPlayback = (scopedSteps: AutomationStep[]) => {
    const scopedNavigationUrl = firstNavigationUrl(scopedSteps, activeBaseUrl);
    if (scopedNavigationUrl) return scopedNavigationUrl;
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const firstScopedStepId = scopedSteps.find((step) => step.id)?.id;
    const firstScopedIndex = firstScopedStepId
      ? timelineSteps.findIndex((step) => step.id === firstScopedStepId)
      : -1;
    const priorSteps = firstScopedIndex >= 0 ? timelineSteps.slice(0, firstScopedIndex + 1) : timelineSteps;
    return (
      lastNavigationUrl(priorSteps, activeBaseUrl) ||
      firstNavigationUrl(timelineSteps, activeBaseUrl) ||
      resolveWorkspaceUrl(targetUrl) ||
      normalizeUrl(targetUrl)
    );
  };

  const playbackStateGuardFor = (
    scope: PlaybackScope,
    scopedSteps: AutomationStep[],
    anchorStep?: AutomationStep | null,
  ): PlaybackStateGuard | null => {
    const expectedUrl = expectedUrlForPlayback(scopedSteps);
    if (shouldUseLegacyDesktopBridge(expectedUrl || resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl))) {
      return null;
    }
    const currentUrl = session?.currentUrl || "";
    if (!isUsableBrokerSession(session)) {
      return {
        anchorStepId: anchorStep?.id || selectedStepId || null,
        currentUrl: "No active Recorder Browser session",
        expectedUrl,
        message:
          "Playback uses the current Recorder Browser state. Start or connect a browser session before selected playback, or choose an option below.",
        scope,
      };
    }
    if (!currentUrl) {
      return {
        anchorStepId: anchorStep?.id || selectedStepId || null,
        currentUrl: "Unknown",
        expectedUrl,
        message:
          "The active browser session did not report its current URL. Selected playback may fail if the browser is not already on the required page.",
        scope,
      };
    }
    if (expectedUrl && !urlsRoughlyMatch(currentUrl, expectedUrl)) {
      return {
        anchorStepId: anchorStep?.id || selectedStepId || null,
        currentUrl,
        expectedUrl,
        message:
          "Browser may not be in the correct state for the selected playback scope.",
        scope,
      };
    }
    return null;
  };

  const startPlayback = async (
    scope: PlaybackScope,
    anchorStep?: AutomationStep | null,
    options: { navigateToExpected?: boolean; skipStateGuard?: boolean } = {},
  ) => {
    setPlaybackConsoleOpen(true);
    setLiveRunReport((current) => current ? { ...current, open: false } : current);
    try {
      const scopedSteps = playbackStepsForScope(scope, anchorStep);
      const executableScope = actionCandidateSteps(scopedSteps);
      if (!executableScope.length) {
        appendLog("Playback has no executable commands.");
        return;
      }
      const guard = !options.skipStateGuard ? playbackStateGuardFor(scope, scopedSteps, anchorStep) : null;
      if (guard) {
        setPlaybackStateGuard(guard);
        appendLog("Playback State Guard opened.");
        return;
      }
      setPlaybackBusy(true);
      setPlaybackState("running");
      const selectedActionStepIds = new Set(
        [...selectedActionCommandKeys].map((key) => key.split(":")[0]).filter(Boolean),
      );
      const expanded = await expandActionSteps(executableScope, {
        selectedActionCommandKeys,
        selectedActionStepIds,
      });
      const unsupported = expanded.steps.find((step) => {
        const definition = commandDefinitionForAction(displayAction(step.action));
        return !definition || !definition.executable || definition.domain !== "web";
      });
      const jobResponse = await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/playback`, {
        body: JSON.stringify({
          configSnapshot: playbackConfig,
          scenarioId,
          scope,
          steps: executableScope,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const jobData = await readJsonResponse<{ error?: string; job?: PlaybackJob }>(jobResponse, {});
      if (!jobResponse.ok || !jobData.job) {
        throw new Error(jobData.error || "Could not queue playback.");
      }
      setPlaybackJobs((current) => [jobData.job as PlaybackJob, ...current].slice(0, 20));
      if (unsupported) {
        const label = commandDefinitionForAction(displayAction(unsupported.action))?.label || unsupported.action;
        const message = `${label} is a first-class CaseForge authoring command, but this phase only executes implemented web commands through CaseForge Companion. Its execution adapter is pending.`;
        if (unsupported.id) {
          setCommandRunStates((current) => ({
            ...current,
            [unsupported.id as string]: {
              message,
              runId: jobData.job?.id,
              status: "failed",
              updatedAt: new Date().toISOString(),
            },
          }));
        }
        await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/playback`, {
          body: JSON.stringify({ jobId: jobData.job.id, logs: [message], status: "blocked" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        appendLog(message);
        await refreshPlaybackState();
        setPlaybackState("failed");
        return;
      }

      const { parameterData, testCase } = resumeRunParameterContext();
      const baseRunSteps = withScenarioInitSteps(
        substituteStepsParameters(expanded.steps, parameterData, runtimeVariableNamesForSubstitution),
        substituteStepsParameters(scopedSteps, parameterData, runtimeVariableNamesForSubstitution),
      );
      const expectedUrl = expectedUrlForPlayback(scopedSteps);
      const runSteps =
        options.navigateToExpected && expectedUrl
          ? [makeNavigateStep(expectedUrl, `playback_state_${Date.now().toString(36)}`), ...baseRunSteps]
          : baseRunSteps;
      const playbackRunId = `playback-${Date.now().toString(36)}`;
      const playbackStartUrl =
        firstNavigationUrl(runSteps, activeBaseUrl) ||
        resolveWorkspaceUrl(targetUrl) ||
        normalizeUrl(targetUrl);
      if (shouldUseLegacyDesktopBridge(playbackStartUrl)) {
        let companionSessionId =
          recordingSessionId ||
          (isUsableBrokerSession(session) && isCompanionPreviewSession(session)
            ? session.sessionId
            : "");
        if (!companionSessionId) {
          const startUrl = playbackStartUrl;
          const data = await companionBrowserRequest({
            body: JSON.stringify({
              action: "start",
              httpCredentials: authFromUrl(startUrl),
              scenarioId,
              startUrl,
              viewport: viewportForRunConfig(runConfig),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          if (!data.sessionId) {
            throw new Error(data.error || "CaseForge Companion did not return a browser session.");
          }
          companionSessionId = data.sessionId;
          companionCursorRef.current = data.cursor ?? 0;
          setRecordingSessionId(data.sessionId);
          setSession(companionSessionMetadata(data, startUrl));
          setLivePreviewFailed(false);
          setProviderEventCaptureAfter(null);
          setEvents((current) => mergeRecorderEvents([...current, ...companionCommandsToRecorderEvents(data.commands)]));
          if (data.logs) setLogs(data.logs.slice(-50));
        }

        appendLog(`Playback running in the current CaseForge Companion browser.`);
        await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/playback`, {
          body: JSON.stringify({ jobId: jobData.job.id, logs: ["Companion playback running."], status: "running" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        const playbackData = await companionBrowserRequest({
          body: JSON.stringify({
            action: "run",
            cursor: companionCursorRef.current,
            parameterData,
            runId: playbackRunId,
            sessionId: companionSessionId,
            steps: runSteps,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        companionCursorRef.current = playbackData.cursor ?? companionCursorRef.current;
        setSession((current) =>
          isCompanionPreviewSession(current)
            ? companionSessionMetadata(playbackData, playbackData.url || current?.currentUrl || targetUrl)
            : current,
        );
        await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/playback`, {
          body: JSON.stringify({ jobId: jobData.job.id, logs: ["Companion playback passed."], status: "passed" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        appendLog(`Playback passed in Companion${testCase ? ` for ${testCase.name}` : ""}.`);
        await refreshPlaybackState();
        setPlaybackState("completed");
        return;
      }
      const activeSession = isUsableBrokerSession(session)
        ? session
        : await createSession(playbackStartUrl, {
            browserMode: runConfig.browserMode,
            viewport: viewportForRunConfig(runConfig),
          });
      if (!activeSession.sessionId) throw new Error("Browser session was not created.");
      appendLog(`Playback queued: ${scope} (${runSteps.length} command${runSteps.length === 1 ? "" : "s"}).`);
      const runResponse = await fetch(
        `/api/automation/sessions/${encodeURIComponent(activeSession.sessionId)}/run`,
        {
          body: JSON.stringify({
            closeOnComplete: false,
            executionMode: "interactive_persistent",
            keepSessionOpen: true,
            parameterData,
            runId: playbackRunId,
            steps: runSteps,
            suppressRecording: true,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const runData = await readJsonResponse<{ error?: string }>(runResponse, {});
      if (!runResponse.ok) throw new Error(runData.error || "Could not start playback.");
      await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/playback`, {
        body: JSON.stringify({ jobId: jobData.job.id, logs: ["Playback running."], status: "running" }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await waitForRunEvent(activeSession.sessionId, playbackRunId);
      await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/playback`, {
        body: JSON.stringify({ jobId: jobData.job.id, logs: ["Playback passed."], status: "passed" }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      appendLog(`Playback passed${testCase ? ` for ${testCase.name}` : ""}.`);
      await refreshPlaybackState();
      setPlaybackState("completed");
    } catch (error) {
      setPlaybackState("failed");
      appendLog(error instanceof Error ? error.message : "Playback failed.");
    } finally {
      setPlaybackBusy(false);
    }
  };

  const stopPlaybackQueue = async () => {
    await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/playback?scenarioId=${encodeURIComponent(scenarioId)}`,
      { method: "DELETE" },
    );
    appendLog("Stopped pending playback requests.");
    await refreshPlaybackState();
  };

  const savePlaybackConfig = async (nextConfig: PlaybackConfig) => {
    setPlaybackConfig(nextConfig);
    const response = await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/playback/config`,
      {
        body: JSON.stringify({ ...nextConfig, scenarioId }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );
    const data = await readJsonResponse<{ config?: PlaybackConfig; error?: string }>(response, {});
    if (!response.ok || !data.config) {
      throw new Error(data.error || "Could not save playback configuration.");
    }
    setPlaybackConfig({ ...defaultPlaybackConfig, ...data.config });
  };

  const refreshCanvasState = useCallback(async () => {
    const [viewsResponse, elementsResponse] = await Promise.all([
      fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/views?scenarioId=${encodeURIComponent(scenarioId)}`,
        { cache: "no-store" },
      ),
      fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/elements`, {
        cache: "no-store",
      }),
    ]);
    const viewsData = await readJsonResponse<{
      error?: string;
      latestView?: CanvasView | null;
      views?: CanvasView[];
    }>(viewsResponse, {});
    const elementsData = await readJsonResponse<{
      elements?: CanvasElement[];
      error?: string;
    }>(elementsResponse, {});
    if (viewsResponse.ok) setCanvasView(viewsData.latestView ?? viewsData.views?.[0] ?? null);
    if (elementsResponse.ok) setCanvasElements(elementsData.elements ?? []);
  }, [projectKey, scenarioId]);

  const canvasSnapshotFromStep = (step: AutomationStep, index: number) => {
    const element = step.element ?? {};
    const bounds = rectRecord(element.bounds ?? element.boundingBox);
    const targetName = elementName(step.element, readableStepLabel(step));
    const locator = rankedLocators(step.locatorCandidates)[0];
    return {
      action: displayAction(step.action),
      bounds,
      elementKind: String(element.elementKind ?? step.target?.elementKind ?? "element"),
      id: step.id || `canvas-step-${index}`,
      label: targetName,
      locatorCandidates: step.locatorCandidates ?? [],
      repositoryStatus: canvasElements.some((item) => {
        const itemLocator = String(item.canonicalLocator.value ?? "");
        return itemLocator && itemLocator === (locator?.value || step.target?.value);
      })
        ? "saved"
        : "new",
      stepId: step.id,
      tag: String(element.tag ?? ""),
      text: String(element.text ?? element.labelText ?? targetName),
      type: String(element.elementKind ?? step.target?.elementKind ?? "element"),
    };
  };

  const captureCanvasFromTimeline = async () => {
    const elementSnapshots = visibleSteps
      .map(canvasSnapshotFromStep)
      .filter((item) => {
        const bounds = numericRect(item.bounds);
        return bounds.width > 0 && bounds.height > 0;
      });
    const response = await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/views`, {
      body: JSON.stringify({
        elementSnapshots,
        metadata: { source: "scenario-timeline", stepCount: visibleSteps.length },
        name: `${scenarioName} Canvas`,
        scenarioId,
        title: scenarioName,
        url: cleanUrlAuth(targetUrl),
        viewport: viewportForRunConfig(runConfig),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = await readJsonResponse<{ error?: string; view?: CanvasView }>(response, {});
    if (!response.ok || !data.view) throw new Error(data.error || "Could not capture Canvas view.");
    setCanvasView(data.view);
    setWorkspaceTab("canvas");
    setCanvasMessage(`Captured ${elementSnapshots.length} canvas element${elementSnapshots.length === 1 ? "" : "s"}.`);
    await refreshCanvasState();
  };

  const canvasCandidateStack = (snapshot: Record<string, unknown>) => {
    const hierarchy = snapshot.candidateHierarchy ?? snapshot.exploreCandidates ?? snapshot.overlapCandidates;
    if (Array.isArray(hierarchy)) {
      const candidates = hierarchy.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)),
      );
      if (candidates.length) return candidates;
    }
    const locatorCandidates = Array.isArray(snapshot.locatorCandidates)
      ? (snapshot.locatorCandidates as AutomationLocatorCandidate[])
      : [];
    const locatorSnapshots = locatorCandidates.map((candidate, index) => ({
      ...snapshot,
      candidateRole: index === 0 ? "current" : index === 1 ? "parent" : index === 2 ? "child" : "sibling",
      label: snapshot.label || candidate.strategy,
      locatorCandidates: [candidate],
      text: candidate.value,
    }));
    return locatorSnapshots.length ? locatorSnapshots : [snapshot];
  };

  const openCanvasExploreMode = (snapshot: Record<string, unknown>) => {
    setCanvasExploreElement(snapshot);
    setCanvasExploreIndex(0);
    setCanvasMenu(null);
    setCanvasMessage("Explore Mode: cycle through overlapping candidates, choose parent/child/sibling, or press Esc to exit.");
  };

  const currentCanvasExploreCandidate = canvasExploreElement
    ? canvasCandidateStack(canvasExploreElement)[canvasExploreIndex] ?? canvasExploreElement
    : null;

  const saveCanvasElement = async (snapshot: Record<string, unknown>) => {
    const candidates = Array.isArray(snapshot.locatorCandidates)
      ? (snapshot.locatorCandidates as AutomationLocatorCandidate[])
      : [];
    const bestLocator = rankedLocators(candidates)[0] ?? {
      score: 0,
      strategy: "css",
      value: String(snapshot.value ?? snapshot.label ?? ""),
    };
    const response = await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/elements`, {
      body: JSON.stringify({
        aliases: [String(snapshot.label ?? ""), String(snapshot.text ?? "")].filter(Boolean),
        boundingBox: rectRecord(snapshot.bounds),
        businessName: String(snapshot.label ?? snapshot.text ?? "Saved Element"),
        canonicalLocator: bestLocator,
        description: String(snapshot.text ?? snapshot.label ?? ""),
        elementSnapshot: snapshot,
        elementType: String(snapshot.elementKind ?? snapshot.type ?? "element"),
        fallbackLocators: rankedLocators(candidates).slice(1),
        lastVerifiedAt: new Date().toISOString(),
        locatorCandidates: candidates,
        metadata: {
          aliases: [String(snapshot.label ?? ""), String(snapshot.text ?? "")].filter(Boolean),
          businessName: String(snapshot.label ?? snapshot.text ?? "Saved Element"),
          description: String(snapshot.text ?? snapshot.label ?? ""),
          lastVerifiedAt: new Date().toISOString(),
          preferredLocatorStrategy: bestLocator.strategy ?? null,
          source: "canvas",
          stabilityScore: Number(bestLocator.score ?? 0),
          stepId: snapshot.stepId,
          technicalName: String(snapshot.label ?? snapshot.text ?? "savedElement")
            .replace(/\W+/g, " ")
            .trim()
            .replace(/\s+(.)/g, (_match, letter: string) => letter.toUpperCase())
            .replace(/^(.)/, (_match, letter: string) => letter.toLowerCase()),
        },
        name: String(snapshot.label ?? snapshot.text ?? "Saved Element"),
        preferredLocatorStrategy: bestLocator.strategy ?? null,
        stabilityScore: Number(bestLocator.score ?? 0),
        status: "active",
        technicalName: String(snapshot.label ?? snapshot.text ?? "savedElement")
          .replace(/\W+/g, " ")
          .trim()
          .replace(/\s+(.)/g, (_match, letter: string) => letter.toUpperCase())
          .replace(/^(.)/, (_match, letter: string) => letter.toLowerCase()),
        viewId: canvasView?.id ?? null,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = await readJsonResponse<{ element?: CanvasElement; error?: string }>(response, {});
    if (!response.ok || !data.element) throw new Error(data.error || "Could not save element.");
    setCanvasElements((current) => [data.element as CanvasElement, ...current.filter((item) => item.id !== data.element?.id)]);
    setCanvasMessage(`Saved ${data.element.name} to Element Repository.`);
  };

  const remapCanvasElement = async (snapshot: Record<string, unknown>) => {
    const candidates = Array.isArray(snapshot.locatorCandidates)
      ? (snapshot.locatorCandidates as AutomationLocatorCandidate[])
      : [];
    const probable = canvasElements[0];
    if (!probable) {
      setCanvasMessage("Save an element before using re-map.");
      return;
    }
    const response = await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/elements/${encodeURIComponent(probable.id)}`,
      {
        body: JSON.stringify({
          boundingBox: rectRecord(snapshot.bounds),
          canonicalLocator: rankedLocators(candidates)[0] ?? probable.canonicalLocator,
          elementSnapshot: snapshot,
          fallbackLocators: rankedLocators(candidates).slice(1),
          locatorCandidates: candidates,
          metadata: { source: "canvas-remap", stepId: snapshot.stepId },
          mode: "remap",
          viewId: canvasView?.id ?? null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );
    const data = await readJsonResponse<{ element?: CanvasElement; error?: string }>(response, {});
    if (!response.ok || !data.element) throw new Error(data.error || "Could not re-map element.");
    setCanvasElements((current) => current.map((item) => (item.id === data.element?.id ? data.element : item)));
    setCanvasMessage(`Re-mapped ${data.element.name}.`);
  };

  const showCanvasElementUsage = async (snapshot: Record<string, unknown>) => {
    const candidates = Array.isArray(snapshot.locatorCandidates)
      ? (snapshot.locatorCandidates as AutomationLocatorCandidate[])
      : [];
    const bestLocator = rankedLocators(candidates)[0];
    const targetValue = bestLocator?.value || String(snapshot.value ?? snapshot.label ?? "");
    const repositoryElement = canvasElements.find((item) => {
      const locatorValue = String(item.canonicalLocator.value ?? "");
      return item.name === snapshot.label || (locatorValue && locatorValue === targetValue);
    });
    if (!repositoryElement) {
      setCanvasMessage("Save this element before showing usage.");
      return;
    }
    const response = await fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/elements/${encodeURIComponent(repositoryElement.id)}/usages`,
      { cache: "no-store" },
    );
    const data = await readJsonResponse<{ error?: string; usages?: Array<Record<string, unknown>> }>(response, {});
    if (!response.ok) throw new Error(data.error || "Could not load element usage.");
    const usageCount = data.usages?.length ?? 0;
    setCanvasMessage(
      usageCount
        ? `${repositoryElement.name} is used by ${usageCount} command${usageCount === 1 ? "" : "s"}.`
        : `${repositoryElement.name} has no saved command usage yet.`,
    );
  };

  const previewCanvasCommandInsert = (snapshot: Record<string, unknown>, action: string) => {
    const candidates = Array.isArray(snapshot.locatorCandidates)
      ? (snapshot.locatorCandidates as AutomationLocatorCandidate[])
      : [];
    setCanvasInsertPreview({
      action,
      insertAfterStepId: selectedStepId,
      locator: rankedLocators(candidates)[0] ?? {
        score: 0,
        strategy: "css",
        value: String(snapshot.value ?? snapshot.label ?? ""),
      },
      snapshot,
    });
    setCanvasMenu(null);
  };

  const insertCanvasCommand = async (snapshot: Record<string, unknown>, action: string) => {
    const normalizedAction = normalizeAutomationAction(action);
    const candidates = Array.isArray(snapshot.locatorCandidates)
      ? (snapshot.locatorCandidates as AutomationLocatorCandidate[])
      : [];
    const bestLocator = rankedLocators(candidates)[0];
    const targetValue = bestLocator?.value || String(snapshot.value ?? snapshot.label ?? "");
    const repositoryElement = canvasElements.find((item) => {
      const locatorValue = String(item.canonicalLocator.value ?? "");
      return (
        item.name === snapshot.label ||
        (locatorValue && locatorValue === targetValue)
      );
    });
    const command: AutomationStep = withLocatorQuality({
      action: normalizedAction,
      commandText: commandDefinitionForAction(normalizedAction)?.label || normalizedAction,
      description: commandDefinitionForAction(normalizedAction)?.label || normalizedAction,
      element: snapshot,
      expectedValue: normalizedAction === "assert" ? String(snapshot.text ?? "") : "",
      id: `step_${crypto.randomUUID().replace(/-/g, "")}`,
      inputValue:
        normalizedAction === "fill"
          ? ""
          : normalizedAction === "select"
            ? ""
            : normalizedAction === "press"
              ? "Enter"
              : "",
      locatorCandidates: candidates,
      options: {
        insertedFromCanvas: true,
        repositoryElementId: repositoryElement?.id,
      },
      target: {
        displayName: String(snapshot.label ?? snapshot.text ?? "Canvas Element"),
        elementKind: String(snapshot.elementKind ?? snapshot.type ?? "element"),
        locatorType: bestLocator?.strategy ?? "css",
        type: "smart",
        value: targetValue,
      },
    });
    const timelineSteps = mergeStepsById([...finalizedSteps, ...liveSteps]);
    const selectedIndex = selectedStepId ? timelineSteps.findIndex((step) => step.id === selectedStepId) : -1;
    const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : timelineSteps.length;
    await persistSteps([
      ...timelineSteps.slice(0, insertAt),
      command,
      ...timelineSteps.slice(insertAt),
    ]);
    if (repositoryElement?.id && command.id) {
      await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/elements/${encodeURIComponent(repositoryElement.id)}/usages`,
        {
          body: JSON.stringify({
            metadata: { commandAction: normalizedAction },
            scenarioId,
            stepId: command.id,
            usageType: "command",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      ).catch(() => undefined);
    }
    setSelectedStepId(command.id ?? null);
    setSelectedStepIds(new Set(command.id ? [command.id] : []));
    setCanvasMenu(null);
    setCanvasInsertPreview(null);
    setCanvasMessage(`Inserted ${command.commandText}.`);
  };

  const appendRunFailures = useCallback(
    async (sessionId: string, runId: string) => {
      const response = await fetch(
        `/api/automation/sessions/${encodeURIComponent(sessionId)}/events`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        events?: ProviderSessionEvent[];
      }>(response, {});
      if (!response.ok) return [];
      const failures = (data.events ?? []).filter((event) => {
        const eventRunId = typeof event.data?.runId === "string" ? event.data.runId : "";
        return eventRunId === runId && event.type === "step:failed";
      });
      for (const failure of failures.slice(-3)) {
        const index =
          typeof failure.data?.index === "number"
            ? failure.data.index + 1
            : "?";
        const description =
          typeof failure.data?.description === "string"
            ? failure.data.description
            : "Command";
        const error =
          typeof failure.data?.error === "string"
            ? failure.data.error
            : "Step failed.";
        appendLog(`Step ${index} failed: ${description} - ${error}`);
      }
    },
    [appendLog],
  );

  const collectRunStepResults = useCallback(async (sessionId: string, runId: string) => {
    const response = await fetch(
      `/api/automation/sessions/${encodeURIComponent(sessionId)}/events`,
      { cache: "no-store" },
    );
    const data = await readJsonResponse<{
      events?: ProviderSessionEvent[];
    }>(response, {});
    if (!response.ok) return [];
    return (data.events ?? [])
      .filter((event) => {
        const eventRunId = typeof event.data?.runId === "string" ? event.data.runId : "";
        return eventRunId === runId && (event.type === "step:success" || event.type === "step:failed");
      })
      .map(stepResultFromEvent)
      .filter(Boolean) as StepExecutionResult[];
  }, []);

  const persistRunHealingEvents = useCallback(
    async (sessionId: string, runId: string) => {
      const response = await fetch(
        `/api/automation/sessions/${encodeURIComponent(sessionId)}/events`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        events?: ProviderSessionEvent[];
      }>(response, {});
      if (!response.ok) return;
      const events = mergeHealingEvents(
        (data.events ?? [])
          .filter((event) => {
            const eventRunId = typeof event.data?.runId === "string" ? event.data.runId : "";
            return eventRunId === runId;
          })
          .map(providerEventToHealingEvent)
          .filter(Boolean) as HealingReviewEvent[],
      );
      if (!events.length) return [];
      setHealingEvents((current) => mergeHealingEvents([...current, ...events]));
      await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/runs/${encodeURIComponent(runId)}/healing-events`,
        {
          body: JSON.stringify({ events }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      ).catch(() => undefined);
      return events;
    },
    [projectKey],
  );

  const updateRunSummary = useCallback(
    async (
      runId: string,
      status: "passed" | "failed",
      summary: Record<string, unknown>,
    ) => {
      await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/runs/${encodeURIComponent(runId)}`,
        {
          body: JSON.stringify({ status, summary }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      ).catch(() => undefined);
    },
    [projectKey],
  );

  const startSessionRun = async (input: {
    actionId?: string | null;
    browserMode?: RunBrowserMode;
    closeOnComplete: boolean;
    deviceLabel?: string;
    environment?: RunEnvironmentDraft | null;
    forceNewSession?: boolean;
    keepSessionOpen?: boolean;
    name: string;
    parameterData?: Record<string, string>;
    runSteps: AutomationStep[];
    runScope?: SessionRunScope;
    showLiveReport?: boolean;
    startUrl?: string;
    summarySteps: AutomationStep[];
    testCase?: ScenarioTestCase | null;
    viewport?: RunViewport | null;
  }) => {
    const summaryParameterData = { ...(input.parameterData ?? {}) };
    if ("basicAuthPassword" in summaryParameterData) {
      summaryParameterData.basicAuthPassword = "***";
    }
    const liveReportEnabled = input.runScope === "scenario" && input.showLiveReport === true;
    if (liveReportEnabled) {
      openLiveRunReport(input.runSteps, {
        browserMode: input.browserMode ?? runConfig.browserMode,
        device: input.deviceLabel,
        environment: input.environment?.name,
        status: "queued",
        title: input.name,
      });
    } else {
      setLiveRunReport(null);
    }
    if (input.forceNewSession && session?.sessionId && !isCompanionPreviewSession(session)) {
      await closeSession("Previous run session closed.");
    }
    const startUrl =
      sessionStartUrlForRun(input.runSteps, input.startUrl) ||
      resolveWorkspaceUrl(targetUrl) ||
      normalizeUrl(targetUrl);
    let companionSessionId =
      !input.forceNewSession && isUsableBrokerSession(session) && isCompanionPreviewSession(session)
        ? session.sessionId
        : "";
    if (!companionSessionId) {
      const started = await companionBrowserRequest({
        body: JSON.stringify({
          action: "start",
          browserMode: input.browserMode ?? runConfig.browserMode,
          httpCredentials:
            input.environment?.basicAuthEnabled && input.environment.username.trim()
              ? {
                  password: input.environment.password,
                  username: input.environment.username,
                }
              : authFromUrl(startUrl),
          scenarioId,
          startUrl,
          viewport: input.viewport ?? viewportForRunConfig(runConfig),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!started.sessionId) {
        throw new Error(started.error || "CaseForge Companion did not return a browser session.");
      }
      companionSessionId = started.sessionId;
      companionCursorRef.current = started.cursor ?? 0;
      setRecordingSessionId(started.sessionId);
      setSession(companionSessionMetadata(started, started.url || startUrl));
      setLivePreviewFailed(false);
      setProviderEventCaptureAfter(null);
      setEvents((current) => mergeRecorderEvents([...current, ...companionCommandsToRecorderEvents(started.commands)]));
      if (started.logs) setLogs(started.logs.slice(-50));
    }
    if (!companionSessionId) {
      throw new Error("CaseForge Companion session was not created.");
    }
    setRunStatus("running");
    setFailedStepResult(null);
    const keepSessionOpen = input.keepSessionOpen ?? !input.closeOnComplete;
    const response = await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/runs`, {
      body: JSON.stringify({
        scenarioId,
        sessionId: companionSessionId,
        summary: {
          device: input.deviceLabel ?? null,
          environment: input.environment
            ? {
                baseUrl: cleanUrlAuth(input.environment.baseUrl),
                basicAuthEnabled: input.environment.basicAuthEnabled,
                name: input.environment.name,
              }
            : null,
          name: input.name,
          parameterData: summaryParameterData,
          queuedFrom: "recorder-workspace",
          stepResults: input.summarySteps.map((step, index) => ({
            id: step.id,
            index,
            label: step.commandText || readableStepLabel(step),
            status: "queued",
          })),
          testCase: input.testCase
            ? {
                id: input.testCase.id,
                name: input.testCase.name,
              }
            : null,
          worker: {
            state: "queued",
            type: "caseforge-companion",
          },
        },
        status: "queued",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = await readJsonResponse<{ error?: string; run?: { id: string } }>(response, {});
    if (!response.ok || !data.run) throw new Error(data.error || "Could not queue run.");
    appendLog(
      `Companion accepted ${input.runSteps.length} command${
        input.runSteps.length === 1 ? "" : "s"
      } for ${input.name}.`,
    );
    logCommandRunStarted(input.runSteps, data.run.id);
    let runPassed = false;
    let stepResults: StepExecutionResult[] = [];
    companionPlaybackEventIdsRef.current = new Set();
    const stopCompanionProgressPolling = startCompanionPlaybackEventPolling(
      companionSessionId,
      data.run.id,
      input.runSteps,
    );
    try {
      const playbackResponse = await fetch(`${localAgentUrl}/automation/browser`, {
        body: JSON.stringify({
          action: "run",
          actionId:
            input.actionId ??
            (input.summarySteps.length === 1 && input.summarySteps[0]?.action === "action"
              ? input.summarySteps[0].target?.value
              : undefined),
          closeOnComplete: input.closeOnComplete,
          cursor: companionCursorRef.current,
          executionMode: keepSessionOpen ? "interactive_persistent" : "ephemeral_ci",
          keepSessionOpen,
          parameterData: input.parameterData ?? {},
          runId: data.run.id,
          sessionId: companionSessionId,
          steps: input.runSteps,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const runData = await readJsonResponse<CompanionBrowserResponse>(playbackResponse, {});
      applyCompanionPlaybackEvents(input.runSteps, runData.playbackEvents, data.run.id);
      companionCursorRef.current = runData.cursor ?? companionCursorRef.current;
      setSession(companionSessionMetadata(runData, runData.url || startUrl));
      setLivePreviewTick(Date.now());
      applyCompanionCommandResults(input.runSteps, runData.results, data.run.id);
      const normalizedResults: CompanionStepResult[] = runData.results?.length
        ? runData.results
        : input.runSteps.map((step, index) => ({
            index,
            status: "passed",
            stepId: step.id ?? null,
          }));
      stepResults = normalizedResults.map((result) => ({
        endedAt: new Date().toISOString(),
        errorMessage: result.status === "failed" ? result.error || "Command failed." : undefined,
        index: result.index,
        runId: data.run?.id ?? null,
        startedAt: new Date().toISOString(),
        status: result.status === "failed" ? "failed" : "passed",
        stepId: result.stepId ?? null,
      }));
      const failedResult = runData.results?.find((result) => result.status === "failed");
      if (!playbackResponse.ok || failedResult) {
        throw new Error(
          failedResult?.error ||
            runData.error ||
            "A command failed in CaseForge Companion.",
        );
      }
      runPassed = true;
      setRunStatus("completed");
    } catch (error) {
      if (runModalDismissedRef.current && isInactiveCompanionSessionError(error)) {
        setSession(null);
        setRecordingSessionId(null);
        setRecording(false);
        setRecordingPaused(false);
        setRunStatus("idle");
        stepResults = [];
        return { runId: data.run.id, sessionId: "", status: "failed" };
      }
      const failedResult: StepExecutionResult = {
        endedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Run failed in CaseForge Companion.",
        index: stepResults.length,
        runId: data.run.id,
        startedAt: new Date().toISOString(),
        status: "failed",
        stepId: input.runSteps[stepResults.length]?.id ?? null,
      };
      stepResults = [...stepResults, failedResult];
      const runId = data.run?.id ?? null;
      const rawFailedIndex = typeof failedResult.index === "number" ? failedResult.index : stepResults.length - 1;
      const failedStepIndex = Math.max(0, Math.min(rawFailedIndex, input.runSteps.length - 1));
      const failedStep = input.runSteps[failedStepIndex];
      setCommandStatus(failedStep, "failed", failedResult.errorMessage || "Run failed.", runId);
      input.runSteps.slice(failedStepIndex + 1).forEach((step) => {
        setCommandStatus(step, "failed", "Not run because an earlier command failed.", runId);
      });
      updateLiveRunReportRows(
        input.runSteps,
        input.runSteps.slice(failedStepIndex + 1).map((step, offset) => ({
          index: failedStepIndex + offset + 1,
          message: "Not run because an earlier command failed.",
          runId,
          status: "skipped" as const,
          stepId: step.id ?? null,
        })),
        "failed",
      );
      setFailedStepResult(failedResult);
      setRunStatus("failed");
      throw error;
    } finally {
      stopCompanionProgressPolling();
      const persistedHealingEvents: HealingReviewEvent[] = [];
      const failedResult = stepResults.find((result) => result.status === "failed");
      if (failedResult) setFailedStepResult(failedResult);
      await updateRunSummary(data.run.id, runPassed ? "passed" : "failed", {
        failed: runPassed ? 0 : 1,
        passed: runPassed ? input.runSteps.length : Math.max(0, input.runSteps.length - 1),
        parameterData: summaryParameterData,
        selfHealedCount: persistedHealingEvents?.length ?? 0,
        stepResults: stepResults.length ? stepResults : input.summarySteps.map((step, index) => ({
          id: step.id,
          index,
          label: step.commandText || readableStepLabel(step),
          status: runPassed ? "passed" : "skipped",
        })),
        testCase: input.testCase
          ? {
              id: input.testCase.id,
              name: input.testCase.name,
            }
          : null,
        totalSteps: input.runSteps.length,
      });
    }
    appendLog("Run completed in CaseForge Companion. Session ready.");
    return { runId: data.run.id, sessionId: companionSessionId, status: runPassed ? "passed" : "failed" };
  };

  const resumeRecordingFromSavedState = async () => {
    setBusy(true);
    try {
      const latestSteps = await fetchLatestScenarioSteps();
      const resumeSteps = mergeStepsById([...finalizedSteps, ...liveSteps, ...latestSteps]);
      if (!resumeSteps.length) {
        appendLog("Add or save commands before resuming.");
        return;
      }
      await persistSteps(resumeSteps, { throwOnError: true });
      setRecording(false);
      setRecordingPaused(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      setSession((current) => (isCompanionPreviewSession(current) ? null : current));
      setEvents([]);
      const replay = await expandActionSteps(resumeSteps);
      const replaySteps = replay.steps;
      const actionCount = replay.actions.length;
      const actionBreakdown = replay.actions
        .map((action) => `${action.name}: ${action.stepCount}`)
        .join(" | ");
      appendLog(
        `Preparing resume replay: ${actionCount} action${
          actionCount === 1 ? "" : "s"
        }, ${replaySteps.length} command${replaySteps.length === 1 ? "" : "s"}${
          actionBreakdown ? ` (${actionBreakdown})` : ""
        }.`,
      );
      const { parameterData, testCase } = resumeRunParameterContext();
      const parameterizedReplaySteps = substituteStepsParameters(replaySteps, parameterData, runtimeVariableNamesForSubstitution);
      const parameterizedResumeSteps = substituteStepsParameters(resumeSteps, parameterData, runtimeVariableNamesForSubstitution);
      if (testCase) appendLog(`Using test data: ${testCase.name}.`);
      const resumeStartUrl =
        firstNavigationUrl(parameterizedReplaySteps, activeBaseUrl) ||
        firstNavigationUrl(parameterizedResumeSteps, activeBaseUrl) ||
        resolveWorkspaceUrl(targetUrl) ||
        normalizeUrl(targetUrl);
      const resumeEndUrl =
        lastNavigationUrl(parameterizedReplaySteps, activeBaseUrl) ||
        lastNavigationUrl(parameterizedResumeSteps, activeBaseUrl) ||
        resumeStartUrl;
      setTargetUrl(resumeStartUrl);
      if (shouldUseLegacyDesktopBridge(resumeStartUrl)) {
        if (session?.sessionId && !isCompanionPreviewSession(session)) {
          await closeSession("Previous browser session closed.");
        }
        appendLog(`Opening Companion browser at ${resumeStartUrl}`);
        const data = await companionBrowserRequest({
          body: JSON.stringify({
            action: "start",
            httpCredentials: authFromUrl(resumeStartUrl),
            scenarioId,
            startUrl: resumeStartUrl,
            viewport: viewportForRunConfig(runConfig),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!data.sessionId) {
          throw new Error(data.error || "CaseForge Companion did not return a browser session.");
        }
        companionCursorRef.current = data.cursor ?? 0;
        setRecordingSessionId(data.sessionId);
        setSession(companionSessionMetadata(data, resumeStartUrl));
        setLivePreviewFailed(false);
        setProviderEventCaptureAfter(null);
        setEvents([]);
        if (data.logs) setLogs(data.logs.slice(-50));

        const replayRunId = `resume-${Date.now().toString(36)}`;
        const playbackData = await companionBrowserRequest({
          body: JSON.stringify({
            action: "run",
            cursor: companionCursorRef.current,
            runId: replayRunId,
            sessionId: data.sessionId,
            steps: parameterizedReplaySteps,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        companionCursorRef.current = playbackData.cursor ?? companionCursorRef.current;
        setSession(companionSessionMetadata(playbackData, playbackData.url || resumeEndUrl));
        setTargetUrl(playbackData.url || resumeEndUrl);
        setRecording(true);
        setRecordingPaused(false);
        appendLog("Resumed recording in CaseForge Companion from the last saved state.");
        return;
      }
      if (session?.sessionId) {
        await closeSession("Previous browser session closed.");
      }
      appendLog(`Opening browser at ${resumeStartUrl}`);
      const activeSession = await createSession(resumeStartUrl);
      if (!activeSession.sessionId) throw new Error("Browser session was not created.");
      const replayRunId = `resume-${Date.now().toString(36)}`;
      const response = await fetch(
        `/api/automation/sessions/${encodeURIComponent(activeSession.sessionId)}/run`,
        {
          body: JSON.stringify({
            closeOnComplete: false,
            parameterData,
            runId: replayRunId,
            steps: parameterizedReplaySteps,
            suppressRecording: true,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await readJsonResponse<{ error?: string }>(response, {});
      if (!response.ok) throw new Error(data.error || "Could not replay saved commands.");
      setRecordingSessionId(activeSession.sessionId);
      await waitForRunEvent(activeSession.sessionId, replayRunId);
      setEvents([]);
      setTargetUrl(resumeEndUrl);
      setProviderEventCaptureAfter(new Date().toISOString());
      await setSessionRecorderMode(activeSession.sessionId, "record");
      setRecording(true);
      setRecordingPaused(false);
      appendLog("Resumed recording from the last saved state.");
    } catch (error) {
      setRecording(false);
      setRecordingPaused(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      appendLog(error instanceof Error ? error.message : "Could not resume recording.");
    } finally {
      setBusy(false);
    }
  };

  const runScenario = async (config: RunConfig) => {
    setBusy(true);
    try {
      if (!(await saveOpenCommandPromptDraft())) return;
      const environments = selectedRunEnvironments(config);
      if (!environments.length) {
        setRunModalError("Select at least one environment with a URL.");
        return;
      }
      const viewport = viewportForRunConfig(config);
      const deviceLabel = deviceLabelForRunConfig(config);
      const runTestData = activeRunTestData();
      const runSteps = await runtimeScenarioSteps();
      if (!runSteps.length) {
        appendLog("Add commands before running.");
        return;
      }
      const selectedActionStepIds = new Set(
        [...selectedActionCommandKeys].map((key) => key.split(":")[0]).filter(Boolean),
      );
      const hasExplicitRunSelection = selectedStepIds.size > 0 || selectedActionStepIds.size > 0;
      const selectedTopLevelIndexes = runSteps
        .map((step, index) =>
          selectedStepIds.has(step.id) || selectedActionStepIds.has(step.id) ? index : -1,
        )
        .filter((index) => index >= 0);
      const selectedContextEndIndex = selectedTopLevelIndexes.length
        ? Math.max(...selectedTopLevelIndexes)
        : -1;
      const scopedRunSteps = hasExplicitRunSelection
        ? selectedContextEndIndex >= 0
          ? runSteps.slice(0, selectedContextEndIndex + 1)
          : runSteps.filter((step, index) => isScenarioInitStep(step, index))
        : runSteps;
      if (hasExplicitRunSelection && actionCandidateSteps(scopedRunSteps).length === 0) {
        appendLog("Select at least one command or action to run.");
        return;
      }
      const stepsRequiringAction = actionCandidateSteps(scopedRunSteps);
      if (!hasExplicitRunSelection && stepsRequiringAction.some((step) => step.action !== "action")) {
        await persistSteps(runSteps, { throwOnError: true });
        setEvents([]);
        promptForLooseAction(runSteps);
        appendLog("Create and name an Action for the selected commands before running.");
        return;
      }
      const actionOnlyRunSelection =
        hasExplicitRunSelection &&
        stepsRequiringAction.length > 0 &&
        stepsRequiringAction.every((step) => step.action === "action");
      if (!actionOnlyRunSelection) {
        await persistSteps(runSteps, { throwOnError: true });
      }
      setEvents([]);
      if (hasExplicitRunSelection) {
        appendLog(`Running selected scope: ${stepsRequiringAction.length} item${stepsRequiringAction.length === 1 ? "" : "s"}.`);
      }
      const executableSteps = (await expandActionSteps(scopedRunSteps, {
        selectedActionCommandKeys,
        selectedActionStepIds,
      })).steps;
      const activeTestCases = runTestData.testCases.filter((testCase) =>
        testCaseMatchesRunScope(testCase, config),
      );
      const runRows = activeTestCases.length
        ? activeTestCases
        : [null];
      const totalRuns = environments.length * runRows.length;
      if (runTestData.testCases.length && !activeTestCases.length) {
        appendLog("No active test cases match the selected run scope.");
        return;
      }
      appendLog(
        `Queued ${totalRuns} run${totalRuns === 1 ? "" : "s"} across ${environments.length} environment${
          environments.length === 1 ? "" : "s"
        } on ${deviceLabel}. Execution mode: ${config.executionMode}.`,
      );
      let runIndex = 0;
      for (const environment of environments) {
        for (const testCase of runRows) {
          runIndex += 1;
          const baseParameterData = testCase
            ? dataForTestCase(testCase, runTestData.parameters)
            : defaultParameterData(runTestData.parameters);
          const parameterData = {
            ...baseParameterData,
            baseUrl: environment.baseUrl.replace(/\/$/, ""),
            basicAuthUsername: environment.username,
            environmentName: environment.name,
          };
          const parameterizedExecutableSteps = applyRunEnvironmentToSteps(
            substituteStepsParameters(executableSteps, parameterData, runtimeVariableNamesForSubstitution),
            environment,
          );
          const parameterizedSummarySteps = applyRunEnvironmentToSteps(
            substituteStepsParameters(scopedRunSteps, parameterData, runtimeVariableNamesForSubstitution),
            environment,
          );
          const runLabel = [
            scenarioName,
            environment.name,
            deviceLabel,
            testCase?.name,
          ]
            .filter(Boolean)
            .join(" / ");
          appendLog(`Starting run ${runIndex}/${totalRuns}: ${runLabel}.`);
          await startSessionRun({
            browserMode: config.browserMode,
            closeOnComplete: false,
            deviceLabel,
            environment,
            forceNewSession: true,
            keepSessionOpen: true,
            name: runLabel,
            parameterData,
            runSteps: parameterizedExecutableSteps,
            runScope: "scenario",
            showLiveReport: true,
            startUrl:
              firstNavigationUrl(parameterizedExecutableSteps, environment.baseUrl) ||
              normalizeUrl(environment.baseUrl),
            summarySteps: parameterizedSummarySteps,
            testCase,
            viewport,
          });
        }
      }
      setRunModalOpen(false);
      setRecording(false);
      setRecordingPaused(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not queue run.");
    } finally {
      setBusy(false);
    }
  };

  const runActionStep = async (step: AutomationStep) => {
    if (step.action !== "action") return;
    setBusy(true);
    const actionStepId = step.id;
    try {
      if (!(await saveOpenCommandPromptDraft())) return;
      const runTestData = activeRunTestData();
      const runnableStep = currentStepForRun(step);
      const setupSourceSteps = await runtimeScenarioSteps();
      setRecording(false);
      setRecordingPaused(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      setPlaybackState("stepRunning");
      if (actionStepId) {
        setCommandRunStates((current) => ({
          ...current,
          [actionStepId]: {
            message: "Queued",
            runId: null,
            status: "running",
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      const actionContextSteps = timelineContextStepsForStep(runnableStep, setupSourceSteps);
      const hasSelectedCommandsForAction = [...selectedActionCommandKeys].some((key) =>
        key.startsWith(`${runnableStep.id}:`),
      );
      const selectedActionStepIds = hasSelectedCommandsForAction
        ? new Set([runnableStep.id])
        : new Set<string>();
      const actionRun = await expandActionSteps(actionContextSteps, {
        selectedActionCommandKeys,
        selectedActionStepIds,
      });
      const actionSteps = actionRun.steps;
      if (!actionSteps.length) throw new Error("Action has no commands.");
      appendLog(
        `Running action with scenario context: ${runnableStep.target?.displayName || runnableStep.commandText || "Action"} (${actionSteps.length} command${
          actionSteps.length === 1 ? "" : "s"
        }).`,
      );
      const actionName = runnableStep.target?.displayName || runnableStep.commandText || "Action";
      if (runTestData.testCases.length) {
        appendLog(`Running ${runTestData.testCases.length} test case${runTestData.testCases.length === 1 ? "" : "s"} for action.`);
        for (const testCase of runTestData.testCases) {
          const parameterData = dataForTestCase(testCase, runTestData.parameters);
          const parameterizedActionSteps = substituteStepsParameters(actionSteps, parameterData, runtimeVariableNamesForSubstitution);
          const parameterizedSetupSteps = substituteStepsParameters(setupSourceSteps, parameterData, runtimeVariableNamesForSubstitution);
          const executableActionSteps = withScenarioInitSteps(parameterizedActionSteps, parameterizedSetupSteps);
          const parameterizedSummarySteps = substituteStepsParameters([runnableStep], parameterData, runtimeVariableNamesForSubstitution);
          await startSessionRun({
            actionId: runnableStep.target?.value || null,
            closeOnComplete: false,
            keepSessionOpen: true,
            name: `${actionName} / ${testCase.name}`,
            parameterData,
            runSteps: executableActionSteps,
            runScope: "action",
            showLiveReport: false,
            startUrl:
              firstNavigationUrl(executableActionSteps, activeBaseUrl) ||
              resolveWorkspaceUrl(targetUrl) ||
              normalizeUrl(targetUrl),
            summarySteps: parameterizedSummarySteps,
            testCase,
          });
        }
      } else {
        const parameterData = defaultParameterData(runTestData.parameters);
        const parameterizedActionSteps = substituteStepsParameters(actionSteps, parameterData, runtimeVariableNamesForSubstitution);
        const parameterizedSetupSteps = substituteStepsParameters(setupSourceSteps, parameterData, runtimeVariableNamesForSubstitution);
        const executableActionSteps = withScenarioInitSteps(parameterizedActionSteps, parameterizedSetupSteps);
        const parameterizedSummarySteps = substituteStepsParameters([runnableStep], parameterData, runtimeVariableNamesForSubstitution);
        await startSessionRun({
          actionId: runnableStep.target?.value || null,
          closeOnComplete: false,
          keepSessionOpen: true,
          name: `${actionName} run`,
          parameterData,
          runSteps: executableActionSteps,
          runScope: "action",
          showLiveReport: false,
          startUrl:
            firstNavigationUrl(executableActionSteps, activeBaseUrl) ||
            resolveWorkspaceUrl(targetUrl) ||
            normalizeUrl(targetUrl),
          summarySteps: parameterizedSummarySteps,
        });
      }
      if (actionStepId) {
        setCommandRunStates((current) => ({
          ...current,
          [actionStepId]: {
            message: "Passed",
            runId: null,
            status: "passed",
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      setPlaybackState("completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run action.";
      setPlaybackState("failed");
      if (actionStepId) {
        setCommandRunStates((current) => ({
          ...current,
          [actionStepId]: {
            message,
            runId: null,
            status: "failed",
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      appendLog(message);
    } finally {
      setBusy(false);
    }
  };

  const runSingleCommand = async (step: AutomationStep) => {
    setBusy(true);
    setLiveRunReport((current) => current ? { ...current, open: false } : current);
    try {
      if (!(await saveOpenCommandPromptDraft())) return;
      const runTestData = activeRunTestData();
      const runnableStep = currentStepForRun(step);
      if (runnableStep.action === "action") {
        await runActionStep(runnableStep);
        return;
      }
      const commandAction = displayAction(runnableStep.action);
      if (commandAction === "navigate") {
        const nextUrl = navigationUrlForStep(runnableStep, activeBaseUrl);
        if (!nextUrl) throw new Error("Navigate command is missing a URL or has an unresolved Base URL.");
        setCommandRunStates((current) => ({
          ...current,
          [runnableStep.id]: {
            message: "Opening in Live Preview",
            runId: null,
            status: "running",
            updatedAt: new Date().toISOString(),
          },
        }));
        setPlaybackState("stepRunning");
        setWorkspaceTab("browser");
        setTargetUrl(nextUrl);
        setAuthoringPreviewUrl(nextUrl);
        setBrowserAddressDraft(nextUrl);
        if (
          session?.sessionId &&
          session.liveViewUrl &&
          isCompanionPreviewSession(session)
        ) {
          const previewData = await companionBrowserRequest({
            body: JSON.stringify({
              action: "browserCommand",
              command: "navigate",
              sessionId: session.sessionId,
              url: nextUrl,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          setSession((current) =>
            companionSessionMetadata(
              previewData,
              previewData.currentUrl || previewData.url || current?.currentUrl || nextUrl,
            ) ?? current,
          );
          companionCursorRef.current = previewData.cursor ?? companionCursorRef.current;
          setLivePreviewFailed(false);
          setLivePreviewTick(Date.now());
        } else {
          await startHiddenLivePreview(nextUrl, livePreviewSize);
        }
        setCommandRunStates((current) => ({
          ...current,
          [runnableStep.id]: {
            message: "Opened in Live Preview",
            runId: null,
            status: "passed",
            updatedAt: new Date().toISOString(),
          },
        }));
        setPlaybackState("completed");
        appendLog(`Navigate opened in Live Preview only: ${nextUrl}. Scenario execution was not started.`);
        return;
      }
      if (!isRunnableWebCommand(commandAction)) {
        const message = commandAdapterPendingMessage(commandAction);
        setPlaybackState("failed");
        setCommandRunStates((current) => ({
          ...current,
          [runnableStep.id]: {
            message,
            runId: null,
            status: "failed",
            updatedAt: new Date().toISOString(),
          },
        }));
        appendLog(message);
        return;
      }
      const commandRun = await expandActionSteps([runnableStep]);
      const commandSteps = commandRun.steps;
      if (!commandSteps.length) throw new Error("Command has no executable step.");
      setCommandRunStates((current) => ({
        ...current,
        [runnableStep.id]: {
          message: "Running",
          runId: null,
          status: "running",
          updatedAt: new Date().toISOString(),
        },
      }));
      setPlaybackState("stepRunning");
      const commandName = runnableStep.commandText || readableStepLabel(runnableStep);
      const activeTestCase = runTestData.testCases[0] ?? null;
      const parameterData = activeTestCase
        ? dataForTestCase(activeTestCase, runTestData.parameters)
        : defaultParameterData(runTestData.parameters);
      const parameterizedSteps = substituteStepsParameters(commandSteps, parameterData, runtimeVariableNamesForSubstitution);
      const parameterizedSummarySteps = substituteStepsParameters([runnableStep], parameterData, runtimeVariableNamesForSubstitution);
      const activeCompanionSession =
        isUsableBrokerSession(session) && isCompanionPreviewSession(session)
          ? session
          : null;
      if (activeCompanionSession?.sessionId) {
        const commandRunId = `command-${Date.now().toString(36)}`;
        const beforeCommandUrl = activeCompanionSession.currentUrl || targetUrl;
        appendLog(`Running command in current Live Preview: ${commandName}.`);
        const playbackResponse = await fetch(`${localAgentUrl}/automation/browser`, {
          body: JSON.stringify({
            action: "run",
            cursor: companionCursorRef.current,
            parameterData,
            runId: commandRunId,
            sessionId: activeCompanionSession.sessionId,
            steps: parameterizedSteps,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const playbackData = await readJsonResponse<CompanionBrowserResponse>(playbackResponse, {});
        companionCursorRef.current = playbackData.cursor ?? companionCursorRef.current;
        setSession((current) =>
          isCompanionPreviewSession(current)
            ? companionSessionMetadata(playbackData, playbackData.url || current?.currentUrl || targetUrl)
            : current,
        );
        setLivePreviewTick(Date.now());
        const failedResult = playbackData.results?.find((result) => result.status === "failed");
        const resultLogLines = (playbackData.results ?? []).flatMap((result) => {
            const resultIndex = typeof result.index === "number" ? result.index : -1;
            const resultStep =
              (result.stepId
                ? parameterizedSteps.find((item) => item.id === result.stepId)
                : null) ??
              (resultIndex >= 0 ? parameterizedSteps[resultIndex] : undefined);
            const outputLine = commandConsoleOutputLineForStep(resultStep, result.output);
            return [
              ...(outputLine ? [outputLine] : []),
              ...commandConsoleDetailLinesForStep(resultStep, result.output),
            ];
          });
        if (!playbackResponse.ok || failedResult) {
          for (const line of resultLogLines) {
            appendLog(line);
          }
          const message =
            failedResult?.error ||
            playbackData.error ||
            "Command failed in Live Preview.";
          throw new Error(message);
        }
        setCommandRunStates((current) => ({
          ...current,
          [runnableStep.id]: {
            message: "Passed",
            runId: commandRunId,
            status: "passed",
            updatedAt: new Date().toISOString(),
          },
        }));
        appendLog(`Command passed in Live Preview: ${commandName}.`);
        const afterCommandUrl = playbackData.url || playbackData.currentUrl || "";
        if (
          afterCommandUrl &&
          normalizeUrl(afterCommandUrl) !== normalizeUrl(beforeCommandUrl)
        ) {
          appendLog(`Current URL changed to: ${afterCommandUrl}.`);
        }
        for (const line of resultLogLines) {
          appendLog(line);
        }
      } else {
        const setupSourceSteps = await runtimeScenarioSteps();
        const contextSourceSteps = timelineContextStepsForStep(runnableStep, setupSourceSteps);
        const contextRun = await expandActionSteps(contextSourceSteps);
        const executableSteps = substituteStepsParameters(
          contextRun.steps.length ? contextRun.steps : commandSteps,
          parameterData,
          runtimeVariableNamesForSubstitution,
        );
        const summarySteps = substituteStepsParameters(
          contextSourceSteps.length ? contextSourceSteps : [runnableStep],
          parameterData,
          runtimeVariableNamesForSubstitution,
        );
        const runResult = await startSessionRun({
          closeOnComplete: false,
          keepSessionOpen: true,
          name: `${commandName} run`,
          parameterData,
          runSteps: executableSteps,
          runScope: "command",
          showLiveReport: false,
          startUrl:
            firstNavigationUrl(executableSteps, activeBaseUrl) ||
            resolveWorkspaceUrl(targetUrl) ||
            normalizeUrl(targetUrl),
          summarySteps,
          testCase: activeTestCase,
        });
        setCommandRunStates((current) => ({
          ...current,
          [runnableStep.id]: {
            message: "Passed",
            runId: runResult.runId,
            status: "passed",
            updatedAt: new Date().toISOString(),
          },
        }));
        appendLog(`Command passed: ${commandName}.`);
        if (runResult.runId) appendLog(`Run ID: ${runResult.runId}.`);
      }
      setPlaybackState("completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run command.";
      setPlaybackState("failed");
      if (step.id) {
        setCommandRunStates((current) => ({
          ...current,
          [step.id]: {
            message,
            runId: null,
            status: "failed",
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      appendLog(message);
    } finally {
      setBusy(false);
    }
  };

  const runActionCommand = async (actionStep: AutomationStep, command: AutomationStep) => {
    await runSingleCommand({
      ...command,
      options: {
        ...command.options,
        sourceActionId: actionStep.target?.value || actionStep.id,
        sourceActionName: actionStep.target?.displayName || actionStep.commandText || "Action",
      },
    });
  };

  const retryFailedStep = async () => {
    if (!failedStepResult?.stepId) return;
    const step = visibleSteps.find((item) => item.id === failedStepResult.stepId);
    if (!step) {
      appendLog("The failed command is no longer in the timeline.");
      return;
    }
    await runSingleCommand(step);
  };

  const resumeFromPreviousFailedStep = async () => {
    if (!failedStepResult?.stepId) return;
    const failedIndex = visibleSteps.findIndex((step) => step.id === failedStepResult.stepId);
    if (failedIndex < 0) {
      appendLog("The failed command is no longer in the timeline.");
      return;
    }
    const startIndex = Math.max(0, failedIndex - 1);
    const resumeSteps = visibleSteps.slice(startIndex);
    if (!resumeSteps.length) return;
    setBusy(true);
    try {
      setRunStatus("running");
      setFailedStepResult(null);
      const expanded = await expandActionSteps(resumeSteps);
      const { parameterData, testCase } = resumeRunParameterContext();
      const parameterizedRunSteps = substituteStepsParameters(expanded.steps, parameterData, runtimeVariableNamesForSubstitution);
      const parameterizedSummarySteps = substituteStepsParameters(resumeSteps, parameterData, runtimeVariableNamesForSubstitution);
      await startSessionRun({
        closeOnComplete: false,
        keepSessionOpen: true,
        name: `Resume from step ${startIndex + 1}`,
        parameterData,
        runSteps: parameterizedRunSteps,
        runScope: "resume",
        showLiveReport: false,
        startUrl:
          firstNavigationUrl(parameterizedRunSteps, activeBaseUrl) ||
          resolveWorkspaceUrl(targetUrl) ||
          normalizeUrl(targetUrl),
        summarySteps: parameterizedSummarySteps,
        testCase,
      });
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not resume from previous step.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecordingPause = async () => {
    const sessionId = recordingSessionId || session?.sessionId;
    if (!recording || !sessionId) return;
    const nextPaused = !recordingPaused;
    try {
      if (nextPaused) {
        await pauseRecording();
        return;
      }
      await resumeRecording();
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not update recording mode.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const fetchScenario = async () => {
      const response = await fetch(
        `/api/automation/projects/${encodeURIComponent(projectKey)}/scenarios/${encodeURIComponent(scenarioId)}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        error?: string;
        scenario?: AutomationScenario;
      }>(response, {});
      if (!response.ok) {
        throw responseStatusError(data.error || "Could not load scenario.", response.status);
      }
      return data.scenario ?? null;
    };

    const loadScenario = async () => {
      try {
        await ensureBrowserProjectSynced(projectKey);
        let loadedScenario: AutomationScenario | null;
        try {
          loadedScenario = await fetchScenario();
        } catch (loadError) {
          if (!isNotFoundStatusError(loadError)) {
            throw loadError;
          }
          const synced = await ensureBrowserProjectSynced(projectKey);
          if (!synced) {
            throw loadError;
          }
          loadedScenario = await fetchScenario();
        }

        if (!cancelled && loadedScenario) {
          const cached = readDraftCache(projectKey, scenarioId);
          if (shouldUseCachedScenario(loadedScenario, cached)) {
            setScenario(cached);
          } else {
            setScenario(loadedScenario);
            clearDraftCache(projectKey, scenarioId);
          }
        }
      } catch (error) {
        const cached = readDraftCache(projectKey, scenarioId);
        if (!cancelled && cached) setScenario(cached);
        appendLog(error instanceof Error ? error.message : "Could not load scenario.");
      }
    };

    void loadScenario();

    return () => {
      cancelled = true;
    };
  }, [appendLog, projectKey, scenarioId]);

  useEffect(() => {
    void refreshPlaybackState().catch((error) => {
      appendLog(error instanceof Error ? error.message : "Could not load playback state.");
    });
  }, [appendLog, refreshPlaybackState]);

  useEffect(() => {
    void refreshCanvasState().catch((error) => {
      appendLog(error instanceof Error ? error.message : "Could not load Canvas state.");
    });
  }, [appendLog, refreshCanvasState]);

  useEffect(() => {
    const resolvedTargetUrl = resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl);
    if (
      !shouldUseLegacyDesktopBridge(resolvedTargetUrl) ||
      !recordingActive ||
      recordingPaused ||
      !recordingSessionId
    ) {
      return;
    }
    const poll = () => {
      const params = new URLSearchParams({
        cursor: String(companionCursorRef.current),
        sessionId: recordingSessionId,
      });
      void companionBrowserRequest(undefined, params)
        .then((data) => {
          companionCursorRef.current = data.cursor ?? companionCursorRef.current;
          if (data.url) setTargetUrl(data.url);
          setSession((current) =>
            isCompanionPreviewSession(current)
              ? companionSessionMetadata(data, data.url || current?.currentUrl || targetUrl)
              : current,
          );
          if (data.status === "stopped" || data.status === "failed") {
            setRecording(false);
          }
          const recorderEvents = companionCommandsToRecorderEvents(data.commands);
          if (recorderEvents.length) {
            setEvents((current) => mergeRecorderEvents([...current, ...recorderEvents]));
            persistRecorderEvents(recorderEvents);
          }
          if (data.logs) setLogs(data.logs.slice(-50));
        })
        .catch(() => undefined);
    };
    poll();
    const intervalId = window.setInterval(poll, 1000);
    return () => window.clearInterval(intervalId);
  }, [persistRecorderEvents, recordingActive, recordingPaused, recordingSessionId, resolveWorkspaceUrl, targetUrl]);

  useEffect(() => {
    if (shouldUseLegacyDesktopBridge(resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl)) || !session?.sessionId) return;
    let cancelled = false;
    const sessionId = session.sessionId;
    const poll = () => {
      void fetch(`/api/automation/sessions/${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          const data = await readJsonResponse<{ sessionMetadata?: BrokerSessionMetadata }>(
            response,
            {},
          );
          const sessionMetadata = normalizeBrokerSessionMetadata(
            data.sessionMetadata,
            sessionId,
          );
          if (!response.ok || !sessionMetadata || cancelled) return;
          setSession(sessionMetadata);
          if (
            verifyPicking &&
            sessionMetadata.metadata?.recorderMode === "record"
          ) {
            setVerifyPicking(false);
            if (!recording) {
              setRecordingSessionId(null);
              setProviderEventCaptureAfter(null);
            }
          }
        })
        .catch(() => undefined);
    };
    poll();
    const intervalId = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [recording, resolveWorkspaceUrl, session?.sessionId, targetUrl, verifyPicking]);

  useEffect(() => {
    const captureSessionId = recordingSessionId || session?.sessionId || "";
    if (
      shouldUseLegacyDesktopBridge(resolveWorkspaceUrl(targetUrl) || normalizeUrl(targetUrl)) ||
      (!recording && !verifyPicking) ||
      !captureSessionId
    ) {
      return;
    }
    let cancelled = false;
    const captureAfterMs = providerEventCaptureAfter ? Date.parse(providerEventCaptureAfter) : 0;
    const poll = () => {
      void fetch(`/api/automation/sessions/${encodeURIComponent(captureSessionId)}/events`, {
        cache: "no-store",
      })
        .then(async (response) => {
          const data = await readJsonResponse<{
            events?: ProviderSessionEvent[];
          }>(response, {});
          if (!response.ok || cancelled) return;
          const recorderEvents = recorderEventsFromProviderEvents(data.events ?? [], captureAfterMs).filter(
            (event) => {
              if (ignoredRecorderStepIdsRef.current.has(event.id)) return false;
              const step = eventToStep(event);
              return !step?.id || !ignoredRecorderStepIdsRef.current.has(step.id);
            },
          );
          if (recorderEvents.length) {
            setEvents((current) => mergeRecorderEvents([...current, ...recorderEvents]));
            persistRecorderEvents(recorderEvents);
            const verifyEvent = recorderEvents.find((event) => event.type === "assert");
            if (verifyEvent) {
              setVerifyPicking(false);
              if (!recording) {
                setRecordingSessionId(null);
                setProviderEventCaptureAfter(null);
                setSelectedStepId(verifyEvent.id);
                setDrawerOpen(true);
                appendLog("Verify target captured. Choose the assertion and save the command.");
              } else {
                appendLog("Verify target captured.");
              }
            }
          }
        })
        .catch(() => undefined);
    };
    poll();
    const intervalId = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [appendLog, persistRecorderEvents, providerEventCaptureAfter, recording, recordingSessionId, resolveWorkspaceUrl, session?.sessionId, targetUrl, verifyPicking]);

  useEffect(() => {
    if (!canvasExploreElement) return;
    const handleCanvasExploreKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCanvasExploreElement(null);
        setCanvasExploreIndex(0);
      }
    };
    window.addEventListener("keydown", handleCanvasExploreKey);
    return () => window.removeEventListener("keydown", handleCanvasExploreKey);
  }, [canvasExploreElement]);

  return (
    <div className="mt-4 min-h-[760px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {scenarioName}
            </h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {session?.status || "not started"}
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
              Browser: {browserSessionState}
            </span>
            {advancedRecordingUiEnabled ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                Recorder: {recorderState}
              </span>
            ) : null}
            {advancedPlaybackUiEnabled ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100">
                Playback: {playbackState}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {visibleSteps.length} commands{selectedSteps.length ? ` | ${selectedSteps.length} selected` : ""}
            {recordingPaused ? " | paused" : ""}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:max-w-4xl">
          <a
            href={companionDownloadUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border !border-zinc-950 !bg-zinc-950 px-3 py-1.5 text-center text-sm font-semibold !text-white transition hover:!bg-white hover:!text-zinc-950 dark:!border-zinc-950 dark:!bg-zinc-950 dark:!text-white dark:hover:!bg-white dark:hover:!text-zinc-950"
          >
            Download Companion {COMPANION_VERSION}
          </a>
          <button
            type="button"
            data-live-preview-action="glowcart-demo"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void prepareGlowCartDemoAuthoring();
            }}
            disabled={busy || recordingActive || verifyPicking}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
          >
            {glowCartPreparing ? "Preparing Demo..." : "Try GlowCart Demo"}
          </button>
          {advancedRecordingUiEnabled ? (
            <button
              type="button"
              onClick={() => void (recordingActive ? stopRecording() : openRecordModal())}
              disabled={busy || verifyPicking}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
                recordingActive ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {recordingActive ? "Stop" : "Record"}
            </button>
          ) : null}
          {advancedPlaybackUiEnabled ? (
            <>
              <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10">
                <button
                  type="button"
                  onClick={() => void startPlayback(selectedStepIds.size ? "selected" : "fullScenario")}
                  disabled={busy || playbackBusy || verifyPicking}
                  className="min-w-[92px] whitespace-nowrap px-3 py-1.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-50 dark:text-sky-100 dark:hover:bg-sky-500/20"
                >
                  Playback
                </button>
                <button
                  type="button"
                  onClick={() => void startPlayback("selectedToEnd")}
                  disabled={busy || playbackBusy || verifyPicking || !selectedStepId}
                  className="min-w-[72px] whitespace-nowrap border-l border-sky-200 px-2.5 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-40 dark:border-sky-500/30 dark:text-sky-100 dark:hover:bg-sky-500/20"
                  title="Playback from selected command to the end"
                >
                  To End
                </button>
                <button
                  type="button"
                  onClick={() => void startPlayback("startToSelected")}
                  disabled={busy || playbackBusy || verifyPicking || !selectedStepId}
                  className="min-w-[72px] whitespace-nowrap border-l border-sky-200 px-2.5 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-40 dark:border-sky-500/30 dark:text-sky-100 dark:hover:bg-sky-500/20"
                  title="Playback from the beginning to selected command"
                >
                  To Here
                </button>
              </div>
              <button
                type="button"
                onClick={() => void stopPlaybackQueue()}
                disabled={playbackBusy && !playbackJobs.some((job) => job.status === "queued")}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Stop Queue
              </button>
              <button
                type="button"
                onClick={() => setPlaybackConfigOpen(true)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Playback Config
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={openRunModal}
            disabled={busy || verifyPicking}
            className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:disabled:bg-zinc-800"
          >
            Run
          </button>
        </div>
      </div>

      <div className={`grid min-h-[700px] min-w-0 gap-3 p-3 ${livePreviewWorkspaceColumns}`}>
        <main
          className="grid min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden"
          style={{ minHeight: `${Math.max(660, activeLivePreviewSize.panelMinHeight + 100)}px` }}
        >
          <section className="relative min-w-0 overflow-hidden rounded-[16px] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex min-w-0 items-center gap-1.5 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void requestLiveBrowserCommand("back")}
                  disabled={!canControlLiveBrowser || browserNavBusy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                  title="Back"
                  aria-label="Back"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                    <path d="M11.8 4.8 6.6 10l5.2 5.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void requestLiveBrowserCommand("forward")}
                  disabled={!canControlLiveBrowser || browserNavBusy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                  title="Forward"
                  aria-label="Forward"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                    <path d="m8.2 4.8 5.2 5.2-5.2 5.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void requestLiveBrowserCommand("reload")}
                  disabled={!canControlLiveBrowser || browserNavBusy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                  title="Reload"
                  aria-label="Reload"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 ${browserNavBusy ? "animate-spin" : ""}`}>
                    <path d="M15.2 7.2A5.8 5.8 0 1 0 16 10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                    <path d="M15.3 3.9v3.4h-3.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                  </svg>
                </button>
                <form onSubmit={submitLiveBrowserAddress} className="min-w-[160px] flex-1">
                  <div className="flex h-8 w-full items-center rounded-full border border-transparent bg-zinc-100 transition focus-within:border-sky-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-100 dark:bg-zinc-900 dark:focus-within:border-sky-500/60 dark:focus-within:bg-zinc-950 dark:focus-within:ring-sky-500/15">
                    <input
                      value={browserAddressDraft}
                      onChange={(event) => setBrowserAddressDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const nextUrl = resolveWorkspaceUrl(browserAddressDraft);
                          if (!nextUrl) {
                            appendLog("Navigation URL still contains an unresolved variable. Set the Base URL first.");
                            return;
                          }
                          setBrowserAddressDraft(nextUrl);
                          void requestLiveBrowserCommand("navigate", nextUrl);
                        }
                      }}
                      disabled={!canControlLiveBrowser || browserNavBusy}
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm text-zinc-800 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100"
                      aria-label="Preview address"
                      spellCheck={false}
                    />
                    <button
                      type="submit"
                      disabled={!canControlLiveBrowser || browserNavBusy}
                      className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white hover:text-zinc-950 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                      title="Go"
                      aria-label="Go"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5">
                        <path d="m7.2 4.8 5.2 5.2-5.2 5.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                  </div>
                </form>
                {session?.liveViewUrl ? (
                  <>
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                      Live preview
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLiveInspectorEnabled((current) => {
                          const next = !current;
                          if (!next) {
                            setLiveInspectorResult(null);
                            setLiveInspectorSelected(null);
                            setLiveCommandMenu(null);
                          }
                          return next;
                        })
                      }
                      className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                        liveInspectorEnabled
                          ? "bg-sky-700 text-white"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                      title={
                        liveInspectorEnabled
                          ? "Inspect is on: hover/right-click to author commands"
                          : "Inspect is off: interact with the browser without recording"
                      }
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => void cycleLivePreviewSize()}
                      disabled={busy}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      title="Increase both the hidden browser viewport and the Live Preview panel"
                    >
                      Preview Size: {activeLivePreviewSize.label}
                    </button>
                    <span className="hidden rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 sm:inline">
                      {activeLivePreviewSize.viewport.width} x {activeLivePreviewSize.viewport.height}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLivePreviewTabsExpanded((current) => !current)}
                      className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      title="Detected preview tabs and windows"
                      aria-label="Detected preview tabs and windows"
                    >
                      {previewTabCount}
                    </button>
                    <button
                      type="button"
                      onClick={() => void requestLiveBrowserCommand("newTab", previewAddress)}
                      disabled={!canControlLiveBrowser || browserNavBusy}
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                      title="Open current page in a new preview tab"
                      aria-label="Open current page in a new preview tab"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                        <rect x="4" y="6" width="9" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M7 4h7.2c1 0 1.8.8 1.8 1.8V12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void requestLiveBrowserCommand("closeTab")}
                      disabled={!canControlLiveBrowser || browserNavBusy}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-200"
                      title="Close active preview tab"
                      aria-label="Close active preview tab"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                        <path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                      </svg>
                    </button>
                  </>
                ) : null}
                {advancedCanvasUiEnabled ? (
                  <div className="ml-1 flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {(["browser", "canvas"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setWorkspaceTab(tab)}
                        className={`px-2 py-1 text-xs font-semibold capitalize transition ${
                          workspaceTab === tab
                            ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                ) : null}
                {advancedCanvasUiEnabled && workspaceTab === "canvas" ? (
                  <button
                    type="button"
                    onClick={() => void captureCanvasFromTimeline()}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
                  >
                    Capture Canvas
                  </button>
                ) : null}
              </div>
              {(livePreviewTabsExpanded && previewTabs.length > 0) || livePreviewTabNotice ? (
                <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                  {livePreviewTabNotice ? (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="truncate">Opened new tab: {livePreviewTabNotice.label}</span>
                    </div>
                  ) : null}
                  {livePreviewTabsExpanded && previewTabs.length > 0 ? (
                    <>
                      <div className="mb-2 min-w-0 truncate text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Active: {livePreviewTabLabel(activePreviewTab)}
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto">
                        {previewTabs.map((tab, index) => {
                          const active = tab.id === session?.activeTabId || tab.active;
                          const label = tab.title || tab.url || `Tab ${index + 1}`;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => void switchLivePreviewTab(tab.id)}
                              className={`max-w-[220px] shrink-0 truncate rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition ${
                                active
                                  ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              }`}
                              title={tab.url || label}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div
              className="h-full min-w-0 overflow-hidden bg-zinc-100 dark:bg-zinc-900"
              style={{ minHeight: `${activeLivePreviewSize.panelMinHeight}px` }}
            >
              {advancedCanvasUiEnabled && workspaceTab === "canvas" ? (
                <div
                  className="relative h-full min-h-[560px] overflow-auto bg-zinc-950 p-4"
                  onClick={() => setCanvasMenu(null)}
                >
                  <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
                    <span className="truncate">
                      {canvasView
                        ? `${canvasView.title || canvasView.name || "Captured View"} | ${canvasView.url || targetUrl}`
                        : "No Canvas captured yet"}
                    </span>
                    <span>
                      {canvasElements.length} repository element{canvasElements.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="relative mx-auto aspect-[16/9] min-h-[420px] max-w-5xl overflow-hidden rounded-xl border border-zinc-700 bg-white shadow-2xl">
                    {canvasView?.screenshotUri ? (
                      <img
                        src={canvasView.screenshotUri}
                        alt=""
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
                    )}
                    {(canvasView?.elementSnapshots ?? []).map((snapshot, index) => {
                      const bounds = rectRecord(snapshot.bounds);
                      const saved = canvasElements.some((element) => {
                        const locatorValue = String(element.canonicalLocator.value ?? "");
                        const snapshotLocator = rankedLocators(
                          Array.isArray(snapshot.locatorCandidates)
                            ? (snapshot.locatorCandidates as AutomationLocatorCandidate[])
                            : [],
                        )[0]?.value;
                        return locatorValue && locatorValue === snapshotLocator;
                      });
                      const ambiguous = Number(snapshot.matchCount ?? 0) > 1 || snapshot.repositoryStatus === "ambiguous";
                      const tableCell = String(snapshot.elementKind ?? snapshot.type).toLowerCase().includes("table");
                      return (
                        <button
                          key={String(snapshot.id ?? index)}
                          type="button"
                          onMouseEnter={() => setCanvasHoverElement(snapshot)}
                          onMouseLeave={() => setCanvasHoverElement(null)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setCanvasMenu({ element: snapshot, x: event.clientX, y: event.clientY });
                          }}
                          onDoubleClick={() => {
                            if (ambiguous) openCanvasExploreMode(snapshot);
                          }}
                          className={`absolute rounded-sm border-2 text-left outline-none transition ${
                            ambiguous
                              ? "border-orange-400 bg-orange-300/20"
                              : saved
                                ? "border-emerald-500 bg-emerald-300/15"
                                : "border-sky-500 bg-sky-300/15"
                          } ${tableCell ? "border-dotted" : ""}`}
                          style={canvasBoxStyle(bounds, canvasView?.viewport ?? {})}
                          title={String(snapshot.label ?? snapshot.text ?? "Canvas element")}
                        >
                          <span className="absolute -top-5 left-0 max-w-40 truncate rounded bg-zinc-950 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {String(snapshot.label ?? snapshot.elementKind ?? "Element")}
                          </span>
                          {tableCell ? (
                            <span className="absolute bottom-0 right-0 rounded-tl bg-zinc-950 px-1 text-[9px] font-semibold text-white">
                              r{String(snapshot.row ?? 1)} c{String(snapshot.column ?? 1)}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    {!canvasView ? (
                      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                        <div>
                          <p className="text-xs font-semibold uppercase text-sky-700">View Canvas</p>
                          <p className="mt-2 text-sm text-zinc-600">
                            Capture a Canvas from recorded commands, then right-click elements to save,
                            re-map, or insert commands.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {currentCanvasExploreCandidate ? (
                    <div className="absolute bottom-4 left-4 z-30 w-[min(420px,calc(100%-32px))] rounded-xl border border-orange-300 bg-white p-3 text-xs shadow-2xl dark:border-orange-500/40 dark:bg-zinc-950">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-200">
                            Canvas Explore Mode
                          </p>
                          <p className="mt-1 truncate font-semibold text-zinc-950 dark:text-zinc-50">
                            {String(currentCanvasExploreCandidate.label ?? currentCanvasExploreCandidate.text ?? "Candidate")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCanvasExploreElement(null)}
                          className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        >
                          Esc
                        </button>
                      </div>
                      <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                        Candidate hierarchy: parent / current / child / sibling. Double-click ambiguous regions to move deeper.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canvasCandidateStack(canvasExploreElement ?? {}).map((candidate, index) => (
                          <button
                            key={`${String(candidate.label ?? candidate.text ?? "candidate")}-${index}`}
                            type="button"
                            onClick={() => setCanvasExploreIndex(index)}
                            className={`rounded-lg border px-2 py-1 font-semibold ${
                              index === canvasExploreIndex
                                ? "border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-100"
                                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            }`}
                          >
                            {String(candidate.candidateRole ?? (index === 0 ? "current" : `candidate ${index + 1}`))}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const stack = canvasCandidateStack(canvasExploreElement ?? {});
                            setCanvasExploreIndex((current) => (current + stack.length - 1) % Math.max(stack.length, 1));
                          }}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const stack = canvasCandidateStack(canvasExploreElement ?? {});
                            setCanvasExploreIndex((current) => (current + 1) % Math.max(stack.length, 1));
                          }}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          Next
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCanvasHoverElement(currentCanvasExploreCandidate);
                            setCanvasMessage("Explore candidate selected.");
                          }}
                          className="rounded-lg bg-orange-600 px-3 py-1.5 font-semibold text-white hover:bg-orange-700"
                        >
                          Select Candidate
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {canvasHoverElement ? (
                    <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-200">
                      <span className="font-semibold">{String(canvasHoverElement.label ?? "Element")}</span>
                      <span className="ml-2 text-zinc-400">
                        {String(canvasHoverElement.elementKind ?? canvasHoverElement.type ?? "element")}
                      </span>
                      <span className="ml-2 text-zinc-400">
                        {String(canvasHoverElement.text ?? "")}
                      </span>
                    </div>
                  ) : canvasMessage ? (
                    <div className="mt-3 rounded-xl border border-sky-700 bg-sky-950/60 p-3 text-xs text-sky-100">
                      {canvasMessage}
                    </div>
                  ) : null}
                  {canvasMenu ? (
                    <div
                      className="fixed z-50 w-64 rounded-xl border border-zinc-200 bg-white p-2 text-sm shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
                      style={{ left: canvasMenu.x, top: canvasMenu.y }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <p className="truncate px-2 py-1 text-xs font-semibold text-zinc-500">
                        {String(canvasMenu.element.label ?? "Canvas Element")}
                      </p>
                      <button
                        type="button"
                        onClick={() => void saveCanvasElement(canvasMenu.element)}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Save Element
                      </button>
                      <button
                        type="button"
                        onClick={() => void remapCanvasElement(canvasMenu.element)}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Re-map Saved Element
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCanvasMessage("Locator test uses the command drawer Test Locator action.");
                          setCanvasMenu(null);
                        }}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Test Locator
                      </button>
                      <button
                        type="button"
                        onClick={() => void showCanvasElementUsage(canvasMenu.element).finally(() => setCanvasMenu(null))}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Show Usage
                      </button>
                      <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                      <button
                        type="button"
                        onClick={() => openCanvasExploreMode(canvasMenu.element)}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Explore Mode
                      </button>
                      <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Insert Command
                      </p>
                      {["click", "doubleClick", "rightClick", "fill", "select", "check", "uncheck", "assert"].map((action) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => previewCanvasCommandInsert(canvasMenu.element, action)}
                          className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          Insert {commandDefinitionForAction(action)?.label || action}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : session?.liveViewUrl && session.sessionId ? (
                <div
                  ref={livePreviewContainerRef}
                  className={`relative h-full overflow-auto bg-zinc-100 p-2 dark:bg-zinc-950 ${
                    liveInspectorEnabled ? "cursor-crosshair" : ""
                  }`}
                  style={{ minHeight: `${activeLivePreviewSize.panelMinHeight}px` }}
                  onClick={handleLiveInspectorClick}
                  onContextMenu={openLiveCommandMenu}
                  onDoubleClick={handleLivePreviewDoubleClick}
                  onKeyDown={handleLivePreviewKeyDown}
                  onMouseLeave={() => {
                    if (!liveInspectorSelected) setLiveInspectorResult(null);
                  }}
                  onMouseMove={handleLiveInspectorMove}
                  onWheel={handleLivePreviewWheel}
                  tabIndex={0}
                >
                  <img
                    ref={livePreviewImageRef}
                    src={livePreviewStreamFrameSrc || liveFrameSrcForSession(session, livePreviewTick)}
                    alt="Live browser preview"
                    className="mx-auto block h-auto w-full bg-white object-contain"
                    style={{ maxWidth: `${activeLivePreviewSize.viewport.width}px` }}
                    draggable={false}
                    onError={() => setLivePreviewFailed(true)}
                    onLoad={() => {
                      setLivePreviewFailed(false);
                      if (!livePreviewScroll.maxY) requestLivePreviewScroll(0, 0);
                    }}
                  />
                  <div className="absolute left-3 top-3 rounded-full border border-zinc-700 bg-zinc-950/86 px-3 py-1 text-xs font-semibold text-zinc-100 shadow-lg backdrop-blur">
                    {livePreviewFailed
                      ? "Reconnecting preview"
                      : livePreviewStreamConnected
                        ? `Live preview | streaming`
                        : `Live preview | ${session.status || "active"}`}
                  </div>
                  {renderLiveInspectorOverlay()}
                  {renderLivePreviewScrollControls()}
                  {livePreviewFailed ? (
                    <div className="absolute inset-x-6 bottom-6 rounded-2xl border border-amber-300/30 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-lg dark:bg-amber-500/15 dark:text-amber-100">
                      Waiting for the browser preview to update.
                    </div>
                  ) : null}
                </div>
              ) : session?.liveViewUrl ? (
                <div className="flex h-full min-h-[560px] items-center justify-center px-6 text-center">
                  <div className="max-w-md">
                    <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">
                      Browser Preview
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                      Session id is not available yet.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      Start or refresh the automation session to connect the live preview.
                    </p>
                  </div>
                </div>
              ) : authoringPreviewUrl || authoringPreviewError ? (
                <div className="flex h-full min-h-[560px] flex-col overflow-hidden bg-zinc-950">
                  <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                      Authoring preview
                    </span>
                    <span className="min-w-0 flex-1 truncate rounded-lg bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-200">
                      {authoringPreviewUrl || targetUrl}
                    </span>
                  </div>
                  {authoringPreviewError ? (
                    <div className="flex flex-1 items-center justify-center px-6 text-center">
                      <div className="max-w-lg rounded-2xl border border-amber-300/30 bg-amber-50 px-5 py-4 text-amber-950 shadow-lg dark:bg-amber-500/15 dark:text-amber-100">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                          GlowCart preview unavailable
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">
                          CaseForge Companion could not start the local demo.
                        </h3>
                        <p className="mt-3 text-sm leading-6">
                          {authoringPreviewError}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      key={authoringPreviewUrl}
                      src={authoringPreviewUrl}
                      title="GlowCart authoring preview"
                      className="h-full min-h-[520px] w-full flex-1 border-0 bg-white"
                    />
                  )}
                </div>
              ) : (
                <div className="flex h-full min-h-[560px] items-center justify-center px-6 text-center">
                  <div className="max-w-md">
                    <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                      Browser
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                      Start recording or run this scenario.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      Choose the URL, device, browser mode, and auth details when you start.
                    </p>
                  </div>
                </div>
              )}
            </div>
            {advancedRecordingUiEnabled && (recordingActive || verifyPicking) ? (
              <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-200 bg-white/95 px-2 py-1.5 text-xs font-semibold shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
                <button
                  type="button"
                  onClick={() => void stopRecording()}
                  className="rounded-full bg-rose-600 px-3 py-1.5 text-white hover:bg-rose-700"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => void toggleRecordingPause()}
                  disabled={!recordingActive}
                  className="rounded-full px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {recordingPaused ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  onClick={() => void (verifyPicking ? exitVerifyMode() : enterVerifyMode())}
                  className="rounded-full px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {verifyPicking ? "Cancel Verify" : "Add Verify"}
                </button>
                <button
                  type="button"
                  onClick={() => insertWaitAfter(selectedStepId ?? undefined)}
                  className="rounded-full px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Add Wait
                </button>
                <button
                  type="button"
                  onClick={openCreateActionModal}
                  disabled={!selectedSteps.length}
                  className="rounded-full px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Create Action
                </button>
                <button
                  type="button"
                  onClick={() => appendLog("Screenshot capture is reserved for run evidence.")}
                  className="rounded-full px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Screenshot
                </button>
                <button
                  type="button"
                  onClick={() => appendLog(`Recorder is using ${browserMode} browser mode.`)}
                  className="rounded-full px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Settings
                </button>
              </div>
            ) : null}
          </section>

          <section className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[14px] border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="min-w-0 flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {runStatus === "failed" && failedStepResult?.errorMessage
                ? failedStepResult.errorMessage
                : logs.at(-1)}
            </div>
            <div
              className="flex shrink-0 items-center gap-1"
            >
              <button
                type="button"
                onClick={saveLiveCommands}
                disabled={!liveSteps.length && !visibleSteps.length}
                className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => void undoLastTimelineChange()}
                disabled={busy || recordingActive || verifyPicking || !undoStack.length}
                className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-900"
                title="Undo last timeline change"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={addStep}
                className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                New
              </button>
              <button
                type="button"
                onClick={openTestData}
                className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                  Test Cases
                  {enabledTestCases.length ? ` (${enabledTestCases.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => void resumeRecordingFromSavedState()}
                disabled={busy || verifyPicking || !visibleSteps.length}
                className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Resume
              </button>
              {session?.sessionId ? (
                <button
                  type="button"
                  onClick={() => void closeSession("Session ended. Browser closed.")}
                  disabled={busy || recordingActive || verifyPicking}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:text-rose-200 dark:hover:bg-rose-500/10"
                >
                  End
                </button>
              ) : null}
            </div>
          </section>

          {playbackConsoleOpen ? (
            <section className="min-w-0 rounded-[14px] border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">Command Console</p>
                  <p className="mt-0.5 truncate text-zinc-500 dark:text-zinc-400">
                    Latest command activity, outputs, URL changes, and errors.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLogs(["Console cleared"])}
                    className="rounded-md px-2 py-1 font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaybackConsoleOpen(false)}
                    className="rounded-md px-2 py-1 font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Hide
                  </button>
                </div>
              </div>
              <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                {logs.slice(-18).map((log, index) => {
                  const expandable = consoleLogNeedsExpand(log);
                  return (
                    <div
                      key={`${index}-${log}`}
                      className="group flex min-w-0 items-start gap-2 rounded-md px-1.5 py-0.5 hover:bg-white dark:hover:bg-zinc-950"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        {expandable ? consoleLogPreview(log) : log}
                      </span>
                      {expandable ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedConsoleLog({
                              body: log,
                              title: `Command Console Output ${logs.length - logs.slice(-18).length + index + 1}`,
                            })
                          }
                          className="shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-sans font-semibold text-zinc-600 opacity-100 hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
                        >
                          Expand
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {!logs.length ? (
                  <div className="rounded-md px-1.5 py-0.5 text-zinc-500 dark:text-zinc-400">
                    No command activity yet.
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setPlaybackConsoleOpen(true)}
              className="justify-self-start rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
            >
              Show Command Console
            </button>
          )}

          {expandedConsoleLog ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="console-output-title"
              onClick={() => setExpandedConsoleLog(null)}
            >
              <section
                className="grid max-h-[86vh] w-full max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <div className="min-w-0">
                    <h3 id="console-output-title" className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {expandedConsoleLog.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Full command console entry
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedConsoleLog(null)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Close
                  </button>
                </div>
                <pre className="min-h-0 overflow-auto whitespace-pre-wrap break-words bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100">
                  {expandedConsoleLog.body}
                </pre>
              </section>
            </div>
          ) : null}

          {runStatus === "failed" && failedStepResult ? (
            <section className="min-w-0 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-normal text-rose-700 dark:text-rose-200">
                    Step failed
                  </p>
                  <p className="mt-1 break-words font-semibold">
                    {failedStepResult.errorMessage || "The command could not complete."}
                  </p>
                  {failedStepResult.suggestion ? (
                    <p className="mt-1 break-words text-xs leading-5 text-rose-800 dark:text-rose-100">
                      {failedStepResult.suggestion}
                    </p>
                  ) : null}
                  {failedStepResult.screenshotPath ? (
                    <p className="mt-1 truncate text-[11px] text-rose-700 dark:text-rose-200">
                      Screenshot: {failedStepResult.screenshotPath}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void retryFailedStep()}
                    disabled={busy || !failedStepResult.stepId}
                    className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-40"
                  >
                    Retry Step
                  </button>
                  <button
                    type="button"
                    onClick={() => void resumeFromPreviousFailedStep()}
                    disabled={busy || !failedStepResult.stepId}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100"
                  >
                    Resume from Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => void closeSession("Failed run stopped. Browser closed.")}
                    disabled={busy || !session?.sessionId}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40 dark:text-rose-100 dark:hover:bg-rose-500/10"
                  >
                    Stop Run
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </main>

        <aside
          className={`grid min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden ${
            livePreviewSize === "full" ? "min-h-[420px]" : "min-h-[660px]"
          }`}
        >
          <section className="min-w-0 overflow-hidden rounded-[16px] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  Command Timeline
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {verifyPicking ? "Pick an element to verify" : recordingActive ? "Recording live" : "Ready"}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900">
                <input
                  type="checkbox"
                  checked={allTimelineStepsSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = someTimelineStepsSelected && !allTimelineStepsSelected;
                  }}
                  onChange={(event) => setAllTimelineStepsSelected(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600"
                  aria-label="Select all commands"
                />
                Select all
              </label>
            </div>
            <div className="h-full min-h-[560px] overflow-y-auto p-2">
              <details className="mb-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-700 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
                  Command Library
                </summary>
                <div className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
                  {Object.entries(commandCatalogByDomain).map(([domain, commands]) => (
                    <div key={domain}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        {domain}
                      </p>
                      <div className="grid gap-1">
                        {commands.slice(0, 8).map((command) => (
                          <button
                            key={command.action}
                            type="button"
                            onClick={() => {
                              if (!command.executable || command.domain !== "web") {
                                appendLog(
                                  `${command.label} is a first-class CaseForge authoring command, but this phase only executes implemented web commands through CaseForge Companion. Its execution adapter is pending.`,
                                );
                                return;
                              }
                              const step = makeManualStep(visibleSteps.length + 1);
                              const nextStep = {
                                ...step,
                                action: command.normalizedAction,
                                commandText: command.label,
                                description: command.label,
                              };
                              void persistSteps([...finalizedSteps, nextStep]);
                              setSelectedStepId(nextStep.id);
                              setSelectedStepIds(new Set([nextStep.id]));
                              setDrawerOpen(true);
                            }}
                            className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-[11px] font-semibold text-zinc-700 hover:bg-white dark:text-zinc-200 dark:hover:bg-zinc-950"
                          >
                            <span className="truncate">{command.label}</span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${
                                command.executable && command.domain === "web"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                              }`}
                            >
                                  {commandExecutionBadgeLabel(command)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
              {visibleSteps.length ? (
                <div className="space-y-2" role="listbox" aria-label="Command timeline" aria-multiselectable="true">
                  {visibleSteps.map((step, index) => {
                    const selected = selectedStepIds.has(step.id);
                    const active = step.id === selectedStepId;
                    const actionExpanded = expandedActionStepIds.has(step.id);
                    const actionLoading = loadingActionStepIds.has(step.id);
                    const nestedCommands = actionStepCommands[step.id] ?? [];
                    const stepHealing =
                      healingEventsByStepId.get(step.id)?.[0] ??
                      nestedCommands.flatMap((command) => healingEventsByStepId.get(command.id || "") ?? [])[0];
                    const badges = step.action === "action" ? [] : timelineBadges(step, Boolean(stepHealing));
                    const stepValue = visibleStepInputValue(step);
                    const stepRunState = commandRunStates[step.id];
                    const stepFailed =
                      stepRunState?.status === "failed" ||
                      (failedStepResult?.stepId === step.id && failedStepResult.status === "failed");
                    return (
                      <div
                        key={step.id}
                        ref={(node) => {
                          timelineStepRefs.current[step.id] = node;
                        }}
                        tabIndex={0}
                        role="option"
                        aria-label={`Command ${index + 1}: ${step.commandText || readableStepLabel(step)}`}
                        aria-selected={selected}
                        draggable={!recordingActive}
                        onFocus={() => {
                          setSelectedStepId(step.id);
                          setTimelineSelectionAnchorId((current) => current ?? step.id);
                        }}
                        onDragStart={(event) => {
                          if (recordingActive) return;
                          setDraggedStepId(step.id);
                          setDraggedActionCommand(null);
                          setActionDropTarget(null);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", step.id);
                        }}
                        onDragOver={(event) => {
                          if (draggedActionCommand) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setActionDropTarget(null);
                            return;
                          }
                          if (
                            step.action === "action" &&
                            draggedStepId &&
                            canMoveTimelineStepIntoAction(step, draggedStepId)
                          ) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setActionDropTarget({
                              actionStepId: step.id,
                              position: "inside",
                            });
                            return;
                          }
                          if (!draggedStepId || draggedStepId === step.id) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setActionDropTarget(null);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggedActionCommand) {
                            const dragCommandId =
                              event.dataTransfer.getData("text/plain") || draggedActionCommand.commandId;
                            void moveActionCommandToTimeline(
                              draggedActionCommand.actionStepId,
                              dragCommandId,
                              step.id,
                            );
                            return;
                          }
                          const dragStepId = event.dataTransfer.getData("text/plain") || draggedStepId;
                          if (
                            step.action === "action" &&
                            dragStepId &&
                            canMoveTimelineStepIntoAction(step, dragStepId)
                          ) {
                            void moveTimelineStepIntoAction(step, dragStepId);
                            return;
                          }
                          setDraggedStepId(null);
                          setActionDropTarget(null);
                          if (dragStepId) reorderTimelineStep(dragStepId, step.id);
                        }}
                        onDragEnd={() => {
                          setDraggedStepId(null);
                          setActionDropTarget(null);
                        }}
                        onKeyDown={(event) => handleTimelineStepKeyDown(event, step, index)}
                        onContextMenu={(event) => openTimelineContextMenu(event, step)}
                        className={`rounded-lg border px-2.5 py-1.5 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                          draggedStepId === step.id
                            ? "border-emerald-300 bg-emerald-50 opacity-60 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                            : actionDropTarget?.actionStepId === step.id &&
                                actionDropTarget.position === "inside"
                              ? "border-emerald-400 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/20 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                            : stepFailed
                              ? "border-rose-300 bg-rose-50 shadow-sm dark:border-rose-500/50 dark:bg-rose-500/10"
                            : active
                            ? "border-emerald-400 bg-emerald-50 shadow-sm dark:border-emerald-500/50 dark:bg-emerald-500/10"
                            : selected
                              ? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                              : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            title="Drag to reorder"
                            className="shrink-0 cursor-grab select-none text-sm font-semibold leading-none text-zinc-300 active:cursor-grabbing dark:text-zinc-600"
                          >
                            ::
                          </span>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) => toggleStepSelection(step.id, event.target.checked)}
                            className="h-4 w-4 shrink-0 rounded border border-zinc-400 accent-emerald-600"
                            aria-label={`Select command ${index + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              openTimelineStep(step);
                            }}
                            aria-expanded={step.action === "action" ? actionExpanded : undefined}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                {index + 1}
                              </span>
                              <span className="truncate text-[13px] font-semibold leading-5 text-zinc-950 dark:text-zinc-50">
                                {step.commandText || readableStepLabel(step)}
                              </span>
                              {step.action === "action" ? (
                                <span className="ml-auto shrink-0 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                  {actionExpanded ? "Collapse" : "Expand"}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold dark:bg-zinc-800">
                                {displayAction(step.action)}
                              </span>
                              {step.action === "action" ? (
                                <span className="truncate">
                                  {Number(step.options?.stepCount ?? nestedCommands.length) || nestedCommands.length || 0} commands
                                </span>
                              ) : null}
                              {stepValue ? (
                                <span className="max-w-full truncate rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                                  value: {stepValue}
                                </span>
                              ) : null}
                            </div>
                          </button>
                          {badges.length ? (
                            <div className="flex shrink-0 items-center gap-1">
                              {badges.map((badge) =>
                                badge.label === "Self-healed" && stepHealing ? (
                                  <button
                                    key={badge.label}
                                    type="button"
                                    title={badge.title}
                                    onClick={() => setSelectedHealingEvent(stepHealing)}
                                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${badgeClass(badge.tone)}`}
                                  >
                                    {badge.label}
                                  </button>
                                ) : (
                                  <button
                                    key={badge.label}
                                    type="button"
                                    title={badge.title}
                                    onClick={(event) => openLocatorFlyout(event, step)}
                                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${badgeClass(badge.tone)}`}
                                  >
                                    {badge.label}
                                  </button>
                                ),
                              )}
                            </div>
                          ) : null}
                          {stepRunState ? (
                            <span
                              title={
                                stepRunState.message || stepRunState.suggestion
                                  ? [stepRunState.message, stepRunState.suggestion].filter(Boolean).join(" ")
                                  : commandRunStatusLabel(stepRunState)
                              }
                              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badgeClass(commandRunStatusTone(stepRunState))}`}
                            >
                              {commandRunStatusLabel(stepRunState)}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            title={step.action === "action" ? "Run action" : "Run this command"}
                            onClick={(event) => {
                              event.stopPropagation();
                              void runSingleCommand(step);
                            }}
                            disabled={busy || recordingActive}
                            className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            Run
                          </button>
                        </div>
                        {step.action === "action" && actionExpanded ? (
                          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                            {actionLoading ? (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Opening action commands...
                              </p>
                            ) : nestedCommands.length ? (
                              <div className="space-y-2">
                                <label className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                                  <input
                                    type="checkbox"
                                    checked={nestedCommands.every(
                                      (command) =>
                                        command.id &&
                                        selectedActionCommandKeys.has(actionCommandSelectionKey(step.id, command.id)),
                                    )}
                                    ref={(node) => {
                                      if (!node) return;
                                      const selectedCount = nestedCommands.filter(
                                        (command) =>
                                          command.id &&
                                          selectedActionCommandKeys.has(actionCommandSelectionKey(step.id, command.id)),
                                      ).length;
                                      node.indeterminate = selectedCount > 0 && selectedCount < nestedCommands.length;
                                    }}
                                    onChange={(event) => setAllActionCommandsSelected(step, event.target.checked)}
                                    className="h-3.5 w-3.5 shrink-0 rounded border border-zinc-400 accent-emerald-600"
                                    aria-label={`Select all commands in ${step.commandText || readableStepLabel(step)}`}
                                  />
                                  Select commands
                                </label>
                                <div
                                  className={`space-y-2 rounded-lg transition ${
                                    actionDropTarget?.actionStepId === step.id &&
                                    actionDropTarget.position === "inside"
                                      ? "bg-emerald-50/60 ring-2 ring-emerald-500/20 dark:bg-emerald-500/10"
                                      : ""
                                  }`}
                                  role="listbox"
                                  aria-label={`${step.commandText || readableStepLabel(step)} commands`}
                                  aria-multiselectable="true"
                                  onDragOver={(event) => {
                                    if (!draggedStepId || !canMoveTimelineStepIntoAction(step, draggedStepId)) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.dataTransfer.dropEffect = "move";
                                    setActionDropTarget({
                                      actionStepId: step.id,
                                      position: "inside",
                                    });
                                  }}
                                  onDrop={(event) => {
                                    const dragStepId = event.dataTransfer.getData("text/plain") || draggedStepId;
                                    if (!dragStepId || !canMoveTimelineStepIntoAction(step, dragStepId)) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void moveTimelineStepIntoAction(step, dragStepId);
                                  }}
                                >
                                {nestedCommands.map((command, commandIndex) => (
                                  (() => {
                                    const commandHealing = healingEventsByStepId.get(command.id || "")?.[0];
                                    const commandBadges = timelineBadges(command, Boolean(commandHealing));
                                    const commandValue = visibleStepInputValue(command);
                                    const commandRunState = command.id ? commandRunStates[command.id] : undefined;
                                    const commandSelectionKey = command.id ? actionCommandSelectionKey(step.id, command.id) : "";
                                    const commandSelected = Boolean(commandSelectionKey && selectedActionCommandKeys.has(commandSelectionKey));
                                    return (
                                  <div
                                    key={`${step.id}-${command.id || commandIndex}`}
                                    ref={(node) => {
                                      if (commandSelectionKey) actionCommandRefs.current[commandSelectionKey] = node;
                                    }}
                                    tabIndex={0}
                                    role="option"
                                    aria-selected={commandSelected}
                                    aria-label={`Action command ${commandIndex + 1}: ${command.commandText || readableStepLabel(command)}`}
                                    onContextMenu={(event) => openActionCommandContextMenu(event, step, command)}
                                    draggable={!recordingActive && Boolean(command.id)}
                                    onFocus={() => {
                                      if (!command.id) return;
                                      setSelectedStepId(command.id);
                                      setActionCommandSelectionAnchorKey((current) => current ?? commandSelectionKey);
                                    }}
                                    onKeyDown={(event) => handleActionCommandKeyDown(event, step, command, commandIndex)}
                                    onDragStart={(event) => {
                                      if (recordingActive || !command.id) return;
                                      event.stopPropagation();
                                      setDraggedStepId(null);
                                      setActionDropTarget(null);
                                      setDraggedActionCommand({
                                        actionStepId: step.id,
                                        commandId: command.id,
                                      });
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", command.id);
                                    }}
                                    onDragOver={(event) => {
                                      if (
                                        draggedStepId &&
                                        canMoveTimelineStepIntoAction(step, draggedStepId)
                                      ) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        event.dataTransfer.dropEffect = "move";
                                        setActionDropTarget({
                                          actionStepId: step.id,
                                          commandId: command.id,
                                          position: "before",
                                        });
                                        return;
                                      }
                                      if (
                                        !draggedActionCommand ||
                                        draggedActionCommand.actionStepId !== step.id ||
                                        draggedActionCommand.commandId === command.id
                                      ) {
                                        return;
                                      }
                                      event.preventDefault();
                                      event.stopPropagation();
                                      event.dataTransfer.dropEffect = "move";
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (
                                        draggedStepId &&
                                        canMoveTimelineStepIntoAction(step, draggedStepId)
                                      ) {
                                        void moveTimelineStepIntoAction(step, draggedStepId, commandIndex);
                                        return;
                                      }
                                      const dragCommandId =
                                        event.dataTransfer.getData("text/plain") ||
                                        draggedActionCommand?.commandId;
                                      setDraggedActionCommand(null);
                                      setActionDropTarget(null);
                                      if (dragCommandId && command.id) {
                                        reorderActionCommand(step, dragCommandId, command.id);
                                      }
                                    }}
                                    onDragEnd={(event) => {
                                      event.stopPropagation();
                                      setDraggedActionCommand(null);
                                      setActionDropTarget(null);
                                    }}
                                    className={`flex gap-2 rounded-lg px-2.5 py-1.5 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                                      actionDropTarget?.actionStepId === step.id &&
                                      actionDropTarget.commandId === command.id &&
                                      actionDropTarget.position === "before"
                                        ? "border-t-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                                        : draggedActionCommand?.actionStepId === step.id &&
                                            draggedActionCommand.commandId === command.id
                                        ? "bg-emerald-50 opacity-60 dark:bg-emerald-500/10"
                                        : commandRunState?.status === "failed"
                                          ? "border border-rose-200 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10"
                                        : commandRunState?.status === "passed"
                                          ? "border border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                                        : commandRunState?.status === "running"
                                          ? "border border-sky-200 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10"
                                        : commandSelected
                                          ? "border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
                                        : "bg-zinc-50 dark:bg-zinc-900"
                                    }`}
                                  >
                                    <span
                                      title="Drag to reorder"
                                      className="shrink-0 cursor-grab select-none text-sm font-semibold leading-5 text-zinc-300 active:cursor-grabbing dark:text-zinc-600"
                                    >
                                      ::
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={commandSelected}
                                      onChange={(event) => toggleActionCommandSelection(step, command, event.target.checked)}
                                      onClick={(event) => event.stopPropagation()}
                                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-zinc-400 accent-emerald-600"
                                      aria-label={`Select action command ${commandIndex + 1}`}
                                    />
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                      {commandIndex + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => openActionCommandPrompt(step, command)}
                                          className="min-w-0 truncate text-left font-semibold text-zinc-900 hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-300"
                                        >
                                          {command.commandText || readableStepLabel(command)}
                                        </button>
                                        {commandBadges.map((badge) =>
                                          badge.label === "Self-healed" && commandHealing ? (
                                            <button
                                              key={badge.label}
                                              type="button"
                                              title={badge.title}
                                              onClick={() => setSelectedHealingEvent(commandHealing)}
                                              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badgeClass(badge.tone)}`}
                                            >
                                              {badge.label}
                                            </button>
                                          ) : (
                                            <button
                                              key={badge.label}
                                              type="button"
                                              title={badge.title}
                                              onClick={(event) => openLocatorFlyout(event, command, step)}
                                              className={`shrink-0 cursor-pointer rounded-full border px-1.5 py-0.5 text-[9px] font-semibold outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${badgeClass(badge.tone)}`}
                                            >
                                              {badge.label}
                                            </button>
                                          ),
                                        )}
                                        {commandRunState ? (
                                          <span
                                            title={
                                              commandRunState.message || commandRunState.suggestion
                                                ? [commandRunState.message, commandRunState.suggestion].filter(Boolean).join(" ")
                                                : commandRunStatusLabel(commandRunState)
                                            }
                                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badgeClass(commandRunStatusTone(commandRunState))}`}
                                          >
                                            {commandRunStatusLabel(commandRunState)}
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-normal text-zinc-400 dark:text-zinc-500">
                                        {displayAction(command.action)}
                                        {commandValue ? ` | value: ${commandValue}` : ""}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      title="Run this command"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void runActionCommand(step, command);
                                      }}
                                      disabled={busy || recordingActive}
                                      className="shrink-0 self-start rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    >
                                      Run
                                    </button>
                                  </div>
                                    );
                                  })()
                                ))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  No commands saved in this action.
                                </p>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full min-h-[520px] items-center justify-center rounded-xl border border-dashed border-zinc-200 px-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Open the browser and record actions to build the timeline.
                </div>
              )}
            </div>
          </section>

          {drawerOpen && selectedStep ? (
            <div
              className="fixed inset-0 z-40 flex justify-end bg-black/20"
              onClick={closeCommandPrompt}
            >
            <section
              className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Command Details
                  </h3>
                  <p className="mt-0.5 truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {displayAction(selectedStep.action)}
                  </p>
                </div>
              </div>
              <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-4">
                {commandPromptError ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    {commandPromptError}
                  </div>
                ) : null}
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Command phrase
                  <textarea
                    value={selectedStep.commandText || readableStepLabel(selectedStep)}
                    onChange={(event) =>
                      updateStep(selectedStep.id, (step) => ({
                        ...step,
                        commandText: event.target.value,
                        description: event.target.value,
                      }))
                    }
                    className="mt-1 min-h-24 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium leading-6 text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <span className="mt-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Human-readable step name. Put typed text, selected options, and dynamic data in the fields below.
                  </span>
                </label>
                <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-3">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Action
                  <select
                    value={displayAction(selectedStep.action)}
                    onChange={(event) =>
                      updateStep(selectedStep.id, (step) => {
                        const action = event.target.value;
                        const definition =
                          action === "action" ? actionCommandDefinition : commandDefinitionForAction(action);
                        if (action === "wait") {
                          const nextStep = {
                            ...step,
                            action,
                            inputValue: step.inputValue || "1000",
                            options: {
                              ...step.options,
                              duration: Number(step.inputValue || step.options?.duration || 1000),
                              waitCondition: step.options?.waitCondition || "visible",
                              waitType: step.options?.waitType || "hard",
                            },
                            target: {
                              ...step.target,
                              displayName: step.target.displayName || "Timer",
                              elementKind: step.target.elementKind || "timer",
                              locatorType: step.target.locatorType || "css",
                            },
                          };
                          const commandPhrase = commandPhraseForStep(nextStep, definition);
                          return {
                            ...nextStep,
                            commandText: commandPhrase,
                            description: commandPhrase,
                          };
                        }
                        const nextStep = {
                          ...step,
                          action,
                          options: {
                            ...step.options,
                            dsl: isLogicIdeCommand(action)
                              ? textValue(step.options?.dsl) || defaultLogicDsl(action)
                              : undefined,
                            outputVariableName:
                              commandShowsOutputCapture(definition) && !phaseOutputVariable(step)
                                ? commandOutputDefaultName(definition)
                                : step.options?.outputVariableName,
                          },
                        };
                        const commandPhrase = commandPhraseForStep(nextStep, definition);
                        return {
                          ...nextStep,
                          commandText: commandPhrase,
                          description: commandPhrase,
                        };
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {commandActionOptions.map((option) => {
                      const implemented = option.action === "action" || (option.executable && option.domain === "web");
                      return (
                      <option key={option.action} value={option.action} disabled={!implemented}>
                        {option.label}{implemented ? "" : " (Coming soon)"}
                      </option>
                    )})}
                  </select>
                </label>
                {commandShowsInputValue(selectedStepAction) ? (
                  <div className="min-w-0 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    <label>
                      {commandInputLabel(selectedStepAction)}
                      <input
                        value={selectedStep.inputValue || ""}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const nextValue = event.target.value;
                            const nextParameterName = exactParameterNameFromText(nextValue);
                            return {
                              ...step,
                              inputValue: nextValue,
                              options: {
                                ...step.options,
                                actual: isCompareCommandAction(selectedStepAction) ? nextValue : step.options?.actual,
                                parameterName: nextParameterName || undefined,
                              },
                            };
                          })
                        }
                        className="mt-1 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                    {commandSupportsTestData(selectedStepAction) && selectedStep.inputValue ? (
                      <button
                        type="button"
                        onClick={() => void convertStepValueToParameter(selectedStep)}
                        className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
                      >
                        Convert typed value to scenario parameter
                      </button>
                    ) : null}
                    {commandSupportsTestData(selectedStepAction) ? (
                      <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                          {isCompareCommandAction(selectedStepAction) ? "Actual variable" : "Data-driven value"}
                          <select
                            value={selectedStepParameterName}
                            onChange={(event) => {
                              const parameterName = event.target.value;
                              updateStep(selectedStep.id, (step) => ({
                                ...step,
                                inputValue: parameterName ? parameterToken(parameterName) : "",
                                options: {
                                  ...step.options,
                                  actual: isCompareCommandAction(selectedStepAction)
                                    ? parameterName
                                      ? parameterToken(parameterName)
                                      : ""
                                    : step.options?.actual,
                                  parameterName: parameterName || undefined,
                                },
                              }));
                            }}
                            className="mt-1 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                          >
                            <option value="">
                              {isCompareCommandAction(selectedStepAction) ? "Use typed actual value" : "Use typed value"}
                            </option>
                            {selectedStepDataValueItems.map((item) => (
                              <option key={`${item.source}-${item.name}`} value={item.name}>
                                {item.name} - {item.detail}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedStepParameterName ? (
                          <p className="mt-1 min-w-0 break-words text-[11px] font-medium text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400">
                            Uses {parameterToken(selectedStepParameterName)}
                            {selectedStepVariableItem && selectedStepVariableItem.source !== "scenarioParameter"
                              ? ` - ${selectedStepVariableItem.detail}`
                              : isCompareCommandAction(selectedStepAction) && selectedStepVariableItem
                              ? ` - ${selectedStepVariableItem.detail}`
                              : selectedStepParameterPreview
                                ? ` -> ${selectedStepParameterPreview}`
                                : ""}
                          </p>
                        ) : selectedStepDataValueItems.length ? (
                          <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            {isCompareCommandAction(selectedStepAction)
                              ? "Choose a previous command output, logic variable, or scenario parameter as the actual value."
                              : "Choose a previous command output, logic variable, or scenario parameter."}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            {isCompareCommandAction(selectedStepAction)
                              ? "Create a command that saves output first, then select that variable here."
                              : "Create a saved output or test data column, then select that variable here."}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedStepAction === "assert" ? (
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    Expected
                    <input
                      value={selectedStep.expectedValue || ""}
                      onChange={(event) =>
                        updateStep(selectedStep.id, (step) => ({
                          ...step,
                          expectedValue: event.target.value,
                        }))
                      }
                      className="mt-1 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                  </label>
                ) : null}
                {selectedStepAction === "wait" ? (
                  <>
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Wait type
                      <select
                        value={textValue(selectedStep.options?.waitType) || (selectedStep.target?.value ? "soft" : "hard")}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const waitType = event.target.value;
                            const nextStep = {
                              ...step,
                              inputValue: waitType === "hard" ? step.inputValue || "1000" : step.inputValue,
                              options: {
                                ...step.options,
                                duration: Number(step.inputValue || step.options?.duration || 1000),
                                waitCondition: step.options?.waitCondition || "visible",
                                waitType,
                              },
                              target: {
                                ...step.target,
                                displayName: waitType === "hard" ? "Timer" : step.target.displayName || "Element",
                                elementKind: waitType === "hard" ? "timer" : "web element",
                              },
                            };
                            return nextStep;
                          })
                        }
                        className="mt-1 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      >
                        <option value="hard">Hard wait</option>
                        <option value="soft">Soft wait</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      {textValue(selectedStep.options?.waitType) === "soft" ? "Timeout (ms)" : "Duration (ms)"}
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={selectedStep.inputValue || String(selectedStep.options?.duration || 1000)}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => ({
                            ...step,
                            inputValue: event.target.value,
                            options: {
                              ...step.options,
                              duration: Number(event.target.value || 0),
                            },
                          }))
                        }
                        className="mt-1 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                  </>
                ) : null}
                </div>
                {selectedCommandUsesLogicIde && selectedStep ? (
                  <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                          Flow Builder
                        </h4>
                        <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Start with a guided flow, then open Advanced Logic IDE only when needed.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                        {["if", "else if", "else", "for", "repeat", "log", "click", "hover", "getText", "getAttribute", "getProperty", "verifyVisible", "wait"].map((token) => (
                          <span
                            key={token}
                            className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
                          >
                            {token}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {logicIdeTemplates(selectedStepAction).map((template) => (
                        <button
                          key={template.label}
                          type="button"
                          onClick={() => updateLogicDsl(selectedStep.id || "", template.value)}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-950"
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                    {selectedStepAction === "loopBlock" ? (
                      <div className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-[0.16em] text-sky-900 dark:text-sky-100">
                              Locator Loop Builder
                            </h5>
                            <p className="mt-1 text-[11px] font-medium text-sky-700 dark:text-sky-200">
                              Build one loop with action-specific locators and collection steps.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateLogicDsl(selectedStep.id || "", locatorLoopPreview)}
                            className="rounded-lg border border-sky-700 bg-sky-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-800"
                          >
                            Build Loop
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="text-xs font-semibold text-sky-900 dark:text-sky-100">
                            Count variable
                            <select
                              value={locatorLoopBuilder.createCountVariable ? "__create__" : locatorLoopBuilder.countVariable}
                              onChange={(event) => {
                                const value = event.target.value;
                                setLocatorLoopBuilder((current) => ({
                                  ...current,
                                  countVariable: value === "__create__" ? current.countVariable || "count" : value,
                                  createCountVariable: value === "__create__",
                                }));
                              }}
                              className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                            >
                              <option value="">Select variable...</option>
                              {locatorLoopBuilder.countVariable && !variablePickerItems.some((item) => item.name === locatorLoopBuilder.countVariable) && !locatorLoopBuilder.createCountVariable ? (
                                <option value={locatorLoopBuilder.countVariable}>{locatorLoopBuilder.countVariable}</option>
                              ) : null}
                              {variablePickerItems.map((item) => (
                                <option key={item.name} value={item.name}>
                                  {item.name} - {item.detail}
                                </option>
                              ))}
                              <option value="__create__">+ Create count variable</option>
                            </select>
                          </label>
                          {locatorLoopBuilder.createCountVariable ? (
                            <>
                              <label className="text-xs font-semibold text-sky-900 dark:text-sky-100">
                                Count variable name
                                <input
                                  value={locatorLoopBuilder.countVariable}
                                  onChange={(event) =>
                                    setLocatorLoopBuilder((current) => ({
                                      ...current,
                                      countVariable: event.target.value,
                                    }))
                                  }
                                  placeholder="count"
                                  className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                                />
                              </label>
                              <label className="text-xs font-semibold text-sky-900 dark:text-sky-100">
                                Count value
                                <input
                                  value={locatorLoopBuilder.countValue}
                                  onChange={(event) =>
                                    setLocatorLoopBuilder((current) => ({
                                      ...current,
                                      countValue: event.target.value,
                                    }))
                                  }
                                  placeholder="5"
                                  className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-zinc-950 outline-none focus:border-sky-500 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                                />
                              </label>
                            </>
                          ) : null}
                        </div>
                        <div className="grid gap-3">
                          {renderLocatorLoopBuilderSection(
                            "before",
                            "Before Loop",
                            "Prepare lists or variables before the iteration starts.",
                            locatorLoopBuilder.beforeActions,
                          )}
                          {renderLocatorLoopBuilderSection(
                            "inside",
                            "Inside Loop",
                            "Actions that run for each matched element or count item.",
                            locatorLoopBuilder.loopActions,
                          )}
                          {renderLocatorLoopBuilderSection(
                            "after",
                            "After Loop",
                            "Print, join, sort, or validate collected results after iteration.",
                            locatorLoopBuilder.afterActions,
                          )}
                          <label className="flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-semibold text-sky-900 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-100">
                            <input
                              type="checkbox"
                              checked={locatorLoopBuilder.logEach}
                              onChange={(event) =>
                                setLocatorLoopBuilder((current) => ({
                                  ...current,
                                  logEach: event.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-sky-300 text-sky-700 focus:ring-sky-500"
                            />
                            Log web getter outputs inside the loop
                          </label>
                          <datalist id="locator-loop-attribute-options">
                            {locatorLoopAttributeSuggestions.map((name) => (
                              <option key={name} value={name} />
                            ))}
                          </datalist>
                          <datalist id="locator-loop-property-options">
                            {locatorLoopPropertySuggestions.map((name) => (
                              <option key={name} value={name} />
                            ))}
                          </datalist>
                        </div>
                        <pre className="max-h-36 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-sky-100">
                          {locatorLoopPreview}
                        </pre>
                      </div>
                    ) : null}
                    <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
                        Advanced Logic IDE
                      </summary>
                      <div className="mt-3 grid gap-3">
                        <div className="relative">
                          <textarea
                            ref={logicEditorTextareaRef}
                            value={logicDslValue(selectedStep)}
                            onBlur={() => window.setTimeout(() => setLogicEditorSuggest(null), 150)}
                            onChange={(event) => {
                              updateLogicDsl(selectedStep.id || "", event.target.value);
                              updateLogicEditorSuggest(event.target.value, event.target.selectionStart);
                            }}
                            onClick={(event) => {
                              const target = event.currentTarget;
                              updateLogicEditorSuggest(target.value, target.selectionStart);
                            }}
                            onKeyUp={(event) => {
                              const target = event.currentTarget;
                              updateLogicEditorSuggest(target.value, target.selectionStart);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                setLogicEditorSuggest(null);
                                return;
                              }
                              if (
                                (event.key === "Enter" || event.key === "Tab") &&
                                logicEditorSuggest &&
                                visibleLogicEditorSuggestions[0]
                              ) {
                                event.preventDefault();
                                insertLogicSuggestion(visibleLogicEditorSuggestions[0]);
                              }
                            }}
                            spellCheck={false}
                            className="min-h-[260px] w-full resize-y rounded-xl border border-zinc-200 bg-zinc-950 px-3 py-3 font-mono text-xs leading-5 text-zinc-50 outline-none focus:border-sky-400 dark:border-zinc-800"
                          />
                          {logicEditorSuggest && visibleLogicEditorSuggestions.length ? (
                            <div className="absolute left-3 top-12 z-20 max-h-64 w-[min(360px,calc(100%-24px))] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
                              {visibleLogicEditorSuggestions.map((suggestion) => (
                                <button
                                  key={`${suggestion.source}-${suggestion.label}-${suggestion.insertText}`}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    insertLogicSuggestion(suggestion);
                                  }}
                                  className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-mono">{suggestion.label}</span>
                                    <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                      {suggestion.detail}
                                    </span>
                                  </span>
                                  <span className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:border-zinc-800">
                                    {logicSuggestionSourceLabel(suggestion.source)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={`rounded-xl border p-3 text-xs font-semibold ${
                            selectedLogicDslValidation.valid
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                              : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100"
                          }`}
                        >
                          <p>
                            {selectedLogicDslValidation.valid ? "Logic looks valid" : "Logic needs attention"}:{" "}
                            {selectedLogicDslValidation.summary}
                          </p>
                          {selectedLogicDslValidation.issues.length ? (
                            <ul className="mt-2 grid gap-1">
                              {selectedLogicDslValidation.issues.slice(0, 5).map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 font-mono text-[11px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                          <p>if {logicVariableToken("env")} == "staging" {"{"} log "staging" {"}"}</p>
                          <p>for item in {logicVariableToken("activeProducts")} {"{"} log item.name {"}"}</p>
                          <p>click css("#submit")</p>
                        </div>
                      </div>
                    </details>
                  </div>
                ) : null}
                {selectedCommandSchemaParameters.length && !selectedCommandUsesLogicIde ? (
                  <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        {commandEditorParameterSectionTitle(selectedCommandEditorUxKind)}
                      </h4>
                      <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {commandEditorParameterSectionHint(selectedCommandEditorUxKind)}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedCommandSchemaParameters.map((parameter) => {
                        const value = commandParameterDisplayValue(selectedStep, parameter);
                        const parameterId = `${selectedStep.id || "step"}-${parameter.name}`;
                        const label = parameter.label || parameterLabel(parameter.name);
                        const sharedClassName =
                          "mt-1 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";
                        if (parameter.type === "boolean") {
                          return (
                            <label
                              key={parameter.name}
                              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                            >
                              <input
                                id={parameterId}
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(event) =>
                                  updateCommandSchemaParameter(selectedStep.id || "", parameter, event.target.checked)
                                }
                                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="min-w-0">{label}</span>
                            </label>
                          );
                        }
                        if (parameter.type === "select" && parameter.options?.length) {
                          return (
                            <label key={parameter.name} className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                              {label}
                              <select
                                id={parameterId}
                                value={String(value)}
                                onChange={(event) =>
                                  updateCommandSchemaParameter(selectedStep.id || "", parameter, event.target.value)
                                }
                                className={sharedClassName}
                              >
                                <option value="">Select...</option>
                                {parameter.options.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        }
                        if (parameter.type === "json" || parameter.type === "query" || parameter.type === "expression") {
                          const showVariablePicker =
                            selectedStepAction === "runJavaScriptSnippet" &&
                            parameter.name === "script" &&
                            variablePickerItems.length > 0;
                          return (
                            <div
                              key={parameter.name}
                              className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 sm:col-span-2"
                            >
                              <label htmlFor={parameterId}>{label}</label>
                              <textarea
                                id={parameterId}
                                ref={(node) => {
                                  commandParameterTextareaRefs.current[parameterId] = node;
                                }}
                                value={String(value)}
                                onChange={(event) =>
                                  updateCommandSchemaParameter(selectedStep.id || "", parameter, event.target.value)
                                }
                                className={`${sharedClassName} min-h-24 resize-y font-mono text-xs`}
                              />
                              {showVariablePicker ? (
                                <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center">
                                  <label
                                    htmlFor={`${parameterId}-variable`}
                                    className="shrink-0 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
                                  >
                                    Insert variable
                                  </label>
                                  <select
                                    id={`${parameterId}-variable`}
                                    value=""
                                    onChange={(event) => {
                                      const variableName = event.target.value;
                                      if (!variableName) return;
                                      insertVariableIntoCommandParameter(
                                        selectedStep.id || "",
                                        parameter,
                                        value,
                                        variableName,
                                        parameterId,
                                      );
                                    }}
                                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-950 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                                  >
                                    <option value="">Choose variable...</option>
                                    {variablePickerItems.map((item) => (
                                      <option key={`${item.source}-${item.name}`} value={item.name}>
                                        {item.name} - {item.detail}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : null}
                            </div>
                          );
                        }
                        return (
                          <label key={parameter.name} className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                            {label}
                            <input
                              id={parameterId}
                              type={
                                parameter.type === "number"
                                  ? "number"
                                  : parameter.type === "secret" || parameter.type === "secureString"
                                    ? "password"
                                    : "text"
                              }
                              value={String(value)}
                              onChange={(event) =>
                                updateCommandSchemaParameter(
                                  selectedStep.id || "",
                                  parameter,
                                  parameter.type === "number" ? Number(event.target.value || 0) : event.target.value,
                                )
                              }
                              className={sharedClassName}
                            />
                            {parameter.description ? (
                              <span className="mt-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                {parameter.description}
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {selectedStepAction === "wait" &&
                (textValue(selectedStep.options?.waitType) || (selectedStep.target?.value ? "soft" : "hard")) === "soft" ? (
                  <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Condition
                      <select
                        value={textValue(selectedStep.options?.waitCondition) || "visible"}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => ({
                            ...step,
                            options: {
                              ...step.options,
                              waitCondition: event.target.value,
                              waitType: "soft",
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      >
                        <option value="visible">visible</option>
                        <option value="hidden">hidden</option>
                        <option value="attached">attached</option>
                        <option value="detached">detached</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Locator to wait for
                      <input
                        value={selectedStep.target?.value || ""}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const value = event.target.value;
                            return {
                              ...step,
                              options: { ...step.options, waitType: "soft" },
                              target: {
                                ...step.target,
                                displayName: step.target.displayName || "Element",
                                elementKind: "web element",
                                locatorType: inferLocatorTypeFromValue(value, step.target.locatorType),
                                value,
                              },
                            };
                          })
                        }
                        className="mt-1 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                  </div>
                ) : null}
                {selectedStep.action === "assert" ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Verify
                      <select
                        value={selectedStep.assertionType || "visible"}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const assertionType = event.target.value;
                            const verify =
                              step.options?.verify && typeof step.options.verify === "object"
                                ? (step.options.verify as { cssProperties?: Record<string, string> })
                                : null;
                            const property =
                              step.options?.property && typeof step.options.property === "string"
                                ? step.options.property
                                : "color";
                            const cssExpected =
                              assertionType === "css_property"
                                ? verify?.cssProperties?.[property] || step.expectedValue || ""
                                : step.expectedValue;
                            return {
                              ...step,
                              assertionType,
                              expectedValue:
                                assertionType === "visible" ||
                                assertionType === "hidden" ||
                                assertionType === "image_loaded"
                                  ? ""
                                  : cssExpected || "",
                            };
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      >
                        {assertionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedStep.assertionType === "css_property" ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          CSS property
                          <select
                            value={
                              typeof selectedStep.options?.property === "string"
                                ? selectedStep.options.property
                                : "color"
                            }
                            onChange={(event) =>
                              updateStep(selectedStep.id, (step) => {
                                const property = event.target.value;
                                const verify =
                                  step.options?.verify && typeof step.options.verify === "object"
                                    ? (step.options.verify as { cssProperties?: Record<string, string> })
                                    : null;
                                return {
                                  ...step,
                                  expectedValue: verify?.cssProperties?.[property] || step.expectedValue || "",
                                  options: {
                                    ...step.options,
                                    property,
                                    operator: step.options?.operator || "equals",
                                  },
                                };
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                          >
                            {cssPropertyOptions.map((property) => (
                              <option key={property} value={property}>
                                {property}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          Match
                          <select
                            value={
                              typeof selectedStep.options?.operator === "string"
                                ? selectedStep.options.operator
                                : "equals"
                            }
                            onChange={(event) =>
                              updateStep(selectedStep.id, (step) => ({
                                ...step,
                                options: { ...step.options, operator: event.target.value },
                              }))
                            }
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                          >
                            <option value="equals">equals</option>
                            <option value="contains">contains</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedCommandCanSaveOutput ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <label className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                      Save {selectedCommandOutputTypeLabel} as variable
                      <input
                        value={selectedStepOutputVariable}
                        placeholder={selectedCommandOutputDefaultName}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const definition =
                              displayAction(step.action) === "action"
                                ? actionCommandDefinition
                                : commandDefinitionForAction(displayAction(step.action));
                            const nextStep = {
                              ...step,
                              options: {
                                ...step.options,
                                outputVariableName: event.target.value || undefined,
                              },
                            };
                            const commandPhrase = commandPhraseForStep(nextStep, definition);
                            return {
                              ...nextStep,
                              commandText: commandPhrase,
                              description: commandPhrase,
                            };
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                    <p className="mt-2 text-[11px] font-medium text-emerald-800/80 dark:text-emerald-100/75">
                      The value returned by this command will be available to later steps using this variable name.
                    </p>
                  </div>
                ) : null}
                {selectedStepAction === "runJavaScriptSnippet" ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-sky-900 dark:text-sky-100">
                          Reusable command
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-sky-800/80 dark:text-sky-100/75">
                          Save this JavaScript snippet into the command library for other scenarios in this project.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={saveSelectedJavaScriptSnippetAsCommand}
                        className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/30 dark:bg-zinc-950 dark:text-sky-200 dark:hover:bg-sky-500/10"
                      >
                        Save as Custom Command
                      </button>
                    </div>
                    {customSnippetCommands.length ? (
                      <p className="mt-2 text-[11px] font-medium text-sky-800/80 dark:text-sky-100/75">
                        {customSnippetCommands.length} custom command{customSnippetCommands.length === 1 ? "" : "s"} saved for this project.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <details className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <summary className="cursor-pointer list-none rounded-lg px-1 py-0.5 text-xs font-semibold text-zinc-700 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-zinc-200 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                    Advanced runtime options
                  </summary>
                  <div className="mt-3 grid gap-3">
                    {selectedCommandHasAdvancedRuntimeInput ||
                    (selectedStepHasAdvancedRuntimeConfig && !isCompareCommandAction(selectedStepAction)) ? (
                      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          Value source
                          <select
                            value={selectedStepValueSource}
                            onChange={(event) => {
                              const valueSource = event.target.value as StepParameterValueType;
                              updateStep(selectedStep.id, (step) => {
                                const currentReference = phaseValueReference(step);
                                const nextInputValue =
                                  valueSource === "testData" && currentReference
                                    ? parameterToken(currentReference)
                                    : valueSource === "static"
                                      ? step.inputValue || ""
                                      : step.inputValue || "";
                                return {
                                  ...step,
                                  inputValue: nextInputValue,
                                  options: {
                                    ...step.options,
                                    isResolvedAtRuntime: valueSource !== "static",
                                    isSecret: valueSource === "secret",
                                    parameterName:
                                      valueSource === "testData" ? currentReference || undefined : undefined,
                                    valueReference:
                                      valueSource === "static" ? undefined : currentReference || undefined,
                                    valueSource,
                                    valueType: valueSource,
                                  },
                                };
                              });
                            }}
                            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                          >
                            {valueSourceOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedStepValueSource === "testData" ? (
                          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                            Parameter
                            <select
                              value={selectedStepValueReference}
                              onChange={(event) => {
                                const reference = event.target.value;
                                updateStep(selectedStep.id, (step) => ({
                                  ...step,
                                  inputValue: reference ? parameterToken(reference) : "",
                                  options: {
                                    ...step.options,
                                    isResolvedAtRuntime: true,
                                    isSecret: false,
                                    parameterName: reference || undefined,
                                    valueReference: reference || undefined,
                                    valueSource: "testData",
                                    valueType: "testData",
                                  },
                                }));
                              }}
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                            >
                              <option value="">Choose parameter</option>
                              {scenarioParameters.map((parameter) => (
                                <option key={parameter.id} value={parameter.name}>
                                  {parameter.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : selectedStepValueSource === "expression" ? (
                          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 sm:col-span-2">
                            Expression
                            <textarea
                              value={selectedStepExpression}
                              onChange={(event) =>
                                updateStep(selectedStep.id, (step) => ({
                                  ...step,
                                  options: {
                                    ...step.options,
                                    expression: event.target.value,
                                    isResolvedAtRuntime: true,
                                    isSecret: false,
                                    valueSource: "expression",
                                    valueType: "expression",
                                  },
                                }))
                              }
                              className="mt-1 min-h-16 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-5 text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                            />
                          </label>
                        ) : (
                          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                            Reference
                            <input
                              value={selectedStepValueReference}
                              onChange={(event) => {
                                const reference = event.target.value;
                                updateStep(selectedStep.id, (step) => ({
                                  ...step,
                                  inputValue:
                                    selectedStepValueSource === "static" ? reference : step.inputValue || "",
                                  options: {
                                    ...step.options,
                                    isResolvedAtRuntime: selectedStepValueSource !== "static",
                                    isSecret: selectedStepValueSource === "secret",
                                    valueReference:
                                      selectedStepValueSource === "static" ? undefined : reference || undefined,
                                    valueSource: selectedStepValueSource,
                                    valueType: selectedStepValueSource,
                                  },
                                }));
                              }}
                              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                            />
                          </label>
                        )}
                        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:col-span-2">
                          {selectedStep ? phaseParameterPreview(selectedStep) : ""}
                        </p>
                      </div>
                    ) : null}
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Run only if
                      <input
                        value={textValue(selectedStep.options?.conditionExpression)}
                        placeholder="Optional condition expression"
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => ({
                            ...step,
                            options: {
                              ...step.options,
                              conditionExpression: event.target.value || undefined,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                  </div>
                </details>
                <details className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <summary className="cursor-pointer list-none rounded-lg px-1 py-0.5 text-xs font-semibold text-zinc-700 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-zinc-200 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                    Failure behavior
                  </summary>
                  <div className="mt-3 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      On failure
                      <select
                        value={selectedStepFailureBehavior.continueOnFailure ? "continue" : "stop"}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const continueOnFailure = event.target.value === "continue";
                            const current = phaseFailureBehavior(step);
                            return {
                              ...step,
                              options: {
                                ...step.options,
                                failureBehavior: {
                                  ...current,
                                  continueOnFailure,
                                  stopOnFailure: !continueOnFailure,
                                },
                              },
                            };
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      >
                        <option value="stop">Stop run</option>
                        <option value="continue">Continue run</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Timeout (ms)
                      <input
                        type="number"
                        min="1000"
                        step="1000"
                        value={selectedStepFailureBehavior.timeoutMs}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const current = phaseFailureBehavior(step);
                            return {
                              ...step,
                              options: {
                                ...step.options,
                                timeoutMs: Number(event.target.value || 0),
                                failureBehavior: {
                                  ...current,
                                  timeoutMs: Number(event.target.value || 0),
                                },
                              },
                            };
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Retry count
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={selectedStepFailureBehavior.retryCount}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const current = phaseFailureBehavior(step);
                            return {
                              ...step,
                              options: {
                                ...step.options,
                                failureBehavior: {
                                  ...current,
                                  retryCount: Number(event.target.value || 0),
                                },
                              },
                            };
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                    <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Recovery action
                      <input
                        value={selectedStepFailureBehavior.recoveryActionId}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const current = phaseFailureBehavior(step);
                            return {
                              ...step,
                              options: {
                                ...step.options,
                                failureBehavior: {
                                  ...current,
                                  recoveryActionId: event.target.value || undefined,
                                },
                              },
                            };
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={selectedStepFailureBehavior.screenshotOnFailure}
                        onChange={(event) =>
                          updateStep(selectedStep.id, (step) => {
                            const current = phaseFailureBehavior(step);
                            return {
                              ...step,
                              options: {
                                ...step.options,
                                failureBehavior: {
                                  ...current,
                                  screenshotOnFailure: event.target.checked,
                                },
                              },
                            };
                          })
                        }
                        className="h-4 w-4 rounded border border-zinc-300 accent-emerald-600"
                      />
                      Screenshot on failure
                    </label>
                  </div>
                </details>
                {selectedStepShowsLocatorDiagnostics ? (
                  <details
                    open={locatorDiagnosticsOpen}
                    onToggle={(event) => setLocatorDiagnosticsOpen(event.currentTarget.open)}
                    className="min-w-0 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs font-semibold text-zinc-700 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-zinc-200 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                      Locator diagnostics
                    </summary>
                    <div className="mt-3 grid min-w-0 gap-3">
                    <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                      <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                        Custom locator
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                        Choose CSS or XPath, then save it as a fallback or replace the primary locator.
                      </p>
                      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                        <label className="min-w-0 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                          Type
                          <select
                            value={customLocatorType}
                            onChange={(event) =>
                              setCustomLocatorType(event.target.value === "xpath" ? "xpath" : "css")
                            }
                            className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                          >
                            <option value="css">CSS</option>
                            <option value="xpath">XPath</option>
                          </select>
                        </label>
                        <label className="min-w-0 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                          Value
                          <textarea
                            value={customLocatorValue}
                            onChange={(event) => setCustomLocatorValue(event.target.value)}
                            placeholder={
                              customLocatorType === "xpath"
                                ? "//button[contains(., 'Submit')]"
                                : "#submit-button"
                            }
                            className="mt-1 min-h-20 w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm leading-5 text-zinc-950 outline-none placeholder:text-zinc-400 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            addCustomLocatorCandidate(selectedStep.id, {
                              type: customLocatorType,
                              value: customLocatorValue,
                            });
                            setCustomLocatorValue("");
                          }}
                          disabled={!customLocatorValue.trim()}
                          className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                        >
                          Save as fallback
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            replaceStepLocator(selectedStep.id, {
                              type: customLocatorType,
                              value: customLocatorValue.trim(),
                            });
                            setCustomLocatorValue("");
                          }}
                          disabled={!customLocatorValue.trim()}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Use as primary
                        </button>
                      </div>
                    </div>
                {selectedStepQuality ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 overflow-hidden">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                          Locator health
                        </p>
                        <p className="mt-1 min-w-0 break-words text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400">
                          Primary: {selectedStepQuality.primaryLocator.type}:{" "}
                          {selectedStepQuality.primaryLocator.value || "not set"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void testSelectedLocator()}
                        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Test locator
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                      <span className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-950">
                        Unique {selectedStepQuality.uniquenessScore}
                      </span>
                      <span className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-950">
                        Stable {selectedStepQuality.stabilityScore}
                      </span>
                      <span className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-950">
                        Confidence {selectedStepQuality.confidenceScore}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          selectedStepQuality.ambiguityStatus === "unresolved"
                            ? badgeClass("rose")
                            : selectedStepQuality.ambiguityStatus === "resolved"
                              ? badgeClass("sky")
                              : badgeClass("emerald")
                        }`}
                      >
                        {selectedStepQuality.ambiguityStatus === "none"
                          ? "Unambiguous"
                          : selectedStepQuality.ambiguityStatus === "resolved"
                            ? "Ambiguous resolved"
                            : "Ambiguous"}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass("zinc")}`}>
                        {selectedStepQuality.fallbackLocators.length} fallbacks
                      </span>
                    </div>
                    {locatorTestResult ? (
                      <p className="mt-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                        {locatorTestResult}
                      </p>
                    ) : null}
                    {selectedStepQuality.fallbackLocators.length ? (
                      <div className="mt-3">
                        <p className="font-semibold text-zinc-700 dark:text-zinc-200">
                          Fallback options
                        </p>
                        <div className="mt-1 space-y-1">
                          {selectedStepQuality.fallbackLocators.slice(0, 3).map((locator) => {
                            const candidate = rankedLocators(selectedStep.locatorCandidates).find(
                              (item) => locatorType(item) === locator.type && item.value === locator.value,
                            );
                            return (
                              <div
                                key={`${locator.type}-${locator.value}`}
                                className="flex min-w-0 items-start gap-2 overflow-hidden rounded-lg bg-white px-2 py-2 dark:bg-zinc-950"
                              >
                                <p
                                  className="min-w-0 flex-1 break-words text-[11px] text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400"
                                  title={`${locator.type}: ${locator.value}`}
                                >
                                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                                    {locator.type}
                                  </span>
                                  : {locator.value}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => replaceStepLocator(selectedStep.id, locator, candidate)}
                                  className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                                >
                                  Use
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedStepAmbiguity ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-sky-900 dark:text-sky-100">
                          Multiple matching elements detected
                        </p>
                        <p className="mt-1 text-xs text-sky-700 dark:text-sky-200">
                          {selectedStepAmbiguity.matchCount || selectedStepAmbiguity.previews.length} matches for{" "}
                          {locatorText(selectedStepAmbiguity.candidate as Record<string, unknown>)}
                        </p>
                      </div>
                      {selectedStepAmbiguity.selectedIndex !== undefined ? (
                        <span className="shrink-0 rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-950">
                          {ambiguityMethodLabel(selectedStepAmbiguity.method || "index")}
                        </span>
                      ) : null}
                    </div>
                    {selectedStepAmbiguity.previews.length ? (
                      <div className="mt-3 space-y-2">
                        {selectedStepAmbiguity.previews.slice(0, 6).map((preview, previewIndex) => {
                          const selected = selectedStepAmbiguity.selectedIndex === previewIndex;
                          const dataAttributes =
                            preview.dataAttributes && typeof preview.dataAttributes === "object"
                              ? Object.entries(preview.dataAttributes as Record<string, unknown>)
                                  .slice(0, 3)
                                  .map(([key, value]) => `${key}=${String(value)}`)
                                  .join(" ")
                              : "";
                          return (
                            <button
                              key={`${selectedStep.id}-ambiguity-${previewIndex}`}
                              type="button"
                              onClick={() => resolveStepAmbiguity(selectedStep.id, previewIndex)}
                              className={`w-full rounded-lg border p-2 text-left text-xs transition ${
                                selected
                                  ? "border-emerald-300 bg-white shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10"
                                  : "border-sky-100 bg-white/70 hover:bg-white dark:border-sky-500/20 dark:bg-zinc-950/60 dark:hover:bg-zinc-950"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  Instance {previewIndex + 1}
                                  {selected ? " selected" : ""}
                                </span>
                                <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                  {previewText(preview.visibility, "unknown")}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-zinc-700 dark:text-zinc-200">
                                {previewText(preview.text, previewText(preview.ariaLabel, "No visible text"))}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                                <span>{previewText(preview.tag, "element")}</span>
                                {previewText(preview.role) ? <span>role={previewText(preview.role)}</span> : null}
                                {previewText(preview.ariaLabel) ? <span>aria={previewText(preview.ariaLabel)}</span> : null}
                                {dataAttributes ? <span>{dataAttributes}</span> : null}
                                {previewBounds(preview) ? <span>{previewBounds(preview)}</span> : null}
                              </div>
                              {previewText(preview.parentSnippet) ? (
                                <p className="mt-1 line-clamp-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                                  Near {previewText(preview.parentSnippet)}
                                </p>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-sky-700 dark:text-sky-200">
                        This command will fail safely at runtime until an instance or stronger locator is chosen.
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-sky-700 dark:text-sky-200">
                      <span>Unique {selectedStepAmbiguity.quality.uniqueness || "-"}</span>
                      <span>Stable {selectedStepAmbiguity.quality.stability || "-"}</span>
                      <span>Readable {selectedStepAmbiguity.quality.readability || "-"}</span>
                    </div>
                  </div>
                ) : null}
                {selectedStep.locatorCandidates?.length ? (
                  <div>
                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Locator candidates
                    </p>
                    <div className="mt-2 min-w-0 space-y-2">
                      {rankedLocators(selectedStep.locatorCandidates).slice(0, 6).map((candidate) => (
                        <div
                          key={`${candidate.rank}-${candidate.type}-${candidate.value}`}
                          className="flex min-w-0 items-start gap-2 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                                {candidate.rank}. {candidate.type}
                              </span>
                              <span className="text-zinc-500">{candidate.score}</span>
                            </div>
                            <div className="mt-1 min-w-0 break-words text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400">
                              {candidate.value}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              replaceStepLocator(
                                selectedStep.id,
                                { type: candidate.type, value: candidate.value },
                                candidate,
                              )
                            }
                            className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                          >
                            Use
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
              <div className="shrink-0 border-t border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={(event) => deleteSelectedCommand(event)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    Delete Command
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => closeCommandPrompt(event)}
                      disabled={commandPromptSaving}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCommandPromptDone()}
                      disabled={commandPromptSaving}
                      className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                    >
                      {commandPromptSaving ? "Saving..." : "Done"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
            </div>
          ) : null}
        </aside>
      </div>

      {timelineMenu ? (() => {
        const menuStep = timelineMenu.actionStepId
          ? actionStepCommands[timelineMenu.actionStepId]?.find((step) => step.id === timelineMenu.stepId) ?? null
          : visibleSteps.find((step) => step.id === timelineMenu.stepId) ?? null;
        const actionStep = timelineMenu.actionStepId
          ? visibleSteps.find((step) => step.id === timelineMenu.actionStepId) ?? null
          : null;
        const isActionMenu = menuStep?.action === "action";
        return (
        <div
          className="fixed z-50 max-h-[calc(100vh-16px)] w-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          style={{ left: timelineMenu.x, top: timelineMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setTimelineMenu(null);
              if (!menuStep) return;
              if (actionStep) openActionCommandPrompt(actionStep, menuStep);
              else openTimelineStep(menuStep);
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelineMenu(null);
              if (menuStep) renameTimelineStep(menuStep.id);
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelineMenu(null);
              if (actionStep && menuStep) void runActionCommand(actionStep, menuStep);
              else if (menuStep) void runSingleCommand(menuStep);
            }}
            disabled={!menuStep || busy}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {isActionMenu ? "Run Action" : "Run This Command"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (timelineMenu.actionStepId) {
                setTimelineMenu(null);
                appendLog("Create Action from saved action commands is available from the parent timeline selection.");
                return;
              }
              const selection = timelineSelectionFor(timelineMenu.stepId);
              setTimelineMenu(null);
              if (!selection.length) return;
              setSelectedStepIds(new Set(selection.map((step) => step.id)));
              setSelectedStepId(selection[0]?.id ?? null);
              setActionName("");
              setActionDescription("");
              setActionModalOpen(true);
            }}
            disabled={!timelineSelectionFor(timelineMenu.stepId).length}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Create Action
          </button>
          <button
            type="button"
            onClick={() => {
              const stepId = timelineMenu.stepId;
              const parent = timelineMenu.actionStepId
                ? visibleSteps.find((step) => step.id === timelineMenu.actionStepId)
                : null;
              setTimelineMenu(null);
              if (parent) insertActionWaitAfter(parent, stepId);
              else insertWaitAfter(stepId);
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Insert Wait After
          </button>
          <button
            type="button"
            onClick={() => openCommandInsertLibrary("before")}
            disabled={!menuStep}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Add Command Before
          </button>
          <button
            type="button"
            onClick={() => openCommandInsertLibrary("after")}
            disabled={!menuStep}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Add Command After
          </button>
          {isActionMenu ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setTimelineMenu(null);
                  if (!menuStep) return;
                  setExpandedActionStepIds((current) => new Set(current).add(menuStep.id));
                  void loadActionStepCommands(menuStep);
                }}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimelineMenu(null);
                  if (!menuStep) return;
                  setExpandedActionStepIds((current) => {
                    const next = new Set(current);
                    next.delete(menuStep.id);
                    return next;
                  });
                }}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Collapse All
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const stepId = timelineMenu.stepId;
              setTimelineMenu(null);
              if (timelineMenu.actionStepId) {
                appendLog("Duplicate saved action command from the drawer after opening it.");
              } else {
                duplicateTimelineSelection(stepId);
              }
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelineMenu(null);
              appendLog("Command disabled state is reserved for execution options.");
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Disable
          </button>
          <button
            type="button"
            onClick={() => {
              const stepId = timelineMenu.stepId;
              const parent = timelineMenu.actionStepId
                ? visibleSteps.find((step) => step.id === timelineMenu.actionStepId)
                : null;
              setTimelineMenu(null);
              if (parent && menuStep) {
                const selectedIds = [...selectedActionCommandKeys]
                  .filter((key) => key.startsWith(`${parent.id}:`))
                  .map((key) => key.slice(parent.id.length + 1));
                void deleteActionCommandsByIds(
                  parent,
                  selectedIds.includes(menuStep.id) ? selectedIds : [menuStep.id],
                );
              }
              else if (menuStep?.action === "action") void moveTimelineActionToBin(menuStep);
              else deleteTimelineSelection(stepId);
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-500/10"
          >
            Delete
          </button>
        </div>
        );
      })() : null}

      {commandInsertMenu ? (() => {
        const anchorStep = commandInsertMenu.actionStepId
          ? actionStepCommands[commandInsertMenu.actionStepId]?.find(
              (step) => step.id === commandInsertMenu.anchorStepId,
            ) ?? null
          : visibleSteps.find((step) => step.id === commandInsertMenu.anchorStepId) ?? null;
        return (
          <div
            className="fixed z-50 w-[min(440px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
            style={{ left: commandInsertMenu.x, top: commandInsertMenu.y }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-200">
                    Command Library
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {commandInsertMenu.position === "before" ? "Before" : "After"}{" "}
                    {anchorStep?.commandText || (anchorStep ? readableStepLabel(anchorStep) : "selected command")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCommandInsertMenu(null)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Close
                </button>
              </div>
              <input
                autoFocus
                value={commandInsertMenu.query}
                onChange={(event) =>
                  setCommandInsertMenu((current) =>
                    current ? { ...current, query: event.target.value } : current,
                  )
                }
                placeholder="Search commands by keyword, alias, or domain"
                className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div className="max-h-[430px] overflow-y-auto p-2">
              {Object.keys(commandInsertResultsByDomain).length ? (
                Object.entries(commandInsertResultsByDomain).map(([domain, commands]) => (
                  <div key={domain} className="mb-2 last:mb-0">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      {domain}
                    </p>
                    <div className="grid gap-1">
                      {commands.map((command) => (
                        <button
                          key={`${domain}-${command.action}`}
                          type="button"
                          onClick={() => void insertCommandFromLibrary(command)}
                          className="flex min-w-0 items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{command.label}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {[command.action, ...command.aliases].slice(0, 4).join(", ")}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                              command.executable && command.domain === "web"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                            }`}
                          >
                            {commandExecutionBadgeLabel(command)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-3 py-8 text-center text-sm font-semibold text-zinc-500">
                  No commands match this search.
                </p>
              )}
            </div>
          </div>
        );
      })() : null}

      {playbackConfigOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Playback Configuration
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Authoring playback stays local and separate from formal Run results.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlaybackConfigOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={playbackConfig.autoPlaybackEnabled}
                  onChange={(event) =>
                    setPlaybackConfig((current) => ({
                      ...current,
                      autoPlaybackEnabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-zinc-300 accent-sky-600"
                />
                Enable Auto Playback
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={playbackConfig.pauseOnElementErrors}
                  onChange={(event) =>
                    setPlaybackConfig((current) => ({
                      ...current,
                      pauseOnElementErrors: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-zinc-300 accent-sky-600"
                />
                Pause on Element Errors
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={playbackConfig.selfHealingEnabled}
                  onChange={(event) =>
                    setPlaybackConfig((current) => ({
                      ...current,
                      selfHealingEnabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-zinc-300 accent-sky-600"
                />
                Enable Self-Healing
              </label>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Environment
                <select
                  value={playbackConfig.environmentId ?? ""}
                  onChange={(event) =>
                    setPlaybackConfig((current) => ({
                      ...current,
                      environmentId: event.target.value || null,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="">Use run default</option>
                  {runConfig.environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Auto playback timeout (sec)
                <input
                  type="number"
                  min="1"
                  value={Math.round(playbackConfig.autoElementTimeoutMs / 1000)}
                  onChange={(event) =>
                    setPlaybackConfig((current) => ({
                      ...current,
                      autoElementTimeoutMs: Number(event.target.value || 5) * 1000,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Manual element timeout (sec)
                <input
                  type="number"
                  min="1"
                  value={Math.round(playbackConfig.manualElementTimeoutMs / 1000)}
                  onChange={(event) =>
                    setPlaybackConfig((current) => ({
                      ...current,
                      manualElementTimeoutMs: Number(event.target.value || 30) * 1000,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Manual page timeout (sec)
                <input
                  type="number"
                  min="1"
                  value={Math.round(playbackConfig.manualPageTimeoutMs / 1000)}
                  onChange={(event) =>
                    setPlaybackConfig((current) => ({
                      ...current,
                      manualPageTimeoutMs: Number(event.target.value || 60) * 1000,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="sm:col-span-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Execution parameters
                <textarea
                  value={JSON.stringify(playbackConfig.executionParameters ?? {}, null, 2)}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value || "{}");
                      setPlaybackConfig((current) => ({
                        ...current,
                        executionParameters:
                          parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {},
                      }));
                    } catch {
                      appendLog("Execution parameters must be valid JSON.");
                    }
                  }}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPlaybackConfigOpen(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void savePlaybackConfig(playbackConfig)
                    .then(() => {
                      appendLog("Playback configuration saved.");
                      setPlaybackConfigOpen(false);
                    })
                    .catch((error) => appendLog(error instanceof Error ? error.message : "Could not save playback configuration."))
                }
                className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
              >
                Save Playback Config
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {liveCommandMenu ? (
        <div
          className="fixed z-50 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          style={{ left: liveCommandMenu.x, top: liveCommandMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-200">
              Live Command Library
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {liveInspectorSnapshot(liveCommandMenu.result).label}
            </p>
            <input
              autoFocus
              value={liveCommandMenu.query}
              onChange={(event) =>
                setLiveCommandMenu((current) =>
                  current ? { ...current, query: event.target.value } : current,
                )
              }
              placeholder="Search commands by keyword, alias, or domain"
              className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {Object.keys(liveCommandResultsByDomain).length ? (
              Object.entries(liveCommandResultsByDomain).map(([domain, commands]) => (
                <div key={domain} className="mb-2 last:mb-0">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    {domain}
                  </p>
                  <div className="grid gap-1">
                    {commands.map((command) => (
                      <button
                        key={`${domain}-${command.action}`}
                        type="button"
                        onClick={() => void insertLivePreviewCommand(command)}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{command.label}</span>
                          {command.aliases.length ? (
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {command.aliases.slice(0, 3).join(", ")}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                            command.executable && command.domain === "web"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                          }`}
                        >
                          {commandExecutionBadgeLabel(command)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-sm font-semibold text-zinc-500">
                No commands match this search.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {canvasInsertPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-200">
                Command Insertion Preview
              </p>
              <h3 className="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Confirm Canvas Command
              </h3>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-zinc-500">Command</p>
                <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {commandDefinitionForAction(canvasInsertPreview.action)?.label || canvasInsertPreview.action}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500">Element</p>
                <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {String(canvasInsertPreview.snapshot.label ?? canvasInsertPreview.snapshot.text ?? "Canvas Element")}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500">Locator</p>
                <p className="break-all font-mono text-xs text-zinc-800 dark:text-zinc-200">
                  {String(canvasInsertPreview.locator.strategy ?? canvasInsertPreview.locator.type ?? "locator")}=
                  {String(canvasInsertPreview.locator.value ?? "")}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500">Insert position</p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {canvasInsertPreview.insertAfterStepId
                    ? `after ${visibleSteps.findIndex((step) => step.id === canvasInsertPreview.insertAfterStepId) + 1 || "selected step"}`
                    : "at the bottom"}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setCanvasInsertPreview(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void insertCanvasCommand(canvasInsertPreview.snapshot, canvasInsertPreview.action)}
                className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
              >
                Insert Command
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {playbackStateGuard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-[16px] border border-amber-200 bg-white shadow-xl dark:border-amber-500/30 dark:bg-zinc-950">
            <div className="border-b border-amber-100 px-5 py-4 dark:border-amber-500/20">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">
                Playback State Guard
              </p>
              <h3 className="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Browser May Be On The Wrong Page
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Playback operates on the current Recorder Browser. The browser must already be in the correct state for
                selected commands to execute correctly.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold text-zinc-500">Current browser URL</p>
                <p className="mt-1 break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">
                  {playbackStateGuard.currentUrl}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold text-zinc-500">Selected command expected page</p>
                <p className="mt-1 break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">
                  {playbackStateGuard.expectedUrl}
                </p>
              </div>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                {playbackStateGuard.message}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPlaybackStateGuard(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const guard = playbackStateGuard;
                  const anchor = guard.anchorStepId
                    ? visibleSteps.find((step) => step.id === guard.anchorStepId) ?? null
                    : null;
                  setPlaybackStateGuard(null);
                  void startPlayback(guard.scope, anchor, { skipStateGuard: true });
                }}
                className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-100 dark:hover:bg-amber-500/10"
              >
                Continue Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  const guard = playbackStateGuard;
                  const anchor = guard.anchorStepId
                    ? visibleSteps.find((step) => step.id === guard.anchorStepId) ?? null
                    : null;
                  setPlaybackStateGuard(null);
                  void startPlayback(guard.scope, anchor, {
                    navigateToExpected: true,
                    skipStateGuard: true,
                  });
                }}
                className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
              >
                Navigate to Starting URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaybackStateGuard(null);
                  void startPlayback("fullScenario", null, { skipStateGuard: true });
                }}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                Playback from Beginning
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {runModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {runModalMode === "record" ? "Start Recording" : "Run Scenario"}
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {runModalMode === "record"
                    ? "Choose where and how the browser should open."
                    : "Choose runtime context for this run only."}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissRunModal}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="grid gap-5 overflow-y-auto px-5 py-4">
              {runModalError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                >
                  {runModalError}
                </div>
              ) : null}
              <section>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      Environments
                    </h4>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {runModalMode === "record"
                        ? "The first selected row starts the recorder."
                        : "Selected rows run one by one."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addRunEnvironment}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Add Environment
                  </button>
                </div>
                <div className="mt-3 grid gap-3">
                  {runConfig.environments.map((environment, index) => (
                    <div
                      key={environment.id}
                      className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70 lg:grid-cols-[auto_minmax(120px,0.75fr)_minmax(220px,1.4fr)_auto]"
                    >
                      <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        <input
                          type="checkbox"
                          checked={environment.enabled}
                          onChange={(event) =>
                            updateRunEnvironment(environment.id, { enabled: event.target.checked })
                          }
                        />
                        Run
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Name
                        <input
                          value={environment.name}
                          onChange={(event) =>
                            updateRunEnvironment(environment.id, { name: event.target.value })
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                          placeholder={`Environment ${index + 1}`}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Base URL
                        <input
                          value={environment.baseUrl}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            const urlAuth = authFromUrl(nextValue);
                            updateRunEnvironment(
                              environment.id,
                              urlAuth
                                ? {
                                    baseUrl: cleanUrlAuth(nextValue),
                                    basicAuthEnabled: true,
                                    password: urlAuth.password,
                                    username: urlAuth.username,
                                  }
                                : { baseUrl: nextValue },
                            );
                          }}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                          placeholder="https://example.com"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeRunEnvironment(environment.id)}
                        disabled={runConfig.environments.length <= 1}
                        className="self-end rounded-lg px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:text-rose-200 dark:hover:bg-rose-500/10"
                      >
                        Remove
                      </button>
                      <div className="lg:col-span-4">
                        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                          <input
                            type="checkbox"
                            checked={environment.basicAuthEnabled}
                            onChange={(event) =>
                              updateRunEnvironment(environment.id, {
                                basicAuthEnabled: event.target.checked,
                              })
                            }
                          />
                          Basic Auth
                        </label>
                        {environment.basicAuthEnabled ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <input
                              value={environment.username}
                              onChange={(event) =>
                                updateRunEnvironment(environment.id, { username: event.target.value })
                              }
                              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                              placeholder="Username"
                            />
                            <input
                              value={environment.password}
                              onChange={(event) =>
                                updateRunEnvironment(environment.id, { password: event.target.value })
                              }
                              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                              placeholder="Password"
                              type="password"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Device
                  </h4>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {runDeviceOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() =>
                          setRunConfig((current) => ({ ...current, device: option.key }))
                        }
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          runConfig.device === option.key
                            ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs opacity-70">{option.description}</span>
                      </button>
                    ))}
                  </div>
                  {runConfig.device === "custom" ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Width
                        <input
                          type="number"
                          min={320}
                          value={runConfig.customWidth}
                          onChange={(event) =>
                            setRunConfig((current) => ({
                              ...current,
                              customWidth: Number(event.target.value),
                            }))
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Height
                        <input
                          type="number"
                          min={320}
                          value={runConfig.customHeight}
                          onChange={(event) =>
                            setRunConfig((current) => ({
                              ...current,
                              customHeight: Number(event.target.value),
                            }))
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Browser Mode
                  </h4>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(["headed", "headless"] as RunBrowserMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setBrowserMode(mode);
                          setRunConfig((current) => ({ ...current, browserMode: mode }));
                        }}
                        className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                          runConfig.browserMode === mode
                            ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        }`}
                      >
                        {mode === "headed" ? "Visible" : "Headless"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    {selectedRunEnvironments(runConfig).length} environment
                    {selectedRunEnvironments(runConfig).length === 1 ? "" : "s"} selected
                    {runModalMode === "record" && selectedRunEnvironments(runConfig).length > 1
                      ? " (first will be used)"
                      : ""}{" "}
                    |{" "}
                    {deviceLabelForRunConfig(runConfig)} |{" "}
                    {runConfig.browserMode === "headed" ? "Visible browser" : "Headless"}
                  </div>
                </div>
              </section>
              {runModalMode === "run" ? (
                <section className="grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      Execution Mode
                    </h4>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {(["sequential", "parallel"] as RunExecutionMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setRunConfig((current) => ({ ...current, executionMode: mode }))}
                          className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold capitalize transition ${
                            runConfig.executionMode === mode
                              ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Parallel is honored when configured agent capacity supports it; otherwise runs fall back to sequential execution.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      Run Scope
                    </h4>
                    <select
                      value={runConfig.runScope}
                      onChange={(event) =>
                        setRunConfig((current) => ({
                          ...current,
                          runScope: event.target.value as RunScope,
                        }))
                      }
                      className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      <option value="allActive">All active cases</option>
                      <option value="failedOnly">Failed cases</option>
                      <option value="tag">Tag</option>
                      <option value="priority">Priority</option>
                    </select>
                    {runConfig.runScope === "tag" ? (
                      <input
                        value={runConfig.scopeTag}
                        onChange={(event) =>
                          setRunConfig((current) => ({ ...current, scopeTag: event.target.value }))
                        }
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                        placeholder="smoke"
                      />
                    ) : null}
                    {runConfig.runScope === "priority" ? (
                      <select
                        value={runConfig.scopePriority}
                        onChange={(event) =>
                          setRunConfig((current) => ({
                            ...current,
                            scopePriority: event.target.value as RunConfig["scopePriority"],
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      >
                        <option value="all">All priorities</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    ) : null}
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {scenarioTestCases.filter((testCase) => testCaseMatchesRunScope(testCase, runConfig)).length ||
                        "No"}{" "}
                      matching scenario test case
                      {scenarioTestCases.filter((testCase) => testCaseMatchesRunScope(testCase, runConfig)).length === 1
                        ? ""
                        : "s"}
                      . Optional overrides can still be added later without changing saved cases.
                    </p>
                  </div>
                </section>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={dismissRunModal}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void (runModalMode === "record"
                    ? startRecording(runConfig)
                    : runScenario(runConfig))
                }
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy
                  ? runModalMode === "record"
                    ? "Starting..."
                    : "Running..."
                  : runModalMode === "record"
                    ? "Start Recording"
                    : "Run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {liveRunReport?.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <section
            className="grid max-h-[90vh] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
            role="dialog"
            aria-modal="true"
            aria-label="Live run report"
          >
            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                    Live Run Report
                  </p>
                  <h3 className="mt-1 truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {liveRunReport.title}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {[liveRunReport.environment, liveRunReport.device, liveRunReport.browserMode]
                      .filter(Boolean)
                      .join(" | ") || "Current runtime context"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                      liveRunReport.status === "passed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : liveRunReport.status === "failed"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                          : liveRunReport.status === "running"
                            ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    {liveRunReport.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLiveRunReport((current) => current ? { ...current, open: false } : current)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {(["queued", "running", "passed", "failed"] as LiveRunReportRowStatus[]).map((status) => {
                  const count = liveRunReport.rows.filter((row) => row.status === status).length;
                  return (
                    <div
                      key={status}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                        {status}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                        {count}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <div className="grid gap-2">
                {liveRunReport.rows.map((row) => (
                  <div
                    key={`${row.stepId || row.index}-${row.index}`}
                    className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-zinc-100 px-2 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {row.index + 1}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                              row.status === "passed"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                                : row.status === "failed"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                                  : row.status === "running"
                                    ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
                                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            }`}
                          >
                            {row.status}
                          </span>
                          {row.parentActionName ? (
                            <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                              {row.parentActionName}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 break-words text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {row.label}
                        </p>
                        {row.message ? (
                          <p className={`mt-1 break-words text-xs font-medium ${row.status === "failed" ? "text-rose-700 dark:text-rose-200" : "text-zinc-500 dark:text-zinc-400"}`}>
                            {row.message}
                          </p>
                        ) : null}
                        {row.outputSummary ? (
                          <p className="mt-1 break-words font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                            {row.outputSummary}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void jumpToLiveReportCommand(row)}
                        disabled={!row.stepId}
                        className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Go to command
                      </button>
                    </div>
                    {row.details.length ? (
                      <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
                        <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-700 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
                          Details
                        </summary>
                        <div className="mt-2 grid gap-1 font-mono text-[11px] leading-5 text-zinc-700 dark:text-zinc-300">
                          {row.details.map((detail, detailIndex) => (
                            <p key={`${row.stepId}-${detailIndex}`} className="break-words">
                              {detail}
                            </p>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {testDataOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Scenario Test Cases
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Detected parameters become columns. Every active row runs automatically when the scenario runs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestDataOpen(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5">
              {testDataError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {testDataError}
                </div>
              ) : null}
              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      Parameters
                    </h4>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Inferred tokens are added automatically. You can add your own too.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const name = typeof window !== "undefined" ? window.prompt("Parameter name", "") : "";
                      const normalized = textValue(name).replace(/[{}\s]/g, "");
                      if (!normalized) return;
                      setParameterDrafts((current) =>
                        current.some((parameter) => parameter.name === normalized)
                          ? current
                          : [
                              ...current,
                              {
                                defaultValue: "",
                                id: makeParameterId(normalized),
                                name: normalized,
                                required: true,
                                type: "string",
                              },
                            ],
                      );
                      setTestCaseDrafts((current) =>
                        current.map((testCase) => ({
                          ...testCase,
                          data: { ...testCase.data, [normalized]: "" },
                        })),
                      );
                    }}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Add Parameter
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {parameterDrafts.map((parameter) => (
                    <div
                      key={parameter.id}
                      className="grid gap-2 rounded-lg bg-white p-2 dark:bg-zinc-950 sm:grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_80px]"
                    >
                      <input
                        value={parameter.name}
                        onChange={(event) => {
                          const nextName = event.target.value.replace(/[{}\s]/g, "");
                          setParameterDrafts((current) =>
                            current.map((item) =>
                              item.id === parameter.id ? { ...item, name: nextName } : item,
                            ),
                          );
                        }}
                        className="min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                        placeholder="parameterName"
                      />
                      <select
                        value={parameter.type}
                        onChange={(event) =>
                          setParameterDrafts((current) =>
                            current.map((item) =>
                              item.id === parameter.id
                                ? { ...item, type: event.target.value as ScenarioParameter["type"] }
                                : item,
                            ),
                          )
                        }
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="secret">secret</option>
                        <option value="enum">enum</option>
                      </select>
                      <input
                        value={parameter.defaultValue || ""}
                        onChange={(event) =>
                          setParameterDrafts((current) =>
                            current.map((item) =>
                              item.id === parameter.id
                                ? { ...item, defaultValue: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                        placeholder="default value"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setParameterDrafts((current) => current.filter((item) => item.id !== parameter.id));
                          setTestCaseDrafts((current) =>
                            current.map((testCase) => {
                              const nextData = { ...testCase.data };
                              delete nextData[parameter.name];
                              return { ...testCase, data: nextData };
                            }),
                          );
                        }}
                        className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {!parameterDrafts.length ? (
                    <p className="rounded-lg bg-white px-3 py-3 text-xs text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                      No parameters yet. Add tokens like {"{{province}}"} in a command field, or add one manually.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      Test Cases
                    </h4>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Test Case Name | detected params | Expected Result | Tags | Priority | Active
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTestCaseDrafts((current) => [
                        ...current,
                        {
                          data: defaultParameterData(parameterDrafts),
                          enabled: true,
                          expectedResult: "",
                          id: makeTestCaseId(),
                          name: `Test Case ${current.length + 1}`,
                          priority: "medium",
                          tags: [],
                        },
                      ])
                    }
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Add Row
                  </button>
                </div>
                <div className="cf-table-shell mt-3 overflow-x-auto">
                  <table className="cf-table-safe min-w-full border-separate border-spacing-0 text-left text-xs">
                    <thead>
                      <tr className="text-zinc-500 dark:text-zinc-400">
                        <th className="sticky left-0 z-10 min-w-48 bg-white px-2 py-2 font-semibold dark:bg-zinc-950">
                          Test Case Name
                        </th>
                        {parameterDrafts.map((parameter) => (
                          <th key={parameter.id} className="min-w-44 px-2 py-2 font-semibold">
                            {parameter.name}
                          </th>
                        ))}
                        <th className="min-w-52 px-2 py-2 font-semibold">Expected Result</th>
                        <th className="min-w-44 px-2 py-2 font-semibold">Tags</th>
                        <th className="min-w-32 px-2 py-2 font-semibold">Priority</th>
                        <th className="min-w-24 px-2 py-2 font-semibold">Active</th>
                        <th className="min-w-20 px-2 py-2 font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {testCaseDrafts.map((testCase) => (
                        <tr key={testCase.id} className="align-top">
                          <td className="sticky left-0 z-10 bg-white px-2 py-1.5 dark:bg-zinc-950">
                            <input
                              value={testCase.name}
                              onChange={(event) =>
                                setTestCaseDrafts((current) =>
                                  current.map((item) =>
                                    item.id === testCase.id ? { ...item, name: event.target.value } : item,
                                  ),
                                )
                              }
                              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                          </td>
                          {parameterDrafts.map((parameter) => (
                            <td key={`${testCase.id}-${parameter.id}`} className="px-2 py-1.5">
                              <input
                                type={parameter.type === "secret" ? "password" : "text"}
                                value={testCase.data?.[parameter.name] ?? ""}
                                onChange={(event) =>
                                  setTestCaseDrafts((current) =>
                                    current.map((item) =>
                                      item.id === testCase.id
                                        ? {
                                            ...item,
                                            data: {
                                              ...item.data,
                                              [parameter.name]: event.target.value,
                                            },
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                                placeholder={parameter.defaultValue || parameter.name}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1.5">
                            <input
                              value={testCase.expectedResult || ""}
                              onChange={(event) =>
                                setTestCaseDrafts((current) =>
                                  current.map((item) =>
                                    item.id === testCase.id
                                      ? { ...item, expectedResult: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                              placeholder="Expected outcome"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={(testCase.tags ?? []).join(", ")}
                              onChange={(event) =>
                                setTestCaseDrafts((current) =>
                                  current.map((item) =>
                                    item.id === testCase.id
                                      ? {
                                          ...item,
                                          tags: event.target.value
                                            .split(",")
                                            .map((tag) => tag.trim())
                                            .filter(Boolean),
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                              placeholder="smoke, regression"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={testCase.priority || "medium"}
                              onChange={(event) =>
                                setTestCaseDrafts((current) =>
                                  current.map((item) =>
                                    item.id === testCase.id
                                      ? {
                                          ...item,
                                          priority: event.target.value as ScenarioTestCase["priority"],
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                              <input
                                type="checkbox"
                                checked={testCase.enabled}
                                onChange={(event) =>
                                  setTestCaseDrafts((current) =>
                                    current.map((item) =>
                                      item.id === testCase.id
                                        ? { ...item, enabled: event.target.checked }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              Active
                            </label>
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setTestCaseDrafts((current) => current.filter((item) => item.id !== testCase.id))
                              }
                              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!testCaseDrafts.length ? (
                    <p className="rounded-lg bg-zinc-50 px-3 py-3 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      Add a row to create data-driven test cases for this scenario.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setTestDataOpen(false)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveTestData()}
                disabled={testDataSaving}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {testDataSaving ? "Saving..." : "Save Test Cases"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {locatorFlyout && locatorFlyoutStep && locatorFlyoutQuality && stepShowsLocatorDiagnostics(locatorFlyoutStep) ? (
        <div
          className="fixed z-50 max-h-[calc(100vh-24px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white p-3 text-xs shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          style={{ left: locatorFlyout.x, top: locatorFlyout.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-zinc-950 dark:text-zinc-50">Locator</p>
              <p className="mt-1 min-w-0 break-words text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400">
                {locatorFlyoutQuality.primaryLocator.type}: {locatorFlyoutQuality.primaryLocator.value || "not set"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocatorFlyout(null);
                setDrawerOpen(true);
                setLocatorDiagnosticsOpen(true);
              }}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Details
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
            <span className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">
              Unique {locatorFlyoutQuality.uniquenessScore}
            </span>
            <span className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">
              Stable {locatorFlyoutQuality.stabilityScore}
            </span>
            <span className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">
              Conf {locatorFlyoutQuality.confidenceScore}
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {locatorFlyoutQuality.fallbackLocators.slice(0, 4).map((locator) => {
              const candidate = rankedLocators(locatorFlyoutStep.locatorCandidates).find(
                (item) => locatorType(item) === locator.type && item.value === locator.value,
              );
              return (
                <div
                  key={`${locator.type}-${locator.value}`}
                  className="flex min-w-0 items-start gap-2 overflow-hidden rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900"
                >
                  <p className="min-w-0 flex-1 break-words text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">{locator.type}</span>: {locator.value}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      replaceStepLocator(locatorFlyoutStep.id, locator, candidate);
                      setLocatorFlyout(null);
                    }}
                    className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                  >
                    Use
                  </button>
                </div>
              );
            })}
            {!locatorFlyoutQuality.fallbackLocators.length ? (
              <p className="rounded-lg bg-zinc-50 px-2 py-2 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                No fallback locators saved yet.
              </p>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void testSelectedLocator()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Test locator
            </button>
            <button
              type="button"
              onClick={() => setLocatorFlyout(null)}
              className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950"
            >
              Done
            </button>
          </div>
          {locatorTestResult ? (
            <p className="mt-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{locatorTestResult}</p>
          ) : null}
        </div>
      ) : null}

      {pendingAmbiguity ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-2xl rounded-[16px] border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Choose Element Instance
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {pendingAmbiguity.message ||
                    `${pendingAmbiguity.description || "This command"} matched ${
                      pendingAmbiguity.matchCount || "multiple"
                    } elements.`}
                </p>
              </div>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                Paused
              </span>
            </div>
            <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {locatorText(pendingAmbiguity.locator)}
              </p>
              <p className="mt-1">
                Pick the matching element. The run will continue automatically from this command.
              </p>
            </div>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
              {(pendingAmbiguity.previews?.length ? pendingAmbiguity.previews : Array.from({ length: pendingAmbiguity.matchCount || 0 })).map(
                (preview, previewIndex) => {
                  const item =
                    preview && typeof preview === "object"
                      ? (preview as Record<string, unknown>)
                      : {};
                  const dataAttributes =
                    item.dataAttributes && typeof item.dataAttributes === "object"
                      ? Object.entries(item.dataAttributes as Record<string, unknown>)
                          .slice(0, 3)
                          .map(([key, value]) => `${key}=${String(value)}`)
                          .join(" ")
                      : "";
                  return (
                    <button
                      key={`pending-ambiguity-${previewIndex}`}
                      type="button"
                      onClick={() => void resolveRuntimeAmbiguity(pendingAmbiguity, previewIndex)}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-left text-xs transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          Instance {previewIndex + 1}
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                          {previewText(item.visibility, "visible")}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-zinc-700 dark:text-zinc-200">
                        {previewText(item.text, previewText(item.ariaLabel, "No visible text"))}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                        <span>{previewText(item.tag, "element")}</span>
                        {previewText(item.role) ? <span>role={previewText(item.role)}</span> : null}
                        {previewText(item.ariaLabel) ? <span>aria={previewText(item.ariaLabel)}</span> : null}
                        {dataAttributes ? <span>{dataAttributes}</span> : null}
                        {previewBounds(item) ? <span>{previewBounds(item)}</span> : null}
                      </div>
                      {previewText(item.parentSnippet) ? (
                        <p className="mt-1 line-clamp-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                          Near {previewText(item.parentSnippet)}
                        </p>
                      ) : null}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedHealingEvent ? (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-32px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Self-healed Locator
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Review before changing the saved command.
                </p>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                {selectedHealingEvent.status.replace("_", " ")}
              </span>
            </div>
            <div className="mt-4 grid gap-3 text-xs text-zinc-600 dark:text-zinc-300">
              <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">Original locator</p>
                <p className="mt-1 break-all">{locatorText(selectedHealingEvent.originalLocator)}</p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">Healed locator</p>
                <p className="mt-1 break-all">{locatorText(selectedHealingEvent.healedLocator)}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">Confidence</p>
                  <p className="mt-1">{selectedHealingEvent.confidenceScore ?? "unknown"}</p>
                </div>
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">Reason</p>
                  <p className="mt-1">{selectedHealingEvent.healReason || "Matched fallback locator"}</p>
                </div>
              </div>
              {selectedHealingEvent.suggestedCandidates?.length ? (
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">Suggested candidates</p>
                  <div className="mt-2 space-y-1">
                    {selectedHealingEvent.suggestedCandidates.slice(0, 5).map((candidate, index) => (
                      <p key={`${selectedHealingEvent.id}-${index}`} className="break-all">
                        {String(candidate.label ?? candidate.value ?? candidate.tag ?? "candidate")}{" "}
                        {candidate.score !== undefined ? `(${String(candidate.score)})` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedHealingEvent(null)}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void reviewHealingEvent(selectedHealingEvent, "discard")}
                  disabled={selectedHealingEvent.status === "discarded"}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void reviewHealingEvent(selectedHealingEvent, "accept")}
                  disabled={selectedHealingEvent.status === "accepted" || !selectedHealingEvent.healedLocator}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  Accept as primary
                </button>
              </div>
            </div>
        </div>
      ) : null}

      {locatorLoopCreateModalOpen && locatorLoopCreateModalAction && locatorLoopCreateModalTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-[16px] border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Create locator variable
                </h3>
                <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Save a CSS or XPath locator, then the loop can use it at the current index.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocatorLoopCreateModalOpen(false);
                  if (!textValue(locatorLoopCreateModalAction.locatorValue)) {
                    updateLocatorLoopBuilderAction(locatorLoopCreateModalTarget.phase, locatorLoopCreateModalTarget.actionId, {
                      createLocatorVariable: false,
                    });
                  }
                  setLocatorLoopCreateModalTarget(null);
                }}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Variable name
                <input
                  autoFocus
                  value={locatorLoopCreateModalAction.locatorVariable}
                  onChange={(event) =>
                    updateLocatorLoopBuilderAction(locatorLoopCreateModalTarget.phase, locatorLoopCreateModalTarget.actionId, {
                      locatorVariable: event.target.value,
                    })
                  }
                  placeholder="productLocator"
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Locator type
                <select
                  value={locatorLoopCreateModalAction.locatorType}
                  onChange={(event) =>
                    updateLocatorLoopBuilderAction(locatorLoopCreateModalTarget.phase, locatorLoopCreateModalTarget.actionId, {
                      locatorType: event.target.value as "css" | "xpath",
                    })
                  }
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="xpath">XPath</option>
                  <option value="css">CSS</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Locator value
                <textarea
                  value={locatorLoopCreateModalAction.locatorValue}
                  onChange={(event) =>
                    updateLocatorLoopBuilderAction(locatorLoopCreateModalTarget.phase, locatorLoopCreateModalTarget.actionId, {
                      locatorValue: event.target.value,
                    })
                  }
                  placeholder={locatorLoopCreateModalAction.locatorType === "xpath" ? "//button[@type='button']/div/div" : "button[type='button'] > div > div"}
                  className="min-h-24 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100">
                Preview: set {cleanLogicVariableName(locatorLoopCreateModalAction.locatorVariable, "locator")} ={" "}
                {logicStringLiteral(textValue(locatorLoopCreateModalAction.locatorValue) || "locator")}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLocatorLoopCreateModalOpen(false);
                    if (!textValue(locatorLoopCreateModalAction.locatorValue)) {
                      updateLocatorLoopBuilderAction(locatorLoopCreateModalTarget.phase, locatorLoopCreateModalTarget.actionId, {
                        createLocatorVariable: false,
                      });
                    }
                    setLocatorLoopCreateModalTarget(null);
                  }}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateLocatorLoopBuilderAction(locatorLoopCreateModalTarget.phase, locatorLoopCreateModalTarget.actionId, {
                      createLocatorVariable: true,
                      locatorVariable: cleanLogicVariableName(locatorLoopCreateModalAction.locatorVariable, "locator"),
                    });
                    setLocatorLoopCreateModalOpen(false);
                    setLocatorLoopCreateModalTarget(null);
                  }}
                  disabled={
                    !cleanLogicVariableName(locatorLoopCreateModalAction.locatorVariable, "") ||
                    !textValue(locatorLoopCreateModalAction.locatorValue)
                  }
                  className="rounded-xl bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-50"
                >
                  Use variable
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {actionModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Create Action
            </h3>
            <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {actionModalSelectedSteps.length} selected command{actionModalSelectedSteps.length === 1 ? "" : "s"}
            </p>
            <div className="mt-4 grid gap-3">
              {actionModalError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                >
                  {actionModalError}
                </div>
              ) : null}
              <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Action name
                <input
                  autoFocus
                  value={actionName}
                  onChange={(event) => {
                    setActionName(event.target.value);
                    setActionModalError("");
                  }}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  placeholder="Action name"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Description
                <textarea
                  value={actionDescription}
                  onChange={(event) => setActionDescription(event.target.value)}
                  className="min-h-20 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  placeholder="Optional"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetActionModalState}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createAction()}
                  disabled={!actionModalSelectedSteps.length || !actionName.trim() || creatingAction}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creatingAction ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function recorderEventIdentity(event: RecorderEvent) {
  return event.id || `${event.type}-${event.timestamp}-${event.url}-${event.value}`;
}

function recorderEventTimestamp(event: RecorderEvent) {
  const timestamp = Number(event.timestamp ?? 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function recorderFillFieldKey(event: RecorderEvent) {
  if (event.type !== "input") return "";
  const element = event.element ?? {};
  const bestLocator = rankedLocators(event.locatorCandidates).find((candidate) => candidate.value);
  const locatorKey = bestLocator ? `${locatorType(bestLocator)}:${bestLocator.value}` : "";
  const fallbackKey = [
    element.id,
    element.name,
    element.labelText,
    element.placeholder,
    element.ariaLabel,
    element.title,
  ]
    .map((item) => textValue(item).trim())
    .find(Boolean);
  const pageKey = event.pageId || event.url || textValue(element.pageUrl);
  const fieldKey = locatorKey || fallbackKey;
  if (!fieldKey) return "";
  return [
    pageKey,
    textValue(element.tag || element.elementKind || "field").toLowerCase(),
    textValue(element.inputType).toLowerCase(),
    fieldKey,
  ].join("|");
}

function isRecorderCommandBoundary(event: RecorderEvent) {
  if (event.type === "input" || event.type === "switchPage") return false;
  return ["click", "navigation", "press", "assert", "wait", "select", "change"].includes(event.type);
}

function mergeRecorderEvents(events: RecorderEvent[]) {
  const seen = new Set<string>();
  const orderedEvents = events
    .map((event, index) => ({ event, index, timestamp: recorderEventTimestamp(event) }))
    .filter((item) => {
      const id = recorderEventIdentity(item.event);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((left, right) => {
      if (left.timestamp && right.timestamp && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      return left.index - right.index;
    });
  const merged: Array<RecorderEvent | null> = [];
  const openFillIndexes = new Map<string, number>();
  const openFillTimestamps = new Map<string, number>();

  for (const { event, timestamp } of orderedEvents) {
    const fillFieldKey = recorderFillFieldKey(event);
    if (fillFieldKey) {
      const previousIndex = openFillIndexes.get(fillFieldKey);
      const previousTimestamp = openFillTimestamps.get(fillFieldKey) ?? 0;
      if (previousIndex !== undefined && previousTimestamp > timestamp && timestamp > 0) {
        continue;
      }
      if (previousIndex !== undefined) {
        merged[previousIndex] = null;
      }
      openFillIndexes.set(fillFieldKey, merged.length);
      openFillTimestamps.set(fillFieldKey, timestamp);
      merged.push(event);
      continue;
    }

    if (isRecorderCommandBoundary(event)) {
      openFillIndexes.clear();
      openFillTimestamps.clear();
    }
    merged.push(event);
  }

  return merged.filter(Boolean) as RecorderEvent[];
}
