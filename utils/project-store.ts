import {
  CoverageDepth,
  GenerationMode,
  Prisma,
  Persona,
  SignoffStatus,
  SourceType,
  TestCaseType,
} from "@prisma/client";

import { prisma } from "./prisma";
import {
  AutomationArtifactType,
  AutomationBinding,
  AutomationExecution,
  AutomationExecutionArtifact,
  AutomationExecutionStatus,
  AutomationProvider,
  AutomationScript,
  AutomationStep,
  AutomationStepAction,
  AutomationTargetType,
  normalizeAutomationProvider,
  CasesSavedView,
  CaseReviewHistoryEntry,
  Project,
  ProjectViewPreferences,
  ReleaseReviewState,
  RunsSavedView,
  SourceArtifact,
  TestCaseRow,
  TestRunRecord,
} from "./workspace";

type StoredJson = Prisma.InputJsonValue | typeof Prisma.JsonNull;

const sanitizeJsonValue = (value: unknown): Prisma.InputJsonValue => {
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
    ) as Prisma.InputJsonArray;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entryValue]) =>
        entryValue === undefined ? [] : [[key, sanitizeJsonValue(entryValue)]]
      )
    ) as Prisma.InputJsonObject;
  }

  return null as unknown as Prisma.InputJsonValue;
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

const sanitizeJson = (value: unknown): StoredJson => {
  if (value === null) {
    return Prisma.JsonNull;
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
      name: record.name,
      description:
        typeof record.description === "string" ? record.description : undefined,
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
            "press",
            "wait-for",
            "assert-text",
            "assert-visible",
            "assert-url",
            "assert-value",
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
      provider,
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

const toWorkspaceRows = (project: ProjectRecord): Project["rows"] => {
  if (project.testCases.length === 0) {
    return getLegacyRows(project.rows);
  }

  return project.testCases.map((testCase) => {
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
    automationScripts: getStoredAutomationScripts(project.rows),
    automationSteps: getStoredAutomationSteps(project.rows),
    automationBindings: getStoredAutomationBindings(project.rows),
    automationExecutions: getStoredAutomationExecutions(project.rows),
    automationArtifacts: getStoredAutomationArtifacts(project.rows),
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
  activeRunId: project.activeRunId ?? "",
  lastGeneratedChangeImpactSignature:
    project.lastGeneratedChangeImpactSignature ?? null,
  latestChangeEntries: project.latestChangeEntries ?? [],
  rows: Array.isArray(project.rows) ? project.rows : [],
});

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

export const readProjects = async () => {
  const projects = await prisma.project.findMany({
    include: projectInclude,
    orderBy: {
      updatedAt: "desc",
    },
  });

  return projects
    .map(safeToWorkspaceProject)
    .filter((project): project is Project => Boolean(project));
};

export const readProjectById = async (projectId: string) => {
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
    include: projectInclude,
  });

  return project ? safeToWorkspaceProject(project) : null;
};

export const readProjectByRef = async (projectRef: string) => {
  const normalizedRef = projectRef.trim().toLowerCase();
  const projects = await readProjects();

  return (
    projects.find((project) => {
      const normalizedKey = project.projectKey?.trim().toLowerCase();
      return project.id.toLowerCase() === normalizedRef || normalizedKey === normalizedRef;
    }) ?? null
  );
};

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
      await prisma.$transaction(async (tx) => {
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
                  automationScripts: project.automationScripts ?? [],
                  automationSteps: project.automationSteps ?? {},
                  automationBindings: project.automationBindings ?? [],
                  automationExecutions: project.automationExecutions ?? [],
                  automationArtifacts: project.automationArtifacts ?? [],
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
                  automationScripts: project.automationScripts ?? [],
                  automationSteps: project.automationSteps ?? {},
                  automationBindings: project.automationBindings ?? [],
                  automationExecutions: project.automationExecutions ?? [],
                  automationArtifacts: project.automationArtifacts ?? [],
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
