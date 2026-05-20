import {
  CoverageDepth,
  GenerationMode,
  Persona,
  SignoffStatus,
  SourceType,
  TestCaseType,
} from "@prisma/client";
import type {
  InputJsonArray,
  InputJsonObject,
  InputJsonValue,
  JsonValue,
} from "@prisma/client/runtime/client";
import { cache } from "react";

import { prisma } from "./prisma";
import {
  AutomationAction,
  AutomationActionParameter,
  AutomationScenario,
  AutomationScenarioParameterizationMode,
  AutomationScenarioPriority,
  AutomationScenarioStatus,
  AutomationScheduleFrequency,
  AutomationArtifactType,
  AutomationBinding,
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationExecutionStatus,
  AutomationProvider,
  AutomationScript,
  AutomationStep,
  AutomationStepAction,
  AutomationStepExecutionStatus,
  AutomationSuite,
  AutomationScheduleStatus,
  AutomationSuiteStatus,
  AutomationTargetType,
  AutomationV2Action,
  AutomationV2Command,
  AutomationV2CommandStatus,
  AutomationV2CommandType,
  AutomationV2Locator,
  AutomationV2Run,
  AutomationV2RunStatus,
  AutomationV2Scenario,
  AutomationV2ScenarioStatus,
  normalizeAutomationProvider,
  CasesSavedView,
  CaseReviewHistoryEntry,
  Project,
  ProjectViewPreferences,
  ReleaseReviewState,
  RunsSavedView,
  ScenarioTestDataSet,
  SourceArtifact,
  TestCaseRow,
  TestRunRecord,
} from "./workspace";

type StoredJson = InputJsonValue;

const sanitizeJsonValue = (value: unknown): InputJsonValue => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : sanitizeJsonValue(item)
    ) as InputJsonArray;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entryValue]) =>
        entryValue === undefined ? [] : [[key, sanitizeJsonValue(entryValue)]]
      )
    ) as InputJsonObject;
  }

  return null as unknown as InputJsonValue;
};

type ProjectRecord = Awaited<
  ReturnType<
    typeof prisma.project.findFirstOrThrow<{
      include: {
        changeComparisons: true;
        requirements: true;
        testCases: true;
      };
    }>
  >
>;

type AutomationProjectRecord = Awaited<
  ReturnType<
    typeof prisma.project.findFirstOrThrow<{
      include: {
        testCases: true;
      };
    }>
  >
>;

type ProjectStoreTransactionClient = Pick<
  typeof prisma,
  "changeComparison" | "project" | "requirement" | "testCase"
>;

const sanitizeJson = (value: unknown): StoredJson => {
  if (value === null) {
    return null as unknown as InputJsonValue;
  }

  return sanitizeJsonValue(value);
};

const waitForRetry = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isTransactionStartTimeout = (error: unknown) =>
  error instanceof Error &&
  /Unable to start a transaction in the given time|Transaction API error/i.test(
    error.message
  );

const toWorkspacePersona = (persona: Persona): Project["persona"] => {
  switch (persona) {
    case Persona.first_time_user:
      return "first-time-user";
    case Persona.returning_user:
      return "returning-user";
    case Persona.blocked_user:
      return "blocked-user";
    default:
      return persona;
  }
};

const toPrismaPersona = (persona: Project["persona"]): Persona => {
  switch (persona) {
    case "first-time-user":
      return Persona.first_time_user;
    case "returning-user":
      return Persona.returning_user;
    case "blocked-user":
      return Persona.blocked_user;
    default:
      return persona as Persona;
  }
};

const toWorkspaceSignoffStatus = (
  signoffStatus: SignoffStatus
): Project["signoffStatus"] => {
  switch (signoffStatus) {
    case SignoffStatus.in_review:
      return "in-review";
    case SignoffStatus.changes_requested:
      return "changes-requested";
    default:
      return signoffStatus;
  }
};

const toPrismaSignoffStatus = (
  signoffStatus: Project["signoffStatus"]
): SignoffStatus => {
  switch (signoffStatus) {
    case "in-review":
      return SignoffStatus.in_review;
    case "changes-requested":
      return SignoffStatus.changes_requested;
    default:
      return signoffStatus as SignoffStatus;
  }
};

const toWorkspaceSourceType = (
  sourceType: SourceType
): SourceArtifact["type"] => {
  switch (sourceType) {
    case SourceType.jira:
      return "jira";
    case SourceType.prd:
      return "prd";
    case SourceType.api_spec:
      return "api-spec";
    case SourceType.user_story:
      return "user-story";
    case SourceType.changelog:
      return "changelog";
    case SourceType.manual:
      throw new Error("Manual requirements are not valid source artifacts.");
  }
};

const toPrismaSourceType = (sourceType: SourceArtifact["type"]): SourceType => {
  switch (sourceType) {
    case "api-spec":
      return SourceType.api_spec;
    case "user-story":
      return SourceType.user_story;
    default:
      return sourceType as SourceType;
  }
};

const toWorkspaceRowType = (type: TestCaseType): TestCaseRow["type"] => {
  switch (type) {
    case TestCaseType.functional:
      return "Functional";
    case TestCaseType.regression:
      return "Regression";
    case TestCaseType.api:
      return "API";
    case TestCaseType.ui:
      return "UI";
    case TestCaseType.negative:
      return "Negative";
    case TestCaseType.edge:
      return "Edge";
    default:
      return "Functional";
  }
};

const toPrismaRowType = (type: TestCaseRow["type"]): TestCaseType => {
  switch (String(type).toLowerCase()) {
    case "regression":
      return TestCaseType.regression;
    case "api":
      return TestCaseType.api;
    case "ui":
      return TestCaseType.ui;
    case "negative":
      return TestCaseType.negative;
    case "edge":
      return TestCaseType.edge;
    case "functional":
    default:
      return TestCaseType.functional;
  }
};

const toStoredCaseKey = (projectId: string, rowId: string, index: number) =>
  `${projectId}::${rowId}::${index}`;

const getProjectPlanning = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const planning = (value as Record<string, unknown>).planning;
  if (!planning || typeof planning !== "object" || Array.isArray(planning)) {
    return null;
  }

  return planning as Record<string, unknown>;
};

const getStoredRuns = (value: unknown): TestRunRecord[] => {
  const planning = getProjectPlanning(value);
  const runs = planning?.runs;

  if (!Array.isArray(runs)) {
    return [];
  }

  return runs
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;

      return {
        id: typeof record.id === "string" ? record.id : "",
        name: typeof record.name === "string" ? record.name : "Untitled Run",
        status:
          record.status === "active" ||
          record.status === "completed" ||
          record.status === "draft"
            ? record.status
            : "draft",
        rowResults:
          record.rowResults && typeof record.rowResults === "object" && !Array.isArray(record.rowResults)
            ? Object.fromEntries(
                Object.entries(record.rowResults).filter(
                  ([, result]) =>
                    result === "not-run" ||
                    result === "passed" ||
                    result === "failed" ||
                    result === "blocked"
                )
              )
            : {},
        rowActualResults:
          record.rowActualResults &&
          typeof record.rowActualResults === "object" &&
          !Array.isArray(record.rowActualResults)
            ? Object.fromEntries(
                Object.entries(record.rowActualResults).filter(
                  ([, value]) => typeof value === "string"
                )
              )
            : {},
        rowNotes:
          record.rowNotes &&
          typeof record.rowNotes === "object" &&
          !Array.isArray(record.rowNotes)
            ? Object.fromEntries(
                Object.entries(record.rowNotes).filter(
                  ([, value]) => typeof value === "string"
                )
              )
            : {},
        rowStepNotes:
          record.rowStepNotes &&
          typeof record.rowStepNotes === "object" &&
          !Array.isArray(record.rowStepNotes)
            ? Object.fromEntries(
                Object.entries(record.rowStepNotes).map(([rowId, value]) => [
                  rowId,
                  value && typeof value === "object" && !Array.isArray(value)
                    ? (Object.fromEntries(
                        Object.entries(value).filter(
                          ([, note]) => typeof note === "string"
                        )
                      ) as Record<string, string>)
                    : {},
                ])
              )
            : {},
        rowStepActualResults:
          record.rowStepActualResults &&
          typeof record.rowStepActualResults === "object" &&
          !Array.isArray(record.rowStepActualResults)
            ? Object.fromEntries(
                Object.entries(record.rowStepActualResults).map(([rowId, value]) => [
                  rowId,
                  value && typeof value === "object" && !Array.isArray(value)
                    ? (Object.fromEntries(
                        Object.entries(value).filter(
                          ([, note]) => typeof note === "string"
                        )
                      ) as Record<string, string>)
                    : {},
                ])
              )
            : {},
        rowStepEvidence:
          record.rowStepEvidence &&
          typeof record.rowStepEvidence === "object" &&
          !Array.isArray(record.rowStepEvidence)
            ? Object.fromEntries(
                Object.entries(record.rowStepEvidence).map(([rowId, value]) => [
                  rowId,
                  value && typeof value === "object" && !Array.isArray(value)
                    ? (Object.fromEntries(
                        Object.entries(value).filter(
                          ([, note]) => typeof note === "string"
                        )
                      ) as Record<string, string>)
                    : {},
                ])
              )
            : {},
        rowStepResults:
          record.rowStepResults &&
          typeof record.rowStepResults === "object" &&
          !Array.isArray(record.rowStepResults)
            ? Object.fromEntries(
                Object.entries(record.rowStepResults).map(([rowId, value]) => [
                  rowId,
                  value && typeof value === "object" && !Array.isArray(value)
                    ? (Object.fromEntries(
                        Object.entries(value).filter(
                          ([, result]) =>
                            result === "not-run" ||
                            result === "passed" ||
                            result === "failed" ||
                            result === "blocked"
                        )
                      ) as Record<
                        string,
                        "not-run" | "passed" | "failed" | "blocked"
                      >)
                    : {},
                ])
              )
            : {},
        linkedDefectIds:
          record.linkedDefectIds &&
          typeof record.linkedDefectIds === "object" &&
          !Array.isArray(record.linkedDefectIds)
            ? Object.fromEntries(
                Object.entries(record.linkedDefectIds).map(([rowId, value]) => [
                  rowId,
                  Array.isArray(value)
                    ? value.filter(
                        (item): item is string =>
                          typeof item === "string" && item.trim().length > 0
                      )
                    : [],
                ])
              )
            : {},
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : Date.now(),
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      } satisfies TestRunRecord;
    })
    .filter((item): item is TestRunRecord => Boolean(item?.id));
};

const getStoredAutomationScripts = (
  value: unknown
): Project["automationScripts"] => {
  const planning = getProjectPlanning(value);
  const scripts = planning?.automationScripts;

  if (!Array.isArray(scripts)) {
    return [];
  }

  const parsedScripts: AutomationScript[] = [];

  scripts.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.projectId !== "string" ||
      typeof record.name !== "string"
    ) {
      return;
    }

    const provider =
      record.provider === "playwright" ||
      record.provider === "cypress" ||
      record.provider === "api" ||
      record.provider === "mobile"
        ? (record.provider as AutomationProvider)
        : "playwright";

    parsedScripts.push({
      id: record.id,
      projectId: record.projectId,
      provider,
      executionMode: record.executionMode === "headed" ? "headed" : "headless",
      environmentBindingId:
        typeof record.environmentBindingId === "string"
          ? record.environmentBindingId
          : undefined,
      name: record.name,
      description:
        typeof record.description === "string" ? record.description : undefined,
      sourceType:
        record.sourceType === "standalone" ? "standalone" : "case-linked",
      linkedCaseIds: Array.isArray(record.linkedCaseIds)
        ? record.linkedCaseIds.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0
          )
        : [],
      linkedRequirementIds: Array.isArray(record.linkedRequirementIds)
        ? record.linkedRequirementIds.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0
          )
        : [],
      linkedReleaseIds: Array.isArray(record.linkedReleaseIds)
        ? record.linkedReleaseIds.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0
          )
        : [],
      linkedIssueIds: Array.isArray(record.linkedIssueIds)
        ? record.linkedIssueIds.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0
          )
        : [],
      createdBy:
        typeof record.createdBy === "string" ? record.createdBy : undefined,
      createdAt:
        typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      updatedAt:
        typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    });
  });

  return parsedScripts;
};

const getStoredAutomationSuites = (
  value: unknown
): Project["automationSuites"] => {
  const planning = getProjectPlanning(value);
  const suites = planning?.automationSuites;

  if (!Array.isArray(suites)) {
    return [];
  }

  const parsed: AutomationSuite[] = [];
  suites.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.projectId !== "string" ||
      typeof record.name !== "string"
    ) {
      return;
    }
    const status: AutomationSuiteStatus =
      record.status === "active" || record.status === "paused"
        ? (record.status as AutomationSuiteStatus)
        : "draft";
    parsed.push({
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      description:
        typeof record.description === "string" ? record.description : undefined,
      scenarioIds: Array.isArray(record.scenarioIds)
        ? record.scenarioIds.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      tags: Array.isArray(record.tags)
        ? record.tags.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      status,
      environmentBindingId:
        typeof record.environmentBindingId === "string"
          ? record.environmentBindingId
          : undefined,
      createdAt:
        typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      updatedAt:
        typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    });
  });
  return parsed;
};

const getStoredAutomationActions = (
  value: unknown
): Project["automationActions"] => {
  const planning = getProjectPlanning(value);
  const actions = planning?.automationActions;

  if (!Array.isArray(actions)) {
    return [];
  }

  const parsed: AutomationAction[] = [];
  actions.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.projectId !== "string" ||
      typeof record.name !== "string"
    ) {
      return;
    }

    const provider =
      record.provider === "playwright" ||
      record.provider === "cypress" ||
      record.provider === "api" ||
      record.provider === "mobile"
        ? (record.provider as AutomationProvider)
        : "playwright";

    const parameters: AutomationActionParameter[] = Array.isArray(record.parameters)
      ? record.parameters.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }
          const parameter = entry as Record<string, unknown>;
          if (typeof parameter.id !== "string" || typeof parameter.name !== "string") {
            return [];
          }
          return [
            {
              id: parameter.id,
              name: parameter.name,
              description:
                typeof parameter.description === "string"
                  ? parameter.description
                  : undefined,
              required:
                typeof parameter.required === "boolean"
                  ? parameter.required
                  : undefined,
              defaultValue:
                typeof parameter.defaultValue === "string"
                  ? parameter.defaultValue
                  : undefined,
            },
          ];
        })
      : [];

    const outputs = Array.isArray(record.outputs)
      ? record.outputs.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }
          const output = entry as Record<string, unknown>;
          if (typeof output.name !== "string") {
            return [];
          }
          return [
            {
              name: output.name,
              description:
                typeof output.description === "string"
                  ? output.description
                  : undefined,
            },
          ];
        })
      : [];

    parsed.push({
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      description:
        typeof record.description === "string" ? record.description : undefined,
      tags: Array.isArray(record.tags)
        ? record.tags.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      provider,
      parameters,
      steps: Array.isArray(record.steps)
        ? (record.steps as AutomationStep[])
        : [],
      outputs,
      backingBlockId:
        typeof record.backingBlockId === "string"
          ? record.backingBlockId
          : undefined,
      createdAt:
        typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      updatedAt:
        typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    });
  });

  return parsed;
};

const getStoredAutomationScenarios = (
  value: unknown
): Project["automationScenarios"] => {
  const planning = getProjectPlanning(value);
  const scenarios = planning?.automationScenarios;

  if (!Array.isArray(scenarios)) {
    return [];
  }

  const parsed: AutomationScenario[] = [];
  scenarios.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.projectId !== "string" ||
      typeof record.name !== "string"
    ) {
      return;
    }
    const provider =
      record.provider === "playwright" ||
      record.provider === "cypress" ||
      record.provider === "api" ||
      record.provider === "mobile"
        ? (record.provider as AutomationProvider)
        : "playwright";
    const priority: AutomationScenarioPriority =
      record.priority === "highest" ||
      record.priority === "high" ||
      record.priority === "medium" ||
      record.priority === "low"
        ? (record.priority as AutomationScenarioPriority)
        : "medium";
    const status: AutomationScenarioStatus =
      record.status === "draft" ||
      record.status === "ready" ||
      record.status === "active" ||
      record.status === "paused"
        ? (record.status as AutomationScenarioStatus)
        : "draft";
    const parameterizationMode: AutomationScenarioParameterizationMode =
      record.parameterizationMode === "selected-dataset" ||
      record.parameterizationMode === "all-datasets"
        ? (record.parameterizationMode as AutomationScenarioParameterizationMode)
        : "default-only";
    parsed.push({
      id: record.id,
      projectId: record.projectId,
      suiteId: typeof record.suiteId === "string" ? record.suiteId : undefined,
      scriptId: typeof record.scriptId === "string" ? record.scriptId : undefined,
      provider,
      executionMode: record.executionMode === "headed" ? "headed" : "headless",
      environmentBindingId:
        typeof record.environmentBindingId === "string"
          ? record.environmentBindingId
          : undefined,
      name: record.name,
      description:
        typeof record.description === "string" ? record.description : undefined,
      tags: Array.isArray(record.tags)
        ? record.tags.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      priority,
      status,
      testDataSetIds: Array.isArray(record.testDataSetIds)
        ? record.testDataSetIds.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      defaultDataSetId:
        typeof record.defaultDataSetId === "string"
          ? record.defaultDataSetId
          : undefined,
      parameterizationMode,
      sourceType: record.sourceType === "standalone" ? "standalone" : "case-linked",
      linkedCaseIds: Array.isArray(record.linkedCaseIds)
        ? record.linkedCaseIds.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      linkedRequirementIds: Array.isArray(record.linkedRequirementIds)
        ? record.linkedRequirementIds.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      linkedReleaseIds: Array.isArray(record.linkedReleaseIds)
        ? record.linkedReleaseIds.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      linkedIssueIds: Array.isArray(record.linkedIssueIds)
        ? record.linkedIssueIds.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0
          )
        : [],
      createdBy:
        typeof record.createdBy === "string" ? record.createdBy : undefined,
      createdAt:
        typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      updatedAt:
        typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    });
  });
  return parsed;
};

const getStoredAutomationScenarioTestDataSets = (
  value: unknown
): Project["automationScenarioTestDataSets"] => {
  const planning = getProjectPlanning(value);
  const sets = planning?.automationScenarioTestDataSets;

  if (!Array.isArray(sets)) {
    return [];
  }

  const parsed: ScenarioTestDataSet[] = [];
  sets.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.scenarioId !== "string" ||
      typeof record.name !== "string"
    ) {
      return;
    }
    const variables =
      record.variables &&
      typeof record.variables === "object" &&
      !Array.isArray(record.variables)
        ? Object.fromEntries(
            Object.entries(record.variables as Record<string, unknown>)
              .filter(([, value]) => typeof value === "string")
              .map(([key, value]) => [key, value as string])
          )
        : {};
    parsed.push({
      id: record.id,
      scenarioId: record.scenarioId,
      name: record.name,
      description:
        typeof record.description === "string" ? record.description : undefined,
      variables,
      isDefault: Boolean(record.isDefault),
      createdAt:
        typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      updatedAt:
        typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    });
  });
  return parsed;
};

const getStoredAutomationSteps = (
  value: unknown
): Project["automationSteps"] => {
  const planning = getProjectPlanning(value);
  const steps = planning?.automationSteps;

  if (!steps || typeof steps !== "object" || Array.isArray(steps)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(steps).map(([scriptId, entries]) => {
      const parsedSteps: AutomationStep[] = [];

      if (Array.isArray(entries)) {
        entries.forEach((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return;
          }

          const record = item as Record<string, unknown>;
          if (
            typeof record.id !== "string" ||
            typeof record.scriptId !== "string" ||
            typeof record.order !== "number" ||
            typeof record.action !== "string"
          ) {
            return;
          }

          const action = [
            "goto",
            "click",
            "fill",
            "select",
            "press",
            "wait-for",
            "assert-text",
            "assert-visible",
            "assert-url",
            "assert-value",
            "run-block",
          ].includes(record.action)
            ? (record.action as AutomationStepAction)
            : null;

          if (!action) {
            return;
          }

          const targetType = [
            "selector",
            "url",
            "endpoint",
            "text",
            "value",
            "key",
            "shared-block",
            "selector-preset",
            "route",
          ].includes(String(record.targetType))
            ? (record.targetType as AutomationTargetType)
            : undefined;

          parsedSteps.push({
            id: record.id,
            scriptId: record.scriptId,
            order: record.order,
            action,
            targetType,
            targetValue:
              typeof record.targetValue === "string" ? record.targetValue : undefined,
            inputValue:
              typeof record.inputValue === "string" ? record.inputValue : undefined,
            assertionType:
              typeof record.assertionType === "string"
                ? record.assertionType
                : undefined,
            expectedValue:
              typeof record.expectedValue === "string"
                ? record.expectedValue
                : undefined,
            timeoutMs:
              typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
            sharedBlockId:
              typeof record.sharedBlockId === "string"
                ? record.sharedBlockId
                : undefined,
            selectorPresetId:
              typeof record.selectorPresetId === "string"
                ? record.selectorPresetId
                : undefined,
            routeKey:
              typeof record.routeKey === "string" ? record.routeKey : undefined,
            metaJson:
              record.metaJson &&
              typeof record.metaJson === "object" &&
              !Array.isArray(record.metaJson)
                ? (record.metaJson as Record<string, unknown>)
                : undefined,
          });
        });
      }

      return [scriptId, parsedSteps];
    })
  );
};

const automationV2CommandTypes = [
  "navigate",
  "click",
  "fill",
  "select",
  "hover",
  "press",
  "assert-text",
  "assert-image",
  "assert-a11y",
  "assert-label",
  "assert-focus",
  "run-action",
] as const;

const automationV2ScenarioStatuses = [
  "draft",
  "ready",
  "active",
  "paused",
] as const;

const automationV2RunStatuses = [
  "not-run",
  "passed",
  "failed",
  "blocked",
] as const;

const automationV2CommandStatuses = [
  "pending",
  "passed",
  "failed",
  "blocked",
] as const;

const getStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0
      )
    : [];

const parseAutomationV2Locator = (value: unknown): AutomationV2Locator | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const strategy = [
    "role",
    "text",
    "label",
    "placeholder",
    "testid",
    "css",
    "xpath",
    "image",
    "a11y",
  ].includes(String(record.strategy))
    ? (record.strategy as AutomationV2Locator["strategy"])
    : "css";

  return {
    strategy,
    value: typeof record.value === "string" ? record.value : "",
    stable: typeof record.stable === "string" ? record.stable : undefined,
    cssPath: typeof record.cssPath === "string" ? record.cssPath : undefined,
    label: typeof record.label === "string" ? record.label : undefined,
    role: typeof record.role === "string" ? record.role : undefined,
    tagName: typeof record.tagName === "string" ? record.tagName : undefined,
    text: typeof record.text === "string" ? record.text : undefined,
  };
};

const parseAutomationV2Command = (
  value: unknown,
  fallbackScenarioId: string,
  fallbackOrder: number
): AutomationV2Command | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") {
    return null;
  }

  const type = automationV2CommandTypes.includes(
    record.type as AutomationV2CommandType
  )
    ? (record.type as AutomationV2CommandType)
    : "click";
  const status = automationV2CommandStatuses.includes(
    record.status as AutomationV2CommandStatus
  )
    ? (record.status as AutomationV2CommandStatus)
    : undefined;

  return {
    id: record.id,
    scenarioId:
      typeof record.scenarioId === "string" ? record.scenarioId : fallbackScenarioId,
    order: typeof record.order === "number" ? record.order : fallbackOrder,
    type,
    name: typeof record.name === "string" ? record.name : type,
    description:
      typeof record.description === "string" ? record.description : undefined,
    locator: parseAutomationV2Locator(record.locator),
    inputValue:
      typeof record.inputValue === "string" ? record.inputValue : undefined,
    expectedValue:
      typeof record.expectedValue === "string" ? record.expectedValue : undefined,
    url: typeof record.url === "string" ? record.url : undefined,
    key: typeof record.key === "string" ? record.key : undefined,
    actionId: typeof record.actionId === "string" ? record.actionId : undefined,
    status,
    createdAt:
      typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    updatedAt:
      typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    meta:
      record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
        ? (record.meta as Record<string, unknown>)
        : undefined,
  };
};

const parseAutomationV2Commands = (
  value: unknown,
  scenarioId: string
): AutomationV2Command[] =>
  Array.isArray(value)
    ? value
        .map((entry, index) => parseAutomationV2Command(entry, scenarioId, index))
        .filter((entry): entry is AutomationV2Command => Boolean(entry))
        .sort((left, right) => left.order - right.order)
    : [];

const getStoredAutomationV2Scenarios = (
  value: unknown
): Project["automationV2Scenarios"] => {
  const planning = getProjectPlanning(value);
  const scenarios = planning?.automationV2Scenarios;

  if (!Array.isArray(scenarios)) {
    return [];
  }

  return scenarios
    .map((item): AutomationV2Scenario | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.projectId !== "string" ||
        typeof record.name !== "string"
      ) {
        return null;
      }

      const status = automationV2ScenarioStatuses.includes(
        record.status as AutomationV2ScenarioStatus
      )
        ? (record.status as AutomationV2ScenarioStatus)
        : "draft";

      return {
        id: record.id,
        projectId: record.projectId,
        suiteId: typeof record.suiteId === "string" ? record.suiteId : undefined,
        name: record.name,
        description:
          typeof record.description === "string" ? record.description : undefined,
        tags: getStringArray(record.tags),
        status,
        startUrl: typeof record.startUrl === "string" ? record.startUrl : undefined,
        commands: parseAutomationV2Commands(record.commands, record.id),
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : Date.now(),
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
        lastRunAt:
          typeof record.lastRunAt === "number" ? record.lastRunAt : undefined,
      } satisfies AutomationV2Scenario;
    })
    .filter((entry): entry is AutomationV2Scenario => Boolean(entry));
};

const getStoredAutomationV2Actions = (
  value: unknown
): Project["automationV2Actions"] => {
  const planning = getProjectPlanning(value);
  const actions = planning?.automationV2Actions;

  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .map((item): AutomationV2Action | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.projectId !== "string" ||
        typeof record.name !== "string"
      ) {
        return null;
      }

      return {
        id: record.id,
        projectId: record.projectId,
        name: record.name,
        description:
          typeof record.description === "string" ? record.description : undefined,
        tags: getStringArray(record.tags),
        parameters: Array.isArray(record.parameters)
          ? record.parameters.flatMap((entry) => {
              if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                return [];
              }
              const parameter = entry as Record<string, unknown>;
              return typeof parameter.id === "string" &&
                typeof parameter.name === "string"
                ? [
                    {
                      id: parameter.id,
                      name: parameter.name,
                      defaultValue:
                        typeof parameter.defaultValue === "string"
                          ? parameter.defaultValue
                          : undefined,
                      required:
                        typeof parameter.required === "boolean"
                          ? parameter.required
                          : undefined,
                    },
                  ]
                : [];
            })
          : [],
        commands: parseAutomationV2Commands(record.commands, record.id),
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : Date.now(),
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      } satisfies AutomationV2Action;
    })
    .filter((entry): entry is AutomationV2Action => Boolean(entry));
};

const getStoredAutomationV2Runs = (value: unknown): Project["automationV2Runs"] => {
  const planning = getProjectPlanning(value);
  const runs = planning?.automationV2Runs;

  if (!Array.isArray(runs)) {
    return [];
  }

  return runs
    .map((item): AutomationV2Run | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.scenarioId !== "string" ||
        typeof record.scenarioName !== "string" ||
        typeof record.startedAt !== "number"
      ) {
        return null;
      }

      const status = automationV2RunStatuses.includes(
        record.status as AutomationV2RunStatus
      )
        ? (record.status as AutomationV2RunStatus)
        : "not-run";

      return {
        id: record.id,
        scenarioId: record.scenarioId,
        scenarioName: record.scenarioName,
        status,
        startedAt: record.startedAt,
        finishedAt:
          typeof record.finishedAt === "number" ? record.finishedAt : undefined,
        logs: getStringArray(record.logs),
        commandResults: Array.isArray(record.commandResults)
          ? record.commandResults.flatMap((entry) => {
              if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                return [];
              }
              const result = entry as Record<string, unknown>;
              if (
                typeof result.commandId !== "string" ||
                typeof result.commandName !== "string"
              ) {
                return [];
              }
              const commandType = automationV2CommandTypes.includes(
                result.commandType as AutomationV2CommandType
              )
                ? (result.commandType as AutomationV2CommandType)
                : "click";
              const commandStatus = automationV2CommandStatuses.includes(
                result.status as AutomationV2CommandStatus
              )
                ? (result.status as AutomationV2CommandStatus)
                : "pending";
              return [
                {
                  commandId: result.commandId,
                  commandName: result.commandName,
                  commandType,
                  status: commandStatus,
                  message:
                    typeof result.message === "string" ? result.message : undefined,
                  startedAt:
                    typeof result.startedAt === "number"
                      ? result.startedAt
                      : undefined,
                  finishedAt:
                    typeof result.finishedAt === "number"
                      ? result.finishedAt
                      : undefined,
                },
              ];
            })
          : [],
      } satisfies AutomationV2Run;
    })
    .filter((entry): entry is AutomationV2Run => Boolean(entry));
};

const getStoredAutomationBindings = (
  value: unknown
): Project["automationBindings"] => {
  const planning = getProjectPlanning(value);
  const bindings = planning?.automationBindings;

  if (!Array.isArray(bindings)) {
    return [];
  }

  return bindings
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.testCaseId !== "string" ||
        typeof record.scriptId !== "string"
      ) {
        return null;
      }

      const mode =
        record.mode === "manual" ||
        record.mode === "automated" ||
        record.mode === "hybrid"
          ? record.mode
          : "manual";

      return {
        id: record.id,
        testCaseId: record.testCaseId,
        scriptId: record.scriptId,
        mode,
      } satisfies AutomationBinding;
    })
    .filter((item): item is AutomationBinding => Boolean(item));
};

const getStoredAutomationExecutions = (
  value: unknown
): Project["automationExecutions"] => {
  const planning = getProjectPlanning(value);
  const executions = planning?.automationExecutions;

  if (!Array.isArray(executions)) {
    return [];
  }

  const parsedExecutions: AutomationExecution[] = [];

  executions.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.runId !== "string" ||
      typeof record.caseId !== "string" ||
      typeof record.scriptId !== "string" ||
      typeof record.startedAt !== "number"
    ) {
      return;
    }

    const provider =
      record.provider === "playwright" ||
      record.provider === "cypress" ||
      record.provider === "api" ||
      record.provider === "mobile"
        ? (record.provider as AutomationProvider)
        : "playwright";

    const status =
      record.status === "not-run" ||
      record.status === "passed" ||
      record.status === "failed" ||
      record.status === "blocked"
        ? (record.status as AutomationExecutionStatus)
        : "not-run";

    parsedExecutions.push({
      id: record.id,
      runId: record.runId,
      caseId: record.caseId,
      scriptId: record.scriptId,
      suiteId: typeof record.suiteId === "string" ? record.suiteId : undefined,
      suiteName:
        typeof record.suiteName === "string" ? record.suiteName : undefined,
      scenarioId:
        typeof record.scenarioId === "string" ? record.scenarioId : undefined,
      scenarioName:
        typeof record.scenarioName === "string"
          ? record.scenarioName
          : undefined,
      dataSetId:
        typeof record.dataSetId === "string" ? record.dataSetId : undefined,
      dataSetName:
        typeof record.dataSetName === "string"
          ? record.dataSetName
          : undefined,
      dataSetVariables:
        record.dataSetVariables &&
        typeof record.dataSetVariables === "object" &&
        !Array.isArray(record.dataSetVariables)
          ? Object.fromEntries(
              Object.entries(record.dataSetVariables as Record<string, unknown>)
                .filter(([, value]) => typeof value === "string")
                .map(([key, value]) => [key, value as string])
            )
          : undefined,
      environmentBindingId:
        typeof record.environmentBindingId === "string"
          ? record.environmentBindingId
          : undefined,
      environmentName:
        typeof record.environmentName === "string"
          ? record.environmentName
          : undefined,
      provider,
      executionMode:
        record.executionMode === "headed" ? "headed" : "headless",
      triggerType:
        record.triggerType === "scheduled" ? "scheduled" : "manual",
      scheduleId:
        typeof record.scheduleId === "string" ? record.scheduleId : undefined,
      scheduleName:
        typeof record.scheduleName === "string" ? record.scheduleName : undefined,
      status,
      startedAt: record.startedAt,
      finishedAt:
        typeof record.finishedAt === "number" ? record.finishedAt : undefined,
      logSummary:
        typeof record.logSummary === "string" ? record.logSummary : undefined,
      failureMessage:
        typeof record.failureMessage === "string"
          ? record.failureMessage
          : undefined,
      failureOrigin:
        record.failureOrigin === "shared-block" || record.failureOrigin === "local-step"
          ? record.failureOrigin
          : undefined,
      failureReferenceId:
        typeof record.failureReferenceId === "string"
          ? record.failureReferenceId
          : undefined,
      stepResults: Array.isArray(record.stepResults)
        ? record.stepResults
            .map((stepResult) => {
              if (
                !stepResult ||
                typeof stepResult !== "object" ||
                Array.isArray(stepResult)
              ) {
                return null;
              }

              const nextRecord = stepResult as Record<string, unknown>;
              if (
                typeof nextRecord.stepId !== "string" ||
                typeof nextRecord.stepIndex !== "number" ||
                typeof nextRecord.action !== "string"
              ) {
                return null;
              }

              return {
                stepId: nextRecord.stepId,
                sourceStepId:
                  typeof nextRecord.sourceStepId === "string"
                    ? nextRecord.sourceStepId
                    : undefined,
                stepIndex: nextRecord.stepIndex,
                action: (
                  nextRecord.action === "goto" ||
                  nextRecord.action === "click" ||
                  nextRecord.action === "fill" ||
                  nextRecord.action === "select" ||
                  nextRecord.action === "press" ||
                  nextRecord.action === "wait-for" ||
                  nextRecord.action === "assert-text" ||
                  nextRecord.action === "assert-visible" ||
                  nextRecord.action === "assert-url" ||
                  nextRecord.action === "assert-value" ||
                  nextRecord.action === "run-block"
                    ? nextRecord.action
                    : "goto"
                ) as AutomationStepAction,
                status: (
                  nextRecord.status === "passed" ||
                  nextRecord.status === "failed" ||
                  nextRecord.status === "blocked" ||
                  nextRecord.status === "pending" ||
                  nextRecord.status === "running" ||
                  nextRecord.status === "skipped"
                    ? nextRecord.status
                    : "pending"
                ) as AutomationStepExecutionStatus,
                targetValue:
                  typeof nextRecord.targetValue === "string"
                    ? nextRecord.targetValue
                    : undefined,
                message:
                  typeof nextRecord.message === "string"
                    ? nextRecord.message
                    : undefined,
                failureReason:
                  typeof nextRecord.failureReason === "string"
                    ? nextRecord.failureReason
                    : undefined,
                logLines: Array.isArray(nextRecord.logLines)
                  ? nextRecord.logLines.filter(
                      (line): line is string => typeof line === "string"
                    )
                  : undefined,
                startedAt:
                  typeof nextRecord.startedAt === "number"
                    ? nextRecord.startedAt
                    : undefined,
                finishedAt:
                  typeof nextRecord.finishedAt === "number"
                    ? nextRecord.finishedAt
                    : undefined,
                durationMs:
                  typeof nextRecord.durationMs === "number"
                    ? nextRecord.durationMs
                    : undefined,
                origin:
                  nextRecord.origin === "shared-block" ||
                  nextRecord.origin === "local-step"
                    ? (nextRecord.origin as "shared-block" | "local-step")
                    : undefined,
                referenceId:
                  typeof nextRecord.referenceId === "string"
                    ? nextRecord.referenceId
                    : undefined,
                referenceLabel:
                  typeof nextRecord.referenceLabel === "string"
                    ? nextRecord.referenceLabel
                    : undefined,
              };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : undefined,
      artifactIds: Array.isArray(record.artifactIds)
        ? record.artifactIds.filter(
            (artifactId): artifactId is string =>
              typeof artifactId === "string" && artifactId.trim().length > 0
          )
        : [],
      linkedIssueId:
        typeof record.linkedIssueId === "string" ? record.linkedIssueId : undefined,
      linkedIssueKey:
        typeof record.linkedIssueKey === "string"
          ? record.linkedIssueKey
          : undefined,
    });
  });

  return parsedExecutions;
};

const getStoredAutomationArtifacts = (
  value: unknown
): Project["automationArtifacts"] => {
  const planning = getProjectPlanning(value);
  const artifacts = planning?.automationArtifacts;

  if (!Array.isArray(artifacts)) {
    return [];
  }

  const parsedArtifacts: AutomationExecutionArtifact[] = [];

  artifacts.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.executionId !== "string" ||
      typeof record.path !== "string"
    ) {
      return;
    }

    const type = ["log", "screenshot", "video", "trace"].includes(
      String(record.type)
    )
      ? (record.type as AutomationArtifactType)
      : "log";

    parsedArtifacts.push({
      id: record.id,
      executionId: record.executionId,
      type,
      path: record.path,
      metadataJson:
        record.metadataJson &&
        typeof record.metadataJson === "object" &&
        !Array.isArray(record.metadataJson)
          ? (record.metadataJson as Record<string, unknown>)
          : undefined,
    });
  });

  return parsedArtifacts;
};

const getStoredAutomationReusableBlocks = (
  value: unknown
): Project["automationReusableBlocks"] => {
  const planning = getProjectPlanning(value);
  const blocks = planning?.automationReusableBlocks;

  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.name !== "string" ||
        typeof record.provider !== "string"
      ) {
        return null;
      }

      const provider =
        record.provider === "playwright" ||
        record.provider === "cypress" ||
        record.provider === "api" ||
        record.provider === "mobile"
          ? (record.provider as AutomationProvider)
          : "playwright";

      const steps = Array.isArray(record.steps)
        ? (record.steps as NonNullable<Project["automationReusableBlocks"]>[number]["steps"])
        : [];

      return {
        id: record.id,
        name: record.name,
        description:
          typeof record.description === "string" ? record.description : undefined,
        provider,
        steps,
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : Date.now(),
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getStoredAutomationSelectorPresets = (
  value: unknown
): Project["automationSelectorPresets"] => {
  const planning = getProjectPlanning(value);
  const presets = planning?.automationSelectorPresets;

  if (!Array.isArray(presets)) {
    return [];
  }

  return presets
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.name !== "string" ||
        typeof record.selector !== "string"
      ) {
        return null;
      }
      return {
        id: record.id,
        name: record.name,
        selector: record.selector,
        description:
          typeof record.description === "string" ? record.description : undefined,
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : Date.now(),
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getStoredAutomationEnvironmentBindings = (
  value: unknown
): Project["automationEnvironmentBindings"] => {
  const planning = getProjectPlanning(value);
  const bindings = planning?.automationEnvironmentBindings;

  if (!Array.isArray(bindings)) {
    return [];
  }

  return bindings
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.name !== "string") {
        return null;
      }
      const platformDomain =
        record.platformDomain === "salesforce" ? ("salesforce" as const) : undefined;
      return {
        id: record.id,
        name: record.name,
        baseUrl:
          typeof record.baseUrl === "string" ? record.baseUrl : undefined,
        platformDomain,
        environmentScope:
          typeof record.environmentScope === "string"
            ? record.environmentScope
            : undefined,
        salesforceOrgAlias:
          typeof record.salesforceOrgAlias === "string"
            ? record.salesforceOrgAlias
            : undefined,
        routePresets:
          record.routePresets &&
          typeof record.routePresets === "object" &&
          !Array.isArray(record.routePresets)
            ? Object.fromEntries(
                Object.entries(record.routePresets).filter(
                  ([key, value]) => typeof key === "string" && typeof value === "string"
                )
              )
            : undefined,
        credentialAliases: Array.isArray(record.credentialAliases)
          ? record.credentialAliases.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0
            )
          : [],
        salesforceUserAliases: Array.isArray(record.salesforceUserAliases)
          ? record.salesforceUserAliases.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0
            )
          : [],
        salesforceProfileAliases: Array.isArray(record.salesforceProfileAliases)
          ? record.salesforceProfileAliases.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0
            )
          : [],
        salesforceAppAliases: Array.isArray(record.salesforceAppAliases)
          ? record.salesforceAppAliases.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0
            )
          : [],
        isDefault: Boolean(record.isDefault),
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : Date.now(),
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getStoredAutomationSchedules = (
  value: unknown
): Project["automationSchedules"] => {
  const planning = getProjectPlanning(value);
  const schedules = planning?.automationSchedules;

  if (!Array.isArray(schedules)) {
    return [];
  }

  return schedules
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.scriptId !== "string" ||
        typeof record.name !== "string"
      ) {
        return null;
      }

      const scheduleStatus =
        record.status === "running" ||
        record.status === "paused" ||
        record.status === "completed" ||
        record.status === "failed" ||
        record.status === "scheduled"
          ? (record.status as AutomationScheduleStatus)
          : record.isEnabled === false
            ? ("paused" as AutomationScheduleStatus)
            : ("scheduled" as AutomationScheduleStatus);

      return {
        id: record.id,
        scriptId: record.scriptId,
        suiteId: typeof record.suiteId === "string" ? record.suiteId : undefined,
        scenarioId:
          typeof record.scenarioId === "string" ? record.scenarioId : undefined,
        datasetId:
          typeof record.datasetId === "string" ? record.datasetId : undefined,
        runAllDataSets: Boolean(record.runAllDataSets),
        name: record.name,
        frequency:
          record.frequency === "once" ||
          record.frequency === "daily" ||
          record.frequency === "weekly" ||
          record.frequency === "custom"
            ? (record.frequency as AutomationScheduleFrequency)
            : ("once" as AutomationScheduleFrequency),
        cronExpression:
          typeof record.cronExpression === "string"
            ? record.cronExpression
            : undefined,
        scheduledFor:
          typeof record.scheduledFor === "number"
            ? record.scheduledFor
            : undefined,
        nextRunAt:
          typeof record.nextRunAt === "number" ? record.nextRunAt : undefined,
        environmentBindingId:
          typeof record.environmentBindingId === "string"
            ? record.environmentBindingId
            : undefined,
        executionMode:
          record.executionMode === "headed"
            ? ("headed" as const)
            : ("headless" as const),
        isEnabled: record.isEnabled !== false,
        status: scheduleStatus,
        lastRunStatus:
          record.lastRunStatus === "passed" ||
          record.lastRunStatus === "failed" ||
          record.lastRunStatus === "blocked" ||
          record.lastRunStatus === "not-run"
            ? (record.lastRunStatus as AutomationExecutionStatus)
            : undefined,
        lastExecutionId:
          typeof record.lastExecutionId === "string"
            ? record.lastExecutionId
            : undefined,
        lastError:
          typeof record.lastError === "string" ? record.lastError : undefined,
        lastRunAt:
          typeof record.lastRunAt === "number" ? record.lastRunAt : undefined,
        lastCheckedAt:
          typeof record.lastCheckedAt === "number"
            ? record.lastCheckedAt
            : undefined,
        createdAt:
          typeof record.createdAt === "number" ? record.createdAt : Date.now(),
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getStoredGenerationFeedbackLog = (
  value: unknown
): Project["generationFeedbackLog"] => {
  const planning = getProjectPlanning(value);
  return Array.isArray(planning?.generationFeedbackLog)
    ? (planning.generationFeedbackLog as Project["generationFeedbackLog"])
    : [];
};

const getStoredTestDataSets = (value: unknown): Project["testDataSets"] => {
  const planning = getProjectPlanning(value);
  const sets = planning?.testDataSets;

  if (!Array.isArray(sets)) {
    return [];
  }

  return sets
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.name !== "string" ||
        typeof record.content !== "string"
      ) {
        return null;
      }

      return {
        id: record.id,
        name: record.name,
        description:
          typeof record.description === "string" ? record.description : undefined,
        content: record.content,
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getStoredCaseTemplates = (value: unknown): Project["caseTemplates"] => {
  const planning = getProjectPlanning(value);
  const templates = planning?.caseTemplates;

  if (!Array.isArray(templates)) {
    return [];
  }

  return templates
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.name !== "string" ||
        typeof record.type !== "string" ||
        typeof record.title !== "string" ||
        typeof record.preconditions !== "string" ||
        typeof record.steps !== "string" ||
        typeof record.expectedResult !== "string"
      ) {
        return null;
      }

      return {
        id: record.id,
        name: record.name,
        externalTemplateId:
          typeof record.externalTemplateId === "string"
            ? record.externalTemplateId
            : undefined,
        category:
          record.category === "provider-starter"
            ? ("provider-starter" as const)
            : ("general" as const),
        pinned: Boolean(record.pinned),
        type: record.type,
        title: record.title,
        preconditions: record.preconditions,
        steps: record.steps,
        expectedResult: record.expectedResult,
        testData:
          typeof record.testData === "string" ? record.testData : undefined,
        automationProvider:
          normalizeAutomationProvider(
            typeof record.automationProvider === "string"
              ? record.automationProvider
              : undefined
          ) || undefined,
        automationReference:
          typeof record.automationReference === "string"
            ? record.automationReference
            : undefined,
        sourceProjectName:
          typeof record.sourceProjectName === "string"
            ? record.sourceProjectName
            : undefined,
        sourceExportedAt:
          typeof record.sourceExportedAt === "string"
            ? record.sourceExportedAt
            : undefined,
        sourceExportedBy:
          typeof record.sourceExportedBy === "string"
            ? record.sourceExportedBy
            : undefined,
        updatedAt:
          typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getStoredCaseComments = (value: unknown): Project["caseComments"] => {
  const planning = getProjectPlanning(value);
  const caseComments = planning?.caseComments;

  if (!caseComments || typeof caseComments !== "object" || Array.isArray(caseComments)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(caseComments).map(([rowId, comments]) => [
      rowId,
      Array.isArray(comments)
        ? comments
            .map((comment) => {
              if (!comment || typeof comment !== "object" || Array.isArray(comment)) {
                return null;
              }

              const record = comment as Record<string, unknown>;

              if (
                typeof record.id !== "string" ||
                typeof record.body !== "string" ||
                typeof record.createdAt !== "number"
              ) {
                return null;
              }

              return {
                id: record.id,
                body: record.body,
                createdAt: record.createdAt,
                authorId:
                  typeof record.authorId === "string" ? record.authorId : undefined,
                authorName:
                  typeof record.authorName === "string" ? record.authorName : undefined,
                authorEmail:
                  typeof record.authorEmail === "string" ? record.authorEmail : undefined,
                resolvedAt:
                  typeof record.resolvedAt === "number" ? record.resolvedAt : undefined,
                resolvedBy:
                  record.resolvedBy &&
                  typeof record.resolvedBy === "object" &&
                  !Array.isArray(record.resolvedBy)
                    ? {
                        id:
                          typeof (record.resolvedBy as Record<string, unknown>).id ===
                          "string"
                            ? ((record.resolvedBy as Record<string, unknown>).id as string)
                            : undefined,
                        name:
                          typeof (record.resolvedBy as Record<string, unknown>).name ===
                          "string"
                            ? ((record.resolvedBy as Record<string, unknown>).name as string)
                            : undefined,
                        email:
                          typeof (record.resolvedBy as Record<string, unknown>).email ===
                          "string"
                            ? ((record.resolvedBy as Record<string, unknown>).email as string)
                            : undefined,
                      }
                    : undefined,
              };
            })
            .filter(
              (comment): comment is NonNullable<typeof comment> => Boolean(comment)
            )
        : [],
    ])
  );
};

const getStoredNotifications = (value: unknown): Project["notifications"] => {
  const planning = getProjectPlanning(value);
  const notifications = planning?.notifications;

  if (!Array.isArray(notifications)) {
    return [];
  }

  return notifications
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.createdAt !== "number" ||
        typeof record.title !== "string" ||
        typeof record.detail !== "string" ||
        (record.type !== "case-mention" && record.type !== "case-watch")
      ) {
        return null;
      }

        return {
          id: record.id,
          type: record.type as "case-mention" | "case-watch",
          createdAt: record.createdAt,
          title: record.title,
          detail: record.detail,
          rowId: typeof record.rowId === "string" ? record.rowId : undefined,
          commentId:
            typeof record.commentId === "string" ? record.commentId : undefined,
          recipientId:
            typeof record.recipientId === "string" ? record.recipientId : undefined,
          recipientLabel:
            typeof record.recipientLabel === "string"
              ? record.recipientLabel
              : undefined,
          readAt: typeof record.readAt === "number" ? record.readAt : undefined,
          archivedAt:
            typeof record.archivedAt === "number" ? record.archivedAt : undefined,
        };
      })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getStoredCaseVersionHistory = (
  value: unknown
): Project["caseVersionHistory"] => {
  const planning = getProjectPlanning(value);
  const caseVersionHistory = planning?.caseVersionHistory;

  if (
    !caseVersionHistory ||
    typeof caseVersionHistory !== "object" ||
    Array.isArray(caseVersionHistory)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(caseVersionHistory).map(([rowId, versions]) => [
      rowId,
      Array.isArray(versions)
        ? versions
            .map((version) => {
              if (!version || typeof version !== "object" || Array.isArray(version)) {
                return null;
              }

              const record = version as Record<string, unknown>;
              const snapshot =
                record.rowSnapshot &&
                typeof record.rowSnapshot === "object" &&
                !Array.isArray(record.rowSnapshot)
                  ? (record.rowSnapshot as TestCaseRow)
                  : null;

              if (
                typeof record.id !== "string" ||
                typeof record.createdAt !== "number" ||
                typeof record.reason !== "string" ||
                !snapshot
              ) {
                return null;
              }

              return {
                id: record.id,
                createdAt: record.createdAt,
                reason: record.reason,
                rowSnapshot: snapshot,
                actorId:
                  typeof record.actorId === "string" ? record.actorId : undefined,
                actorName:
                  typeof record.actorName === "string" ? record.actorName : undefined,
                actorEmail:
                  typeof record.actorEmail === "string" ? record.actorEmail : undefined,
              };
            })
            .filter(
              (version): version is NonNullable<typeof version> => Boolean(version)
            )
        : [],
    ])
  );
};

const getStoredCaseReviewHistory = (
  value: unknown
): Project["caseReviewHistory"] => {
  const planning = getProjectPlanning(value);
  const caseReviewHistory = planning?.caseReviewHistory;

  if (
    !caseReviewHistory ||
    typeof caseReviewHistory !== "object" ||
    Array.isArray(caseReviewHistory)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(caseReviewHistory).map(([rowId, entries]) => [
      rowId,
      Array.isArray(entries)
        ? entries
            .map((entry) => {
              if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                return null;
              }

              const record = entry as Record<string, unknown>;

              if (
                typeof record.id !== "string" ||
                typeof record.createdAt !== "number" ||
                typeof record.action !== "string" ||
                typeof record.detail !== "string"
              ) {
                return null;
              }

              return {
                id: record.id,
                createdAt: record.createdAt,
                action: record.action,
                detail: record.detail,
                actorId:
                  typeof record.actorId === "string" ? record.actorId : undefined,
                actorName:
                  typeof record.actorName === "string" ? record.actorName : undefined,
                actorEmail:
                  typeof record.actorEmail === "string" ? record.actorEmail : undefined,
              } satisfies CaseReviewHistoryEntry;
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        : [],
    ])
  );
};

const getActiveRunId = (value: unknown) => {
  const planning = getProjectPlanning(value);
  return typeof planning?.activeRunId === "string" ? planning.activeRunId : undefined;
};

const getViewPreferences = (value: unknown): Project["viewPreferences"] => {
  const planning = getProjectPlanning(value);
  const viewPreferences = planning?.viewPreferences;

  if (!viewPreferences || typeof viewPreferences !== "object" || Array.isArray(viewPreferences)) {
    return undefined;
  }

  const record = viewPreferences as Record<string, unknown>;
  return {
    casesDefaultPreset:
      record.casesDefaultPreset === "default" ||
      record.casesDefaultPreset === "review-queue" ||
      record.casesDefaultPreset === "failed-linked"
        ? (record.casesDefaultPreset as ProjectViewPreferences["casesDefaultPreset"])
        : undefined,
    runsDefaultPreset:
      record.runsDefaultPreset === "default" ||
      record.runsDefaultPreset === "high-risk" ||
      record.runsDefaultPreset === "failed-linked"
        ? (record.runsDefaultPreset as ProjectViewPreferences["runsDefaultPreset"])
        : undefined,
    casesDefaultSavedViewId:
      typeof record.casesDefaultSavedViewId === "string"
        ? record.casesDefaultSavedViewId
        : undefined,
    runsDefaultSavedViewId:
      typeof record.runsDefaultSavedViewId === "string"
        ? record.runsDefaultSavedViewId
        : undefined,
  };
};

const getSavedViews = (value: unknown): Project["savedViews"] => {
  const planning = getProjectPlanning(value);
  const savedViews = planning?.savedViews;

  if (!savedViews || typeof savedViews !== "object" || Array.isArray(savedViews)) {
    return { cases: [], runs: [] };
  }

  const record = savedViews as Record<string, unknown>;
  const cases = Array.isArray(record.cases)
    ? record.cases
        .map((view) => {
          if (!view || typeof view !== "object" || Array.isArray(view)) {
            return null;
          }
          const item = view as Record<string, unknown>;
          const filters =
            item.filters && typeof item.filters === "object" && !Array.isArray(item.filters)
              ? (item.filters as Record<string, unknown>)
              : null;

          if (
            typeof item.id !== "string" ||
            typeof item.name !== "string" ||
            typeof item.updatedAt !== "number" ||
            !filters
          ) {
            return null;
          }

  return {
    id: item.id,
    name: item.name,
    pinned: Boolean(item.pinned),
    updatedAt: item.updatedAt,
    filters: {
              searchQuery:
                typeof filters.searchQuery === "string" ? filters.searchQuery : "",
              assignee: typeof filters.assignee === "string" ? filters.assignee : "",
              priority:
                filters.priority === "highest" ||
                filters.priority === "high" ||
                filters.priority === "medium" ||
                filters.priority === "low"
                  ? (filters.priority as CasesSavedView["filters"]["priority"])
                  : "",
              testDomain:
                filters.testDomain === "functional" ||
                filters.testDomain === "regression" ||
                filters.testDomain === "api" ||
                filters.testDomain === "ui" ||
                filters.testDomain === "negative" ||
                filters.testDomain === "edge" ||
                filters.testDomain === "security" ||
                filters.testDomain === "accessibility"
                  ? (filters.testDomain as CasesSavedView["filters"]["testDomain"])
                  : "",
              riskLevel:
                filters.riskLevel === "low" ||
                filters.riskLevel === "medium" ||
                filters.riskLevel === "high"
                  ? (filters.riskLevel as CasesSavedView["filters"]["riskLevel"])
                  : "",
              securityCategory:
                filters.securityCategory === "auth" ||
                filters.securityCategory === "authorization" ||
                filters.securityCategory === "session" ||
                filters.securityCategory === "validation" ||
                filters.securityCategory === "data-protection" ||
                filters.securityCategory === "api-security" ||
                filters.securityCategory === "upload-safety" ||
                filters.securityCategory === "business-logic" ||
                filters.securityCategory === "abuse-resistance"
                  ? (filters.securityCategory as CasesSavedView["filters"]["securityCategory"])
                  : "",
              accessibilityCategory:
                filters.accessibilityCategory === "keyboard-navigation" ||
                filters.accessibilityCategory === "focus-management" ||
                filters.accessibilityCategory === "screen-reader" ||
                filters.accessibilityCategory === "forms" ||
                filters.accessibilityCategory === "semantics" ||
                filters.accessibilityCategory === "contrast" ||
                filters.accessibilityCategory === "zoom-reflow" ||
                filters.accessibilityCategory === "error-handling" ||
                filters.accessibilityCategory === "media-content"
                  ? (filters.accessibilityCategory as CasesSavedView["filters"]["accessibilityCategory"])
                  : "",
              approvalState:
                filters.approvalState === "pending" ||
                filters.approvalState === "approved" ||
                filters.approvalState === "rejected"
                  ? (filters.approvalState as CasesSavedView["filters"]["approvalState"])
                  : "",
              handoffState:
                filters.handoffState === "needs-qa-review" ||
                filters.handoffState === "needs-automation" ||
                filters.handoffState === "needs-product-signoff" ||
                filters.handoffState === "release-blocking"
                  ? (filters.handoffState as CasesSavedView["filters"]["handoffState"])
                  : "",
              linked:
                filters.linked === "linked" || filters.linked === "unlinked"
                  ? (filters.linked as CasesSavedView["filters"]["linked"])
                  : "all",
              execution:
                filters.execution === "not-run" ||
                filters.execution === "passed" ||
                filters.execution === "failed" ||
                filters.execution === "blocked"
                  ? (filters.execution as CasesSavedView["filters"]["execution"])
                  : "",
              review:
                filters.review === "draft" ||
                filters.review === "in-review" ||
                filters.review === "approved" ||
                filters.review === "changes-requested"
                  ? (filters.review as CasesSavedView["filters"]["review"])
                  : "",
              reviewHealth:
                filters.reviewHealth === "open-notes" || filters.reviewHealth === "history"
                  ? (filters.reviewHealth as CasesSavedView["filters"]["reviewHealth"])
                  : "",
              collaboration:
                  filters.collaboration === "watching" ||
                  filters.collaboration === "mentioned" ||
                  filters.collaboration === "attention"
                    ? (filters.collaboration as CasesSavedView["filters"]["collaboration"])
                    : "",
              suite: typeof filters.suite === "string" ? filters.suite : "",
              component: typeof filters.component === "string" ? filters.component : "",
              automation:
                filters.automation === "manual" ||
                filters.automation === "candidate" ||
                filters.automation === "automated"
                  ? (filters.automation as CasesSavedView["filters"]["automation"])
                  : "",
              automationProvider:
                normalizeAutomationProvider(
                  typeof filters.automationProvider === "string"
                    ? filters.automationProvider
                    : ""
                ),
              archived:
                filters.archived === "archived" || filters.archived === "all"
                  ? (filters.archived as CasesSavedView["filters"]["archived"])
                  : "active",
            },
          } satisfies CasesSavedView;
        })
        .filter((view): view is NonNullable<typeof view> => Boolean(view))
    : [];

  const runs = Array.isArray(record.runs)
    ? record.runs
        .map((view) => {
          if (!view || typeof view !== "object" || Array.isArray(view)) {
            return null;
          }
          const item = view as Record<string, unknown>;
          const filters =
            item.filters && typeof item.filters === "object" && !Array.isArray(item.filters)
              ? (item.filters as Record<string, unknown>)
              : null;

          if (
            typeof item.id !== "string" ||
            typeof item.name !== "string" ||
            typeof item.updatedAt !== "number" ||
            !filters
          ) {
            return null;
          }

          return {
            id: item.id,
            name: item.name,
            pinned: Boolean(item.pinned),
            updatedAt: item.updatedAt,
            filters: {
              searchQuery:
                typeof filters.searchQuery === "string" ? filters.searchQuery : "",
              execution:
                filters.execution === "not-run" ||
                filters.execution === "passed" ||
                filters.execution === "failed" ||
                filters.execution === "blocked"
                  ? (filters.execution as RunsSavedView["filters"]["execution"])
                  : "",
              linked:
                filters.linked === "linked" || filters.linked === "unlinked"
                  ? (filters.linked as RunsSavedView["filters"]["linked"])
                  : "all",
              highRiskOnly: Boolean(filters.highRiskOnly),
            },
          } satisfies RunsSavedView;
        })
        .filter((view): view is NonNullable<typeof view> => Boolean(view))
    : [];

  return { cases, runs };
};

const getReleaseReviewState = (value: unknown): ReleaseReviewState | undefined => {
  const planning = getProjectPlanning(value);
  const releaseReview = planning?.releaseReview;

  if (!releaseReview || typeof releaseReview !== "object" || Array.isArray(releaseReview)) {
    return undefined;
  }

  const record = releaseReview as Record<string, unknown>;
  const decisionRecordedBy =
    record.decisionRecordedBy &&
    typeof record.decisionRecordedBy === "object" &&
    !Array.isArray(record.decisionRecordedBy)
      ? {
          id:
            typeof (record.decisionRecordedBy as Record<string, unknown>).id === "string"
              ? ((record.decisionRecordedBy as Record<string, unknown>).id as string)
              : undefined,
          name:
            typeof (record.decisionRecordedBy as Record<string, unknown>).name === "string"
              ? ((record.decisionRecordedBy as Record<string, unknown>).name as string)
              : undefined,
          email:
            typeof (record.decisionRecordedBy as Record<string, unknown>).email === "string"
              ? ((record.decisionRecordedBy as Record<string, unknown>).email as string)
              : undefined,
        }
      : undefined;

  return {
    reviewedReasonIds: Array.isArray(record.reviewedReasonIds)
      ? record.reviewedReasonIds.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [],
    reviewedActionIds: Array.isArray(record.reviewedActionIds)
      ? record.reviewedActionIds.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [],
    lastReviewedAt:
      typeof record.lastReviewedAt === "number" ? record.lastReviewedAt : undefined,
    recordedDecision:
      record.recordedDecision === "safe" ||
      record.recordedDecision === "caution" ||
      record.recordedDecision === "blocked"
        ? record.recordedDecision
        : undefined,
    decisionNote:
      typeof record.decisionNote === "string" ? record.decisionNote : undefined,
    decisionRecordedAt:
      typeof record.decisionRecordedAt === "number"
        ? record.decisionRecordedAt
        : undefined,
    decisionRecordedBy:
      decisionRecordedBy &&
      (decisionRecordedBy.id || decisionRecordedBy.name || decisionRecordedBy.email)
        ? decisionRecordedBy
        : undefined,
    waivedAutomationProviders: Array.isArray(record.waivedAutomationProviders)
      ? record.waivedAutomationProviders
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }

            const waiver = item as Record<string, unknown>;
            if (
              typeof waiver.provider !== "string" ||
              typeof waiver.recordedAt !== "number"
            ) {
              return null;
            }

            const recordedBy =
              waiver.recordedBy &&
              typeof waiver.recordedBy === "object" &&
              !Array.isArray(waiver.recordedBy)
                ? {
                    id:
                      typeof (waiver.recordedBy as Record<string, unknown>).id === "string"
                        ? ((waiver.recordedBy as Record<string, unknown>).id as string)
                        : undefined,
                    name:
                      typeof (waiver.recordedBy as Record<string, unknown>).name === "string"
                        ? ((waiver.recordedBy as Record<string, unknown>).name as string)
                        : undefined,
                    email:
                      typeof (waiver.recordedBy as Record<string, unknown>).email === "string"
                        ? ((waiver.recordedBy as Record<string, unknown>).email as string)
                        : undefined,
                  }
                : undefined;

            const provider = normalizeAutomationProvider(waiver.provider);
            if (!provider) {
              return null;
            }

            return {
              provider,
              note: typeof waiver.note === "string" ? waiver.note : undefined,
              recordedAt: waiver.recordedAt,
              recordedBy:
                recordedBy && (recordedBy.id || recordedBy.name || recordedBy.email)
                  ? recordedBy
                  : undefined,
            };
          })
          .filter(Boolean) as NonNullable<ReleaseReviewState["waivedAutomationProviders"]>
      : [],
    snapshots: Array.isArray(record.snapshots)
      ? record.snapshots
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }

            const snapshot = item as Record<string, unknown>;
            const recordedDecision =
              snapshot.recordedDecision === "safe" ||
              snapshot.recordedDecision === "caution" ||
              snapshot.recordedDecision === "blocked"
                ? snapshot.recordedDecision
                : null;
            const level =
              snapshot.level === "safe" ||
              snapshot.level === "caution" ||
              snapshot.level === "blocked"
                ? snapshot.level
                : null;

            if (
              !recordedDecision ||
              !level ||
              typeof snapshot.id !== "string" ||
              typeof snapshot.decisionRecordedAt !== "number" ||
              typeof snapshot.score !== "number" ||
              typeof snapshot.recommendation !== "string"
            ) {
              return null;
            }

            const recordedBy =
              snapshot.recordedBy &&
              typeof snapshot.recordedBy === "object" &&
              !Array.isArray(snapshot.recordedBy)
                ? {
                    id:
                      typeof (snapshot.recordedBy as Record<string, unknown>).id === "string"
                        ? ((snapshot.recordedBy as Record<string, unknown>).id as string)
                        : undefined,
                    name:
                      typeof (snapshot.recordedBy as Record<string, unknown>).name === "string"
                        ? ((snapshot.recordedBy as Record<string, unknown>).name as string)
                        : undefined,
                    email:
                      typeof (snapshot.recordedBy as Record<string, unknown>).email === "string"
                        ? ((snapshot.recordedBy as Record<string, unknown>).email as string)
                        : undefined,
                  }
                : undefined;

            return {
              id: snapshot.id,
              recordedDecision,
              decisionNote:
                typeof snapshot.decisionNote === "string"
                  ? snapshot.decisionNote
                  : undefined,
              decisionRecordedAt: snapshot.decisionRecordedAt,
              recordedBy:
                recordedBy && (recordedBy.id || recordedBy.name || recordedBy.email)
                  ? recordedBy
                  : undefined,
              score: snapshot.score,
              level,
              recommendation: snapshot.recommendation,
              automationCoveragePercent:
                typeof snapshot.automationCoveragePercent === "number"
                  ? snapshot.automationCoveragePercent
                  : undefined,
              automatedCases:
                typeof snapshot.automatedCases === "number"
                  ? snapshot.automatedCases
                  : undefined,
              candidateCases:
                typeof snapshot.candidateCases === "number"
                  ? snapshot.candidateCases
                  : undefined,
              automationReadyCases:
                typeof snapshot.automationReadyCases === "number"
                  ? snapshot.automationReadyCases
                  : undefined,
              automationProviders: Array.isArray(snapshot.automationProviders)
                ? snapshot.automationProviders
                    .map((entry) => {
                      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                        return null;
                      }

                      const providerEntry = entry as Record<string, unknown>;
                      if (
                        typeof providerEntry.provider !== "string" ||
                        typeof providerEntry.count !== "number"
                      ) {
                        return null;
                      }

                      const provider = normalizeAutomationProvider(providerEntry.provider);
                      if (!provider) {
                        return null;
                      }

                      return {
                        provider,
                        count: providerEntry.count,
                      };
                    })
                    .filter(Boolean) as NonNullable<
                    NonNullable<ReleaseReviewState["snapshots"]>[number]["automationProviders"]
                  >
                : undefined,
              waivedAutomationProviders: Array.isArray(snapshot.waivedAutomationProviders)
                ? snapshot.waivedAutomationProviders
                    .map((entry) => {
                      if (typeof entry === "string") {
                        const provider = normalizeAutomationProvider(entry);
                        return provider ? { provider } : null;
                      }

                      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                        return null;
                      }

                      const waiverEntry = entry as Record<string, unknown>;
                      const provider = normalizeAutomationProvider(
                        typeof waiverEntry.provider === "string" ? waiverEntry.provider : ""
                      );
                      if (!provider) {
                        return null;
                      }

                      return {
                        provider,
                        note:
                          typeof waiverEntry.note === "string"
                            ? waiverEntry.note
                            : undefined,
                      };
                    })
                    .filter(Boolean) as NonNullable<
                    NonNullable<ReleaseReviewState["snapshots"]>[number]["waivedAutomationProviders"]
                  >
                : undefined,
              automationHotspots: Array.isArray(snapshot.automationHotspots)
                ? snapshot.automationHotspots
                    .map((entry) => {
                      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                        return null;
                      }

                      const hotspot = entry as Record<string, unknown>;

                      if (
                        typeof hotspot.area !== "string" ||
                        typeof hotspot.automated !== "number" ||
                        typeof hotspot.candidate !== "number" ||
                        typeof hotspot.strongReady !== "number"
                      ) {
                        return null;
                      }

                      return {
                        area: hotspot.area,
                        automated: hotspot.automated,
                        candidate: hotspot.candidate,
                        strongReady: hotspot.strongReady,
                        rowIds: Array.isArray(hotspot.rowIds)
                          ? hotspot.rowIds.filter(
                              (item): item is string =>
                                typeof item === "string" && item.trim().length > 0
                            )
                          : undefined,
                      };
                    })
                    .filter(Boolean) as NonNullable<
                    NonNullable<ReleaseReviewState["snapshots"]>[number]["automationHotspots"]
                  >
                : undefined,
            };
          })
          .filter(Boolean) as NonNullable<ReleaseReviewState["snapshots"]>
      : [],
  };
};

const getLegacyRows = (value: unknown): Project["rows"] => {
  if (Array.isArray(value)) {
    return value as Project["rows"];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const items = (value as Record<string, unknown>).items;
  return Array.isArray(items) ? (items as Project["rows"]) : [];
};

const getActiveRequirement = (project: ProjectRecord) =>
  project.requirements
    .filter((requirement) => requirement.sourceType === SourceType.manual)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ??
  null;

const getLatestChangeComparison = (project: ProjectRecord) =>
  project.changeComparisons
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ??
  null;

const toWorkspaceRows = (project: { rows: unknown; testCases: ProjectRecord["testCases"] }) => {
  if (project.testCases.length === 0) {
    return getLegacyRows(project.rows);
  }

  return project.testCases.map((testCase): TestCaseRow => {
    const linkedIssueId = (testCase as { issueId?: string | null }).issueId;
    const metadata =
      testCase.metadata && typeof testCase.metadata === "object"
        ? (testCase.metadata as Record<string, unknown>)
        : {};

    return {
      id:
        typeof metadata.rowId === "string"
          ? metadata.rowId
          : testCase.caseKey.split("::").at(-1) ?? testCase.caseKey,
      issueId:
        typeof linkedIssueId === "string"
          ? linkedIssueId
          : typeof metadata.issueId === "string"
          ? metadata.issueId
          : undefined,
      issueKey: typeof metadata.issueKey === "string" ? metadata.issueKey : undefined,
      type: toWorkspaceRowType(testCase.type),
      title: testCase.title,
      preconditions: testCase.preconditions,
      steps: testCase.steps,
      expectedResult: testCase.expectedResult,
      testData:
        typeof metadata.testData === "string"
          ? metadata.testData
          : testCase.testData ?? undefined,
      workflowStatus:
        metadata.workflowStatus === "backlog" ||
        metadata.workflowStatus === "todo" ||
        metadata.workflowStatus === "in-progress" ||
        metadata.workflowStatus === "blocked" ||
        metadata.workflowStatus === "done"
          ? metadata.workflowStatus
          : undefined,
      priority:
        metadata.priority === "highest" ||
        metadata.priority === "high" ||
        metadata.priority === "medium" ||
        metadata.priority === "low"
          ? metadata.priority
          : undefined,
      executionResult:
        metadata.executionResult === "not-run" ||
        metadata.executionResult === "passed" ||
        metadata.executionResult === "failed" ||
        metadata.executionResult === "blocked"
          ? metadata.executionResult
          : undefined,
      reviewStatus:
        metadata.reviewStatus === "draft" ||
        metadata.reviewStatus === "in-review" ||
        metadata.reviewStatus === "approved" ||
        metadata.reviewStatus === "changes-requested"
          ? metadata.reviewStatus
          : undefined,
      reviewOwner:
        typeof metadata.reviewOwner === "string" ? metadata.reviewOwner : undefined,
      suiteName:
        typeof metadata.suiteName === "string" ? metadata.suiteName : undefined,
      componentArea:
        typeof metadata.componentArea === "string"
          ? metadata.componentArea
          : undefined,
      testDataSetId:
        typeof metadata.testDataSetId === "string"
          ? metadata.testDataSetId
          : undefined,
      automationStatus:
        metadata.automationStatus === "manual" ||
        metadata.automationStatus === "candidate" ||
        metadata.automationStatus === "automated"
          ? metadata.automationStatus
          : undefined,
      automationProvider:
        normalizeAutomationProvider(
          typeof metadata.automationProvider === "string"
            ? metadata.automationProvider
            : undefined
        ) || undefined,
      automationReference:
        typeof metadata.automationReference === "string"
          ? metadata.automationReference
          : undefined,
      automationScriptId:
        typeof metadata.automationScriptId === "string"
          ? metadata.automationScriptId
          : undefined,
      automationBindingMode:
        metadata.automationBindingMode === "manual" ||
        metadata.automationBindingMode === "automated" ||
        metadata.automationBindingMode === "hybrid"
          ? metadata.automationBindingMode
          : undefined,
      platformDomain:
        metadata.platformDomain === "salesforce" ? "salesforce" : undefined,
      salesforceModule:
        typeof metadata.salesforceModule === "string"
          ? metadata.salesforceModule
          : undefined,
      salesforceObjectType:
        typeof metadata.salesforceObjectType === "string"
          ? metadata.salesforceObjectType
          : undefined,
      salesforceTestType:
        typeof metadata.salesforceTestType === "string"
          ? metadata.salesforceTestType
          : undefined,
      permissionScope:
        typeof metadata.permissionScope === "string"
          ? metadata.permissionScope
          : undefined,
      environmentScope:
        typeof metadata.environmentScope === "string"
          ? metadata.environmentScope
          : undefined,
      generationSource:
        metadata.generationSource === "ai-generated" ||
        metadata.generationSource === "manual" ||
        metadata.generationSource === "imported"
          ? metadata.generationSource
          : undefined,
      generationFeedback:
        metadata.generationFeedback &&
        typeof metadata.generationFeedback === "object" &&
        !Array.isArray(metadata.generationFeedback)
          ? (metadata.generationFeedback as Project["rows"][number]["generationFeedback"])
          : undefined,
      approvalState:
        metadata.approvalState === "pending" ||
        metadata.approvalState === "approved" ||
        metadata.approvalState === "rejected"
          ? metadata.approvalState
          : undefined,
      handoffState:
        metadata.handoffState === "needs-qa-review" ||
        metadata.handoffState === "needs-automation" ||
        metadata.handoffState === "needs-product-signoff" ||
        metadata.handoffState === "release-blocking"
          ? metadata.handoffState
          : undefined,
      generatedBy:
        metadata.generatedBy &&
        typeof metadata.generatedBy === "object" &&
        !Array.isArray(metadata.generatedBy)
          ? (metadata.generatedBy as Project["rows"][number]["generatedBy"])
          : undefined,
      editedBy:
        metadata.editedBy &&
        typeof metadata.editedBy === "object" &&
        !Array.isArray(metadata.editedBy)
          ? (metadata.editedBy as Project["rows"][number]["editedBy"])
          : undefined,
      approvedBy:
        metadata.approvedBy &&
        typeof metadata.approvedBy === "object" &&
        !Array.isArray(metadata.approvedBy)
          ? (metadata.approvedBy as Project["rows"][number]["approvedBy"])
          : undefined,
      rejectedBy:
        metadata.rejectedBy &&
        typeof metadata.rejectedBy === "object" &&
        !Array.isArray(metadata.rejectedBy)
          ? (metadata.rejectedBy as Project["rows"][number]["rejectedBy"])
          : undefined,
      releaseReviewedBy:
        metadata.releaseReviewedBy &&
        typeof metadata.releaseReviewedBy === "object" &&
        !Array.isArray(metadata.releaseReviewedBy)
          ? (metadata.releaseReviewedBy as Project["rows"][number]["releaseReviewedBy"])
          : undefined,
      archived:
        typeof metadata.archived === "boolean" ? metadata.archived : undefined,
      assignee:
        typeof metadata.assignee === "string" ? metadata.assignee : undefined,
      labels: Array.isArray(metadata.labels)
        ? metadata.labels.filter(
            (label): label is string => typeof label === "string" && label.trim().length > 0
          )
        : undefined,
      gapSourceId:
        typeof metadata.gapSourceId === "string" ? metadata.gapSourceId : undefined,
      gapSourceLabel:
        typeof metadata.gapSourceLabel === "string"
          ? metadata.gapSourceLabel
          : undefined,
      gapSourceMethod:
        metadata.gapSourceMethod === "auto" || metadata.gapSourceMethod === "manual"
          ? metadata.gapSourceMethod
          : undefined,
      predictionSourceId:
        typeof metadata.predictionSourceId === "string"
          ? metadata.predictionSourceId
          : undefined,
      predictionSourceLabel:
        typeof metadata.predictionSourceLabel === "string"
          ? metadata.predictionSourceLabel
          : undefined,
      predictionSourceMethod:
        metadata.predictionSourceMethod === "auto" ||
        metadata.predictionSourceMethod === "manual"
          ? metadata.predictionSourceMethod
          : undefined,
      changeSourceLabel:
        typeof metadata.changeSourceLabel === "string"
          ? metadata.changeSourceLabel
          : undefined,
      changeSourceType:
        metadata.changeSourceType === "new" || metadata.changeSourceType === "updated"
          ? metadata.changeSourceType
          : undefined,
      lifecycleStatus:
        metadata.lifecycleStatus === "keep" ||
        metadata.lifecycleStatus === "new" ||
        metadata.lifecycleStatus === "obsolete" ||
        metadata.lifecycleStatus === "needs-review" ||
        metadata.lifecycleStatus === "needs-update"
          ? metadata.lifecycleStatus
          : undefined,
      createdAt:
        typeof metadata.createdAt === "number" ? metadata.createdAt : undefined,
      updatedAt:
        typeof metadata.updatedAt === "number" ? metadata.updatedAt : undefined,
    };
  });
};

const toWorkspaceRequirementInput = (project: ProjectRecord) =>
  getActiveRequirement(project)?.normalizedContent || project.input;

const toWorkspaceSourceArtifacts = (
  project: ProjectRecord
): Project["sourceArtifacts"] => {
  const importedRequirements = project.requirements
    .filter((requirement) => requirement.sourceType !== SourceType.manual)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  if (importedRequirements.length === 0) {
    return Array.isArray(project.sourceArtifacts)
      ? (project.sourceArtifacts as Project["sourceArtifacts"])
      : [];
  }

  return importedRequirements.map((requirement) => ({
    id: requirement.sourceRef || requirement.id,
    type: toWorkspaceSourceType(requirement.sourceType),
    title: requirement.title,
    rawContent: requirement.rawContent,
    normalizedContent: requirement.normalizedContent,
    importedAt: requirement.createdAt.getTime(),
  }));
};

const toWorkspaceProject = (project: ProjectRecord): Project => {
  const latestChangeComparison = getLatestChangeComparison(project);

  return {
    id: project.id,
    name: project.name,
    projectKey:
      project.key?.trim() ||
      (typeof getProjectPlanning(project.rows)?.projectKey === "string"
        ? (getProjectPlanning(project.rows)?.projectKey as string)
        : ""),
    sprintName:
      typeof getProjectPlanning(project.rows)?.sprintName === "string"
        ? (getProjectPlanning(project.rows)?.sprintName as string)
        : "",
    releaseName:
      typeof getProjectPlanning(project.rows)?.releaseName === "string"
        ? (getProjectPlanning(project.rows)?.releaseName as string)
        : "",
    teamName:
      typeof getProjectPlanning(project.rows)?.teamName === "string"
        ? (getProjectPlanning(project.rows)?.teamName as string)
        : "",
    input: toWorkspaceRequirementInput(project),
    oldRequirement: latestChangeComparison?.oldRequirement || "",
    rows: toWorkspaceRows(project),
    generationMode: project.generationMode as Project["generationMode"],
    coverageDepth: project.coverageDepth as Project["coverageDepth"],
    persona: toWorkspacePersona(project.persona),
    autosaveEnabled: project.autosaveEnabled,
    sourceArtifacts: toWorkspaceSourceArtifacts(project),
    reviewerName: project.reviewerName,
    reviewerNotes: project.reviewerNotes,
    signoffStatus: toWorkspaceSignoffStatus(project.signoffStatus),
    auditTrail: Array.isArray(project.auditTrail)
      ? (project.auditTrail as Project["auditTrail"])
      : [],
    caseComments: getStoredCaseComments(project.rows),
    notifications: getStoredNotifications(project.rows),
    caseVersionHistory: getStoredCaseVersionHistory(project.rows),
    caseReviewHistory: getStoredCaseReviewHistory(project.rows),
    testDataSets: getStoredTestDataSets(project.rows),
    caseTemplates: getStoredCaseTemplates(project.rows),
    viewPreferences: getViewPreferences(project.rows),
    savedViews: getSavedViews(project.rows),
    releaseReview: getReleaseReviewState(project.rows),
    runs: getStoredRuns(project.rows),
    automationSuites: getStoredAutomationSuites(project.rows),
    automationScenarios: getStoredAutomationScenarios(project.rows),
    automationActions: getStoredAutomationActions(project.rows),
    automationScenarioTestDataSets: getStoredAutomationScenarioTestDataSets(
      project.rows
    ),
    automationScripts: getStoredAutomationScripts(project.rows),
    automationSteps: getStoredAutomationSteps(project.rows),
    automationBindings: getStoredAutomationBindings(project.rows),
    automationExecutions: getStoredAutomationExecutions(project.rows),
    automationArtifacts: getStoredAutomationArtifacts(project.rows),
    automationReusableBlocks: getStoredAutomationReusableBlocks(project.rows),
    automationSelectorPresets: getStoredAutomationSelectorPresets(project.rows),
    automationEnvironmentBindings: getStoredAutomationEnvironmentBindings(project.rows),
    automationSchedules: getStoredAutomationSchedules(project.rows),
    activeAutomationEnvironmentId:
      typeof getProjectPlanning(project.rows)?.activeAutomationEnvironmentId === "string"
        ? (getProjectPlanning(project.rows)?.activeAutomationEnvironmentId as string)
        : "",
    automationV2Scenarios: getStoredAutomationV2Scenarios(project.rows),
    automationV2Actions: getStoredAutomationV2Actions(project.rows),
    automationV2Runs: getStoredAutomationV2Runs(project.rows),
    activeAutomationV2ScenarioId:
      typeof getProjectPlanning(project.rows)?.activeAutomationV2ScenarioId === "string"
        ? (getProjectPlanning(project.rows)?.activeAutomationV2ScenarioId as string)
        : "",
    generationFeedbackLog: getStoredGenerationFeedbackLog(project.rows),
    activeRunId: getActiveRunId(project.rows),
    lastGeneratedChangeImpactSignature: latestChangeComparison?.signature ?? null,
    latestChangeEntries: Array.isArray(latestChangeComparison?.changes)
      ? (latestChangeComparison?.changes as Project["latestChangeEntries"])
      : [],
    changeComparisonCount: project.changeComparisons.length,
    activeRequirementId: getActiveRequirement(project)?.id ?? undefined,
    requirementCount: project.requirements.length,
    testCaseCount: project.testCases.length,
    createdAt: project.createdAt.getTime(),
    updatedAt: project.updatedAt.getTime(),
  };
};

const toWorkspaceAutomationProject = (project: AutomationProjectRecord): Project => ({
  id: project.id,
  name: project.name,
  projectKey:
    project.key?.trim() ||
    (typeof getProjectPlanning(project.rows)?.projectKey === "string"
      ? (getProjectPlanning(project.rows)?.projectKey as string)
      : ""),
  sprintName:
    typeof getProjectPlanning(project.rows)?.sprintName === "string"
      ? (getProjectPlanning(project.rows)?.sprintName as string)
      : "",
  releaseName:
    typeof getProjectPlanning(project.rows)?.releaseName === "string"
      ? (getProjectPlanning(project.rows)?.releaseName as string)
      : "",
  teamName:
    typeof getProjectPlanning(project.rows)?.teamName === "string"
      ? (getProjectPlanning(project.rows)?.teamName as string)
      : "",
  input: project.input,
  oldRequirement: "",
  rows: toWorkspaceRows(project),
  generationMode: project.generationMode as Project["generationMode"],
  coverageDepth: project.coverageDepth as Project["coverageDepth"],
  persona: toWorkspacePersona(project.persona),
  autosaveEnabled: project.autosaveEnabled,
  sourceArtifacts: Array.isArray(project.sourceArtifacts)
    ? (project.sourceArtifacts as Project["sourceArtifacts"])
    : [],
  reviewerName: project.reviewerName,
  reviewerNotes: project.reviewerNotes,
  signoffStatus: toWorkspaceSignoffStatus(project.signoffStatus),
  auditTrail: Array.isArray(project.auditTrail)
    ? (project.auditTrail as Project["auditTrail"])
    : [],
  caseComments: getStoredCaseComments(project.rows),
  notifications: getStoredNotifications(project.rows),
  caseVersionHistory: getStoredCaseVersionHistory(project.rows),
  caseReviewHistory: getStoredCaseReviewHistory(project.rows),
  testDataSets: getStoredTestDataSets(project.rows),
  caseTemplates: getStoredCaseTemplates(project.rows),
  viewPreferences: getViewPreferences(project.rows),
  savedViews: getSavedViews(project.rows),
  releaseReview: getReleaseReviewState(project.rows),
  runs: getStoredRuns(project.rows),
  automationSuites: getStoredAutomationSuites(project.rows),
  automationScenarios: getStoredAutomationScenarios(project.rows),
  automationActions: getStoredAutomationActions(project.rows),
  automationScenarioTestDataSets: getStoredAutomationScenarioTestDataSets(
    project.rows
  ),
  automationScripts: getStoredAutomationScripts(project.rows),
  automationSteps: getStoredAutomationSteps(project.rows),
  automationBindings: getStoredAutomationBindings(project.rows),
  automationExecutions: getStoredAutomationExecutions(project.rows),
  automationArtifacts: getStoredAutomationArtifacts(project.rows),
  automationReusableBlocks: getStoredAutomationReusableBlocks(project.rows),
  automationSelectorPresets: getStoredAutomationSelectorPresets(project.rows),
  automationEnvironmentBindings: getStoredAutomationEnvironmentBindings(project.rows),
  automationSchedules: getStoredAutomationSchedules(project.rows),
  activeAutomationEnvironmentId:
    typeof getProjectPlanning(project.rows)?.activeAutomationEnvironmentId === "string"
      ? (getProjectPlanning(project.rows)?.activeAutomationEnvironmentId as string)
      : "",
  automationV2Scenarios: getStoredAutomationV2Scenarios(project.rows),
  automationV2Actions: getStoredAutomationV2Actions(project.rows),
  automationV2Runs: getStoredAutomationV2Runs(project.rows),
  activeAutomationV2ScenarioId:
    typeof getProjectPlanning(project.rows)?.activeAutomationV2ScenarioId === "string"
      ? (getProjectPlanning(project.rows)?.activeAutomationV2ScenarioId as string)
      : "",
  generationFeedbackLog: getStoredGenerationFeedbackLog(project.rows),
  activeRunId: getActiveRunId(project.rows),
  lastGeneratedChangeImpactSignature: null,
  latestChangeEntries: [],
  changeComparisonCount: 0,
  activeRequirementId: undefined,
  requirementCount: 0,
  testCaseCount: project.testCases.length,
  createdAt: project.createdAt.getTime(),
  updatedAt: project.updatedAt.getTime(),
});

const safeToWorkspaceProject = (project: ProjectRecord): Project | null => {
  try {
    return toWorkspaceProject(project);
  } catch (error) {
    console.error("Failed to convert project record:", {
      projectId: project.id,
      projectName: project.name,
      error,
    });
    return null;
  }
};

const safeToWorkspaceAutomationProject = (
  project: AutomationProjectRecord
): Project | null => {
  try {
    return toWorkspaceAutomationProject(project);
  } catch (error) {
    console.error("Failed to convert automation project record:", {
      projectId: project.id,
      projectName: project.name,
      error,
    });
    return null;
  }
};

const normalizeProject = (project: Project): Project => ({
  ...project,
  projectKey: project.projectKey?.trim() || "",
  sprintName: project.sprintName?.trim() || "",
  releaseName: project.releaseName?.trim() || "",
  teamName: project.teamName?.trim() || "",
  persona: project.persona ?? "all",
  sourceArtifacts: project.sourceArtifacts ?? [],
  reviewerName: project.reviewerName ?? "",
  reviewerNotes: project.reviewerNotes ?? "",
  signoffStatus: project.signoffStatus ?? "draft",
  oldRequirement: project.oldRequirement ?? "",
  auditTrail: project.auditTrail ?? [],
  caseComments: project.caseComments ?? {},
  notifications: project.notifications ?? [],
  caseVersionHistory: project.caseVersionHistory ?? {},
  caseReviewHistory: project.caseReviewHistory ?? {},
  testDataSets: project.testDataSets ?? [],
  caseTemplates: project.caseTemplates ?? [],
  viewPreferences: project.viewPreferences ?? {},
  savedViews: project.savedViews ?? { cases: [], runs: [] },
  releaseReview: project.releaseReview ?? {
    reviewedReasonIds: [],
    reviewedActionIds: [],
    decisionNote: "",
    snapshots: [],
  },
  runs: Array.isArray(project.runs) ? project.runs : [],
  automationSuites: Array.isArray(project.automationSuites)
    ? project.automationSuites
    : [],
  automationScenarios: Array.isArray(project.automationScenarios)
    ? project.automationScenarios
    : [],
  automationActions: Array.isArray(project.automationActions)
    ? project.automationActions
    : [],
  automationScenarioTestDataSets: Array.isArray(project.automationScenarioTestDataSets)
    ? project.automationScenarioTestDataSets
    : [],
  automationScripts: Array.isArray(project.automationScripts)
    ? project.automationScripts
    : [],
  automationSteps:
    project.automationSteps && typeof project.automationSteps === "object"
      ? project.automationSteps
      : {},
  automationBindings: Array.isArray(project.automationBindings)
    ? project.automationBindings
    : [],
  automationExecutions: Array.isArray(project.automationExecutions)
    ? project.automationExecutions
    : [],
  automationArtifacts: Array.isArray(project.automationArtifacts)
    ? project.automationArtifacts
    : [],
  automationReusableBlocks: Array.isArray(project.automationReusableBlocks)
    ? project.automationReusableBlocks
    : [],
  automationSelectorPresets: Array.isArray(project.automationSelectorPresets)
    ? project.automationSelectorPresets
    : [],
  automationEnvironmentBindings: Array.isArray(project.automationEnvironmentBindings)
    ? project.automationEnvironmentBindings
    : [],
  automationSchedules: Array.isArray(project.automationSchedules)
    ? project.automationSchedules
    : [],
  activeAutomationEnvironmentId: project.activeAutomationEnvironmentId ?? "",
  automationV2Scenarios: Array.isArray(project.automationV2Scenarios)
    ? project.automationV2Scenarios
    : [],
  automationV2Actions: Array.isArray(project.automationV2Actions)
    ? project.automationV2Actions
    : [],
  automationV2Runs: Array.isArray(project.automationV2Runs)
    ? project.automationV2Runs
    : [],
  activeAutomationV2ScenarioId: project.activeAutomationV2ScenarioId ?? "",
  generationFeedbackLog: Array.isArray(project.generationFeedbackLog)
    ? project.generationFeedbackLog
    : [],
  activeRunId: project.activeRunId ?? "",
  lastGeneratedChangeImpactSignature:
    project.lastGeneratedChangeImpactSignature ?? null,
  latestChangeEntries: project.latestChangeEntries ?? [],
  rows: Array.isArray(project.rows) ? project.rows : [],
});

export type ProjectShellSummary = {
  id: string;
  name: string;
  projectKey: string;
  sprintName: string;
  releaseName: string;
  teamName: string;
  testCaseCount: number;
  releaseDecision?: "safe" | "caution" | "blocked";
  releaseDecisionRecordedAt?: number;
};

const projectShellSelect = {
  id: true,
  key: true,
  name: true,
  rows: true,
  _count: {
    select: {
      testCases: true,
    },
  },
};

const toProjectShellSummary = (project: {
  id: string;
  key: string | null;
  name: string;
  rows: JsonValue;
  _count: {
    testCases: number;
  };
}): ProjectShellSummary => {
  const planning = getProjectPlanning(project.rows);
  const releaseReview =
    planning?.releaseReview &&
    typeof planning.releaseReview === "object" &&
    !Array.isArray(planning.releaseReview)
      ? (planning.releaseReview as Record<string, unknown>)
      : null;

  const releaseDecision =
    releaseReview?.recordedDecision === "safe" ||
    releaseReview?.recordedDecision === "caution" ||
    releaseReview?.recordedDecision === "blocked"
      ? (releaseReview.recordedDecision as ProjectShellSummary["releaseDecision"])
      : undefined;

  return {
    id: project.id,
    name: project.name,
    projectKey:
      (typeof planning?.projectKey === "string" && planning.projectKey.trim()) ||
      project.key?.trim() ||
      project.id,
    sprintName:
      typeof planning?.sprintName === "string" ? planning.sprintName : "",
    releaseName:
      typeof planning?.releaseName === "string" ? planning.releaseName : "",
    teamName: typeof planning?.teamName === "string" ? planning.teamName : "",
    testCaseCount: project._count.testCases,
    releaseDecision,
    releaseDecisionRecordedAt:
      typeof releaseReview?.decisionRecordedAt === "number"
        ? releaseReview.decisionRecordedAt
        : undefined,
  };
};

const projectInclude = {
  changeComparisons: {
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  requirements: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
  testCases: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
};

const automationProjectInclude = {
  testCases: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
};

export const readProjects = cache(async () => {
  const projects = await prisma.project.findMany({
    include: projectInclude,
    orderBy: {
      updatedAt: "desc",
    },
  });

  return projects
    .map(safeToWorkspaceProject)
    .filter((project): project is Project => Boolean(project));
});

export const readProjectById = cache(async (projectId: string) => {
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
    include: projectInclude,
  });

  return project ? safeToWorkspaceProject(project) : null;
});

export const readAutomationProjectById = cache(async (projectId: string) => {
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
    include: automationProjectInclude,
  });

  return project ? safeToWorkspaceAutomationProject(project) : null;
});

export const readProjectShellById = cache(async (projectId: string) => {
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
    select: projectShellSelect,
  });

  return project ? toProjectShellSummary(project) : null;
});

export const readProjectByRef = cache(async (projectRef: string) => {
  const directById = await readProjectById(projectRef);
  if (directById) {
    return directById;
  }

  const directProjectRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Project"
    WHERE LOWER("id") = LOWER(${projectRef})
       OR LOWER(COALESCE("key", '')) = LOWER(${projectRef})
       OR LOWER(COALESCE("rows"->'planning'->>'projectKey', '')) = LOWER(${projectRef})
    LIMIT 1
  `;

  const directProjectId = directProjectRows[0]?.id;
  if (directProjectId) {
    const directMatch = await prisma.project.findUnique({
      where: {
        id: directProjectId,
      },
      include: projectInclude,
    });

    return directMatch ? safeToWorkspaceProject(directMatch) : null;
  }

  const normalizedRef = projectRef.trim().toLowerCase();
  const projects = await readProjects();

  return (
    projects.find((project) => {
      const normalizedKey = project.projectKey?.trim().toLowerCase();
      return project.id.toLowerCase() === normalizedRef || normalizedKey === normalizedRef;
    }) ?? null
  );
});

export const readAutomationProjectByRef = cache(async (projectRef: string) => {
  const directById = await readAutomationProjectById(projectRef);
  if (directById) {
    return directById;
  }

  const directProjectRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Project"
    WHERE LOWER("id") = LOWER(${projectRef})
       OR LOWER(COALESCE("key", '')) = LOWER(${projectRef})
       OR LOWER(COALESCE("rows"->'planning'->>'projectKey', '')) = LOWER(${projectRef})
    LIMIT 1
  `;

  const directProjectId = directProjectRows[0]?.id;
  if (!directProjectId) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: {
      id: directProjectId,
    },
    include: automationProjectInclude,
  });

  return project ? safeToWorkspaceAutomationProject(project) : null;
});

export const readProjectShellByRef = cache(async (projectRef: string) => {
  const directById = await readProjectShellById(projectRef);
  if (directById) {
    return directById;
  }

  const directProjectRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Project"
    WHERE LOWER("id") = LOWER(${projectRef})
       OR LOWER(COALESCE("key", '')) = LOWER(${projectRef})
       OR LOWER(COALESCE("rows"->'planning'->>'projectKey', '')) = LOWER(${projectRef})
    LIMIT 1
  `;

  const directProjectId = directProjectRows[0]?.id;
  if (!directProjectId) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: {
      id: directProjectId,
    },
    select: projectShellSelect,
  });

  return project ? toProjectShellSummary(project) : null;
});

export const writeProjects = async (projects: Project[]) => {
  const normalizedProjects = projects.map(normalizeProject);
  const incomingProjectIds = normalizedProjects.map((project) => project.id);

  const flattenedRows = normalizedProjects.flatMap((project) =>
    project.rows.map((row, index) => ({
      id: `${project.id}-${row.id}-${index}`,
      projectId: project.id,
      requirementId: `${project.id}::active-requirement`,
      caseKey: toStoredCaseKey(project.id, row.id, index),
      title: row.title,
      type: toPrismaRowType(row.type),
      preconditions: row.preconditions,
      steps: row.steps,
      expectedResult: row.expectedResult,
      testData: row.testData ?? null,
      metadata: sanitizeJson({
        rowId: row.id,
        issueId: row.issueId,
        issueKey: row.issueKey,
        testData: row.testData,
        workflowStatus: row.workflowStatus,
        priority: row.priority,
        executionResult: row.executionResult,
        reviewStatus: row.reviewStatus,
        reviewOwner: row.reviewOwner,
        suiteName: row.suiteName,
        componentArea: row.componentArea,
        testDataSetId: row.testDataSetId,
        automationStatus: row.automationStatus,
        automationProvider: row.automationProvider,
        automationReference: row.automationReference,
        automationScriptId: row.automationScriptId,
        automationBindingMode: row.automationBindingMode,
        generationSource: row.generationSource,
        generationFeedback: row.generationFeedback,
        approvalState: row.approvalState,
        handoffState: row.handoffState,
        generatedBy: row.generatedBy,
        editedBy: row.editedBy,
        approvedBy: row.approvedBy,
        rejectedBy: row.rejectedBy,
        releaseReviewedBy: row.releaseReviewedBy,
        archived: row.archived,
        assignee: row.assignee,
        labels: row.labels,
        gapSourceId: row.gapSourceId,
        gapSourceLabel: row.gapSourceLabel,
        gapSourceMethod: row.gapSourceMethod,
        predictionSourceId: row.predictionSourceId,
        predictionSourceLabel: row.predictionSourceLabel,
        predictionSourceMethod: row.predictionSourceMethod,
        changeSourceLabel: row.changeSourceLabel,
        changeSourceType: row.changeSourceType,
        lifecycleStatus: row.lifecycleStatus,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    }))
  );

  const flattenedRequirements = normalizedProjects.flatMap((project) => [
    {
      id: `${project.id}::active-requirement`,
      projectId: project.id,
      title: `${project.name} Requirement`,
      sourceType: SourceType.manual,
      sourceRef: null,
      rawContent: project.input,
      normalizedContent: project.input,
      version: 1,
      isActive: true,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
    },
    ...project.sourceArtifacts.map((artifact, index) => ({
      id: `${project.id}::artifact::${artifact.id}`,
      projectId: project.id,
      title: artifact.title,
      sourceType: toPrismaSourceType(artifact.type),
      sourceRef: artifact.id,
      rawContent: artifact.rawContent,
      normalizedContent: artifact.normalizedContent,
      version: index + 1,
      isActive: true,
      createdAt: new Date(artifact.importedAt),
      updatedAt: new Date(artifact.importedAt),
    })),
  ]);

  const flattenedComparisons = normalizedProjects
    .filter(
      (project) =>
        project.oldRequirement?.trim() ||
        project.lastGeneratedChangeImpactSignature
    )
    .map((project) => ({
      id: `${project.id}::latest-change-comparison`,
      projectId: project.id,
      oldRequirement: project.oldRequirement?.trim() || "",
      newRequirement: project.input,
      signature: project.lastGeneratedChangeImpactSignature ?? null,
      changes: sanitizeJson(project.latestChangeEntries ?? []),
      generatedAt: project.lastGeneratedChangeImpactSignature
        ? new Date(project.updatedAt)
        : null,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
    }));

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(async (tx: ProjectStoreTransactionClient) => {
        await tx.project.deleteMany({
          where: incomingProjectIds.length > 0 ? { id: { notIn: incomingProjectIds } } : {},
        });

        for (const project of normalizedProjects) {
          await tx.project.upsert({
            where: { id: project.id },
            create: {
              id: project.id,
              name: project.name,
              input: project.input,
              rows: sanitizeJson({
                items: [],
                planning: {
                  projectKey: project.projectKey,
                  sprintName: project.sprintName,
                  releaseName: project.releaseName,
                  teamName: project.teamName,
                  caseComments: project.caseComments ?? {},
                  notifications: project.notifications ?? [],
                  caseVersionHistory: project.caseVersionHistory ?? {},
                  caseReviewHistory: project.caseReviewHistory ?? {},
                  testDataSets: project.testDataSets ?? [],
                  caseTemplates: project.caseTemplates ?? [],
                  viewPreferences: project.viewPreferences ?? {},
                  savedViews: project.savedViews ?? { cases: [], runs: [] },
                  releaseReview: project.releaseReview ?? {
                    reviewedReasonIds: [],
                    reviewedActionIds: [],
                    decisionNote: "",
                    snapshots: [],
                  },
                  runs: project.runs ?? [],
                  automationSuites: project.automationSuites ?? [],
                  automationScenarios: project.automationScenarios ?? [],
                  automationActions: project.automationActions ?? [],
                  automationScenarioTestDataSets:
                    project.automationScenarioTestDataSets ?? [],
                  automationScripts: project.automationScripts ?? [],
                  automationSteps: project.automationSteps ?? {},
                  automationBindings: project.automationBindings ?? [],
                  automationExecutions: project.automationExecutions ?? [],
                  automationArtifacts: project.automationArtifacts ?? [],
                  automationReusableBlocks: project.automationReusableBlocks ?? [],
                  automationSelectorPresets: project.automationSelectorPresets ?? [],
                  automationEnvironmentBindings: project.automationEnvironmentBindings ?? [],
                  automationSchedules: project.automationSchedules ?? [],
                  activeAutomationEnvironmentId:
                    project.activeAutomationEnvironmentId ?? "",
                  automationV2Scenarios: project.automationV2Scenarios ?? [],
                  automationV2Actions: project.automationV2Actions ?? [],
                  automationV2Runs: project.automationV2Runs ?? [],
                  activeAutomationV2ScenarioId:
                    project.activeAutomationV2ScenarioId ?? "",
                  generationFeedbackLog: project.generationFeedbackLog ?? [],
                  activeRunId: project.activeRunId ?? "",
                },
              }),
              generationMode: project.generationMode as GenerationMode,
              coverageDepth: project.coverageDepth as CoverageDepth,
              persona: toPrismaPersona(project.persona),
              autosaveEnabled: project.autosaveEnabled,
              sourceArtifacts: sanitizeJson(project.sourceArtifacts),
              reviewerName: project.reviewerName,
              reviewerNotes: project.reviewerNotes,
              signoffStatus: toPrismaSignoffStatus(project.signoffStatus),
              auditTrail: sanitizeJson(project.auditTrail),
              createdAt: new Date(project.createdAt),
              updatedAt: new Date(project.updatedAt),
            },
            update: {
              name: project.name,
              input: project.input,
              rows: sanitizeJson({
                items: [],
                planning: {
                  projectKey: project.projectKey,
                  sprintName: project.sprintName,
                  releaseName: project.releaseName,
                  teamName: project.teamName,
                  caseComments: project.caseComments ?? {},
                  notifications: project.notifications ?? [],
                  caseVersionHistory: project.caseVersionHistory ?? {},
                  caseReviewHistory: project.caseReviewHistory ?? {},
                  testDataSets: project.testDataSets ?? [],
                  caseTemplates: project.caseTemplates ?? [],
                  viewPreferences: project.viewPreferences ?? {},
                  savedViews: project.savedViews ?? { cases: [], runs: [] },
                  releaseReview: project.releaseReview ?? {
                    reviewedReasonIds: [],
                    reviewedActionIds: [],
                    decisionNote: "",
                    snapshots: [],
                  },
                  runs: project.runs ?? [],
                  automationSuites: project.automationSuites ?? [],
                  automationScenarios: project.automationScenarios ?? [],
                  automationActions: project.automationActions ?? [],
                  automationScenarioTestDataSets:
                    project.automationScenarioTestDataSets ?? [],
                  automationScripts: project.automationScripts ?? [],
                  automationSteps: project.automationSteps ?? {},
                  automationBindings: project.automationBindings ?? [],
                  automationExecutions: project.automationExecutions ?? [],
                  automationArtifacts: project.automationArtifacts ?? [],
                  automationReusableBlocks: project.automationReusableBlocks ?? [],
                  automationSelectorPresets: project.automationSelectorPresets ?? [],
                  automationEnvironmentBindings: project.automationEnvironmentBindings ?? [],
                  automationSchedules: project.automationSchedules ?? [],
                  activeAutomationEnvironmentId:
                    project.activeAutomationEnvironmentId ?? "",
                  automationV2Scenarios: project.automationV2Scenarios ?? [],
                  automationV2Actions: project.automationV2Actions ?? [],
                  automationV2Runs: project.automationV2Runs ?? [],
                  activeAutomationV2ScenarioId:
                    project.activeAutomationV2ScenarioId ?? "",
                  generationFeedbackLog: project.generationFeedbackLog ?? [],
                  activeRunId: project.activeRunId ?? "",
                },
              }),
              generationMode: project.generationMode as GenerationMode,
              coverageDepth: project.coverageDepth as CoverageDepth,
              persona: toPrismaPersona(project.persona),
              autosaveEnabled: project.autosaveEnabled,
              sourceArtifacts: sanitizeJson(project.sourceArtifacts),
              reviewerName: project.reviewerName,
              reviewerNotes: project.reviewerNotes,
              signoffStatus: toPrismaSignoffStatus(project.signoffStatus),
              auditTrail: sanitizeJson(project.auditTrail),
              updatedAt: new Date(project.updatedAt),
            },
          });
        }

        await tx.requirement.deleteMany({
          where:
            incomingProjectIds.length > 0 ? { projectId: { in: incomingProjectIds } } : {},
        });

        if (flattenedRequirements.length > 0) {
          await tx.requirement.createMany({
            data: flattenedRequirements,
          });
        }

        await tx.changeComparison.deleteMany({
          where:
            incomingProjectIds.length > 0 ? { projectId: { in: incomingProjectIds } } : {},
        });

        if (flattenedComparisons.length > 0) {
          await tx.changeComparison.createMany({
            data: flattenedComparisons,
          });
        }

        await tx.testCase.deleteMany({
          where:
            incomingProjectIds.length > 0 ? { projectId: { in: incomingProjectIds } } : {},
        });

        if (flattenedRows.length > 0) {
          await tx.testCase.createMany({
            data: flattenedRows,
          });
        }
      }, {
        maxWait: 15000,
        timeout: 30000,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;

      if (!isTransactionStartTimeout(error) || attempt === 2) {
        throw error;
      }

      await waitForRetry(400 * (attempt + 1));
    }
  }

  if (lastError) {
    throw lastError;
  }

  return readProjects();
};
