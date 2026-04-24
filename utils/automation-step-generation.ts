import type { AutomationStep, TestCaseRow } from "./workspace";

export type GeneratedAutomationIntent = {
  actionType: "navigate" | "click" | "fill" | "assert" | "wait";
  target: string;
  value?: string;
  expectedResult?: string;
  description?: string;
};

export type AutomationGenerationDomain = "ui" | "api" | "salesforce";

const normalizeTargetType = (
  domain: AutomationGenerationDomain,
  actionType: GeneratedAutomationIntent["actionType"],
  target: string
): AutomationStep["targetType"] => {
  if (actionType === "navigate") {
    return domain === "api" ? "endpoint" : "route";
  }
  if (actionType === "assert" && domain === "api") {
    return "text";
  }
  if (target.toLowerCase().includes("route")) {
    return "route";
  }
  return "selector";
};

const normalizeAction = (
  domain: AutomationGenerationDomain,
  intent: GeneratedAutomationIntent
): Pick<
  AutomationStep,
  | "action"
  | "targetType"
  | "targetValue"
  | "inputValue"
  | "expectedValue"
  | "metaJson"
> => {
  const targetType = normalizeTargetType(domain, intent.actionType, intent.target);

  switch (intent.actionType) {
    case "navigate":
      return {
        action: "goto",
        targetType,
        targetValue: intent.target,
        inputValue: "",
        expectedValue: intent.expectedResult ?? "",
        metaJson: {
          description: intent.description,
          expectedResult: intent.expectedResult,
        },
      };
    case "click":
      return {
        action: "click",
        targetType,
        targetValue: intent.target,
        inputValue: "",
        expectedValue: intent.expectedResult ?? "",
        metaJson: {
          description: intent.description,
          expectedResult: intent.expectedResult,
        },
      };
    case "fill":
      return {
        action: "fill",
        targetType,
        targetValue: intent.target,
        inputValue: intent.value ?? "",
        expectedValue: intent.expectedResult ?? "",
        metaJson: {
          description: intent.description,
          expectedResult: intent.expectedResult,
        },
      };
    case "wait":
      return {
        action: "wait-for",
        targetType,
        targetValue: intent.target,
        inputValue: "",
        expectedValue: intent.expectedResult ?? "",
        metaJson: {
          description: intent.description,
          expectedResult: intent.expectedResult,
        },
      };
    case "assert":
    default:
      return {
        action:
          domain === "api"
            ? "assert-text"
            : intent.expectedResult?.toLowerCase().includes("url")
            ? "assert-url"
            : "assert-visible",
        targetType,
        targetValue: intent.target,
        inputValue: "",
        expectedValue: intent.expectedResult ?? intent.value ?? "",
        metaJson: {
          description: intent.description,
          expectedResult: intent.expectedResult,
        },
      };
  }
};

export const inferAutomationGenerationDomain = (
  row: Pick<
    TestCaseRow,
    "type" | "testDomain" | "platformDomain" | "salesforceModule" | "salesforceObjectType"
  >
): AutomationGenerationDomain => {
  if (
    row.platformDomain === "salesforce" ||
    row.salesforceModule?.trim() ||
    row.salesforceObjectType?.trim()
  ) {
    return "salesforce";
  }

  const normalizedDomain = row.testDomain?.trim().toLowerCase();
  const normalizedType = row.type?.trim().toLowerCase();
  if (normalizedDomain === "api" || normalizedType === "api") {
    return "api";
  }

  return "ui";
};

export const mapGeneratedIntentsToAutomationSteps = ({
  intents,
  rowId,
  scriptId,
  domain,
}: {
  intents: GeneratedAutomationIntent[];
  rowId: string;
  scriptId?: string;
  domain: AutomationGenerationDomain;
}): AutomationStep[] =>
  intents.map((intent, index) => {
    const normalized = normalizeAction(domain, intent);
    return {
      id: crypto.randomUUID(),
      scriptId: scriptId ?? "",
      order: index,
      timeoutMs: 5000,
      ...normalized,
      metaJson: {
        ...normalized.metaJson,
        generatedFromCaseId: rowId,
        logicalTarget: intent.target,
      },
    };
  });
