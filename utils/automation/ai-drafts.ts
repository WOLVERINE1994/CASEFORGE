import { generateCaseForgeAiText } from "../ai/caseforge-ai";
import type {
  AutomationLocatorCandidate,
  AutomationLocatorStrategy,
  AutomationStep,
} from "./types";

export type ManualAutomationCase = {
  id: string;
  title: string;
  type?: string;
  preconditions?: string;
  steps: string;
  expectedResult: string;
  testData?: string;
};

export type GeneratedAutomationDraft = {
  sourceCaseId: string;
  name: string;
  description: string;
  confidence: number;
  warnings: string[];
  variables: Record<string, string>;
  steps: AutomationStep[];
};

export type AutomationDraftContext = {
  baseUrl?: string;
  environmentName?: string;
  startPage?: string;
  authMode?: string;
  usernameVariable?: string;
  passwordVariable?: string;
  testDataNotes?: string;
  validationGoals?: string;
  browserProfile?: string;
  runScope?: string;
  locatorStrategy?: string;
  cleanupNotes?: string;
  blockersAcknowledged?: boolean;
};

type AiLocatorCandidate = {
  strategy?: string;
  value?: string;
  score?: number;
};

type AiDraftStep = {
  action?: string;
  description?: string;
  commandText?: string;
  url?: string;
  locator?: string;
  locatorType?: string;
  text?: string;
  value?: string;
  option?: string;
  expectedText?: string;
  expectedValue?: string;
  matchType?: string;
  durationMs?: number;
  variableName?: string;
  locatorCandidates?: AiLocatorCandidate[];
};

type AiDraftScenario = {
  sourceCaseId?: string;
  name?: string;
  description?: string;
  confidence?: number;
  warnings?: string[];
  variables?: Record<string, string>;
  steps?: AiDraftStep[];
};

type AiDraftResponse = {
  scenarios?: AiDraftScenario[];
};

const SUPPORTED_ACTIONS = new Set([
  "navigate",
  "click",
  "fill",
  "type",
  "select",
  "assert",
  "assertText",
  "verifyPageText",
  "getText",
  "getElementCount",
  "compareValues",
  "wait",
  "logMessage",
]);

const LOCATOR_STRATEGIES = new Set<AutomationLocatorStrategy>([
  "role",
  "label",
  "text",
  "alt",
  "title",
  "testid",
  "placeholder",
  "css",
  "xpath",
]);

const splitManualSteps = (value: string) =>
  value
    .split(/\s*(?:;|\r?\n|\d+\.\s+)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);

const cleanText = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : fallback;

const clampConfidence = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 45;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const normalizeLocatorStrategy = (value: unknown): AutomationLocatorStrategy => {
  const normalized = cleanText(value, "css").toLowerCase() as AutomationLocatorStrategy;
  return LOCATOR_STRATEGIES.has(normalized) ? normalized : "css";
};

const inferLocatorType = (locator: string, locatorType?: string) => {
  if (locatorType) return normalizeLocatorStrategy(locatorType);
  if (locator.startsWith("//") || locator.startsWith("(//")) return "xpath";
  if (/^text=/i.test(locator)) return "text";
  return "css";
};

const textLocatorForIntent = (intent: string) => {
  const safe = intent.replace(/"/g, '\\"').slice(0, 120);
  return safe ? `text="${safe}"` : "";
};

const hasUrlProtocol = (value: string) => /^https?:\/\//i.test(value);

const normalizeUrlText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return trimmed;
    }
  }
};

const mergeBaseAndPath = (baseUrl: string, pathValue: string) => {
  const normalizedBase = normalizeUrlText(baseUrl);
  if (!normalizedBase) return pathValue.trim();
  const path = pathValue.trim();
  if (!path) return normalizedBase;
  if (hasUrlProtocol(path)) return normalizeUrlText(path);

  try {
    return new URL(path.startsWith("/") ? path : `/${path}`, normalizedBase).toString();
  } catch {
    return normalizedBase;
  }
};

const contextNavigateUrl = (context?: AutomationDraftContext) => {
  const baseUrl = cleanText(context?.baseUrl);
  if (!baseUrl) return "";
  const startPage = cleanText(context?.startPage);
  return mergeBaseAndPath(baseUrl, startPage);
};

const resolveNavigateUrl = (rawUrl: string, context?: AutomationDraftContext) => {
  const url = cleanText(rawUrl);
  const baseUrl = cleanText(context?.baseUrl);
  const defaultUrl = contextNavigateUrl(context);
  if (!url || url === "{{baseUrl}}") return defaultUrl || "{{baseUrl}}";
  if (url.includes("{{baseUrl}}")) {
    if (!baseUrl) return url;
    const mergedBase = mergeBaseAndPath(baseUrl, "");
    const normalizedBase = mergedBase.replace(/\/$/, "");
    return normalizeUrlText(
      url
        .replace(/^https?:\/\/\{\{baseUrl\}\}/i, normalizedBase)
        .replaceAll("{{baseUrl}}", normalizedBase),
    );
  }
  if (hasUrlProtocol(url)) return normalizeUrlText(url);
  if (baseUrl && (url.startsWith("/") || cleanText(context?.startPage))) {
    return mergeBaseAndPath(baseUrl, url);
  }
  return url;
};

const targetFor = (input: {
  displayName: string;
  elementKind?: string;
  locatorType?: string;
  type?: "smart" | "manual";
  value: string;
}) => ({
  displayName: input.displayName,
  elementKind: input.elementKind ?? "web element",
  locatorType: input.locatorType ?? inferLocatorType(input.value),
  operator: "equals",
  type: input.type ?? "manual",
  value: input.value,
});

const locatorCandidatesFor = (
  locator: string,
  locatorType: string,
  candidates: AiLocatorCandidate[] | undefined,
): AutomationLocatorCandidate[] => {
  const primary: AutomationLocatorCandidate[] = locator
    ? [
        {
          isUnique: false,
          rank: 0,
          score: 65,
          source: "ai-draft",
          strategy: normalizeLocatorStrategy(locatorType),
          value: locator,
        },
      ]
    : [];

  const extras = Array.isArray(candidates)
    ? candidates.flatMap((candidate, index): AutomationLocatorCandidate[] => {
        const value = cleanText(candidate.value);
        if (!value) return [];
        return [
          {
            isUnique: false,
            rank: index + 1,
            score: Math.max(1, Math.min(100, Number(candidate.score) || 50)),
            source: "ai-draft",
            strategy: normalizeLocatorStrategy(candidate.strategy),
            value,
          },
        ];
      })
    : [];

  return [...primary, ...extras].filter(
    (candidate, index, all) =>
      all.findIndex(
        (item) => item.strategy === candidate.strategy && item.value === candidate.value,
      ) === index,
  );
};

const normalizeAction = (value: unknown) => {
  const action = cleanText(value, "click");
  return SUPPORTED_ACTIONS.has(action) ? action : "click";
};

const makeStep = (
  raw: AiDraftStep,
  index: number,
  context?: AutomationDraftContext,
): AutomationStep => {
  const action = normalizeAction(raw.action);
  const description = cleanText(raw.description || raw.commandText, `${action} ${index + 1}`);
  const locator = cleanText(raw.locator);
  const locatorType = inferLocatorType(locator, raw.locatorType);
  const value = cleanText(raw.value || raw.text);
  const expectedText = cleanText(raw.expectedText || raw.expectedValue || raw.text || raw.value);
  const url = cleanText(raw.url || raw.value);
  const duration = Number(raw.durationMs);

  if (action === "navigate") {
    const targetUrl = resolveNavigateUrl(url, context);
    return {
      action,
      commandText: description || `Navigate to ${targetUrl}`,
      description: description || `Navigate to ${targetUrl}`,
      inputValue: targetUrl,
      locatorCandidates: [],
      options: { url: targetUrl },
      target: targetFor({
        displayName: targetUrl,
        elementKind: "browser",
        locatorType: "url",
        value: targetUrl,
      }),
    };
  }

  if (action === "wait") {
    const waitMs = Number.isFinite(duration) && duration > 0 ? duration : 1000;
    return {
      action,
      commandText: description || `Wait ${waitMs} ms`,
      description: description || `Wait ${waitMs} ms`,
      inputValue: String(waitMs),
      locatorCandidates: [],
      options: { duration: waitMs, waitType: "hard" },
      target: targetFor({ displayName: "Timer", elementKind: "timer", value: "" }),
    };
  }

  if (action === "verifyPageText") {
    return {
      action,
      commandText: description || `Verify page contains ${expectedText}`,
      description: description || `Verify page contains ${expectedText}`,
      expectedValue: expectedText,
      inputValue: expectedText,
      locatorCandidates: [],
      options: { expectedText, matchType: cleanText(raw.matchType, "contains") },
      target: targetFor({
        displayName: expectedText || "page text",
        elementKind: "page",
        locatorType: "text",
        value: expectedText,
      }),
    };
  }

  if (action === "logMessage") {
    const message = value || expectedText || description;
    return {
      action,
      commandText: description || `Log ${message}`,
      description: description || `Log ${message}`,
      inputValue: message,
      locatorCandidates: [],
      options: { message },
      target: targetFor({
        displayName: "Console",
        elementKind: "console",
        value: "",
      }),
    };
  }

  if (action === "compareValues") {
    return {
      action,
      commandText: description || "Compare values",
      description: description || "Compare values",
      expectedValue: expectedText,
      inputValue: value,
      locatorCandidates: [],
      options: {
        actual: value,
        caseSensitive: false,
        expected: expectedText,
        operator: cleanText(raw.matchType, "equals"),
        trimWhitespace: true,
      },
      target: targetFor({
        displayName: "Comparison",
        elementKind: "data",
        value: "",
      }),
    };
  }

  const targetLocator = locator || textLocatorForIntent(description);
  const targetDisplayName = description.replace(/^(click|fill|type|select|assert|get)\s+/i, "");
  const common = {
    action,
    commandText: description,
    description,
    locatorCandidates: locatorCandidatesFor(targetLocator, locatorType, raw.locatorCandidates),
    target: targetFor({
      displayName: targetDisplayName || "web element",
      locatorType,
      type: locator ? "manual" : "smart",
      value: targetLocator,
    }),
  } satisfies Partial<AutomationStep>;

  if (action === "fill" || action === "type") {
    return {
      ...common,
      action,
      inputValue: value,
      options: {
        clearBeforeType: action === "fill" ? true : undefined,
        locator: targetLocator,
        text: value,
      },
    } as AutomationStep;
  }

  if (action === "select") {
    const option = cleanText(raw.option || raw.value || raw.text);
    return {
      ...common,
      action,
      inputValue: option,
      options: { locator: targetLocator, option },
    } as AutomationStep;
  }

  if (action === "assertText") {
    return {
      ...common,
      action,
      assertionType: "text",
      expectedValue: expectedText,
      inputValue: expectedText,
      options: {
        expectedText,
        locator: targetLocator,
        matchType: cleanText(raw.matchType, "contains"),
      },
    } as AutomationStep;
  }

  if (action === "getText") {
    return {
      ...common,
      action,
      options: {
        locator: targetLocator,
        outputVariableName: cleanText(raw.variableName, "text"),
      },
    } as AutomationStep;
  }

  if (action === "getElementCount") {
    return {
      ...common,
      action,
      options: {
        locator: targetLocator,
        outputVariableName: cleanText(raw.variableName, "count"),
      },
    } as AutomationStep;
  }

  return {
    ...common,
    action,
    inputValue: value,
    options: { locator: targetLocator, scrollIntoView: true },
  } as AutomationStep;
};

const extractJson = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI response did not include JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as AiDraftResponse;
};

const fallbackDraftForCase = (
  manualCase: ManualAutomationCase,
  context?: AutomationDraftContext,
): GeneratedAutomationDraft => {
  const manualSteps = splitManualSteps(manualCase.steps);
  const steps: AutomationStep[] = manualSteps.map((step, index) => {
    const lower = step.toLowerCase();
    if (/\b(open|navigate|go to|launch|load)\b/.test(lower)) {
      return makeStep(
        {
          action: "navigate",
          description: step,
          url: /\bhttps?:\/\//i.test(step)
            ? step.match(/https?:\/\/\S+/i)?.[0]
            : contextNavigateUrl(context) || "{{baseUrl}}",
        },
        index,
        context,
      );
    }
    if (/\b(enter|type|fill|input)\b/.test(lower)) {
      return makeStep({ action: "fill", description: step, text: "" }, index, context);
    }
    if (/\b(select|choose)\b/.test(lower)) {
      return makeStep({ action: "select", description: step, option: "" }, index, context);
    }
    if (/\b(verify|validate|check|confirm|ensure)\b/.test(lower)) {
      return makeStep(
        {
          action: "verifyPageText",
          description: step,
          expectedText: manualCase.expectedResult,
        },
        index,
        context,
      );
    }
    return makeStep({ action: "click", description: step }, index, context);
  });

  if (!steps.some((step) => step.action === "verifyPageText" || step.action === "assertText")) {
    steps.push(
      makeStep(
        {
          action: "verifyPageText",
          description: `Verify expected result: ${manualCase.expectedResult}`,
          expectedText: manualCase.expectedResult,
        },
        steps.length,
        context,
      ),
    );
  }

  return {
    confidence: 38,
    description: `AI-assisted automation draft from manual case ${manualCase.id}. Review locators and data before running.`,
    name: manualCase.title || `Automation for ${manualCase.id}`,
    sourceCaseId: manualCase.id,
    steps,
    variables: {
      ...(context?.baseUrl?.trim() ? { baseUrl: normalizeUrlText(context.baseUrl.trim()) } : {}),
      ...(context?.usernameVariable?.trim() ? { [context.usernameVariable.trim()]: "" } : {}),
      ...(context?.passwordVariable?.trim() ? { [context.passwordVariable.trim()]: "" } : {}),
    },
    warnings: [
      "Fallback draft was created from manual step wording. Review locators and input values before running.",
      ...(!context?.baseUrl?.trim() ? ["Base URL is missing. Set {{baseUrl}} before running."] : []),
    ],
  };
};

const promptForCases = (
  manualCases: ManualAutomationCase[],
  requirement?: string,
  automationContext?: AutomationDraftContext,
) => `Convert these manual QA cases into editable CaseForge automation draft scenarios.

Return JSON only. Do not use markdown.

Allowed command actions:
- navigate: use url
- click: use locator, locatorType
- fill: use locator, locatorType, text
- type: use locator, locatorType, text
- select: use locator, locatorType, option
- assert: use locator, locatorType
- assertText: use locator, locatorType, expectedText, matchType
- verifyPageText: use expectedText, matchType
- getText: use locator, locatorType, variableName
- getElementCount: use locator, locatorType, variableName
- compareValues: use value, expectedValue, matchType
- wait: use durationMs
- logMessage: use text

Prefer reviewable CaseForge commands over code. Do not output Playwright, Selenium, JavaScript, or prose.
Use variables like {{baseUrl}}, {{email}}, {{password}} for reusable data.
Never guess the target URL. Use {{baseUrl}} for navigation and include a baseUrl variable from automation context when available.
If authMode is login-form, saved-session, sso, otp, or manual, create reviewable login/precondition steps and warnings instead of assuming credentials or bypassing auth.
Add validation steps for the expected result and the automation validation goals.
Add logMessage steps for important captured values or unresolved blockers.
Use loops/conditions only when the manual case or context clearly requires repeated rows, lists, responsive branches, or optional UI states.
Use CSS or XPath locator candidates when likely, but be honest: add warnings for weak locators.
Every scenario must include sourceCaseId matching the manual case id.

JSON shape:
{
  "scenarios": [
    {
      "sourceCaseId": "TC001",
      "name": "Scenario name",
      "description": "Short review note",
      "confidence": 0,
      "warnings": ["warning"],
      "variables": { "baseUrl": "" },
      "steps": [
        {
          "action": "navigate",
          "description": "Navigate to {{baseUrl}}",
          "url": "{{baseUrl}}"
        }
      ]
    }
  ]
}

Requirement context:
${requirement?.trim() || "No extra requirement context was provided."}

Automation setup context:
${JSON.stringify(automationContext ?? {}, null, 2)}

Manual cases:
${JSON.stringify(manualCases, null, 2)}`;

export async function generateAutomationDraftsFromManualCases(input: {
  automationContext?: AutomationDraftContext;
  manualCases: ManualAutomationCase[];
  requirement?: string;
}): Promise<{
  drafts: GeneratedAutomationDraft[];
  model: string;
  provider: string;
  usedFallback: boolean;
}> {
  const manualCases = input.manualCases.filter((manualCase) => manualCase.id && manualCase.title);
  if (!manualCases.length) {
    throw new Error("At least one manual case is required.");
  }

  let parsed: AiDraftResponse | null = null;
  let model = "";
  let provider = "";
  let usedFallback = false;

  try {
    const response = await generateCaseForgeAiText({
      messages: [
        {
          role: "system",
          content:
            "You are CaseForge's automation designer. Create structured, reviewable browser automation command drafts from manual QA scenarios.",
        },
        {
          role: "user",
          content: promptForCases(manualCases, input.requirement, input.automationContext),
        },
      ],
      temperature: 0.12,
    });
    model = response.model;
    provider = response.provider;
    parsed = extractJson(response.text);
  } catch (error) {
    usedFallback = true;
    parsed = null;
    if (!model) model = "fallback";
    if (!provider) provider = "caseforge";
    console.error("AI automation draft generation failed:", error);
  }

  const aiScenarios = Array.isArray(parsed?.scenarios) ? parsed?.scenarios ?? [] : [];
  const byCaseId = new Map(
    aiScenarios
      .filter((scenario) => cleanText(scenario.sourceCaseId))
      .map((scenario) => [cleanText(scenario.sourceCaseId), scenario]),
  );

  const drafts = manualCases.map((manualCase) => {
    const aiScenario = byCaseId.get(manualCase.id);
    if (!aiScenario) {
      usedFallback = true;
      return fallbackDraftForCase(manualCase, input.automationContext);
    }

    const aiSteps = Array.isArray(aiScenario.steps) ? aiScenario.steps : [];
    const steps = aiSteps.map((step, index) => makeStep(step, index, input.automationContext));
    if (!steps.length) {
      usedFallback = true;
      return fallbackDraftForCase(manualCase, input.automationContext);
    }

    return {
      confidence: clampConfidence(aiScenario.confidence),
      description:
        cleanText(aiScenario.description) ||
        `AI-generated automation draft from manual case ${manualCase.id}.`,
      name: cleanText(aiScenario.name, manualCase.title),
      sourceCaseId: manualCase.id,
      steps,
      variables:
        aiScenario.variables && typeof aiScenario.variables === "object"
          ? {
              ...Object.fromEntries(
                Object.entries(aiScenario.variables).map(([key, value]) => [
                  key,
                  typeof value === "string" ? value : String(value ?? ""),
                ]),
              ),
              ...(input.automationContext?.baseUrl?.trim()
                ? { baseUrl: normalizeUrlText(input.automationContext.baseUrl.trim()) }
                : {}),
            }
          : {
              ...(input.automationContext?.baseUrl?.trim()
                ? { baseUrl: normalizeUrlText(input.automationContext.baseUrl.trim()) }
                : {}),
            },
      warnings: Array.isArray(aiScenario.warnings)
        ? aiScenario.warnings.map((warning) => cleanText(warning)).filter(Boolean)
        : [],
    };
  });

  return { drafts, model, provider, usedFallback };
}
