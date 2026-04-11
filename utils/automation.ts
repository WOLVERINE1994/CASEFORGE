import type {
  AutomationBinding,
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationProvider,
  AutomationScript,
  AutomationStep,
} from "./workspace";

export const automationProviderLabels: Record<AutomationProvider, string> = {
  playwright: "Playwright",
  cypress: "Cypress",
  api: "API",
  mobile: "Mobile",
};

export const normalizeAutomationRuntimeProvider = (
  value: unknown
): AutomationProvider => {
  switch (value) {
    case "playwright":
    case "cypress":
    case "api":
    case "mobile":
      return value;
    default:
      return "playwright";
  }
};

export const getAutomationScriptById = (
  scripts: AutomationScript[] | undefined,
  scriptId: string | undefined
) => scripts?.find((script) => script.id === scriptId) ?? null;

export const getAutomationStepsForScript = (
  automationSteps: Record<string, AutomationStep[]> | undefined,
  scriptId: string | undefined
) =>
  scriptId
    ? [...(automationSteps?.[scriptId] ?? [])].sort((left, right) => left.order - right.order)
    : [];

export const getAutomationBindingForCase = (
  bindings: AutomationBinding[] | undefined,
  caseId: string
) => bindings?.find((binding) => binding.testCaseId === caseId) ?? null;

export const getAutomationExecutionsForCase = (
  executions: AutomationExecution[] | undefined,
  caseId: string
) =>
  (executions ?? [])
    .filter((execution) => execution.caseId === caseId)
    .sort((left, right) => right.startedAt - left.startedAt);

export const getAutomationArtifactsForExecution = (
  artifacts: AutomationExecutionArtifact[] | undefined,
  executionId: string
) => (artifacts ?? []).filter((artifact) => artifact.executionId === executionId);
