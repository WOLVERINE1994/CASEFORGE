import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { createActivityLog } from "./activity-service";

export type IssueType =
  | "epic"
  | "story"
  | "task"
  | "bug"
  | "test-case"
  | "test-plan"
  | "test-run";

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "blocked"
  | "in-review"
  | "done";

export type IssuePriority = "highest" | "high" | "medium" | "low";

export type IssueRecord = {
  id: string;
  projectId: string;
  projectKey: string;
  issueKey: string;
  issueNumber: number;
  type: IssueType;
  summary: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  reporterId: string | null;
  assigneeId: string | null;
  sprintId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateIssueInput = {
  type: IssueType;
  summary: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  reporterId?: string | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  dueDate?: string | null;
};

export type UpdateIssueInput = Partial<CreateIssueInput>;

type IssueRow = {
  id: string;
  projectId: string;
  projectKey: string | null;
  issueKey: string;
  issueNumber: number;
  type: string;
  summary: string;
  description: string | null;
  status: string;
  priority: string;
  reporterId: string | null;
  assigneeId: string | null;
  sprintId: string | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectLookup = {
  id: string;
  key: string | null;
};

const issueTypeToDb = (value: IssueType) =>
  value === "test-case"
    ? "test_case"
    : value === "test-plan"
    ? "test_plan"
    : value === "test-run"
    ? "test_run"
    : value;

const issueTypeFromDb = (value: string): IssueType =>
  value === "test_case"
    ? "test-case"
    : value === "test_plan"
    ? "test-plan"
    : value === "test_run"
    ? "test-run"
    : (value as IssueType);

const issueStatusToDb = (value: IssueStatus) =>
  value === "in-progress"
    ? "in_progress"
    : value === "in-review"
    ? "in_review"
    : value;

const issueStatusFromDb = (value: string): IssueStatus =>
  value === "in_progress"
    ? "in-progress"
    : value === "in_review"
    ? "in-review"
    : (value as IssueStatus);

const mapIssueRecord = (row: IssueRow): IssueRecord => ({
  id: row.id,
  projectId: row.projectId,
  projectKey: row.projectKey ?? row.projectId,
  issueKey: row.issueKey,
  issueNumber: row.issueNumber,
  type: issueTypeFromDb(row.type),
  summary: row.summary,
  description: row.description ?? "",
  status: issueStatusFromDb(row.status),
  priority: row.priority as IssuePriority,
  reporterId: row.reporterId,
  assigneeId: row.assigneeId,
  sprintId: row.sprintId,
  dueDate: row.dueDate ? row.dueDate.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const isMissingIssueTablesError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('relation "Issue" does not exist') ||
    error.message.includes('relation "Project" does not exist') ||
    error.message.includes("column Project.key does not exist") ||
    error.message.includes("column Project.status does not exist")
  );
};

export class IssueServiceNotReadyError extends Error {
  constructor() {
    super(
      "Issue persistence is not ready yet. Apply the latest Prisma migration before using issue CRUD."
    );
    this.name = "IssueServiceNotReadyError";
  }
}

const withIssueReadiness = <T,>(operation: () => Promise<T>) =>
  operation().catch((error) => {
    if (isMissingIssueTablesError(error)) {
      throw new IssueServiceNotReadyError();
    }

    throw error;
  });

const findProjectByKey = async (projectKey: string) => {
  const rows = await prisma.$queryRaw<ProjectLookup[]>(Prisma.sql`
    SELECT "id", "key"
    FROM "Project"
    WHERE LOWER(COALESCE("key", '')) = LOWER(${projectKey})
       OR LOWER("id") = LOWER(${projectKey})
       OR LOWER(COALESCE("rows"->'planning'->>'projectKey', '')) = LOWER(${projectKey})
    LIMIT 1
  `);

  return rows[0] ?? null;
};

export const listProjectIssues = async (
  projectKey: string
): Promise<IssueRecord[]> =>
  withIssueReadiness(async () => {
    const issues = await prisma.$queryRaw<IssueRow[]>(Prisma.sql`
      SELECT
        i."id",
        i."projectId",
        p."key" AS "projectKey",
        i."issueKey",
        i."issueNumber",
        i."type",
        i."summary",
        i."description",
        i."status",
        i."priority",
        i."reporterId",
        i."assigneeId",
        i."sprintId",
        i."dueDate",
        i."createdAt",
        i."updatedAt"
      FROM "Issue" i
      INNER JOIN "Project" p ON p."id" = i."projectId"
      WHERE LOWER(COALESCE(p."key", '')) = LOWER(${projectKey})
         OR LOWER(p."id") = LOWER(${projectKey})
         OR LOWER(COALESCE(p."rows"->'planning'->>'projectKey', '')) = LOWER(${projectKey})
      ORDER BY i."issueNumber" DESC
    `);

    return issues.map(mapIssueRecord);
  });

export const createProjectIssue = async (
  projectKey: string,
  input: CreateIssueInput
): Promise<IssueRecord> =>
  withIssueReadiness(async () => {
    const project = await findProjectByKey(projectKey);

    if (!project) {
      throw new Error("Project not found.");
    }

    const projectRef = project.key?.trim() || project.id;

    return prisma.$transaction(async (transaction) => {
      const nextIssueNumberRows = await transaction.$queryRaw<{ nextNumber: number }[]>(
        Prisma.sql`
          SELECT COALESCE(MAX("issueNumber"), 0) + 1 AS "nextNumber"
          FROM "Issue"
          WHERE "projectId" = ${project.id}
        `
      );
      const issueNumber = nextIssueNumberRows[0]?.nextNumber ?? 1;
      const issueKey = `${projectRef}-${issueNumber}`;
      const issueId = randomUUID();

      const createdRows = await transaction.$queryRaw<IssueRow[]>(Prisma.sql`
        INSERT INTO "Issue" (
          "id",
          "projectId",
          "issueNumber",
          "issueKey",
          "type",
          "summary",
          "description",
          "status",
          "priority",
          "reporterId",
          "assigneeId",
          "sprintId",
          "dueDate",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${issueId},
          ${project.id},
          ${issueNumber},
          ${issueKey},
          ${issueTypeToDb(input.type)}::"IssueType",
          ${input.summary},
          ${input.description?.trim() || ""},
          ${issueStatusToDb(input.status ?? "backlog")}::"IssueStatus",
          ${(input.priority ?? "medium")}::"Priority",
          ${input.reporterId ?? null},
          ${input.assigneeId ?? null},
          ${input.sprintId ?? null},
          ${input.dueDate ? new Date(input.dueDate) : null},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING
          "id",
          "projectId",
          ${project.key ?? project.id}::text AS "projectKey",
          "issueKey",
          "issueNumber",
          "type",
          "summary",
          "description",
          "status",
          "priority",
          "reporterId",
          "assigneeId",
          "sprintId",
          "dueDate",
          "createdAt",
          "updatedAt"
      `);

      const createdIssue = mapIssueRecord(createdRows[0]);
      await createActivityLog({
        entityType: "issue",
        entityId: createdIssue.id,
        action: "issue.created",
        actorId: createdIssue.reporterId,
        afterJson: {
          issueKey: createdIssue.issueKey,
          summary: createdIssue.summary,
          status: createdIssue.status,
          priority: createdIssue.priority,
        },
      }).catch(() => undefined);

      return createdIssue;
    });
  });

export const updateIssue = async (
  issueId: string,
  input: UpdateIssueInput,
  actorId?: string | null
): Promise<IssueRecord> =>
  withIssueReadiness(async () => {
    const existingRows = await prisma.$queryRaw<IssueRow[]>(Prisma.sql`
      SELECT
        i."id",
        i."projectId",
        p."key" AS "projectKey",
        i."issueKey",
        i."issueNumber",
        i."type",
        i."summary",
        i."description",
        i."status",
        i."priority",
        i."reporterId",
        i."assigneeId",
        i."sprintId",
        i."dueDate",
        i."createdAt",
        i."updatedAt"
      FROM "Issue" i
      INNER JOIN "Project" p ON p."id" = i."projectId"
      WHERE i."id" = ${issueId}
      LIMIT 1
    `);

    const existing = existingRows[0];
    if (!existing) {
      throw new Error("Issue not found.");
    }

    const updatedRows = await prisma.$queryRaw<IssueRow[]>(Prisma.sql`
      UPDATE "Issue"
      SET
        "type" = ${issueTypeToDb(input.type ?? issueTypeFromDb(existing.type))}::"IssueType",
        "summary" = ${input.summary?.trim() || existing.summary},
        "description" = ${input.description !== undefined ? input.description.trim() : existing.description ?? ""},
        "status" = ${issueStatusToDb(input.status ?? issueStatusFromDb(existing.status))}::"IssueStatus",
        "priority" = ${(input.priority ?? (existing.priority as IssuePriority))}::"Priority",
        "reporterId" = ${input.reporterId !== undefined ? input.reporterId : existing.reporterId},
        "assigneeId" = ${input.assigneeId !== undefined ? input.assigneeId : existing.assigneeId},
        "sprintId" = ${input.sprintId !== undefined ? input.sprintId : existing.sprintId},
        "dueDate" = ${
          input.dueDate !== undefined
            ? input.dueDate
              ? new Date(input.dueDate)
              : null
            : existing.dueDate
        },
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${issueId}
      RETURNING
        "id",
        "projectId",
        ${existing.projectKey ?? existing.projectId}::text AS "projectKey",
        "issueKey",
        "issueNumber",
        "type",
        "summary",
        "description",
        "status",
        "priority",
        "reporterId",
        "assigneeId",
        "sprintId",
        "dueDate",
        "createdAt",
        "updatedAt"
    `);

    const updatedIssue = mapIssueRecord(updatedRows[0]);
    await createActivityLog({
      entityType: "issue",
      entityId: updatedIssue.id,
      action: "issue.updated",
      actorId: actorId ?? updatedIssue.assigneeId ?? updatedIssue.reporterId,
      beforeJson: {
        summary: existing.summary,
        description: existing.description ?? "",
        status: issueStatusFromDb(existing.status),
        priority: existing.priority,
        assigneeId: existing.assigneeId,
        type: issueTypeFromDb(existing.type),
      },
      afterJson: {
        summary: updatedIssue.summary,
        description: updatedIssue.description,
        status: updatedIssue.status,
        priority: updatedIssue.priority,
        assigneeId: updatedIssue.assigneeId,
        type: updatedIssue.type,
      },
    }).catch(() => undefined);

    return updatedIssue;
  });
