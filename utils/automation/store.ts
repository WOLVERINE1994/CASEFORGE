import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import {
  createRunArtifactManifest,
  normalizeArtifactInput,
  toDownloadUrl,
  type AutomationArtifactInput,
} from "./artifact-storage";
import { normalizeLocatorCandidates } from "./locator-policy";
import type {
  AutomationAction,
  AutomationArtifact,
  AutomationArtifactType,
  AutomationHealingEvent,
  AutomationRecycleBinItem,
  AutomationRecycleBinItemType,
  AutomationHealingStatus,
  AutomationRun,
  AutomationScenario,
  AutomationSession,
  AutomationSessionProviderId,
  AutomationSessionStatus,
  AutomationStep,
} from "./types";

const jsonb = (value: unknown) =>
  Prisma.sql`CAST(${JSON.stringify(value ?? null)} AS jsonb)`;

const INSERT_CHUNK_SIZE = 250;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function uniqueStepId(step: AutomationStep, seenIds: Set<string>) {
  const candidate = typeof step.id === "string" && step.id.trim() ? step.id.trim() : "";
  if (candidate && !seenIds.has(candidate)) {
    seenIds.add(candidate);
    return candidate;
  }

  let nextId = newId("step");
  while (seenIds.has(nextId)) {
    nextId = newId("step");
  }
  seenIds.add(nextId);
  return nextId;
}

type ProjectRefRow = { id: string };
type ScenarioRow = {
  id: string;
  projectId: string;
  version: number;
  name: string;
  description: string;
  status: AutomationScenario["status"];
  tags: unknown;
  metadata: unknown;
  updatedAt: Date;
};
type ActionRow = {
  id: string;
  projectId: string;
  version: number;
  createdFromScenarioId: string | null;
  name: string;
  description: string;
  tags: unknown;
  updatedAt: Date;
};
type StepRow = {
  id: string;
  action: string;
  description: string;
  target: unknown;
  inputValue: string;
  expectedValue: string;
  assertionType: string;
  options: unknown;
  commandText: string;
  elementSnapshot: unknown;
};
type LocatorRow = {
  stepId: string;
  id: string;
  strategy: string;
  value: string;
  score: number;
  isUnique: boolean;
  rank: number;
  source: string;
  metadata: unknown;
};

type StepIdRow = { id: string };
type RecycleBinRow = {
  id: string;
  type: AutomationRecycleBinItemType;
  projectId: string;
  name: string;
  description: string;
  deletedAt: string | null;
  deletedBy: string | null;
  previousStatus: string | null;
  updatedAt: Date;
};

export async function resolveAutomationProjectId(projectKey: string) {
  const rows = await prisma.$queryRaw<ProjectRefRow[]>(Prisma.sql`
    SELECT "id" FROM "Project"
    WHERE "id" = ${projectKey} OR "key" = ${projectKey}
    LIMIT 1
  `);
  return rows[0]?.id ?? null;
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapStep(row: StepRow, locators: LocatorRow[]): AutomationStep {
  return {
    action: row.action,
    assertionType: row.assertionType,
    commandText: row.commandText,
    description: row.description,
    element:
      row.elementSnapshot && typeof row.elementSnapshot === "object"
        ? (row.elementSnapshot as Record<string, unknown>)
        : {},
    expectedValue: row.expectedValue,
    id: row.id,
    inputValue: row.inputValue,
    locatorCandidates: locators
      .filter((locator) => locator.stepId === row.id)
      .sort((left, right) => left.rank - right.rank)
      .map((locator) => ({
        id: locator.id,
        isUnique: locator.isUnique,
        metadata:
          locator.metadata && typeof locator.metadata === "object"
            ? (locator.metadata as Record<string, unknown>)
            : {},
        rank: locator.rank,
        score: locator.score,
        source: locator.source,
        strategy: locator.strategy as never,
        value: locator.value,
      })),
    options:
      row.options && typeof row.options === "object"
        ? (row.options as AutomationStep["options"])
        : {},
    target:
      row.target && typeof row.target === "object"
        ? (row.target as AutomationStep["target"])
        : { type: "manual", value: "" },
  };
}

function mapScenario(row: ScenarioRow, steps: AutomationStep[] = []): AutomationScenario {
  return {
    description: row.description,
    id: row.id,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    name: row.name,
    projectId: row.projectId,
    status: row.status,
    steps,
    tags: toStringArray(row.tags),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function mapAction(row: ActionRow, steps: AutomationStep[] = []): AutomationAction {
  return {
    createdFromScenarioId: row.createdFromScenarioId,
    description: row.description,
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    steps,
    tags: toStringArray(row.tags),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function mapRecycleBinItem(row: RecycleBinRow): AutomationRecycleBinItem {
  return {
    deletedAt: row.deletedAt || row.updatedAt.toISOString(),
    deletedBy: row.deletedBy,
    description: row.description,
    id: row.id,
    name: row.name,
    previousStatus: row.previousStatus,
    projectId: row.projectId,
    type: row.type,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeImportedSteps(value: unknown): AutomationStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step, index): AutomationStep[] => {
    if (!step || typeof step !== "object") return [];
    const record = step as Partial<AutomationStep>;
    const action = typeof record.action === "string" ? record.action : "";
    if (!action) return [];
    const description =
      typeof record.description === "string" && record.description.trim()
        ? record.description
        : `Imported command ${index + 1}`;
    const target =
      record.target && typeof record.target === "object"
        ? record.target
        : { type: "manual" as const, value: "" };

    return [
      {
        action,
        assertionType:
          typeof record.assertionType === "string" ? record.assertionType : "",
        commandText:
          typeof record.commandText === "string" ? record.commandText : description,
        description,
        element:
          record.element && typeof record.element === "object" ? record.element : {},
        expectedValue:
          typeof record.expectedValue === "string" ? record.expectedValue : "",
        id: typeof record.id === "string" ? record.id : newId("step"),
        inputValue: typeof record.inputValue === "string" ? record.inputValue : "",
        locatorCandidates: Array.isArray(record.locatorCandidates)
          ? record.locatorCandidates
          : [],
        options:
          record.options && typeof record.options === "object"
            ? record.options
            : {},
        target,
      },
    ];
  });
}

function actionStepSignature(steps: AutomationStep[]) {
  return steps
    .map((step) =>
      [
        step.action,
        step.target?.locatorType || "",
        step.target?.value || "",
        step.inputValue || "",
        step.expectedValue || "",
        step.commandText || step.description || "",
      ]
        .join(":")
        .toLowerCase(),
    )
    .join("|");
}

export async function listScenarios(projectId: string): Promise<AutomationScenario[]> {
  const rows = await prisma.$queryRaw<ScenarioRow[]>(Prisma.sql`
    SELECT "id", "projectId", "version", "name", "description", "status", "tags", "metadata", "updatedAt"
    FROM "AutomationScenario"
    WHERE "projectId" = ${projectId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') = ''
    ORDER BY "updatedAt" DESC
  `);

  return rows.map((row) => mapScenario(row));
}

export async function getScenario(
  projectId: string,
  scenarioId: string,
): Promise<AutomationScenario | null> {
  const rows = await prisma.$queryRaw<ScenarioRow[]>(Prisma.sql`
    SELECT "id", "projectId", "version", "name", "description", "status", "tags", "metadata", "updatedAt"
    FROM "AutomationScenario"
    WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') = ''
    LIMIT 1
  `);
  const scenario = rows[0];
  if (!scenario) return null;

  const steps = await prisma.$queryRaw<StepRow[]>(Prisma.sql`
    SELECT "id", "action", "description", "target", "inputValue", "expectedValue",
      "assertionType", "options", "commandText", "elementSnapshot"
    FROM "AutomationStep"
    WHERE "projectId" = ${projectId} AND "scenarioId" = ${scenarioId}
    ORDER BY "orderIndex" ASC
  `);
  const locators = steps.length
    ? await prisma.$queryRaw<LocatorRow[]>(Prisma.sql`
        SELECT lc."stepId", lc."id", lc."strategy", lc."value", lc."score",
          lc."isUnique", lc."rank", lc."source", lc."metadata"
        FROM "AutomationLocatorCandidate" lc
        INNER JOIN "AutomationStep" step ON step."id" = lc."stepId"
        WHERE step."scenarioId" = ${scenarioId}
        ORDER BY lc."rank" ASC
      `)
    : [];

  return mapScenario(scenario, steps.map((step) => mapStep(step, locators)));
}

export async function createScenario(input: {
  projectId: string;
  name?: string;
  description?: string;
  status?: AutomationScenario["status"];
  tags?: string[];
  metadata?: Record<string, unknown>;
}) {
  const id = newId("scenario");
  const scenarioName = input.name?.trim() || "Untitled Scenario";
  const rows = await prisma.$queryRaw<ScenarioRow[]>(Prisma.sql`
    INSERT INTO "AutomationScenario" (
      "id", "projectId", "name", "description", "status", "tags", "metadata", "updatedAt"
    )
    VALUES (
      ${id}, ${input.projectId}, ${scenarioName}, ${input.description ?? ""},
      ${input.status ?? "draft"}::"AutomationScenarioStatus", ${jsonb(input.tags ?? [])},
      ${jsonb(input.metadata ?? {})}, NOW()
    )
    RETURNING "id", "projectId", "version", "name", "description", "status", "tags", "metadata", "updatedAt"
  `);
  if (!rows[0]) {
    throw new Error("Scenario was not created.");
  }
  return mapScenario(rows[0]) satisfies AutomationScenario;
}

export async function updateScenario(
  projectId: string,
  scenarioId: string,
  input: {
    name?: string;
    description?: string;
    status?: AutomationScenario["status"];
    tags?: string[];
    metadata?: Record<string, unknown>;
    steps?: AutomationStep[];
  },
) {
  if (input.steps) {
    await replaceScenarioSteps(projectId, scenarioId, input.steps);
  }

  const current = await getScenario(projectId, scenarioId);
  if (!current) return null;

  const name = typeof input.name === "string" ? input.name.trim() : current.name;
  const description =
    typeof input.description === "string" ? input.description : current.description;
  const status = input.status ?? current.status;
  const tags = Array.isArray(input.tags) ? input.tags : current.tags;
  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? { ...(current.metadata ?? {}), ...input.metadata }
      : current.metadata ?? {};

  const rows = await prisma.$queryRaw<ScenarioRow[]>(Prisma.sql`
    UPDATE "AutomationScenario"
    SET "name" = ${name || "Untitled Scenario"},
      "description" = ${description},
      "status" = ${status}::"AutomationScenarioStatus",
      "tags" = ${jsonb(tags)},
      "metadata" = ${jsonb(metadata)},
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
    RETURNING "id", "projectId", "version", "name", "description", "status", "tags", "metadata", "updatedAt"
  `);

  if (!rows[0]) return null;
  return mapScenario(rows[0], input.steps ? (await getScenario(projectId, scenarioId))?.steps ?? [] : current.steps);
}

export async function deleteScenario(projectId: string, scenarioId: string) {
  const current = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT "status" FROM "AutomationScenario"
    WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') = ''
    LIMIT 1
  `);
  if (!current[0]) return false;
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE "AutomationScenario"
    SET "status" = ${"archived"}::"AutomationScenarioStatus",
      "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        ${Prisma.raw("'{recycleBin}'")},
        ${jsonb({
          deletedAt: new Date().toISOString(),
          deletedBy: null,
          previousStatus: current[0].status,
          type: "scenario",
        })},
        true
      ),
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
  `);
  return Number(result) > 0;
}

export async function purgeScenario(projectId: string, scenarioId: string) {
  const result = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "AutomationScenario"
    WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') <> ''
  `);
  return Number(result) > 0;
}

export async function restoreScenario(projectId: string, scenarioId: string) {
  const rows = await prisma.$queryRaw<Array<{ previousStatus: string | null }>>(Prisma.sql`
    SELECT "metadata"->'recycleBin'->>'previousStatus' AS "previousStatus"
    FROM "AutomationScenario"
    WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') <> ''
    LIMIT 1
  `);
  if (!rows[0]) return null;
  const previousStatus =
    rows[0].previousStatus === "active" ||
    rows[0].previousStatus === "paused" ||
    rows[0].previousStatus === "archived" ||
    rows[0].previousStatus === "draft"
      ? rows[0].previousStatus
      : "draft";
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "AutomationScenario"
    SET "status" = ${previousStatus}::"AutomationScenarioStatus",
      "metadata" = COALESCE("metadata", '{}'::jsonb) - 'recycleBin',
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
  `);
  return getScenario(projectId, scenarioId);
}

export async function replaceScenarioSteps(
  projectId: string,
  scenarioId: string,
  steps: AutomationStep[],
) {
  const incomingIds = steps
    .map((step) => (typeof step.id === "string" ? step.id.trim() : ""))
    .filter(Boolean);
  const existingStepIds = incomingIds.length
    ? await prisma.$queryRaw<StepIdRow[]>(Prisma.sql`
        SELECT "id"
        FROM "AutomationStep"
        WHERE "id" IN (${Prisma.join(incomingIds)})
          AND NOT (
            "projectId" = ${projectId}
            AND "scenarioId" = ${scenarioId}
          )
      `)
    : [];
  const seenStepIds = new Set(existingStepIds.map((row) => row.id));
  const normalizedSteps = steps.map((step) => ({
    ...step,
    id: uniqueStepId(step, seenStepIds),
  }));
  const locatorCandidates = normalizedSteps.flatMap((step) =>
    normalizeLocatorCandidates(step.locatorCandidates).map((candidate) => ({
      candidate,
      stepId: step.id,
    })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "AutomationStep"
      WHERE "projectId" = ${projectId} AND "scenarioId" = ${scenarioId}
    `);

    for (const stepChunk of chunks(
      normalizedSteps.map((step, index) => ({ index, step })),
      INSERT_CHUNK_SIZE,
    )) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AutomationStep" (
          "id", "projectId", "scenarioId", "orderIndex", "action", "description",
          "target", "inputValue", "expectedValue", "assertionType", "options",
          "commandText", "elementSnapshot", "updatedAt"
        )
        VALUES ${Prisma.join(
          stepChunk.map(({ index, step }) => Prisma.sql`
            (
              ${step.id}, ${projectId}, ${scenarioId}, ${index}, ${step.action},
              ${step.description}, ${jsonb(step.target)}, ${step.inputValue ?? ""},
              ${step.expectedValue ?? ""}, ${step.assertionType ?? ""},
              ${jsonb(step.options ?? {})}, ${step.commandText ?? ""},
              ${jsonb(step.element ?? {})}, NOW()
            )
          `),
        )}
      `);
    }

    for (const locatorChunk of chunks(locatorCandidates, INSERT_CHUNK_SIZE)) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AutomationLocatorCandidate" (
          "id", "stepId", "strategy", "value", "score", "isUnique", "rank", "source", "metadata"
        )
        VALUES ${Prisma.join(
          locatorChunk.map(({ candidate, stepId }) => Prisma.sql`
            (
              ${newId("locator")}, ${stepId}, ${candidate.strategy}, ${candidate.value},
              ${candidate.score}, ${Boolean(candidate.isUnique)}, ${candidate.rank ?? 0},
              ${candidate.source ?? "recorded"}, ${jsonb(candidate.metadata ?? {})}
            )
          `),
        )}
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "AutomationScenario" SET "version" = "version" + 1, "updatedAt" = NOW()
      WHERE "projectId" = ${projectId} AND "id" = ${scenarioId}
    `);
  });

  return getScenario(projectId, scenarioId);
}

export async function createActionFromSteps(input: {
  projectId: string;
  scenarioId: string;
  name: string;
  description?: string;
  stepIds: string[];
}): Promise<AutomationAction> {
  const source = await getScenario(input.projectId, input.scenarioId);
  if (!source) throw new Error("Scenario was not found.");
  const selectedStepIds = new Set(input.stepIds);
  const selected = source.steps.filter((step) => step.id && selectedStepIds.has(step.id));
  if (!selected.length) throw new Error("Select at least one command.");

  const selectedSignature = actionStepSignature(selected);
  const duplicate = (await listActions(input.projectId)).find(
    (action) =>
      action.createdFromScenarioId === input.scenarioId &&
      actionStepSignature(action.steps) === selectedSignature,
  );
  if (duplicate) return duplicate;

  const actionId = newId("action");
  const copiedSteps = selected.map((step, index) => ({
    copiedStepId: newId("step"),
    index,
    step,
  }));
  const copiedLocatorCandidates = copiedSteps.flatMap(({ copiedStepId, step }) =>
    normalizeLocatorCandidates(step.locatorCandidates).map((candidate) => ({
      candidate,
      copiedStepId,
    })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "AutomationAction" (
        "id", "projectId", "createdFromScenarioId", "name", "description",
        "tags", "metadata", "updatedAt"
      )
      VALUES (
        ${actionId}, ${input.projectId}, ${input.scenarioId}, ${input.name},
        ${input.description ?? ""}, ${jsonb([])}, ${jsonb({})}, NOW()
      )
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "AutomationStep" (
        "id", "projectId", "actionId", "orderIndex", "action", "description",
        "target", "inputValue", "expectedValue", "assertionType", "options",
        "commandText", "elementSnapshot", "updatedAt"
      )
      VALUES ${Prisma.join(
        copiedSteps.map(({ copiedStepId, index, step }) => Prisma.sql`
          (
            ${copiedStepId}, ${input.projectId}, ${actionId}, ${index}, ${step.action},
            ${step.description}, ${jsonb(step.target)}, ${step.inputValue ?? ""},
            ${step.expectedValue ?? ""}, ${step.assertionType ?? ""},
            ${jsonb(step.options ?? {})}, ${step.commandText ?? ""},
            ${jsonb(step.element ?? {})}, NOW()
          )
        `),
      )}
    `);

    for (const locatorChunk of chunks(copiedLocatorCandidates, INSERT_CHUNK_SIZE)) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AutomationLocatorCandidate" (
          "id", "stepId", "strategy", "value", "score", "isUnique", "rank", "source", "metadata"
        )
        VALUES ${Prisma.join(
          locatorChunk.map(({ candidate, copiedStepId }) => Prisma.sql`
            (
              ${newId("locator")}, ${copiedStepId}, ${candidate.strategy}, ${candidate.value},
              ${candidate.score}, ${Boolean(candidate.isUnique)}, ${candidate.rank ?? 0},
              ${candidate.source ?? "recorded"}, ${jsonb(candidate.metadata ?? {})}
            )
          `),
        )}
      `);
    }
  });

  const action = await getAction(input.projectId, actionId);
  if (!action) throw new Error("Action was not saved.");
  return action;
}

export async function listActions(projectId: string): Promise<AutomationAction[]> {
  const rows = await prisma.$queryRaw<ActionRow[]>(Prisma.sql`
    SELECT "id", "projectId", "version", "createdFromScenarioId", "name",
      "description", "tags", "updatedAt"
    FROM "AutomationAction"
    WHERE "projectId" = ${projectId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') = ''
    ORDER BY "updatedAt" DESC
  `);
  const actions = await Promise.all(
    rows.map((row) => getAction(projectId, row.id).then((action) => action ?? mapAction(row))),
  );
  return actions;
}

export async function getAction(
  projectId: string,
  actionId: string,
): Promise<AutomationAction | null> {
  const rows = await prisma.$queryRaw<ActionRow[]>(Prisma.sql`
    SELECT "id", "projectId", "version", "createdFromScenarioId", "name",
      "description", "tags", "updatedAt"
    FROM "AutomationAction"
    WHERE "projectId" = ${projectId} AND "id" = ${actionId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') = ''
    LIMIT 1
  `);
  const action = rows[0];
  if (!action) return null;

  const steps = await prisma.$queryRaw<StepRow[]>(Prisma.sql`
    SELECT "id", "action", "description", "target", "inputValue", "expectedValue",
      "assertionType", "options", "commandText", "elementSnapshot"
    FROM "AutomationStep"
    WHERE "projectId" = ${projectId} AND "actionId" = ${actionId}
    ORDER BY "orderIndex" ASC
  `);
  const locators = steps.length
    ? await prisma.$queryRaw<LocatorRow[]>(Prisma.sql`
        SELECT lc."stepId", lc."id", lc."strategy", lc."value", lc."score",
          lc."isUnique", lc."rank", lc."source", lc."metadata"
        FROM "AutomationLocatorCandidate" lc
        INNER JOIN "AutomationStep" step ON step."id" = lc."stepId"
        WHERE step."actionId" = ${actionId}
        ORDER BY lc."rank" ASC
      `)
    : [];

  return mapAction(action, steps.map((step) => mapStep(step, locators)));
}

export async function updateAction(
  projectId: string,
  actionId: string,
  input: { name?: string; description?: string; tags?: string[] },
) {
  const current = await getAction(projectId, actionId);
  if (!current) return null;
  const rows = await prisma.$queryRaw<ActionRow[]>(Prisma.sql`
    UPDATE "AutomationAction"
    SET "name" = ${typeof input.name === "string" && input.name.trim() ? input.name.trim() : current.name},
      "description" = ${typeof input.description === "string" ? input.description : current.description},
      "tags" = ${jsonb(Array.isArray(input.tags) ? input.tags : current.tags)},
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${actionId}
    RETURNING "id", "projectId", "version", "createdFromScenarioId", "name",
      "description", "tags", "updatedAt"
  `);
  return rows[0] ? mapAction(rows[0], current.steps) : null;
}

export async function reorderActionSteps(
  projectId: string,
  actionId: string,
  stepIds: string[],
) {
  const action = await getAction(projectId, actionId);
  if (!action) return null;
  const existingIds = new Set(action.steps.map((step) => step.id).filter(Boolean) as string[]);
  const orderedIds = stepIds.filter((id) => existingIds.has(id));
  const missingIds = action.steps
    .map((step) => step.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .filter((id) => !orderedIds.includes(id));
  const nextOrder = [...orderedIds, ...missingIds];

  await prisma.$transaction(async (tx) => {
    for (const [index, stepId] of nextOrder.entries()) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "AutomationStep"
        SET "orderIndex" = ${index}, "updatedAt" = NOW()
        WHERE "projectId" = ${projectId}
          AND "actionId" = ${actionId}
          AND "id" = ${stepId}
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "AutomationAction"
      SET "version" = "version" + 1, "updatedAt" = NOW()
      WHERE "projectId" = ${projectId} AND "id" = ${actionId}
    `);
  });

  return getAction(projectId, actionId);
}

export async function insertActionStep(
  projectId: string,
  actionId: string,
  input: {
    afterStepId?: string | null;
    step: AutomationStep;
  },
) {
  const action = await getAction(projectId, actionId);
  if (!action) return null;
  const afterIndex =
    input.afterStepId && action.steps.some((step) => step.id === input.afterStepId)
      ? action.steps.findIndex((step) => step.id === input.afterStepId)
      : action.steps.length - 1;
  const insertAt = afterIndex >= 0 ? afterIndex + 1 : action.steps.length;
  const stepId = newId("step");
  const step = { ...input.step, id: stepId };

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "AutomationStep"
      SET "orderIndex" = "orderIndex" + 1, "updatedAt" = NOW()
      WHERE "projectId" = ${projectId}
        AND "actionId" = ${actionId}
        AND "orderIndex" >= ${insertAt}
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "AutomationStep" (
        "id", "projectId", "actionId", "orderIndex", "action", "description",
        "target", "inputValue", "expectedValue", "assertionType", "options",
        "commandText", "elementSnapshot", "updatedAt"
      )
      VALUES (
        ${stepId}, ${projectId}, ${actionId}, ${insertAt}, ${step.action},
        ${step.description}, ${jsonb(step.target)}, ${step.inputValue ?? ""},
        ${step.expectedValue ?? ""}, ${step.assertionType ?? ""},
        ${jsonb(step.options ?? {})}, ${step.commandText ?? ""},
        ${jsonb(step.element ?? {})}, NOW()
      )
    `);

    for (const candidate of normalizeLocatorCandidates(step.locatorCandidates)) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AutomationLocatorCandidate" (
          "id", "stepId", "strategy", "value", "score", "isUnique", "rank", "source", "metadata"
        )
        VALUES (
          ${newId("locator")}, ${stepId}, ${candidate.strategy}, ${candidate.value},
          ${candidate.score}, ${Boolean(candidate.isUnique)}, ${candidate.rank ?? 0},
          ${candidate.source ?? "recorded"}, ${jsonb(candidate.metadata ?? {})}
        )
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "AutomationAction"
      SET "version" = "version" + 1, "updatedAt" = NOW()
      WHERE "projectId" = ${projectId} AND "id" = ${actionId}
    `);
  });

  return getAction(projectId, actionId);
}

export async function deleteActionStep(
  projectId: string,
  actionId: string,
  stepId: string,
) {
  const deleted = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "AutomationStep"
    WHERE "projectId" = ${projectId}
      AND "actionId" = ${actionId}
      AND "id" = ${stepId}
  `);
  if (Number(deleted) <= 0) return null;

  await prisma.$executeRaw(Prisma.sql`
    WITH ordered AS (
      SELECT "id", ROW_NUMBER() OVER (ORDER BY "orderIndex" ASC, "updatedAt" ASC) - 1 AS "nextIndex"
      FROM "AutomationStep"
      WHERE "projectId" = ${projectId} AND "actionId" = ${actionId}
    )
    UPDATE "AutomationStep" step
    SET "orderIndex" = ordered."nextIndex", "updatedAt" = NOW()
    FROM ordered
    WHERE step."id" = ordered."id"
  `);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "AutomationAction"
    SET "version" = "version" + 1, "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${actionId}
  `);

  return getAction(projectId, actionId);
}

export async function updateActionStep(
  projectId: string,
  actionId: string,
  stepId: string,
  input: {
    action?: string;
    assertionType?: string;
    commandText?: string;
    description?: string;
    expectedValue?: string;
    inputValue?: string;
    locatorCandidates?: AutomationStep["locatorCandidates"];
    options?: AutomationStep["options"];
    target?: AutomationStep["target"];
  },
) {
  const action = await getAction(projectId, actionId);
  const current = action?.steps.find((step) => step.id === stepId);
  if (!action || !current) return null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "AutomationStep"
      SET "action" = ${typeof input.action === "string" ? input.action : current.action},
        "description" = ${typeof input.description === "string" ? input.description : current.description},
        "target" = ${jsonb(input.target ?? current.target)},
        "inputValue" = ${typeof input.inputValue === "string" ? input.inputValue : current.inputValue ?? ""},
        "expectedValue" = ${typeof input.expectedValue === "string" ? input.expectedValue : current.expectedValue ?? ""},
        "assertionType" = ${typeof input.assertionType === "string" ? input.assertionType : current.assertionType ?? ""},
        "options" = ${jsonb(input.options ?? current.options ?? {})},
        "commandText" = ${typeof input.commandText === "string" ? input.commandText : current.commandText ?? ""},
        "updatedAt" = NOW()
      WHERE "projectId" = ${projectId}
        AND "actionId" = ${actionId}
        AND "id" = ${stepId}
    `);

    if (input.locatorCandidates) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "AutomationLocatorCandidate"
        WHERE "stepId" = ${stepId}
      `);
      for (const candidate of normalizeLocatorCandidates(input.locatorCandidates)) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "AutomationLocatorCandidate" (
            "id", "stepId", "strategy", "value", "score", "isUnique", "rank", "source", "metadata"
          )
          VALUES (
            ${newId("locator")}, ${stepId}, ${candidate.strategy}, ${candidate.value},
            ${candidate.score}, ${Boolean(candidate.isUnique)}, ${candidate.rank ?? 0},
            ${candidate.source ?? "recorded"}, ${jsonb(candidate.metadata ?? {})}
          )
        `);
      }
    }
  });

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "AutomationAction"
    SET "version" = "version" + 1, "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${actionId}
  `);

  return getAction(projectId, actionId);
}

export async function deleteAction(projectId: string, actionId: string) {
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE "AutomationAction"
    SET "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        ${Prisma.raw("'{recycleBin}'")},
        ${jsonb({
          deletedAt: new Date().toISOString(),
          deletedBy: null,
          previousStatus: null,
          type: "action",
        })},
        true
      ),
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${actionId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') = ''
  `);
  return Number(result) > 0;
}

export async function purgeAction(projectId: string, actionId: string) {
  const result = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "AutomationAction"
    WHERE "projectId" = ${projectId} AND "id" = ${actionId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') <> ''
  `);
  return Number(result) > 0;
}

export async function restoreAction(projectId: string, actionId: string) {
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE "AutomationAction"
    SET "metadata" = COALESCE("metadata", '{}'::jsonb) - 'recycleBin',
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${actionId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') <> ''
  `);
  if (Number(result) <= 0) return null;
  return getAction(projectId, actionId);
}

export async function listRecycleBinItems(projectId: string): Promise<AutomationRecycleBinItem[]> {
  const scenarioRows = await prisma.$queryRaw<RecycleBinRow[]>(Prisma.sql`
    SELECT "id", 'scenario' AS "type", "projectId", "name", "description",
      "metadata"->'recycleBin'->>'deletedAt' AS "deletedAt",
      "metadata"->'recycleBin'->>'deletedBy' AS "deletedBy",
      "metadata"->'recycleBin'->>'previousStatus' AS "previousStatus",
      "updatedAt"
    FROM "AutomationScenario"
    WHERE "projectId" = ${projectId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') <> ''
  `);
  const actionRows = await prisma.$queryRaw<RecycleBinRow[]>(Prisma.sql`
    SELECT "id", 'action' AS "type", "projectId", "name", "description",
      "metadata"->'recycleBin'->>'deletedAt' AS "deletedAt",
      "metadata"->'recycleBin'->>'deletedBy' AS "deletedBy",
      "metadata"->'recycleBin'->>'previousStatus' AS "previousStatus",
      "updatedAt"
    FROM "AutomationAction"
    WHERE "projectId" = ${projectId}
      AND COALESCE("metadata"->'recycleBin'->>'deletedAt', '') <> ''
  `);
  return [...scenarioRows, ...actionRows]
    .map(mapRecycleBinItem)
    .sort((left, right) => new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime());
}

export async function restoreRecycleBinItem(
  projectId: string,
  type: AutomationRecycleBinItemType,
  id: string,
) {
  if (type === "scenario") return restoreScenario(projectId, id);
  if (type === "action") return restoreAction(projectId, id);
  return null;
}

export async function purgeRecycleBinItem(
  projectId: string,
  type: AutomationRecycleBinItemType,
  id: string,
) {
  if (type === "scenario") return purgeScenario(projectId, id);
  if (type === "action") return purgeAction(projectId, id);
  return false;
}

export async function importLegacyScenarios(
  projectId: string,
  legacyScenarios: Array<Partial<AutomationScenario> & { id?: string | number }>,
) {
  const imported: AutomationScenario[] = [];

  for (const legacy of legacyScenarios) {
    const legacyId = typeof legacy.id === "string" ? legacy.id : String(legacy.id ?? "");
    const duplicateRows = legacyId
      ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "AutomationScenario"
          WHERE "projectId" = ${projectId}
            AND "metadata"->>'legacyLocalStorageId' = ${legacyId}
          LIMIT 1
        `)
      : [];
    if (duplicateRows[0]) {
      const duplicate = await getScenario(projectId, duplicateRows[0].id);
      if (duplicate) imported.push(duplicate);
      continue;
    }

    const scenario = await createScenario({
      description: typeof legacy.description === "string" ? legacy.description : "",
      metadata: {
        importedAt: new Date().toISOString(),
        legacyLocalStorageId: legacyId,
        source: "legacy-local-storage",
      },
      name: typeof legacy.name === "string" ? legacy.name : "Imported Scenario",
      projectId,
      status:
        legacy.status === "active" ||
        legacy.status === "paused" ||
        legacy.status === "archived"
          ? legacy.status
          : "draft",
      tags: toStringArray(legacy.tags),
    });
    const steps = normalizeImportedSteps(legacy.steps);
    imported.push(steps.length ? (await replaceScenarioSteps(projectId, scenario.id, steps)) ?? scenario : scenario);
  }

  return imported;
}

export async function createSessionRecord(input: {
  projectId: string;
  scenarioId?: string | null;
  environmentId?: string | null;
  provider: AutomationSessionProviderId;
  providerSessionId?: string | null;
  status: AutomationSessionStatus;
  liveViewUrl?: string | null;
  expiresAt?: string | null;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<AutomationSession> {
  const id = newId("session");
  const status = databaseSessionStatus(input.status);
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    provider: AutomationSessionProviderId;
    status: AutomationSessionStatus;
  }>>(Prisma.sql`
    INSERT INTO "AutomationSession" (
      "id", "projectId", "scenarioId", "environmentId", "provider", "providerSessionId",
      "status", "liveViewUrl", "expiresAt", "capabilities", "metadata", "updatedAt"
    )
    VALUES (
      ${id}, ${input.projectId}, ${input.scenarioId ?? null}, ${input.environmentId ?? null},
      ${input.provider}::"AutomationSessionProvider", ${input.providerSessionId ?? null},
      ${status}::"AutomationSessionStatus", ${input.liveViewUrl ?? null},
      ${input.expiresAt ? new Date(input.expiresAt) : null}, ${jsonb(input.capabilities ?? {})},
      ${jsonb(input.metadata ?? {})}, NOW()
    )
    RETURNING "id", "provider", "status"
  `);

  return {
    capabilities: input.capabilities ?? {},
    environmentId: input.environmentId ?? null,
    eventStreamUrl:
      typeof input.metadata?.eventStreamUrl === "string"
        ? input.metadata.eventStreamUrl
        : typeof input.metadata?.streamUrl === "string"
          ? input.metadata.streamUrl
          : null,
    expiresAt: input.expiresAt ?? null,
    id: rows[0].id,
    liveViewUrl: input.liveViewUrl ?? null,
    metadata: input.metadata ?? {},
    projectId: input.projectId,
    provider: rows[0].provider,
    providerSessionId: input.providerSessionId ?? null,
    scenarioId: input.scenarioId ?? null,
    status: rows[0].status,
  };
}

type SessionRow = {
  id: string;
  projectId: string;
  version: number;
  scenarioId: string | null;
  environmentId: string | null;
  provider: AutomationSessionProviderId;
  providerSessionId: string | null;
  status: AutomationSessionStatus;
  liveViewUrl: string | null;
  expiresAt: Date | null;
  capabilities: unknown;
  metadata: unknown;
};

function mapSession(row: SessionRow): AutomationSession {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    capabilities:
      row.capabilities && typeof row.capabilities === "object"
        ? (row.capabilities as Record<string, unknown>)
        : {},
    environmentId: row.environmentId,
    eventStreamUrl:
      typeof metadata.eventStreamUrl === "string"
        ? metadata.eventStreamUrl
        : typeof metadata.streamUrl === "string"
          ? metadata.streamUrl
          : null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    id: row.id,
    liveViewUrl: row.liveViewUrl,
    metadata,
    projectId: row.projectId,
    provider: row.provider,
    providerSessionId: row.providerSessionId,
    scenarioId: row.scenarioId,
    status: row.status,
    version: row.version,
  };
}

function databaseSessionStatus(status?: string | null): AutomationSessionStatus {
  if (status === "creating") return "starting";
  if (status === "idle") return "ready";
  if (status === "running") return "recording";
  if (status === "completed" || status === "complete" || status === "succeeded" || status === "success") {
    return "ready";
  }
  if (status === "cancelled" || status === "canceled") return "closed";
  if (status === "broken") return "failed";
  if (status === "terminating" || status === "terminated") return "closed";
  if (
    status === "requested" ||
    status === "starting" ||
    status === "ready" ||
    status === "recording" ||
    status === "closed" ||
    status === "failed"
  ) {
    return status;
  }
  return "requested";
}

export async function getSessionRecord(sessionId: string) {
  const rows = await prisma.$queryRaw<SessionRow[]>(Prisma.sql`
    SELECT "id", "projectId", "version", "scenarioId", "environmentId",
      "provider", "providerSessionId", "status", "liveViewUrl", "expiresAt",
      "capabilities", "metadata"
    FROM "AutomationSession"
    WHERE "id" = ${sessionId}
    LIMIT 1
  `);
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function updateSessionRecord(
  sessionId: string,
  input: {
    status?: string | null;
    liveViewUrl?: string | null;
    expiresAt?: string | null;
    capabilities?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
) {
  const current = await getSessionRecord(sessionId);
  if (!current) return null;
  const nextStatus = databaseSessionStatus(input.status ?? current.status);

  const rows = await prisma.$queryRaw<SessionRow[]>(Prisma.sql`
    UPDATE "AutomationSession"
    SET "status" = ${nextStatus}::"AutomationSessionStatus",
      "liveViewUrl" = ${input.liveViewUrl ?? current.liveViewUrl},
      "expiresAt" = ${
        input.expiresAt === undefined
          ? current.expiresAt
            ? new Date(current.expiresAt)
            : null
          : input.expiresAt
            ? new Date(input.expiresAt)
            : null
      },
      "capabilities" = ${jsonb(input.capabilities ?? current.capabilities)},
      "metadata" = ${jsonb(input.metadata ?? current.metadata)},
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "id" = ${sessionId}
    RETURNING "id", "projectId", "version", "scenarioId", "environmentId",
      "provider", "providerSessionId", "status", "liveViewUrl", "expiresAt",
      "capabilities", "metadata"
  `);
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function createRunWithArtifacts(input: {
  projectId: string;
  scenarioId?: string | null;
  sessionId?: string | null;
  environmentId?: string | null;
  status?: AutomationRun["status"];
  summary?: Record<string, unknown>;
  artifacts?: Array<Partial<AutomationArtifactInput>>;
}): Promise<AutomationRun> {
  const runId = newId("run");
  const status = normalizeRunStatus(input.status) ?? "queued";
  const artifactInputs = (input.artifacts?.length
    ? input.artifacts
    : createRunArtifactManifest(runId)
  ).flatMap((artifact) => {
    const normalized = normalizeArtifactInput({ ...artifact, runId });
    return normalized ? [normalized] : [];
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "AutomationRun" (
        "id", "projectId", "scenarioId", "sessionId", "environmentId",
        "status", "startedAt", "finishedAt", "summary", "updatedAt"
      )
      VALUES (
        ${runId}, ${input.projectId}, ${input.scenarioId ?? null},
        ${input.sessionId ?? null}, ${input.environmentId ?? null},
        ${status}::"AutomationRunStatus",
        ${status === "running" ? new Date() : null},
        ${["passed", "failed", "blocked", "canceled"].includes(status) ? new Date() : null},
        ${jsonb(buildRunSummary(input.summary))}, NOW()
      )
    `);

    for (const artifact of artifactInputs) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AutomationArtifact" (
          "id", "projectId", "runId", "type", "label", "uri", "mimeType",
          "sizeBytes", "encrypted", "metadata"
        )
        VALUES (
          ${newId("artifact")}, ${input.projectId}, ${runId},
          ${artifact.type}::"AutomationArtifactType", ${artifact.label}, ${artifact.uri},
          ${artifact.mimeType ?? null}, ${artifact.sizeBytes ?? null},
          ${artifact.encrypted}, ${jsonb(artifact.metadata ?? {})}
        )
      `);
    }
  });

  return {
    createdAt: new Date().toISOString(),
    environmentId: input.environmentId ?? null,
    finishedAt: ["passed", "failed", "blocked", "canceled"].includes(status)
      ? new Date().toISOString()
      : null,
    id: runId,
    projectId: input.projectId,
    scenarioId: input.scenarioId ?? null,
    sessionId: input.sessionId ?? null,
    startedAt: status === "running" ? new Date().toISOString() : null,
    status,
    summary: buildRunSummary(input.summary),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

function normalizeRunStatus(value: unknown): AutomationRun["status"] | null {
  return value === "queued" ||
    value === "running" ||
    value === "passed" ||
    value === "failed" ||
    value === "blocked" ||
    value === "canceled"
    ? value
    : null;
}

function buildRunSummary(summary?: Record<string, unknown>) {
  const startedAt = new Date().toISOString();
  return {
    artefactRetention: {
      days: 30,
      policy: "standard-run-evidence",
    },
    queuedAt: startedAt,
    stepResults: Array.isArray(summary?.stepResults) ? summary.stepResults : [],
    worker: {
      state: "queued",
      type: "automation-execution-service",
    },
    ...summary,
  };
}

type RunRow = {
  id: string;
  projectId: string;
  version: number;
  scenarioId: string | null;
  sessionId: string | null;
  environmentId: string | null;
  status: AutomationRun["status"];
  startedAt: Date | null;
  finishedAt: Date | null;
  summary: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function mapRun(row: RunRow): AutomationRun {
  return {
    createdAt: row.createdAt.toISOString(),
    environmentId: row.environmentId,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    id: row.id,
    projectId: row.projectId,
    scenarioId: row.scenarioId,
    sessionId: row.sessionId,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
    summary:
      row.summary && typeof row.summary === "object"
        ? (row.summary as Record<string, unknown>)
        : {},
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

export async function listRuns(projectId: string): Promise<AutomationRun[]> {
  const rows = await prisma.$queryRaw<RunRow[]>(Prisma.sql`
    SELECT "id", "projectId", "version", "scenarioId", "sessionId", "environmentId",
      "status", "startedAt", "finishedAt", "summary", "createdAt", "updatedAt"
    FROM "AutomationRun"
    WHERE "projectId" = ${projectId}
    ORDER BY "createdAt" DESC
  `);
  return rows.map(mapRun);
}

export async function getRun(projectId: string, runId: string) {
  const rows = await prisma.$queryRaw<RunRow[]>(Prisma.sql`
    SELECT "id", "projectId", "version", "scenarioId", "sessionId", "environmentId",
      "status", "startedAt", "finishedAt", "summary", "createdAt", "updatedAt"
    FROM "AutomationRun"
    WHERE "projectId" = ${projectId} AND "id" = ${runId}
    LIMIT 1
  `);
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function updateRun(projectId: string, runId: string, input: {
  status?: AutomationRun["status"];
  summary?: Record<string, unknown>;
}) {
  const current = await getRun(projectId, runId);
  if (!current) return null;
  const status = normalizeRunStatus(input.status) ?? current.status;
  const summary = { ...current.summary, ...(input.summary ?? {}) };
  const rows = await prisma.$queryRaw<RunRow[]>(Prisma.sql`
    UPDATE "AutomationRun"
    SET "status" = ${status}::"AutomationRunStatus",
      "startedAt" = ${
        !current.startedAt && status === "running" ? new Date() : current.startedAt ? new Date(current.startedAt) : null
      },
      "finishedAt" = ${
        ["passed", "failed", "blocked", "canceled"].includes(status)
          ? new Date()
          : current.finishedAt
            ? new Date(current.finishedAt)
            : null
      },
      "summary" = ${jsonb(summary)},
      "version" = "version" + 1,
      "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${runId}
    RETURNING "id", "projectId", "version", "scenarioId", "sessionId", "environmentId",
      "status", "startedAt", "finishedAt", "summary", "createdAt", "updatedAt"
  `);
  return rows[0] ? mapRun(rows[0]) : null;
}

function healingEventsFromSummary(summary: Record<string, unknown>): AutomationHealingEvent[] {
  return Array.isArray(summary.healingEvents)
    ? summary.healingEvents.filter((event): event is AutomationHealingEvent =>
        Boolean(event && typeof event === "object" && typeof (event as { id?: unknown }).id === "string"),
      )
    : [];
}

function normalizeHealingStatus(value: unknown): AutomationHealingStatus {
  return value === "accepted" || value === "discarded" ? value : "not_reviewed";
}

function normalizeHealingEvent(runId: string, event: Partial<AutomationHealingEvent>): AutomationHealingEvent | null {
  const healedLocator =
    event.healedLocator && typeof event.healedLocator === "object"
      ? event.healedLocator
      : null;
  const originalLocator =
    event.originalLocator && typeof event.originalLocator === "object"
      ? event.originalLocator
      : null;
  const stepId = typeof event.stepId === "string" ? event.stepId : typeof event.commandId === "string" ? event.commandId : null;
  if (!stepId && !healedLocator) return null;
  return {
    acceptedAt: typeof event.acceptedAt === "string" ? event.acceptedAt : null,
    acceptedBy: typeof event.acceptedBy === "string" ? event.acceptedBy : null,
    actionId: typeof event.actionId === "string" ? event.actionId : null,
    commandId: typeof event.commandId === "string" ? event.commandId : stepId,
    confidenceScore: typeof event.confidenceScore === "number" ? event.confidenceScore : null,
    discardedAt: typeof event.discardedAt === "string" ? event.discardedAt : null,
    healedLocator,
    healReason: typeof event.healReason === "string" ? event.healReason : "",
    id: typeof event.id === "string" ? event.id : newId("heal"),
    originalLocator,
    runId,
    sessionId: typeof event.sessionId === "string" ? event.sessionId : null,
    status: normalizeHealingStatus(event.status),
    stepId,
    suggestedCandidates: Array.isArray(event.suggestedCandidates)
      ? event.suggestedCandidates.filter((candidate): candidate is Record<string, unknown> =>
          Boolean(candidate && typeof candidate === "object"),
        )
      : [],
    timestamp: typeof event.timestamp === "string" ? event.timestamp : new Date().toISOString(),
    userAccepted: Boolean(event.userAccepted),
  };
}

export async function appendRunHealingEvents(
  projectId: string,
  runId: string,
  events: Array<Partial<AutomationHealingEvent>>,
) {
  const current = await getRun(projectId, runId);
  if (!current) return null;
  const existing = healingEventsFromSummary(current.summary);
  const byKey = new Map(existing.map((event) => [event.id, event]));
  for (const event of events) {
    const normalized = normalizeHealingEvent(runId, event);
    if (!normalized) continue;
    byKey.set(normalized.id, { ...byKey.get(normalized.id), ...normalized });
  }
  const healingEvents = Array.from(byKey.values());
  return updateRun(projectId, runId, {
    summary: {
      healingEvents,
      selfHealedCount: healingEvents.filter((event) => event.healedLocator).length,
    },
  });
}

export async function reviewRunHealingEvent(
  projectId: string,
  runId: string,
  healingEventId: string,
  status: AutomationHealingStatus,
) {
  const current = await getRun(projectId, runId);
  if (!current) return null;
  const nowIso = new Date().toISOString();
  const healingEvents = healingEventsFromSummary(current.summary).map((event) =>
    event.id === healingEventId
      ? {
          ...event,
          acceptedAt: status === "accepted" ? nowIso : event.acceptedAt ?? null,
          discardedAt: status === "discarded" ? nowIso : event.discardedAt ?? null,
          status,
          userAccepted: status === "accepted",
        }
      : event,
  );
  return updateRun(projectId, runId, { summary: { healingEvents } });
}

export async function acceptRunHealingLocator(
  projectId: string,
  runId: string,
  healingEventId: string,
) {
  const current = await getRun(projectId, runId);
  if (!current) return null;
  const event = healingEventsFromSummary(current.summary).find((item) => item.id === healingEventId);
  if (!event?.stepId || !event.healedLocator) return null;
  const healedType = String(event.healedLocator.type ?? event.healedLocator.strategy ?? "css");
  const healedValue = String(event.healedLocator.value ?? "").trim();
  if (!healedValue) return null;

  const stepRows = await prisma.$queryRaw<Array<{ target: unknown }>>(Prisma.sql`
    SELECT "target" FROM "AutomationStep"
    WHERE "projectId" = ${projectId} AND "id" = ${event.stepId}
    LIMIT 1
  `);
  const currentTarget =
    stepRows[0]?.target && typeof stepRows[0].target === "object"
      ? (stepRows[0].target as Record<string, unknown>)
      : {};
  const nextTarget = {
    ...currentTarget,
    displayName: String(event.healedLocator.label ?? event.healedLocator.value ?? currentTarget.displayName ?? ""),
    locatorType: healedType,
    type: "smart",
    value: healedValue,
  };

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "AutomationStep"
    SET "target" = ${jsonb(nextTarget)}, "version" = "version" + 1, "updatedAt" = NOW()
    WHERE "projectId" = ${projectId} AND "id" = ${event.stepId}
  `);

  const oldType = String(event.originalLocator?.type ?? event.originalLocator?.strategy ?? "").trim();
  const oldValue = String(event.originalLocator?.value ?? "").trim();
  if (oldType && oldValue) {
    const rankRows = await prisma.$queryRaw<Array<{ rank: number | null }>>(Prisma.sql`
      SELECT MAX("rank") AS "rank" FROM "AutomationLocatorCandidate"
      WHERE "stepId" = ${event.stepId}
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AutomationLocatorCandidate" (
        "id", "stepId", "strategy", "value", "score", "isUnique", "rank", "source", "metadata"
      )
      VALUES (
        ${newId("locator")}, ${event.stepId}, ${oldType}, ${oldValue}, ${Math.round(Number(event.confidenceScore ?? 0))},
        false, ${(rankRows[0]?.rank ?? 0) + 1}, ${"previous_primary"}, ${jsonb({ acceptedFromHealingEventId: event.id })}
      )
    `);
  }

  return reviewRunHealingEvent(projectId, runId, healingEventId, "accepted");
}

export async function appendRunArtifacts(
  projectId: string,
  runId: string,
  artifacts: Array<Partial<AutomationArtifactInput>>,
) {
  const normalized = artifacts.flatMap((artifact) => {
    const item = normalizeArtifactInput({ ...artifact, runId });
    return item ? [item] : [];
  });
  for (const artifact of normalized) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AutomationArtifact" (
        "id", "projectId", "runId", "type", "label", "uri", "mimeType",
        "sizeBytes", "encrypted", "metadata"
      )
      VALUES (
        ${newId("artifact")}, ${projectId}, ${runId},
        ${artifact.type}::"AutomationArtifactType", ${artifact.label}, ${artifact.uri},
        ${artifact.mimeType ?? null}, ${artifact.sizeBytes ?? null},
        ${artifact.encrypted}, ${jsonb(artifact.metadata ?? {})}
      )
    `);
  }
  return listRunArtifacts(projectId, runId);
}

export async function listRunArtifacts(
  projectId: string,
  runId: string,
): Promise<AutomationArtifact[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    version: number;
    runId: string | null;
    type: AutomationArtifactType;
    label: string;
    uri: string;
    mimeType: string | null;
    sizeBytes: number | null;
    encrypted: boolean;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>>(Prisma.sql`
    SELECT "id", "version", "runId", "type", "label", "uri", "mimeType", "sizeBytes",
      "encrypted", "metadata", "createdAt", "updatedAt"
    FROM "AutomationArtifact"
    WHERE "projectId" = ${projectId} AND "runId" = ${runId}
    ORDER BY "createdAt" ASC
  `);

  return rows.map((row) => ({
    createdAt: row.createdAt.toISOString(),
    encrypted: row.encrypted,
    id: row.id,
    label: row.label,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    mimeType: row.mimeType,
    projectId,
    runId: row.runId,
    sizeBytes: row.sizeBytes,
    type: row.type,
    uri: row.uri,
    downloadUrl: toDownloadUrl({ id: row.id, uri: row.uri }),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  }));
}
