import {
  executeAutomationScript,
  validateAutomationDefinition,
} from "./automation-execution";
import {
  applyDataSetToSteps,
  getAutomationScenarios,
  getAutomationSuites,
  getDefaultScenarioDataSet,
  getScenarioById,
  getScenarioRuntimeScript,
  getScenarioSteps,
  getScenarioTestDataSets,
  getSuiteById,
} from "./automation-domain";
import { readProjects, writeProjects } from "./project-store";
import type {
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationExecutionStatus,
  AutomationScenario,
  AutomationSchedule,
  Project,
  ScenarioTestDataSet,
} from "./workspace";

type ScheduleExecutionTarget = {
  scenario: AutomationScenario;
  dataSet: ScenarioTestDataSet | null;
  suiteId?: string;
  suiteName?: string;
};

type ScheduleRunResult = {
  scheduleId: string;
  projectId: string;
  projectName: string;
  executionCount: number;
  status: AutomationExecutionStatus | "skipped";
  lastExecutionId?: string;
  message: string;
};

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WEEKLY_INTERVAL_MS = 7 * DAILY_INTERVAL_MS;

export const computeNextAutomationScheduleRun = (
  schedule: AutomationSchedule,
  fromTime: number
) => {
  if (!schedule.isEnabled) {
    return undefined;
  }

  if (schedule.frequency === "once") {
    return schedule.scheduledFor && schedule.scheduledFor > fromTime
      ? schedule.scheduledFor
      : undefined;
  }

  if (schedule.frequency === "custom") {
    return schedule.nextRunAt && schedule.nextRunAt > fromTime
      ? schedule.nextRunAt
      : undefined;
  }

  const interval =
    schedule.frequency === "daily" ? DAILY_INTERVAL_MS : WEEKLY_INTERVAL_MS;
  let next =
    typeof schedule.nextRunAt === "number"
      ? schedule.nextRunAt
      : schedule.scheduledFor ?? fromTime;

  while (next <= fromTime) {
    next += interval;
  }

  return next;
};

const getScheduleScopeName = (
  schedule: AutomationSchedule,
  project: Project
) => {
  const scenarios = getAutomationScenarios(project);
  const suites = getAutomationSuites(project, scenarios);

  if (schedule.suiteId) {
    return getSuiteById(suites, schedule.suiteId)?.name ?? schedule.name;
  }

  if (schedule.scenarioId) {
    return getScenarioById(scenarios, schedule.scenarioId)?.name ?? schedule.name;
  }

  return schedule.name;
};

const resolveTargetsForSchedule = (
  project: Project,
  schedule: AutomationSchedule
): { targets: ScheduleExecutionTarget[]; error?: string } => {
  const scenarios = getAutomationScenarios(project);
  const suites = getAutomationSuites(project, scenarios);

  if (schedule.suiteId) {
    const suite = getSuiteById(suites, schedule.suiteId);
    if (!suite) {
      return { targets: [], error: "Scheduled suite was not found." };
    }

    const suiteScenarios = scenarios.filter(
      (scenario) =>
        scenario.suiteId === suite.id || suite.scenarioIds?.includes(scenario.id)
    );

    if (!suiteScenarios.length) {
      return { targets: [], error: "Scheduled suite has no scenarios." };
    }

    const targets = suiteScenarios.flatMap((scenario) => {
      const dataSets = getScenarioTestDataSets(project, scenario.id);
      const defaultDataSet = getDefaultScenarioDataSet(scenario, dataSets);
      if (scenario.parameterizationMode === "all-datasets" && dataSets.length > 0) {
        return dataSets.map((dataSet) => ({
          scenario,
          dataSet,
          suiteId: suite.id,
          suiteName: suite.name,
        }));
      }

      return [
        {
          scenario,
          dataSet: defaultDataSet,
          suiteId: suite.id,
          suiteName: suite.name,
        },
      ];
    });

    return { targets };
  }

  const scenario = schedule.scenarioId
    ? getScenarioById(scenarios, schedule.scenarioId)
    : null;

  if (!scenario) {
    return { targets: [], error: "Scheduled scenario was not found." };
  }

  const dataSets = getScenarioTestDataSets(project, scenario.id);
  const defaultDataSet = getDefaultScenarioDataSet(scenario, dataSets);
  const selectedDataSets = schedule.runAllDataSets
    ? dataSets
    : schedule.datasetId
      ? dataSets.filter((entry) => entry.id === schedule.datasetId)
      : defaultDataSet
        ? [defaultDataSet]
        : [];

  if (!selectedDataSets.length) {
    return {
      targets: [{ scenario, dataSet: null, suiteId: scenario.suiteId }],
    };
  }

  return {
    targets: selectedDataSets.map((dataSet) => ({
      scenario,
      dataSet,
      suiteId: scenario.suiteId,
      suiteName: scenario.suiteId
        ? getSuiteById(suites, scenario.suiteId)?.name
        : undefined,
    })),
  };
};

const aggregateScheduleStatus = (
  executions: AutomationExecution[]
): AutomationExecutionStatus => {
  if (executions.some((execution) => execution.status === "failed")) {
    return "failed";
  }
  if (executions.some((execution) => execution.status === "blocked")) {
    return "blocked";
  }
  return "passed";
};

const runSingleSchedule = async ({
  project,
  schedule,
  now,
}: {
  project: Project;
  schedule: AutomationSchedule;
  now: number;
}) => {
  const resolvedTargets = resolveTargetsForSchedule(project, schedule);

  if (resolvedTargets.error) {
    return {
      project,
      result: {
        scheduleId: schedule.id,
        projectId: project.id,
        projectName: project.name,
        executionCount: 0,
        status: "skipped" as const,
        message: resolvedTargets.error,
      },
      schedulePatch: {
        status: "failed" as const,
        lastError: resolvedTargets.error,
        lastCheckedAt: now,
        updatedAt: now,
      } satisfies Partial<AutomationSchedule>,
      executions: [] as AutomationExecution[],
      artifacts: [] as AutomationExecutionArtifact[],
    };
  }

  const runId = `schedule-${schedule.id}-${now}`;
  const storedExecutions: AutomationExecution[] = [];
  const storedArtifacts: AutomationExecutionArtifact[] = [];

  for (const target of resolvedTargets.targets) {
    const script = getScenarioRuntimeScript(project, target.scenario);
    const runtimeScript = {
      ...script,
      executionMode: schedule.executionMode ?? script.executionMode,
      environmentBindingId:
        schedule.environmentBindingId ?? script.environmentBindingId,
    };
    const rawSteps = getScenarioSteps(project.automationSteps, target.scenario);
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
      storedExecutions.push({
        id: `schedule-blocked-${schedule.id}-${target.scenario.id}-${Date.now()}`,
        runId,
        caseId: `scenario:${target.scenario.id}${target.dataSet ? `:dataset:${target.dataSet.id}` : ""}`,
        scriptId: runtimeScript.id,
        suiteId: target.suiteId,
        suiteName: target.suiteName,
        scenarioId: target.scenario.id,
        scenarioName: target.scenario.name,
        dataSetId: target.dataSet?.id,
        dataSetName: target.dataSet?.name,
        dataSetVariables: target.dataSet?.variables,
        environmentBindingId: runtimeScript.environmentBindingId,
        environmentName:
          project.automationEnvironmentBindings?.find(
            (environment) => environment.id === runtimeScript.environmentBindingId
          )?.name,
        provider: runtimeScript.provider,
        executionMode: runtimeScript.executionMode,
        triggerType: "scheduled",
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        status: "blocked",
        startedAt: now,
        finishedAt: now,
        logSummary: validation.errors.slice(0, 5).join("\n"),
        failureMessage: validation.errors[0],
        artifactIds: [],
        stepResults: [],
      });
      continue;
    }

    const { execution, artifacts } = await executeAutomationScript({
      projectId: project.id,
      projectKey: project.projectKey,
      runId,
      caseId: `scenario:${target.scenario.id}${target.dataSet ? `:dataset:${target.dataSet.id}` : ""}`,
      suiteId: target.suiteId,
      suiteName: target.suiteName,
      scenarioId: target.scenario.id,
      scenarioName: target.scenario.name,
      dataSetId: target.dataSet?.id,
      dataSetName: target.dataSet?.name,
      dataSetVariables: target.dataSet?.variables,
      triggerType: "scheduled",
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      script: runtimeScript,
      steps,
      reusableBlocks: project.automationReusableBlocks,
      selectorPresets: project.automationSelectorPresets,
      environments: project.automationEnvironmentBindings,
    });

    storedExecutions.push(execution);
    storedArtifacts.push(...artifacts);
  }

  const aggregateStatus = aggregateScheduleStatus(storedExecutions);
  const isOneTime = schedule.frequency === "once";
  const nextRunAt = isOneTime
    ? undefined
    : computeNextAutomationScheduleRun(schedule, now);
  const nextScheduleStatus: AutomationSchedule["status"] = isOneTime
    ? "completed"
    : "scheduled";

  return {
    project,
    result: {
      scheduleId: schedule.id,
      projectId: project.id,
      projectName: project.name,
      executionCount: storedExecutions.length,
      status: aggregateStatus,
      lastExecutionId: storedExecutions[storedExecutions.length - 1]?.id,
      message: `${schedule.name} ran ${storedExecutions.length} execution(s).`,
    },
    schedulePatch: {
      isEnabled: isOneTime ? false : schedule.isEnabled,
      status: nextScheduleStatus,
      nextRunAt,
      lastRunAt: now,
      lastRunStatus: aggregateStatus,
      lastExecutionId: storedExecutions[storedExecutions.length - 1]?.id,
      lastError:
        aggregateStatus === "passed"
          ? undefined
          : storedExecutions.find(
              (execution) =>
                execution.status === "failed" || execution.status === "blocked"
            )?.failureMessage,
      lastCheckedAt: now,
      updatedAt: now,
    } satisfies Partial<AutomationSchedule>,
    executions: storedExecutions,
    artifacts: storedArtifacts,
  };
};

const persistScheduledRun = async ({
  project,
  schedule,
  schedulePatch,
  executions,
  artifacts,
}: {
  project: Project;
  schedule: AutomationSchedule;
  schedulePatch: Partial<AutomationSchedule>;
  executions: AutomationExecution[];
  artifacts: AutomationExecutionArtifact[];
}) => {
  const executionsByRowId = new Map<string, AutomationExecution>();

  for (const execution of executions) {
    executionsByRowId.set(execution.caseId, execution);
  }

  return {
    ...project,
    automationExecutions: [...(project.automationExecutions ?? []), ...executions],
    automationArtifacts: [...(project.automationArtifacts ?? []), ...artifacts],
    automationSchedules: (project.automationSchedules ?? []).map((item) =>
      item.id === schedule.id
        ? {
            ...item,
            ...schedulePatch,
          }
        : item
    ),
    rows: project.rows.map((item) => {
      const linkedExecution =
        executionsByRowId.get(item.id) ??
        executions.find((execution) =>
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
    runs: project.runs ?? [],
    updatedAt: Date.now(),
  };
};

export const runDueAutomationSchedules = async ({
  projectRef,
  scheduleId,
  now = Date.now(),
}: {
  projectRef?: string;
  scheduleId?: string;
  now?: number;
}) => {
  const projects = await readProjects();
  const results: ScheduleRunResult[] = [];
  const nextProjects = [...projects];

  for (let index = 0; index < nextProjects.length; index += 1) {
    const project = nextProjects[index];
    if (
      projectRef &&
      project.id !== projectRef &&
      project.projectKey?.trim().toLowerCase() !== projectRef.trim().toLowerCase()
    ) {
      continue;
    }

    const schedules = project.automationSchedules ?? [];
    const dueSchedules = schedules.filter((schedule) => {
      if (scheduleId && schedule.id !== scheduleId) {
        return false;
      }
      if (!schedule.isEnabled) {
        return false;
      }
      const dueAt = schedule.nextRunAt ?? schedule.scheduledFor;
      return typeof dueAt === "number" && dueAt <= now;
    });

    if (!dueSchedules.length) {
      continue;
    }

    let workingProject = project;

    for (const dueSchedule of dueSchedules) {
      workingProject = {
        ...workingProject,
        automationSchedules: (workingProject.automationSchedules ?? []).map((item) =>
          item.id === dueSchedule.id
            ? {
                ...item,
                status: "running",
                lastCheckedAt: now,
                updatedAt: now,
              }
            : item
        ),
      };

      const { result, schedulePatch, executions, artifacts } =
        await runSingleSchedule({
          project: workingProject,
          schedule: {
            ...dueSchedule,
            status: "running",
          },
          now,
        });

      results.push({
        ...result,
        message:
          result.status === "skipped"
            ? `${getScheduleScopeName(dueSchedule, workingProject)} was skipped: ${result.message}`
            : result.message,
      });

      workingProject = await persistScheduledRun({
        project: workingProject,
        schedule: dueSchedule,
        schedulePatch,
        executions,
        artifacts,
      });
    }

    nextProjects[index] = workingProject;
  }

  if (results.length > 0) {
    await writeProjects(nextProjects);
  }

  return {
    ranAt: now,
    processedCount: results.length,
    results,
  };
};
