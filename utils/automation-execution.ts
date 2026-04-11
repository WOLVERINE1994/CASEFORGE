import { randomUUID } from "crypto";
import {
  ensureAutomationOutputDir,
  writeAutomationLogArtifact,
} from "./automation-artifacts";
import { PlaywrightAdapter } from "./automation-playwright";
import type {
  AutomationExecutionContext,
  AutomationProviderAdapter,
} from "./automation-provider";
import type {
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationProvider,
  AutomationScript,
  AutomationStep,
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

export const validateAutomationScript = (
  provider: AutomationProvider,
  steps: AutomationStep[]
) => getAutomationAdapter(provider).validate(steps);

export const executeAutomationScript = async ({
  projectId,
  projectKey,
  runId,
  caseId,
  script,
  steps,
}: {
  projectId: string;
  projectKey?: string;
  runId: string;
  caseId: string;
  script: AutomationScript;
  steps: AutomationStep[];
}) => {
  const executionId = randomUUID();
  const outputDir = await ensureAutomationOutputDir(projectId, runId, executionId);
  const context: AutomationExecutionContext = {
    projectId,
    projectKey,
    runId,
    caseId,
    executionId,
    outputDir,
  };

  const adapter = getAutomationAdapter(script.provider);
  const startedAt = Date.now();
  const result = await adapter.execute(steps, context);

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

  const execution: AutomationExecution = {
    id: executionId,
    runId,
    caseId,
    scriptId: script.id,
    provider: script.provider,
    status: result.status,
    startedAt,
    finishedAt: Date.now(),
    logSummary: result.logs.slice(-5).join("\n"),
    failureMessage: result.failureMessage,
    artifactIds: artifacts.map((artifact) => artifact.id),
  };

  return {
    execution,
    artifacts,
    logs: result.logs,
  };
};
