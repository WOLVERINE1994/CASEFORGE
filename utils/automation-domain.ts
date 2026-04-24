import {
  automationProviderLabels,
  getAutomationScriptById,
  getAutomationStepsForScript,
} from "./automation";
import type {
  AutomationAction,
  AutomationActionParameter,
  AutomationReusableBlock,
  AutomationScenario,
  AutomationScript,
  AutomationStep,
  AutomationSuite,
  Project,
  ScenarioTestDataSet,
  TestCaseRow,
} from "./workspace";

const DEFAULT_STANDALONE_SUITE_ID = "automation-suite-standalone";
const DEFAULT_LINKED_SUITE_ID = "automation-suite-linked";

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

export const getScenarioRuntimeId = (
  scenario: Pick<AutomationScenario, "id" | "scriptId">
) => scenario.scriptId ?? scenario.id;

export const buildAutomationScenarioRow = (
  scenario: AutomationScenario,
  project: Pick<Project, "rows">
): TestCaseRow => {
  const linkedCases = project.rows.filter((row) =>
    (scenario.linkedCaseIds ?? []).includes(row.id)
  );

  return {
    id: `scenario:${scenario.id}`,
    type: "Automation",
    title: scenario.name || "Untitled automation scenario",
    preconditions: linkedCases.length
      ? `Linked to ${linkedCases.length} manual case(s).`
      : "Independent automation scenario.",
    steps:
      scenario.description || "Open the scenario editor to manage structured steps.",
    expectedResult:
      "Scenario is ready to validate, run, debug, record, and replay.",
    automationStatus: "automated",
    automationProvider: automationProviderLabels[scenario.provider],
    automationReference: scenario.name,
    automationScriptId: getScenarioRuntimeId(scenario),
    automationBindingMode:
      linkedCases.length > 0 ? "hybrid" : "automated",
    createdAt: scenario.createdAt,
    updatedAt: scenario.updatedAt,
  };
};

export const getAutomationScenarios = (project: Project): AutomationScenario[] => {
  if (Array.isArray(project.automationScenarios) && project.automationScenarios.length) {
    return [...project.automationScenarios].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
  }

  return (project.automationScripts ?? [])
    .map((script) => ({
      id: script.id,
      projectId: script.projectId,
      suiteId:
        (script.sourceType ?? "case-linked") === "standalone"
          ? DEFAULT_STANDALONE_SUITE_ID
          : DEFAULT_LINKED_SUITE_ID,
      scriptId: script.id,
      provider: script.provider,
      executionMode: script.executionMode,
      environmentBindingId: script.environmentBindingId,
      name: script.name,
      description: script.description,
      tags: [],
      priority: "medium" as const,
      status: "ready" as const,
      testDataSetIds: [],
      parameterizationMode: "default-only" as const,
      sourceType: script.sourceType ?? "case-linked",
      linkedCaseIds: script.linkedCaseIds ?? [],
      linkedRequirementIds: script.linkedRequirementIds ?? [],
      linkedReleaseIds: script.linkedReleaseIds ?? [],
      linkedIssueIds: script.linkedIssueIds ?? [],
      createdBy: script.createdBy,
      createdAt: script.createdAt,
      updatedAt: script.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

export const getAutomationSuites = (
  project: Project,
  scenarios: AutomationScenario[]
): AutomationSuite[] => {
  if (Array.isArray(project.automationSuites) && project.automationSuites.length) {
    return [...project.automationSuites].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
  }

  const now = Date.now();
  const standaloneIds = scenarios
    .filter((scenario) => (scenario.sourceType ?? "standalone") === "standalone")
    .map((scenario) => scenario.id);
  const linkedIds = scenarios
    .filter((scenario) => (scenario.sourceType ?? "case-linked") !== "standalone")
    .map((scenario) => scenario.id);

  return [
    {
      id: DEFAULT_STANDALONE_SUITE_ID,
      projectId: project.id,
      name: "Standalone Automation",
      description: "Scenarios created directly in the Automation workspace.",
      scenarioIds: standaloneIds,
      tags: ["automation-first"],
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: DEFAULT_LINKED_SUITE_ID,
      projectId: project.id,
      name: "Linked Automation",
      description: "Backward-compatible scenarios linked to manual cases.",
      scenarioIds: linkedIds,
      tags: ["compatibility"],
      status: "draft" as const,
      createdAt: now,
      updatedAt: now,
    },
  ].filter((suite) => suite.scenarioIds?.length);
};

const inferActionParametersFromSteps = (
  steps: AutomationStep[]
): AutomationActionParameter[] => {
  const parameterNames = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string") {
      const matches = value.matchAll(/\{\{\s*param:([a-zA-Z0-9_.-]+)\s*\}\}/g);
      for (const match of matches) {
        if (match[1]) {
          parameterNames.add(match[1]);
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(collect);
    }
  };

  steps.forEach((step) => {
    collect(step.targetValue);
    collect(step.inputValue);
    collect(step.expectedValue);
    collect(step.routeKey);
    collect(step.metaJson);
  });

  return [...parameterNames].sort().map((name) => ({
    id: `param:${name}`,
    name,
    required: true,
  }));
};

export const buildActionBackingBlock = (
  action: AutomationAction
): AutomationReusableBlock => ({
  id: action.backingBlockId ?? action.id,
  name: action.name,
  description: action.description,
  provider: action.provider,
  steps: action.steps.map((step, index) => ({
    ...step,
    id: step.id || `${action.id}-step-${index + 1}`,
    scriptId: action.backingBlockId ?? action.id,
    order: index,
  })),
  createdAt: action.createdAt,
  updatedAt: action.updatedAt,
});

export const getAutomationActions = (project: Project): AutomationAction[] => {
  if (Array.isArray(project.automationActions) && project.automationActions.length) {
    return [...project.automationActions].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
  }

  return (project.automationReusableBlocks ?? [])
    .map((block) => ({
      id: block.id,
      projectId: project.id,
      name: block.name,
      description: block.description,
      tags: [],
      provider: block.provider,
      parameters: inferActionParametersFromSteps(block.steps),
      steps: block.steps.map((step, index) => ({
        ...step,
        id: step.id || `${block.id}-step-${index + 1}`,
        scriptId: block.id,
        order: index,
      })),
      outputs: [],
      backingBlockId: block.id,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

export const getScenarioSteps = (
  automationSteps: Record<string, AutomationStep[]> | undefined,
  scenario: Pick<AutomationScenario, "id" | "scriptId">
) => getAutomationStepsForScript(automationSteps, getScenarioRuntimeId(scenario));

export const getScenarioTestDataSets = (
  project: Pick<Project, "automationScenarioTestDataSets">,
  scenarioId: string
): ScenarioTestDataSet[] =>
  (project.automationScenarioTestDataSets ?? [])
    .filter((entry) => entry.scenarioId === scenarioId)
    .sort((left, right) => {
      if (left.isDefault && !right.isDefault) {
        return -1;
      }
      if (!left.isDefault && right.isDefault) {
        return 1;
      }
      return left.updatedAt - right.updatedAt;
    });

const replaceTokens = (value: string, variables: Record<string, string>) =>
  value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] ?? "" : `{{${key}}}`
  );

const resolveMetaJson = (
  value: unknown,
  variables: Record<string, string>
): unknown => {
  if (typeof value === "string") {
    return replaceTokens(value, variables);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveMetaJson(item, variables));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        resolveMetaJson(entryValue, variables),
      ])
    );
  }

  return value;
};

export const applyDataSetToSteps = (
  steps: AutomationStep[],
  dataSet?: ScenarioTestDataSet | null
) => {
  if (!dataSet) {
    return steps;
  }

  return steps.map((step) => ({
    ...step,
    targetValue: step.targetValue
      ? replaceTokens(step.targetValue, dataSet.variables)
      : step.targetValue,
    inputValue: step.inputValue
      ? replaceTokens(step.inputValue, dataSet.variables)
      : step.inputValue,
    expectedValue: step.expectedValue
      ? replaceTokens(step.expectedValue, dataSet.variables)
      : step.expectedValue,
    routeKey: step.routeKey ? replaceTokens(step.routeKey, dataSet.variables) : step.routeKey,
    metaJson: step.metaJson
      ? (resolveMetaJson(step.metaJson, dataSet.variables) as Record<string, unknown>)
      : step.metaJson,
  }));
};

export const getDefaultScenarioDataSet = (
  scenario: Pick<AutomationScenario, "defaultDataSetId">,
  dataSets: ScenarioTestDataSet[]
) =>
  dataSets.find((entry) => entry.id === scenario.defaultDataSetId) ??
  dataSets.find((entry) => entry.isDefault) ??
  dataSets[0] ??
  null;

export const buildScenarioBackingScript = (
  projectId: string,
  scenario: AutomationScenario
): AutomationScript => ({
  id: getScenarioRuntimeId(scenario),
  projectId,
  provider: scenario.provider,
  executionMode: scenario.executionMode,
  environmentBindingId: scenario.environmentBindingId,
  name: scenario.name,
  description: scenario.description,
  sourceType: scenario.sourceType ?? "standalone",
  linkedCaseIds: scenario.linkedCaseIds ?? [],
  linkedRequirementIds: scenario.linkedRequirementIds ?? [],
  linkedReleaseIds: scenario.linkedReleaseIds ?? [],
  linkedIssueIds: scenario.linkedIssueIds ?? [],
  createdBy: scenario.createdBy,
  createdAt: scenario.createdAt,
  updatedAt: scenario.updatedAt,
});

export const getScenarioById = (
  scenarios: AutomationScenario[],
  scenarioId: string | undefined
) => scenarios.find((scenario) => scenario.id === scenarioId) ?? null;

export const getSuiteById = (
  suites: AutomationSuite[],
  suiteId: string | undefined
) => suites.find((suite) => suite.id === suiteId) ?? null;

export const getScenarioSearchText = (
  scenario: AutomationScenario,
  suiteName?: string
) =>
  [
    scenario.name,
    scenario.description,
    suiteName,
    ...(scenario.tags ?? []),
    scenario.priority,
    scenario.status,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ")
    .toLowerCase();

export const summarizeScenarioDataSet = (dataSet: ScenarioTestDataSet) => {
  const keys = Object.keys(dataSet.variables);
  if (!keys.length) {
    return "No variables";
  }

  return keys
    .slice(0, 3)
    .map((key) => `${key}=${dataSet.variables[key]}`)
    .join(" | ");
};

export const getAutomationDisplayKey = (value: string | undefined) => {
  if (!value || isUuidLike(value)) {
    return undefined;
  }

  return value;
};

export const syncScenarioCollections = (
  project: Project,
  nextScenarios: AutomationScenario[]
) => {
  const scenariosBySuite = nextScenarios.reduce<Record<string, string[]>>(
    (accumulator, scenario) => {
      const suiteId = scenario.suiteId ?? DEFAULT_STANDALONE_SUITE_ID;
      accumulator[suiteId] = [...(accumulator[suiteId] ?? []), scenario.id];
      return accumulator;
    },
    {}
  );

  const storedSuites = getAutomationSuites(project, nextScenarios);
  const nextSuites = storedSuites.map((suite) => ({
    ...suite,
    scenarioIds: scenariosBySuite[suite.id] ?? [],
    updatedAt: Date.now(),
  }));

  return {
    scenarios: nextScenarios,
    suites: nextSuites,
    scripts: nextScenarios.map((scenario) =>
      buildScenarioBackingScript(project.id, scenario)
    ),
  };
};

export const syncAutomationActions = (
  project: Project,
  nextActions: AutomationAction[]
) => {
  const actionBlockIds = new Set(
    (project.automationActions ?? []).map(
      (action) => action.backingBlockId ?? action.id
    )
  );
  const preservedLegacyBlocks = (project.automationReusableBlocks ?? []).filter(
    (block) => !actionBlockIds.has(block.id)
  );

  return {
    actions: nextActions,
    reusableBlocks: [
      ...nextActions.map((action) => buildActionBackingBlock(action)),
      ...preservedLegacyBlocks,
    ].sort((left, right) => right.updatedAt - left.updatedAt),
  };
};

export const getLinkedManualRowsForScenario = (
  scenario: AutomationScenario,
  rows: TestCaseRow[]
) => rows.filter((row) => (scenario.linkedCaseIds ?? []).includes(row.id));

export const getScenarioRuntimeScript = (
  project: Pick<Project, "automationScripts">,
  scenario: AutomationScenario
) =>
  getAutomationScriptById(
    project.automationScripts,
    getScenarioRuntimeId(scenario)
  ) ?? buildScenarioBackingScript(scenario.projectId, scenario);
