import type {
  AutomationExecutionEvent,
  AutomationExecutionMode,
  AutomationExecutionArtifact,
  AutomationExecutionStatus,
  AutomationStepResult,
  AutomationValidationResult,
  AutomationProvider,
  AutomationStep,
} from "./workspace";

export type AutomationExecutionContext = {
  projectId: string;
  projectKey?: string;
  runId: string;
  caseId: string;
  suiteId?: string;
  suiteName?: string;
  scenarioId?: string;
  scenarioName?: string;
  dataSetId?: string;
  dataSetName?: string;
  dataSetVariables?: Record<string, string>;
  executionId: string;
  outputDir: string;
  executionMode: AutomationExecutionMode;
  onExecutionEvent?: (event: AutomationExecutionEvent) => void | Promise<void>;
};

export type AutomationExecutionArtifactDraft = Omit<
  AutomationExecutionArtifact,
  "executionId"
>;

export type AutomationExecutionResult = {
  status: AutomationExecutionStatus;
  logs: string[];
  failureMessage?: string;
  failureStepId?: string;
  stepResults: AutomationStepResult[];
  artifacts: AutomationExecutionArtifactDraft[];
};

export interface AutomationProviderAdapter {
  provider: AutomationProvider;
  validate(steps: AutomationStep[]): AutomationValidationResult;
  transformStepsToExecutable(steps: AutomationStep[]): unknown;
  execute(
    steps: AutomationStep[],
    context: AutomationExecutionContext
  ): Promise<AutomationExecutionResult>;
}
