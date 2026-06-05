"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from "react";

import type {
  AutomationLocatorCandidate,
  AutomationScenario,
  AutomationStep,
} from "./AutomationScenariosClient";

type Props = {
  projectKey: string;
  scenarioId: string;
};

type RecorderEvent = {
  id: string;
  type: string;
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

type BrokerSessionMetadata = {
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
};

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
  };
}

type CompanionCommand = {
  id?: string;
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
  url?: string;
  key?: string;
  meta?: Record<string, unknown>;
};

type CompanionBrowserResponse = {
  error?: string;
  started?: boolean;
  stopped?: boolean;
  sessionId?: string;
  status?: "starting" | "recording" | "stopping" | "stopped" | "failed";
  cursor?: number;
  url?: string;
  commands?: CompanionCommand[];
  logs?: string[];
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

type ScenarioParameter = {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "secret" | "enum";
  defaultValue?: string;
  required?: boolean;
};

type ScenarioTestCase = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  data: Record<string, string>;
};

type RunBrowserMode = "headed" | "headless";

type RunDeviceKey = "desktop" | "mobile" | "tablet" | "custom";

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
};

type RunConfig = {
  browserMode: RunBrowserMode;
  customHeight: number;
  customWidth: number;
  device: RunDeviceKey;
  environments: RunEnvironmentDraft[];
};

const localAgentUrl =
  process.env.NEXT_PUBLIC_AUTOMATION_LOCAL_AGENT_URL || "http://127.0.0.1:4873";
const companionVersion = "0.1.5";
const companionDownloadUrl =
  process.env.NEXT_PUBLIC_COMPANION_DOWNLOAD_URL ||
  `https://github.com/WOLVERINE1994/CASEFORGE/releases/download/caseforge-companion-v${companionVersion}/CaseForge-Companion-Setup-${companionVersion}.exe`;
const privateConnectorEnabled =
  process.env.NEXT_PUBLIC_AUTOMATION_PRIVATE_CONNECTOR_ENABLED === "true";
const legacyDesktopBridgeEnabled =
  process.env.NEXT_PUBLIC_AUTOMATION_LOCAL_CONNECTOR_ENABLED !== "false";

const commandActions = ["navigate", "switchPage", "click", "fill", "select", "hover", "assert", "wait", "action"];
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
    description: "1440 x 900",
    key: "desktop",
    label: "Desktop",
    viewport: { height: 900, width: 1440 },
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
  return Boolean(
    localAgentUrl &&
      legacyDesktopBridgeEnabled &&
      (!isBrowserOnLocalCaseForge() || shouldUsePrivateConnector(url)),
  );
}

function isUsableBrokerSession(
  session?: BrokerSessionMetadata | null,
): session is BrokerSessionMetadata & { sessionId: string } {
  if (!session?.sessionId) return false;
  return !["broken", "closed", "failed", "terminated", "terminating"].includes(
    session.status || "",
  );
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
  if (action === "goto") return "navigate";
  if (action === "waitForElement" || action === "waitForTimeout") return "wait";
  return action;
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
  if (!["fill", "select", "type"].includes(action)) return "";
  if (!textValue(step.inputValue)) return "";
  if (isSecretInputStep(step)) return "******";
  return compactStepValue(step.inputValue);
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
  if (action === "fill") {
    const value = visibleStepInputValue(step);
    return value ? `Fill ${targetName} with "${value}"` : `Fill ${targetName}`;
  }
  if (action === "select") return `Select ${step.inputValue || "option"} in ${targetName}`;
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
  if (["click", "fill", "select", "hover", "assert"].includes(action) && !targetValue) {
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

function navigationUrlForStep(step: AutomationStep) {
  if (displayAction(step.action) !== "navigate") return null;
  const value = step.inputValue || step.target?.value;
  if (!value) return null;
  return normalizeUrl(value);
}

function lastNavigationUrl(steps: AutomationStep[]) {
  for (const step of [...steps].reverse()) {
    const url = navigationUrlForStep(step);
    if (url) return url;
  }
  return null;
}

function firstNavigationUrl(steps: AutomationStep[]) {
  for (const step of steps) {
    const url = navigationUrlForStep(step);
    if (url) return url;
  }
  return null;
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
    return normalizeUrl(rawValue.replaceAll("{{baseUrl}}", environmentBaseUrl.replace(/\/$/, "")));
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
          pageId: event.pageId || textValue(event.element?.pageId),
          pageUrl: eventUrl,
        }
      : {
          healed: false,
          healedLocator: null,
          healingReason: "",
          pageId: event.pageId || textValue(event.element?.pageId),
          pageUrl: eventUrl,
        };
  const base = {
    element: event.element,
    id: event.id || makeStepId(),
    locatorCandidates: rankedLocators(event.locatorCandidates),
    options: baseOptions,
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
    const step = {
      ...base,
      action: "fill",
      description: `Enter ${event.value || "text"} in ${targetName}`,
      inputValue: event.value || "",
    };
    return withLocatorQuality({ ...step, commandText: readableStepLabel(step) });
  }
  if (event.type === "select" || event.type === "change") {
    const step = {
      ...base,
      action: "select",
      description: `Select ${event.value || "option"} in ${targetName}`,
      inputValue: event.value || "",
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
            : action;
  if (!["navigation", "switchPage", "input", "select", "click", "assert", "wait", "press"].includes(type)) {
    return null;
  }
  const url =
    typeof data.pageUrl === "string"
      ? data.pageUrl
      : typeof data.frameUrl === "string"
        ? data.frameUrl
        : undefined;
  const value = typeof data.value === "string" ? data.value : undefined;
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

  if (commandType === "navigate" && recordedUrl) {
    return {
      id: command.id || makeStepId(),
      timestamp: Date.now(),
      type: "navigation",
      url: recordedUrl,
    };
  }

  if (commandType === "fill") {
    return {
      commandLabel: command.description || command.name,
      element,
      id: command.id || makeStepId(),
      locatorCandidates,
      timestamp: Date.now(),
      type: "input",
      url: recordedUrl,
      value,
    };
  }

  if (commandType === "select") {
    return {
      commandLabel: command.description || command.name,
      element,
      id: command.id || makeStepId(),
      locatorCandidates,
      timestamp: Date.now(),
      type: "select",
      url: recordedUrl,
      value,
    };
  }

  if (commandType === "press") {
    return {
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

function exactParameterNameFromText(value?: string) {
  const match = textValue(value).match(/^\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}$/);
  return match?.[1] ?? "";
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
        id: typeof record.id === "string" ? record.id : makeTestCaseId(),
        name: textValue(record.name) || `Test Case ${index + 1}`,
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
      },
    ];
  });
  return { parameters, testCases };
}

function substituteTemplate(value: string | undefined, data: Record<string, string>) {
  return String(value ?? "").replace(/\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g, (_match, name: string) =>
    data[name] ?? "",
  );
}

function substituteUnknown(value: unknown, data: Record<string, string>): unknown {
  if (typeof value === "string") return substituteTemplate(value, data);
  if (Array.isArray(value)) return value.map((item) => substituteUnknown(item, data));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        substituteUnknown(item, data),
      ]),
    );
  }
  return value;
}

function substituteStepParameters(step: AutomationStep, data: Record<string, string>): AutomationStep {
  return {
    ...step,
    commandText: substituteTemplate(step.commandText, data),
    description: substituteTemplate(step.description, data),
    expectedValue: substituteTemplate(step.expectedValue, data),
    inputValue: substituteTemplate(step.inputValue, data),
    locatorCandidates: Array.isArray(step.locatorCandidates)
      ? step.locatorCandidates.map((candidate) => ({
          ...candidate,
          value: substituteTemplate(candidate.value, data),
        }))
      : step.locatorCandidates,
    options: substituteUnknown(step.options ?? {}, data) as Record<string, unknown>,
    target: substituteUnknown(step.target, data) as AutomationStep["target"],
  };
}

function substituteStepsParameters(steps: AutomationStep[], data: Record<string, string>) {
  return steps.map((step) => substituteStepParameters(step, data));
}

async function readJsonResponse<T>(response: Response, fallback: T): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      throw new Error(
        `Empty response from ${new URL(response.url).pathname || "request"} (${response.status}).`,
      );
    }
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Invalid response from ${new URL(response.url).pathname || "request"} (${response.status}).`,
    );
  }
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
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [providerEventCaptureAfter, setProviderEventCaptureAfter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "paused" | "failed" | "completed">("idle");
  const [failedStepResult, setFailedStepResult] = useState<StepExecutionResult | null>(null);
  const [commandRunStates, setCommandRunStates] = useState<Record<string, CommandRunState>>({});
  const [events, setEvents] = useState<RecorderEvent[]>([]);
  const [logs, setLogs] = useState<string[]>(["Studio ready"]);
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
  const [runConfig, setRunConfig] = useState<RunConfig>(() =>
    defaultRunConfig(targetUrl),
  );
  const [testDataOpen, setTestDataOpen] = useState(false);
  const [testDataSaving, setTestDataSaving] = useState(false);
  const [testDataError, setTestDataError] = useState("");
  const [parameterDrafts, setParameterDrafts] = useState<ScenarioParameter[]>([]);
  const [testCaseDrafts, setTestCaseDrafts] = useState<ScenarioTestCase[]>([]);
  const targetInitializedForScenario = useRef<string | null>(null);
  const companionCursorRef = useRef(0);
  const ignoredRecorderStepIdsRef = useRef<Set<string>>(new Set());
  const timelineStepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const actionCommandRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scenarioName = scenario?.name || "Untitled Scenario";
  const scenarioMetadata = useMemo(() => scenarioMetadataRecord(scenario), [scenario]);
  const finalizedSteps = useMemo(() => normalizeSteps(scenario?.steps), [scenario?.steps]);
  const liveSteps = useMemo(
    () => events.map(eventToStep).filter(Boolean) as AutomationStep[],
    [events],
  );
  const visibleSteps = useMemo(
    () => mergeStepsById([...finalizedSteps, ...liveSteps]),
    [finalizedSteps, liveSteps],
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
  const selectedStepQuality = selectedStep ? locatorQualityForStep(selectedStep) : null;
  const selectedStepAction = selectedStep ? displayAction(selectedStep.action) : "";
  const selectedStepParameterName = selectedStep ? exactParameterNameFromText(selectedStep.inputValue) : "";
  const selectedStepParameterPreviewData = dataForTestCase(
    enabledTestCases[0] ?? scenarioTestCases[0] ?? null,
    scenarioParameters,
  );
  const selectedStepParameterPreview =
    selectedStepParameterName && scenarioParameters.some((parameter) => parameter.name === selectedStepParameterName)
      ? selectedStepParameterPreviewData[selectedStepParameterName] ?? ""
      : "";
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
  const recordingActive = recording;
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
    if (!scenario || targetInitializedForScenario.current === scenarioId) return;
    targetInitializedForScenario.current = scenarioId;
    const savedUrl = lastNavigationUrl(finalizedSteps);
    if (savedUrl) setTargetUrl(savedUrl);
  }, [finalizedSteps, scenario, scenarioId]);

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
              id: makeTestCaseId(),
              name: "Test Case 1",
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
      setSession(null);
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
    [appendLog, session?.sessionId],
  );

  const setSessionRecorderMode = async (sessionId: string, mode: "off" | "record" | "verify") => {
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
      const url = normalizeUrl(targetUrl);
      if (shouldUseLegacyDesktopBridge(url)) {
        appendLog("Verify picker is available in the Playwright browser session.");
        return;
      }
      const activeSession = isUsableBrokerSession(session) ? session : await createSession(url);
      if (!activeSession.sessionId) throw new Error("Browser session was not created.");
      setProviderEventCaptureAfter(new Date().toISOString());
      setRecordingSessionId(activeSession.sessionId);
      setVerifyPicking(true);
      await setSessionRecorderMode(activeSession.sessionId, "verify");
      appendLog("Verify mode started. Move over the browser, then click the element to verify.");
    } catch (error) {
      setVerifyPicking(false);
      appendLog(error instanceof Error ? error.message : "Could not start verify mode.");
    } finally {
      setBusy(false);
    }
  };

  const cancelVerifyCapture = async () => {
    const sessionId = recordingSessionId || session?.sessionId;
    setVerifyPicking(false);
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
      const navigateStep = makeNavigateStep(url);
      if (!visibleSteps.some((step) => step.action === "navigate" && step.target.value === url)) {
        void persistSteps([...finalizedSteps, navigateStep]);
      }
      if (!shouldUseLegacyDesktopBridge(url)) {
        if (session?.sessionId) {
          await closeSession("Previous browser session closed.");
        }
        await createSession(url);
        return;
      }
      const data = await companionBrowserRequest({
        body: JSON.stringify({
          action: "start",
          httpCredentials: authFromUrl(targetUrl),
          scenarioId,
          startUrl: url,
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
          if (session?.sessionId && session.sessionId === recordingSessionId) {
            await setSessionRecorderMode(session.sessionId, "off").catch(() => undefined);
            recordedEvents = mergeRecorderEvents([
              ...recordedEvents,
              ...(await fetchSessionRecorderEvents(session.sessionId)),
            ]);
          }
          const recordedSteps = recordedEvents.map(eventToStep).filter(Boolean) as AutomationStep[];
          const nextSteps = mergeStepsById([...finalizedSteps, ...recordedSteps]);
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
          await closeSession(
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
        const activeSession = isUsableBrokerSession(session) ? session : await createSession();
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
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!data.sessionId) {
          throw new Error(data.error || "CaseForge Companion did not return a browser session.");
        }
        companionCursorRef.current = data.cursor ?? 0;
        setRecordingSessionId(data.sessionId);
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
      const nextSteps = mergeStepsById([...finalizedSteps, ...recordedSteps]);
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
        : readableStepLabel(nextCommandRaw);
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
            : readableStepLabel(nextStep);
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
            : readableStepLabel(nextStep);
        return withLocatorQuality({ ...nextStep, commandText });
      }),
    );
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

  const openRunModal = () => openRuntimeModal("run");

  const openRecordModal = () => openRuntimeModal("record");

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
      const navigateStep = makeNavigateStep(url);
      if (!visibleSteps.some((step) => step.action === "navigate" && step.target.value === url)) {
        void persistSteps([...finalizedSteps, navigateStep]);
      }
      if (session?.sessionId) {
        await closeSession("Previous browser session closed.");
      }
      setRecording(true);
      setRecordingPaused(false);
      ignoredRecorderStepIdsRef.current = new Set();
      appendLog(`Opening recorder at ${url}`);
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
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      appendLog(error instanceof Error ? error.message : "Could not start recording.");
    } finally {
      setBusy(false);
    }
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
    const estimatedHeight = isAction ? 360 : 330;
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
    try {
      setLocatorTestResult("Testing locator...");
      const response = await fetch(
        `/api/automation/sessions/${encodeURIComponent(session.sessionId)}/test-locator`,
        {
          body: JSON.stringify({
            locatorType: selectedStep.target?.locatorType || "css",
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
      if (!response.ok) throw new Error(data.error || "Could not test locator.");
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
        return;
      }
      if (terminalEvent?.type === "run:failed") {
        setRunStatus("failed");
        const error =
          typeof terminalEvent.data?.error === "string"
            ? terminalEvent.data.error
            : "Replay failed before recording could resume.";
        throw new Error(error);
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error("Replay timed out before recording could resume.");
  }, [appendLog]);

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
    startUrl?: string;
    summarySteps: AutomationStep[];
    testCase?: ScenarioTestCase | null;
    viewport?: RunViewport | null;
  }) => {
    const summaryParameterData = { ...(input.parameterData ?? {}) };
    if ("basicAuthPassword" in summaryParameterData) {
      summaryParameterData.basicAuthPassword = "***";
    }
    if (input.forceNewSession && session?.sessionId) {
      await closeSession("Previous run session closed.");
    }
    const activeSession = !input.forceNewSession && isUsableBrokerSession(session)
      ? session
      : await createSession(sessionStartUrlForRun(input.runSteps, input.startUrl), {
          browserMode: input.browserMode,
          environment: input.environment,
          viewport: input.viewport,
        });
    if (!activeSession.sessionId) {
      throw new Error("Browser session was not created.");
    }
    setRunStatus("running");
    setFailedStepResult(null);
    const keepSessionOpen = input.keepSessionOpen ?? !input.closeOnComplete;
    const response = await fetch(`/api/automation/projects/${encodeURIComponent(projectKey)}/runs`, {
      body: JSON.stringify({
        scenarioId,
        sessionId: activeSession.sessionId,
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
            type: "automation-execution-service",
          },
        },
        status: "queued",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = await readJsonResponse<{ error?: string; run?: { id: string } }>(response, {});
    if (!response.ok || !data.run) throw new Error(data.error || "Could not queue run.");
    const runResponse = await fetch(
      `/api/automation/sessions/${encodeURIComponent(activeSession.sessionId)}/run`,
      {
        body: JSON.stringify({
          actionId:
            input.actionId ??
            (input.summarySteps.length === 1 && input.summarySteps[0]?.action === "action"
              ? input.summarySteps[0].target?.value
              : undefined),
          closeOnComplete: input.closeOnComplete,
          executionMode: keepSessionOpen ? "interactive_persistent" : "ephemeral_ci",
          keepSessionOpen,
          parameterData: input.parameterData ?? {},
          runId: data.run.id,
          steps: input.runSteps,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const runData = await readJsonResponse<{
      code?: string;
      error?: string;
      result?: { status?: string };
    }>(runResponse, {});
    if (!runResponse.ok) {
      throw new Error(
        runData.code === "SESSION_BUSY"
          ? "Session is already running another action. Wait for it to finish, then run again."
          : runData.error || "Could not start run.",
      );
    }
    appendLog(
      `Worker accepted ${input.runSteps.length} command${
        input.runSteps.length === 1 ? "" : "s"
      } for ${input.name}.`,
    );
    let runPassed = false;
    let stepResults: StepExecutionResult[] = [];
    try {
      await waitForRunEvent(activeSession.sessionId, data.run.id);
      runPassed = true;
      setRunStatus("completed");
    } catch (error) {
      await appendRunFailures(activeSession.sessionId, data.run.id);
      setRunStatus("failed");
      throw error;
    } finally {
      const refreshed = await fetch(`/api/automation/sessions/${encodeURIComponent(activeSession.sessionId)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          const refreshedData = await readJsonResponse<{ sessionMetadata?: BrokerSessionMetadata }>(
            response,
            {},
          );
          return response.ok
            ? normalizeBrokerSessionMetadata(refreshedData.sessionMetadata, activeSession.sessionId)
            : null;
        })
        .catch(() => null);
      if (refreshed) setSession(refreshed);
      const persistedHealingEvents = await persistRunHealingEvents(activeSession.sessionId, data.run.id);
      stepResults = await collectRunStepResults(activeSession.sessionId, data.run.id);
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
    await appendRunFailures(activeSession.sessionId, data.run.id);
    appendLog("Run completed. Session ready.");
    return { runId: data.run.id, sessionId: activeSession.sessionId, status: runData.result?.status || "started" };
  };

  const resumeRecording = async () => {
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
      const parameterizedReplaySteps = substituteStepsParameters(replaySteps, parameterData);
      const parameterizedResumeSteps = substituteStepsParameters(resumeSteps, parameterData);
      if (testCase) appendLog(`Using test data: ${testCase.name}.`);
      const resumeStartUrl =
        firstNavigationUrl(parameterizedReplaySteps) ||
        firstNavigationUrl(parameterizedResumeSteps) ||
        normalizeUrl(targetUrl);
      const resumeEndUrl =
        lastNavigationUrl(parameterizedReplaySteps) ||
        lastNavigationUrl(parameterizedResumeSteps) ||
        resumeStartUrl;
      setTargetUrl(resumeStartUrl);
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
      const latestSteps = await fetchLatestScenarioSteps();
      const runSteps = mergeStepsById([...finalizedSteps, ...liveSteps, ...latestSteps]);
      if (!runSteps.length) {
        appendLog("Add commands before running.");
        return;
      }
      const selectedActionStepIds = new Set(
        [...selectedActionCommandKeys].map((key) => key.split(":")[0]).filter(Boolean),
      );
      const hasExplicitRunSelection = selectedStepIds.size > 0 || selectedActionStepIds.size > 0;
      const scopedRunSteps = hasExplicitRunSelection
        ? runSteps.filter(
            (step, index) =>
              isScenarioInitStep(step, index) ||
              selectedStepIds.has(step.id) ||
              selectedActionStepIds.has(step.id),
          )
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
      const activeTestCases = runTestData.testCases;
      const runRows = activeTestCases.length
        ? activeTestCases
        : [null];
      const totalRuns = environments.length * runRows.length;
      appendLog(
        `Queued ${totalRuns} run${totalRuns === 1 ? "" : "s"} across ${environments.length} environment${
          environments.length === 1 ? "" : "s"
        } on ${deviceLabel}.`,
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
            substituteStepsParameters(executableSteps, parameterData),
            environment,
          );
          const parameterizedSummarySteps = applyRunEnvironmentToSteps(
            substituteStepsParameters(scopedRunSteps, parameterData),
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
            closeOnComplete: true,
            deviceLabel,
            environment,
            forceNewSession: true,
            name: runLabel,
            parameterData,
            runSteps: parameterizedExecutableSteps,
            startUrl:
              firstNavigationUrl(parameterizedExecutableSteps) ||
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
      setSession(null);
    } catch (error) {
      setSession(null);
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
      const latestSteps = await fetchLatestScenarioSteps();
      const setupSourceSteps = mergeStepsById([...finalizedSteps, ...liveSteps, ...latestSteps]);
      setRecording(false);
      setRecordingPaused(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      setEvents([]);
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
          const parameterizedActionSteps = substituteStepsParameters(actionSteps, parameterData);
          const parameterizedSetupSteps = substituteStepsParameters(setupSourceSteps, parameterData);
          const executableActionSteps = withScenarioInitSteps(parameterizedActionSteps, parameterizedSetupSteps);
          const parameterizedSummarySteps = substituteStepsParameters([runnableStep], parameterData);
          await startSessionRun({
            actionId: runnableStep.target?.value || null,
            closeOnComplete: false,
            keepSessionOpen: true,
            name: `${actionName} / ${testCase.name}`,
            parameterData,
            runSteps: executableActionSteps,
            startUrl: firstNavigationUrl(executableActionSteps) || normalizeUrl(targetUrl),
            summarySteps: parameterizedSummarySteps,
            testCase,
          });
        }
      } else {
        const parameterData = defaultParameterData(runTestData.parameters);
        const parameterizedActionSteps = substituteStepsParameters(actionSteps, parameterData);
        const parameterizedSetupSteps = substituteStepsParameters(setupSourceSteps, parameterData);
        const executableActionSteps = withScenarioInitSteps(parameterizedActionSteps, parameterizedSetupSteps);
        const parameterizedSummarySteps = substituteStepsParameters([runnableStep], parameterData);
        await startSessionRun({
          actionId: runnableStep.target?.value || null,
          closeOnComplete: false,
          keepSessionOpen: true,
          name: `${actionName} run`,
          parameterData,
          runSteps: executableActionSteps,
          startUrl: firstNavigationUrl(executableActionSteps) || normalizeUrl(targetUrl),
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run action.";
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
    try {
      if (!(await saveOpenCommandPromptDraft())) return;
      const runTestData = activeRunTestData();
      const runnableStep = currentStepForRun(step);
      const latestSteps = await fetchLatestScenarioSteps();
      const setupSourceSteps = mergeStepsById([...finalizedSteps, ...liveSteps, ...latestSteps]);
      setRecording(false);
      setRecordingPaused(false);
      setRecordingSessionId(null);
      setProviderEventCaptureAfter(null);
      setEvents([]);
      if (runnableStep.action === "action") {
        await runActionStep(runnableStep);
        return;
      }
      const commandContextSteps = timelineContextStepsForStep(runnableStep, setupSourceSteps);
      const commandRun = await expandActionSteps(commandContextSteps);
      const commandSteps = commandRun.steps;
      setCommandRunStates((current) => ({
        ...current,
        [runnableStep.id]: {
          message: "Queued",
          runId: null,
          status: "running",
          updatedAt: new Date().toISOString(),
        },
      }));
      const commandName = runnableStep.commandText || readableStepLabel(runnableStep);
      if (runTestData.testCases.length) {
        for (const testCase of runTestData.testCases) {
          const parameterData = dataForTestCase(testCase, runTestData.parameters);
          const parameterizedSteps = substituteStepsParameters(commandSteps, parameterData);
          const parameterizedSummarySteps = substituteStepsParameters([runnableStep], parameterData);
          const parameterizedSetupSteps = substituteStepsParameters(setupSourceSteps, parameterData);
          const executableSteps = withScenarioInitSteps(parameterizedSteps, parameterizedSetupSteps);
          await startSessionRun({
            closeOnComplete: false,
            keepSessionOpen: true,
            name: `${commandName} / ${testCase.name}`,
            parameterData,
            runSteps: executableSteps,
            startUrl: firstNavigationUrl(executableSteps) || normalizeUrl(targetUrl),
            summarySteps: parameterizedSummarySteps,
            testCase,
          });
        }
      } else {
        const parameterData = defaultParameterData(runTestData.parameters);
        const parameterizedSteps = substituteStepsParameters(commandSteps, parameterData);
        const parameterizedSummarySteps = substituteStepsParameters([runnableStep], parameterData);
        const parameterizedSetupSteps = substituteStepsParameters(setupSourceSteps, parameterData);
        const executableSteps = withScenarioInitSteps(parameterizedSteps, parameterizedSetupSteps);
        await startSessionRun({
          closeOnComplete: false,
          keepSessionOpen: true,
          name: `${commandName} run`,
          parameterData,
          runSteps: executableSteps,
          startUrl: firstNavigationUrl(executableSteps) || normalizeUrl(targetUrl),
          summarySteps: parameterizedSummarySteps,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run command.";
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
      const parameterizedRunSteps = substituteStepsParameters(expanded.steps, parameterData);
      const parameterizedSummarySteps = substituteStepsParameters(resumeSteps, parameterData);
      await startSessionRun({
        closeOnComplete: false,
        keepSessionOpen: true,
        name: `Resume from step ${startIndex + 1}`,
        parameterData,
        runSteps: parameterizedRunSteps,
        startUrl: firstNavigationUrl(parameterizedRunSteps) || normalizeUrl(targetUrl),
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
      if (shouldUseLegacyDesktopBridge(normalizeUrl(targetUrl))) {
        setRecordingPaused(nextPaused);
        appendLog(nextPaused ? "Companion sync paused." : "Companion sync resumed.");
        return;
      }
      await setSessionRecorderMode(sessionId, nextPaused ? "off" : "record");
      setRecordingPaused(nextPaused);
      appendLog(nextPaused ? "Recording paused." : "Recording resumed.");
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Could not update recording mode.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/automation/projects/${encodeURIComponent(projectKey)}/scenarios/${encodeURIComponent(scenarioId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = await readJsonResponse<{
          error?: string;
          scenario?: AutomationScenario;
        }>(response, {});
        if (!response.ok) throw new Error(data.error || "Could not load scenario.");
        if (!cancelled && data.scenario) {
          const cached = readDraftCache(projectKey, scenarioId);
          if (shouldUseCachedScenario(data.scenario, cached)) {
            setScenario(cached);
          } else {
            setScenario(data.scenario);
            clearDraftCache(projectKey, scenarioId);
          }
        }
      })
      .catch((error) => {
        const cached = readDraftCache(projectKey, scenarioId);
        if (!cancelled && cached) setScenario(cached);
        appendLog(error instanceof Error ? error.message : "Could not load scenario.");
      });

    return () => {
      cancelled = true;
    };
  }, [appendLog, projectKey, scenarioId]);

  useEffect(() => {
    if (
      !shouldUseLegacyDesktopBridge(normalizeUrl(targetUrl)) ||
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
          if (data.status === "stopped" || data.status === "failed") {
            setRecording(false);
          }
          const recorderEvents = companionCommandsToRecorderEvents(data.commands);
          if (recorderEvents.length) {
            setEvents((current) => mergeRecorderEvents([...current, ...recorderEvents]));
          }
          if (data.logs) setLogs(data.logs.slice(-50));
        })
        .catch(() => undefined);
    };
    poll();
    const intervalId = window.setInterval(poll, 1000);
    return () => window.clearInterval(intervalId);
  }, [recordingActive, recordingPaused, recordingSessionId, targetUrl]);

  useEffect(() => {
    if (shouldUseLegacyDesktopBridge(normalizeUrl(targetUrl)) || !session?.sessionId) return;
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
  }, [recording, session?.sessionId, targetUrl, verifyPicking]);

  useEffect(() => {
    const captureSessionId = recordingSessionId || session?.sessionId || "";
    if (
      shouldUseLegacyDesktopBridge(normalizeUrl(targetUrl)) ||
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
  }, [appendLog, providerEventCaptureAfter, recording, recordingSessionId, session?.sessionId, targetUrl, verifyPicking]);

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
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {visibleSteps.length} commands{selectedSteps.length ? ` | ${selectedSteps.length} selected` : ""}
            {recordingPaused ? " | paused" : ""}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end lg:max-w-4xl">
          <a
            href={companionDownloadUrl}
            className="rounded-lg border border-zinc-950 bg-zinc-950 px-3 py-1.5 text-center text-sm font-semibold text-white transition hover:bg-white hover:text-zinc-950 dark:border-zinc-950 dark:bg-zinc-950 dark:text-white dark:hover:bg-white dark:hover:text-zinc-950"
          >
            Download Companion
          </a>
          <button
            type="button"
            onClick={() => void (recordingActive ? toggleRecording() : openRecordModal())}
            disabled={busy || verifyPicking}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
              recordingActive ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {recordingActive ? "Stop" : "Record"}
          </button>
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

      <div className="grid min-h-[700px] min-w-0 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="grid min-h-[660px] min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden">
          <section className="relative min-w-0 overflow-hidden rounded-[16px] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <div className="ml-2 min-w-0 flex-1 truncate rounded-lg bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {targetUrl}
              </div>
              {session?.liveViewUrl ? (
                <a
                  href={session.liveViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                >
                  Pop out
                </a>
              ) : null}
            </div>
            <div className="h-full min-h-[560px] min-w-0 overflow-hidden bg-zinc-100 dark:bg-zinc-900">
              {session?.liveViewUrl ? (
                <iframe
                  src={session.liveViewUrl}
                  className="h-full min-h-[560px] w-full border-0 bg-white"
                  title="Automation browser live view"
                />
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
            {recordingActive || verifyPicking ? (
              <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-200 bg-white/95 px-2 py-1.5 text-xs font-semibold shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
                <button
                  type="button"
                  onClick={() => void toggleRecording()}
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
                  onClick={() => void (verifyPicking ? cancelVerifyCapture() : startVerifyCapture())}
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
                Test Data
                {enabledTestCases.length ? ` (${enabledTestCases.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => void resumeRecording()}
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

        <aside className="grid min-h-[660px] min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden">
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
                  Prompt
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
                </label>
                <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-3">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Action
                  <select
                    value={displayAction(selectedStep.action)}
                    onChange={(event) =>
                      updateStep(selectedStep.id, (step) => {
                        const action = event.target.value;
                        if (action === "wait") {
                          return {
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
                        }
                        return {
                          ...step,
                          action,
                        };
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {commandActions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                {["navigate", "fill", "select"].includes(selectedStepAction) ? (
                  <div className="min-w-0 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    <label>
                      {selectedStepAction === "navigate"
                        ? "URL"
                        : selectedStepAction === "select"
                          ? "Option"
                          : "Text"}
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
                                parameterName: nextParameterName || undefined,
                              },
                            };
                          })
                        }
                        className="mt-1 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                    </label>
                    {["fill", "select"].includes(selectedStepAction) ? (
                      <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                          Test data parameter
                          <select
                            value={selectedStepParameterName}
                            onChange={(event) => {
                              const parameterName = event.target.value;
                              updateStep(selectedStep.id, (step) => ({
                                ...step,
                                inputValue: parameterName ? parameterToken(parameterName) : "",
                                options: {
                                  ...step.options,
                                  parameterName: parameterName || undefined,
                                },
                              }));
                            }}
                            className="mt-1 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                          >
                            <option value="">Manual value</option>
                            {scenarioParameters.map((parameter) => (
                              <option key={parameter.id} value={parameter.name}>
                                {parameter.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedStepParameterName ? (
                          <p className="mt-1 min-w-0 break-words text-[11px] font-medium text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400">
                            Uses {parameterToken(selectedStepParameterName)}
                            {selectedStepParameterPreview ? ` -> ${selectedStepParameterPreview}` : ""}
                          </p>
                        ) : scenarioParameters.length ? (
                          <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            Pick a parameter to replace this value during run.
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            Add parameters in Test Data, then bind this command.
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
                          updateStep(selectedStep.id, (step) => ({
                            ...step,
                            options: { ...step.options, waitType: "soft" },
                            target: {
                              ...step.target,
                              displayName: step.target.displayName || "Element",
                              elementKind: "web element",
                              value: event.target.value,
                            },
                          }))
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
                <details
                  open={locatorDiagnosticsOpen}
                  onToggle={(event) => setLocatorDiagnosticsOpen(event.currentTarget.open)}
                  className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <summary className="cursor-pointer list-none rounded-lg px-1 py-0.5 text-xs font-semibold text-zinc-700 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-zinc-200 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                    Locator diagnostics
                  </summary>
                  <div className="mt-3 grid min-w-0 gap-3">
                <div className="min-w-0 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                    Custom locator
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <label className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
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
                    <label className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                      Value
                      <textarea
                        value={customLocatorValue}
                        onChange={(event) => setCustomLocatorValue(event.target.value)}
                        placeholder={
                          customLocatorType === "xpath"
                            ? "//button[contains(., 'Submit')]"
                            : "#submit-button"
                        }
                        className="mt-1 min-h-16 w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm leading-5 text-zinc-950 outline-none placeholder:text-zinc-400 dark:border-emerald-500/30 dark:bg-zinc-950 dark:text-zinc-50"
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
                onClick={() => setRunModalOpen(false)}
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
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setRunModalOpen(false)}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void (runModalMode === "record"
                    ? startRecordingFromConfig(runConfig)
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

      {testDataOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Test Data
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Use parameters like {"{{email}}"} in commands, then run this scenario once per enabled row.
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
                      Each enabled row becomes one scenario run.
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
                          id: makeTestCaseId(),
                          name: `Test Case ${current.length + 1}`,
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
                          Test Case
                        </th>
                        <th className="min-w-24 px-2 py-2 font-semibold">Run</th>
                        {parameterDrafts.map((parameter) => (
                          <th key={parameter.id} className="min-w-44 px-2 py-2 font-semibold">
                            {parameter.name}
                          </th>
                        ))}
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
                              Enabled
                            </label>
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
                {testDataSaving ? "Saving..." : "Save Test Data"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {locatorFlyout && locatorFlyoutStep && locatorFlyoutQuality ? (
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
