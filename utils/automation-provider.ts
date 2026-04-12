import type {
  AutomationExecutionMode,
  AutomationExecutionArtifact,
  AutomationExecutionStatus,
  AutomationProvider,
  AutomationStep,
} from "./workspace";

export type AutomationExecutionContext = {
  projectId: string;
  projectKey?: string;
  runId: string;
  caseId: string;
  executionId: string;
  outputDir: string;
  executionMode: AutomationExecutionMode;
};

export type AutomationValidationResult = {
  valid: boolean;
  errors: string[];
};

export type AutomationExecutionArtifactDraft = Omit<
  AutomationExecutionArtifact,
  "executionId"
>;

export type AutomationExecutionResult = {
  status: AutomationExecutionStatus;
  logs: string[];
  failureMessage?: string;
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
