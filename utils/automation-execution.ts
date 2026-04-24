import { randomUUID } from "crypto";
import {
  ensureAutomationOutputDir,
  writeAutomationLogArtifact,
} from "./automation-artifacts";
import { PlaywrightAdapter } from "./automation-playwright";
import { resolveAutomationSteps } from "./automation-reuse";
import type {
  AutomationExecutionContext,
  AutomationProviderAdapter,
} from "./automation-provider";
import type {
  AutomationExecutionEvent,
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationEnvironmentBinding,
  AutomationProvider,
  AutomationReusableBlock,
  AutomationSelectorPreset,
  AutomationScript,
  AutomationStep,
  AutomationValidationIssue,
  AutomationValidationResult,
} from "./workspace";

const getAutomationAdapter = (
  provider: AutomationProvider
): AutomationProviderAdapter => {
  switch (provider) {
    case "playwright":
      return new PlaywrightAdapter();
    default:
      throw new Error(
        `Automation provider "${provider}" is not implemented in this V1 build.`
      );
  }
};

const createIssueSignature = (issue: AutomationValidationIssue) =>
  [
    issue.code,
    issue.stepId ?? "",
    issue.stepIndex ?? "",
    issue.field ?? "",
    issue.message,
  ].join("|");

const dedupeIssues = (issues: AutomationValidationIssue[]) => {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const signature = createIssueSignature(issue);
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
};

const buildValidationResult = (
  issues: AutomationValidationIssue[]
): AutomationValidationResult => {
  const dedupedIssues = dedupeIssues(issues);
  const errors = dedupedIssues
    .filter((issue) => issue.severity !== "warning")
    .map((issue) => issue.message);

  return {
    valid: errors.length === 0,
    errors,
    issues: dedupedIssues,
  };
};

export const validateAutomationScript = (
  provider: AutomationProvider,
  steps: AutomationStep[]
) => getAutomationAdapter(provider).validate(steps);

export const validateAutomationDefinition = ({
  provider,
  script,
  steps,
  reusableBlocks = [],
  selectorPresets = [],
  environments = [],
}: {
  provider: AutomationProvider;
  script?: AutomationScript | null;
  steps: AutomationStep[];
  reusableBlocks?: AutomationReusableBlock[];
  selectorPresets?: AutomationSelectorPreset[];
  environments?: AutomationEnvironmentBinding[];
}): AutomationValidationResult => {
  const adapter = getAutomationAdapter(provider);
  const issues: AutomationValidationIssue[] = [];
  const selectorPresetIds = new Set(selectorPresets.map((preset) => preset.id));
  const reusableBlockMap = new Map(reusableBlocks.map((block) => [block.id, block] as const));

  const appendValidation = (validation: AutomationValidationResult) => {
    issues.push(...validation.issues);
  };

  appendValidation(adapter.validate(steps));

  steps.forEach((step, index) => {
    if (
      step.targetType === "selector-preset" &&
      !selectorPresetIds.has(step.selectorPresetId ?? step.targetValue ?? "")
    ) {
      issues.push({
        code: "automation.selector-preset.missing",
        message: `Step ${index + 1} references a selector preset that does not exist.`,
        stepId: step.id,
        stepIndex: index,
        field: "selectorPresetId",
        severity: "error",
      });
    }

    if (step.action === "run-block") {
      const blockId = step.sharedBlockId ?? step.targetValue ?? "";
      const block = reusableBlockMap.get(blockId);

      if (!block) {
        issues.push({
          code: "automation.shared-block.missing-reference",
          message: `Step ${index + 1} references a shared block that does not exist.`,
          stepId: step.id,
          stepIndex: index,
          field: "sharedBlockId",
          severity: "error",
        });
        return;
      }

      appendValidation(
        buildValidationResult(
          adapter.validate(block.steps).issues.map((issue) => ({
            ...issue,
            stepId: step.id,
            stepIndex: index,
            field: issue.field === "step" ? "sharedBlockId" : issue.field,
            code: `shared-block.${issue.code}`,
            message: `Step ${index + 1} uses shared block "${block.name}" with an invalid nested step: ${issue.message}`,
          }))
        )
      );
    }
  });

  if (script) {
    const { resolvedSteps, referenceMap } = resolveAutomationSteps({
      script,
      steps,
      reusableBlocks,
      selectorPresets,
      environments,
    });

    appendValidation(
      buildValidationResult(
        adapter.validate(resolvedSteps).issues.map((issue) => {
          if (!issue.stepId) {
            return issue;
          }

          const reference = referenceMap.get(issue.stepId);
          if (!reference) {
            return issue;
          }

          return {
            ...issue,
            stepId: reference.sourceStepId,
            field:
              reference.origin === "shared-block" && issue.field === "step"
                ? "sharedBlockId"
                : issue.field,
            code: `resolved.${issue.code}`,
            message:
              reference.origin === "shared-block"
                ? `Shared block "${reference.label}" has an invalid nested step: ${issue.message}`
                : issue.message,
          };
        })
      )
    );
  }

  return buildValidationResult(issues);
};

export const executeAutomationScript = async ({
  projectId,
  projectKey,
  runId,
  caseId,
  suiteId,
  suiteName,
  scenarioId,
  scenarioName,
  dataSetId,
  dataSetName,
  dataSetVariables,
  triggerType,
  scheduleId,
  scheduleName,
  script,
  steps,
  reusableBlocks,
  selectorPresets,
  environments,
  onExecutionEvent,
}: {
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
  triggerType?: "manual" | "scheduled";
  scheduleId?: string;
  scheduleName?: string;
  script: AutomationScript;
  steps: AutomationStep[];
  reusableBlocks?: AutomationReusableBlock[];
  selectorPresets?: AutomationSelectorPreset[];
  environments?: AutomationEnvironmentBinding[];
  onExecutionEvent?: (event: AutomationExecutionEvent) => void | Promise<void>;
}) => {
  const executionId = randomUUID();
  const outputDir = await ensureAutomationOutputDir(projectId, runId, executionId);
  const context: AutomationExecutionContext = {
    projectId,
    projectKey,
    runId,
    caseId,
    suiteId,
    suiteName,
    scenarioId,
    scenarioName,
    dataSetId,
    dataSetName,
    dataSetVariables,
    executionId,
      outputDir,
      executionMode: script.executionMode ?? "headless",
      onExecutionEvent,
    };

  const validation = validateAutomationDefinition({
    provider: script.provider,
    script,
    steps,
    reusableBlocks,
    selectorPresets,
    environments,
  });

  if (!validation.valid) {
    const activeEnvironment =
      environments?.find((environment) => environment.id === script.environmentBindingId) ??
      environments?.find((environment) => environment.isDefault) ??
      null;
    const execution: AutomationExecution = {
      id: executionId,
      runId,
      caseId,
      scriptId: script.id,
      suiteId,
      suiteName,
      scenarioId,
      scenarioName,
      dataSetId,
      dataSetName,
      dataSetVariables,
      environmentBindingId: script.environmentBindingId,
      environmentName: activeEnvironment?.name,
      provider: script.provider,
      executionMode: script.executionMode,
      triggerType,
      scheduleId,
      scheduleName,
      status: "blocked",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      logSummary: validation.errors.slice(0, 5).join("\n"),
      failureMessage: validation.errors[0],
      artifactIds: [],
      stepResults: [],
    };

    if (onExecutionEvent) {
      await onExecutionEvent({
        type: "execution_complete",
        timestamp: Date.now(),
        executionId,
        caseId,
        scenarioId,
        scenarioName,
        dataSetId,
        dataSetName,
        status: execution.status,
        failureMessage: execution.failureMessage,
        execution,
        artifacts: [],
      });
    }

    return {
      execution,
      artifacts: [] as AutomationExecutionArtifact[],
      logs: validation.errors,
      validation,
    };
  }

  const adapter = getAutomationAdapter(script.provider);
  const { resolvedSteps, referenceMap } = resolveAutomationSteps({
    script,
    steps,
    reusableBlocks: reusableBlocks ?? [],
    selectorPresets: selectorPresets ?? [],
    environments: environments ?? [],
  });
  const startedAt = Date.now();
  const result = await adapter.execute(resolvedSteps, context);

  const logPath = await writeAutomationLogArtifact(
    outputDir,
    "execution.log",
    result.logs.join("\n")
  );

  const artifacts: AutomationExecutionArtifact[] = [
    {
      id: `${executionId}-log`,
      executionId,
      type: "log",
      path: logPath,
      metadataJson: {
        lineCount: result.logs.length,
      },
    },
    ...result.artifacts.map((artifact) => ({
      ...artifact,
      executionId,
    })),
  ];

  const stepResults = result.stepResults.map((stepResult) => {
    const reference = referenceMap.get(stepResult.stepId);
    return {
      ...stepResult,
      sourceStepId: reference?.sourceStepId ?? stepResult.sourceStepId ?? stepResult.stepId,
      origin: reference?.origin ?? stepResult.origin,
      referenceId: reference?.referenceId ?? stepResult.referenceId,
      referenceLabel: reference?.label ?? stepResult.referenceLabel,
    };
  });

  const failureReference = result.failureStepId
    ? referenceMap.get(result.failureStepId)
    : undefined;
  const activeEnvironment =
    environments?.find((environment) => environment.id === script.environmentBindingId) ??
    environments?.find((environment) => environment.isDefault) ??
    null;

  const execution: AutomationExecution = {
    id: executionId,
    runId,
    caseId,
    scriptId: script.id,
    suiteId,
    suiteName,
    scenarioId,
    scenarioName,
    dataSetId,
    dataSetName,
    dataSetVariables,
    environmentBindingId: script.environmentBindingId,
    environmentName: activeEnvironment?.name,
    provider: script.provider,
    executionMode: script.executionMode,
    triggerType,
    scheduleId,
    scheduleName,
    status: result.status,
    startedAt,
    finishedAt: Date.now(),
    logSummary: result.logs.slice(-10).join("\n"),
    failureMessage: result.failureMessage,
    failureOrigin: failureReference?.origin,
    failureReferenceId: failureReference?.referenceId,
    stepResults,
    artifactIds: artifacts.map((artifact) => artifact.id),
  };

  return {
    execution,
    artifacts,
    logs: result.logs,
    validation,
  };
};
