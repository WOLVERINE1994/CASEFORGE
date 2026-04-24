import {
  executeAutomationScript,
  validateAutomationDefinition,
} from "../../../../utils/automation-execution";
import {
  applyDataSetToSteps,
  getAutomationScenarios,
  getAutomationSuites,
  getDefaultScenarioDataSet,
  getLinkedManualRowsForScenario,
  getScenarioById,
  getScenarioRuntimeScript,
  getScenarioSteps,
  getScenarioTestDataSets,
  getSuiteById,
} from "../../../../utils/automation-domain";
import {
  getAutomationBindingForCase,
  getAutomationScriptById,
} from "../../../../utils/automation";
import { readProjects, writeProjects } from "../../../../utils/project-store";
import type {
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationExecutionEvent,
  AutomationExecutionMode,
  AutomationScenario,
  Project,
  ScenarioTestDataSet,
  TestCaseExecutionResult,
  TestCaseRow,
} from "../../../../utils/workspace";

type ExecutionTarget = {
  scenario: AutomationScenario;
  dataSet: ScenarioTestDataSet | null;
  row: TestCaseRow | null;
  suiteId?: string;
  suiteName?: string;
};

type ParsedExecutionRequest = {
  projectRef: string;
  runId: string;
  caseId: string;
  scriptId?: string;
  scenarioId?: string;
  suiteId?: string;
  dataSetId?: string;
  runAllDataSets: boolean;
  executionMode?: AutomationExecutionMode;
  stream: boolean;
};

type RunExecutionTargetsResult = {
  storedExecutions: AutomationExecution[];
  storedArtifacts: AutomationExecutionArtifact[];
  allLogs: string[];
  validationError?: {
    error: string;
    validation: ReturnType<typeof validateAutomationDefinition>;
    scenarioId: string;
    dataSetId?: string;
  };
};

const buildStepOutcomeMaps = (execution: AutomationExecution) => {
  const nextRowStepResults: Record<string, TestCaseExecutionResult> =
    Object.fromEntries(
      (execution.stepResults ?? []).map((stepResult) => [
        stepResult.stepId,
        stepResult.status === "passed"
          ? "passed"
          : stepResult.status === "blocked"
            ? "blocked"
            : "failed",
      ])
    );
  const nextRowStepNotes = Object.fromEntries(
    (execution.stepResults ?? []).map((stepResult) => [
      stepResult.stepId,
      stepResult.failureReason || stepResult.message || "",
    ])
  );
  const nextRowStepActualResults = Object.fromEntries(
    (execution.stepResults ?? []).map((stepResult) => [
      stepResult.stepId,
      stepResult.referenceLabel
        ? `${stepResult.referenceLabel}: ${stepResult.message || stepResult.status}`
        : stepResult.message || stepResult.status,
    ])
  );

  return {
    nextRowStepResults,
    nextRowStepNotes,
    nextRowStepActualResults,
  };
};

const getProjectByRef = (projects: Project[], projectRef: string) =>
  projects.find(
    (entry) =>
      entry.id === projectRef ||
      entry.projectKey?.trim().toLowerCase() === projectRef.trim().toLowerCase()
  );

const parseExecutionRequest = (body: unknown): ParsedExecutionRequest => {
  const request = body as Record<string, unknown>;

  return {
    projectRef:
      typeof request?.projectId === "string"
        ? request.projectId
        : typeof request?.projectRef === "string"
          ? request.projectRef
          : "",
    runId: typeof request?.runId === "string" ? request.runId : "",
    caseId: typeof request?.caseId === "string" ? request.caseId : "",
    scriptId: typeof request?.scriptId === "string" ? request.scriptId : undefined,
    scenarioId:
      typeof request?.scenarioId === "string" ? request.scenarioId : undefined,
    suiteId: typeof request?.suiteId === "string" ? request.suiteId : undefined,
    dataSetId:
      typeof request?.dataSetId === "string" ? request.dataSetId : undefined,
    runAllDataSets: request?.runAllDataSets === true,
    executionMode:
      request?.executionMode === "headed" || request?.executionMode === "headless"
        ? (request.executionMode as AutomationExecutionMode)
        : undefined,
    stream: request?.stream === true,
  };
};

const resolveExecutionTargets = ({
  project,
  caseId,
  scriptId,
  scenarioId,
  suiteId,
  dataSetId,
  runAllDataSets,
}: {
  project: Project;
  caseId: string;
  scriptId?: string;
  scenarioId?: string;
  suiteId?: string;
  dataSetId?: string;
  runAllDataSets: boolean;
}) => {
  const row = caseId
    ? project.rows.find((entry) => entry.id === caseId) ?? null
    : null;

  if (caseId && !row) {
    return {
      error: Response.json({ error: "Test case not found." }, { status: 404 }),
    };
  }

  const scenarios = getAutomationScenarios(project);
  const suites = getAutomationSuites(project, scenarios);
  const scenarioTargets: ExecutionTarget[] = [];

  if (scenarioId || suiteId) {
    const requestedSuite = getSuiteById(suites, suiteId);
    const scenarioList = scenarioId
      ? [getScenarioById(scenarios, scenarioId)].filter(
          (entry): entry is AutomationScenario => Boolean(entry)
        )
      : requestedSuite
        ? scenarios.filter(
            (scenario) =>
              scenario.suiteId === requestedSuite.id ||
              requestedSuite.scenarioIds?.includes(scenario.id)
          )
        : [];

    if (!scenarioList.length) {
      return {
        error: Response.json(
          { error: scenarioId ? "Scenario not found." : "Suite has no scenarios." },
          { status: 404 }
        ),
      };
    }

    for (const scenario of scenarioList) {
      const dataSets = getScenarioTestDataSets(project, scenario.id);
      const resolvedDataSets = runAllDataSets
        ? dataSets
        : dataSetId
          ? dataSets.filter((entry) => entry.id === dataSetId)
          : [
              getDefaultScenarioDataSet(scenario, dataSets),
            ].filter((entry): entry is ScenarioTestDataSet => Boolean(entry));

      const linkedRows = getLinkedManualRowsForScenario(scenario, project.rows);
      const targetRows = row
        ? [row]
        : linkedRows.length
          ? [linkedRows[0]]
          : [null];

      if (!resolvedDataSets.length) {
        scenarioTargets.push({
          scenario,
          dataSet: null,
          row: targetRows[0] ?? null,
          suiteId: requestedSuite?.id ?? scenario.suiteId,
          suiteName: requestedSuite?.name,
        });
        continue;
      }

      for (const set of resolvedDataSets) {
        scenarioTargets.push({
          scenario,
          dataSet: set,
          row: targetRows[0] ?? null,
          suiteId: requestedSuite?.id ?? scenario.suiteId,
          suiteName: requestedSuite?.name,
        });
      }
    }

    return { row, scenarioTargets };
  }

  const binding =
    row && caseId
      ? getAutomationBindingForCase(project.automationBindings, caseId) ?? null
      : null;
  const resolvedScriptId = scriptId ?? binding?.scriptId ?? row?.automationScriptId;
  const storedScript = getAutomationScriptById(
    project.automationScripts,
    resolvedScriptId
  );

  if (!storedScript) {
    return {
      error: Response.json(
        {
          error:
            "Provide a scenarioId/suiteId or a linked caseId/standalone scriptId.",
        },
        { status: 400 }
      ),
    };
  }

  const compatibilityScenario =
    scenarios.find(
      (scenario) =>
        (scenario.scriptId ?? scenario.id) === storedScript.id ||
        scenario.id === storedScript.id
    ) ?? {
      id: storedScript.id,
      projectId: project.id,
      suiteId: undefined,
      scriptId: storedScript.id,
      provider: storedScript.provider,
      executionMode: storedScript.executionMode,
      environmentBindingId: storedScript.environmentBindingId,
      name: storedScript.name,
      description: storedScript.description,
      tags: [],
      priority: "medium",
      status: "ready",
      testDataSetIds: [],
      parameterizationMode: "default-only",
      sourceType: storedScript.sourceType ?? "standalone",
      linkedCaseIds: storedScript.linkedCaseIds ?? [],
      linkedRequirementIds: storedScript.linkedRequirementIds ?? [],
      linkedReleaseIds: storedScript.linkedReleaseIds ?? [],
      linkedIssueIds: storedScript.linkedIssueIds ?? [],
      createdBy: storedScript.createdBy,
      createdAt: storedScript.createdAt,
      updatedAt: storedScript.updatedAt,
    };

  scenarioTargets.push({
    scenario: compatibilityScenario,
    dataSet: null,
    row,
  });

  return { row, scenarioTargets };
};

const persistExecutionResults = async ({
  projects,
  project,
  runId,
  storedExecutions,
  storedArtifacts,
}: {
  projects: Project[];
  project: Project;
  runId: string;
  storedExecutions: AutomationExecution[];
  storedArtifacts: AutomationExecutionArtifact[];
}) => {
  const run = runId
    ? project.runs?.find((entry) => entry.id === runId) ?? null
    : null;

  const updatedProjects = projects.map((entry: Project) => {
    if (entry.id !== project.id) {
      return entry;
    }

    const nextExecutions = [...(entry.automationExecutions ?? []), ...storedExecutions];
    const nextArtifacts = [...(entry.automationArtifacts ?? []), ...storedArtifacts];
    const executionsByRowId = new Map<string, AutomationExecution>();

    for (const execution of storedExecutions) {
      executionsByRowId.set(execution.caseId, execution);
    }

    return {
      ...entry,
      automationExecutions: nextExecutions,
      automationArtifacts: nextArtifacts,
      rows: entry.rows.map((item) => {
        const linkedExecution =
          executionsByRowId.get(item.id) ??
          storedExecutions.find((execution) =>
            project.automationBindings?.some(
              (binding) =>
                binding.testCaseId === item.id &&
                binding.scriptId === execution.scriptId
            )
          );

        if (!linkedExecution) {
          return item;
        }

        return {
          ...item,
          executionResult: linkedExecution.status,
          automationStatus:
            item.automationStatus === "automated"
              ? item.automationStatus
              : "automated",
          automationScriptId: linkedExecution.scriptId,
        };
      }),
      runs: run
        ? (entry.runs ?? []).map((existingRun) => {
            if (existingRun.id !== run.id) {
              return existingRun;
            }

            let nextRun = existingRun;
            for (const execution of storedExecutions) {
              const {
                nextRowStepResults,
                nextRowStepNotes,
                nextRowStepActualResults,
              } = buildStepOutcomeMaps(execution);
              nextRun = {
                ...nextRun,
                rowResults: {
                  ...nextRun.rowResults,
                  [execution.caseId]: execution.status,
                },
                rowNotes: {
                  ...nextRun.rowNotes,
                  [execution.caseId]:
                    execution.failureMessage ||
                    execution.logSummary ||
                    nextRun.rowNotes[execution.caseId] ||
                    "",
                },
                rowStepResults: {
                  ...nextRun.rowStepResults,
                  [execution.caseId]: nextRowStepResults,
                },
                rowStepNotes: {
                  ...nextRun.rowStepNotes,
                  [execution.caseId]: nextRowStepNotes,
                },
                rowStepActualResults: {
                  ...nextRun.rowStepActualResults,
                  [execution.caseId]: nextRowStepActualResults,
                },
                updatedAt: Date.now(),
              };
            }
            return nextRun;
          })
        : entry.runs ?? [],
      updatedAt: Date.now(),
    };
  });

  await writeProjects(updatedProjects);
};

const runExecutionTargets = async ({
  project,
  runId,
  executionMode,
  scenarioTargets,
  emitEvent,
  streaming,
}: {
  project: Project;
  runId: string;
  executionMode?: AutomationExecutionMode;
  scenarioTargets: ExecutionTarget[];
  emitEvent?: (event: AutomationExecutionEvent) => Promise<void>;
  streaming: boolean;
}): Promise<RunExecutionTargetsResult> => {
  const storedExecutions: AutomationExecution[] = [];
  const storedArtifacts: AutomationExecutionArtifact[] = [];
  const allLogs: string[] = [];

  for (const target of scenarioTargets) {
    const scenario = target.scenario;
    const script = getScenarioRuntimeScript(project, scenario);
    const runtimeScript = executionMode ? { ...script, executionMode } : script;
    const rawSteps = getScenarioSteps(project.automationSteps, scenario);
    const steps = applyDataSetToSteps(rawSteps, target.dataSet);
    const validation = validateAutomationDefinition({
      provider: runtimeScript.provider,
      script: runtimeScript,
      steps,
      reusableBlocks: project.automationReusableBlocks,
      selectorPresets: project.automationSelectorPresets,
      environments: project.automationEnvironmentBindings,
    });

    if (!validation.valid) {
      if (!streaming) {
        return {
          storedExecutions,
          storedArtifacts,
          allLogs,
          validationError: {
            error: validation.errors[0],
            validation,
            scenarioId: scenario.id,
            dataSetId: target.dataSet?.id,
          },
        };
      }

      if (emitEvent) {
        await emitEvent({
          type: "log_message",
          timestamp: Date.now(),
          executionId: `blocked-${scenario.id}-${Date.now()}`,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          dataSetId: target.dataSet?.id,
          dataSetName: target.dataSet?.name,
          message: validation.errors[0] || "Validation blocked execution.",
          level: "error",
          status: "blocked",
        });
        await emitEvent({
          type: "execution_complete",
          timestamp: Date.now(),
          executionId: `blocked-${scenario.id}-${Date.now()}`,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          dataSetId: target.dataSet?.id,
          dataSetName: target.dataSet?.name,
          status: "blocked",
          failureMessage: validation.errors[0] || "Validation blocked execution.",
        });
      }
      allLogs.push(...validation.errors);
      continue;
    }

    const resolvedRunId =
      runId || `automation-${Date.now()}-${storedExecutions.length + 1}`;
    const resolvedCaseId =
      target.row?.id ??
      `scenario:${scenario.id}${target.dataSet ? `:dataset:${target.dataSet.id}` : ""}`;

      const { execution, artifacts, logs } = await executeAutomationScript({
        projectId: project.id,
        projectKey: project.projectKey,
        runId: resolvedRunId,
        caseId: resolvedCaseId,
      suiteId: target.suiteId,
      suiteName: target.suiteName,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
        dataSetId: target.dataSet?.id,
        dataSetName: target.dataSet?.name,
        dataSetVariables: target.dataSet?.variables,
        triggerType: "manual",
        script: runtimeScript,
        steps,
      reusableBlocks: project.automationReusableBlocks,
      selectorPresets: project.automationSelectorPresets,
      environments: project.automationEnvironmentBindings,
      onExecutionEvent: emitEvent,
    });

    storedExecutions.push(execution);
    storedArtifacts.push(...artifacts);
    allLogs.push(...logs);

    if (emitEvent) {
      await emitEvent({
        type: "execution_complete",
        timestamp: Date.now(),
        executionId: execution.id,
        caseId: execution.caseId,
        scenarioId: execution.scenarioId,
        scenarioName: execution.scenarioName,
        dataSetId: execution.dataSetId,
        dataSetName: execution.dataSetName,
        status: execution.status,
        failureMessage: execution.failureMessage,
        execution,
        artifacts,
      });
    }
  }

  return {
    storedExecutions,
    storedArtifacts,
    allLogs,
  };
};

const encodeSseEvent = (event: AutomationExecutionEvent) =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

export async function POST(req: Request) {
  try {
    const request = parseExecutionRequest(await req.json());

    if (!request.projectRef) {
      return Response.json(
        { error: "projectId/projectRef is required." },
        { status: 400 }
      );
    }

    const projects = await readProjects();
    const project = getProjectByRef(projects, request.projectRef);

    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    if (request.runId) {
      const run = project.runs?.find((entry) => entry.id === request.runId) ?? null;
      if (!run) {
        return Response.json({ error: "Run not found." }, { status: 404 });
      }
    }

    const resolvedTargets = resolveExecutionTargets({
      project,
      caseId: request.caseId,
      scriptId: request.scriptId,
      scenarioId: request.scenarioId,
      suiteId: request.suiteId,
      dataSetId: request.dataSetId,
      runAllDataSets: request.runAllDataSets,
    });

    if (resolvedTargets.error) {
      return resolvedTargets.error;
    }

    const scenarioTargets = resolvedTargets.scenarioTargets;

    if (!scenarioTargets.length) {
      return Response.json(
        { error: "No automation scenario was selected for execution." },
        { status: 400 }
      );
    }

    if (!request.stream) {
      const result = await runExecutionTargets({
        project,
        runId: request.runId,
        executionMode: request.executionMode,
        scenarioTargets,
        streaming: false,
      });

      if (result.validationError) {
        return Response.json(result.validationError, { status: 400 });
      }

      await persistExecutionResults({
        projects,
        project,
        runId: request.runId,
        storedExecutions: result.storedExecutions,
        storedArtifacts: result.storedArtifacts,
      });

      return Response.json({
        execution: result.storedExecutions[result.storedExecutions.length - 1],
        executions: result.storedExecutions,
        artifacts: result.storedArtifacts,
        logs: result.allLogs,
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writeEvent = async (event: AutomationExecutionEvent) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        };

        void (async () => {
          try {
            const result = await runExecutionTargets({
              project,
              runId: request.runId,
              executionMode: request.executionMode,
              scenarioTargets,
              emitEvent: writeEvent,
              streaming: true,
            });

            if (result.storedExecutions.length > 0) {
              await persistExecutionResults({
                projects,
                project,
                runId: request.runId,
                storedExecutions: result.storedExecutions,
                storedArtifacts: result.storedArtifacts,
              });
            }
          } catch (error) {
            const message =
              error instanceof Error && error.message.trim()
                ? error.message
                : "Failed to execute automation.";
            await writeEvent({
              type: "log_message",
              timestamp: Date.now(),
              executionId: `stream-error-${Date.now()}`,
              scenarioId: request.scenarioId,
              dataSetId: request.dataSetId,
              message,
              level: "error",
              status: "failed",
            });
            await writeEvent({
              type: "execution_complete",
              timestamp: Date.now(),
              executionId: `stream-error-${Date.now()}`,
              scenarioId: request.scenarioId,
              dataSetId: request.dataSetId,
              status: "failed",
              failureMessage: message,
            });
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("AUTOMATION EXECUTE ERROR:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to execute automation.";
    return Response.json({ error: message }, { status: 500 });
  }
}
