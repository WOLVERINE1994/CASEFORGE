import { randomUUID } from "node:crypto";
import { prisma } from "../utils/prisma";

export type ActivityRecord = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
};

export type CreateActivityInput = {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
};

type ActivityRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: Date;
};

const isActivityLogNotReadyError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('relation "ActivityLog" does not exist') ||
    error.message.includes("column ActivityLog.beforeJson does not exist") ||
    error.message.includes("column ActivityLog.afterJson does not exist")
  );
};

export class ActivityServiceNotReadyError extends Error {
  constructor() {
    super(
      "Issue activity is not ready yet. Apply the latest Prisma migration before using activity history."
    );
    this.name = "ActivityServiceNotReadyError";
  }
}

const withActivityReadiness = <T,>(operation: () => Promise<T>) =>
  operation().catch((error) => {
    if (isActivityLogNotReadyError(error)) {
      throw new ActivityServiceNotReadyError();
    }

    throw error;
  });

const mapActivityRecord = (row: ActivityRow): ActivityRecord => ({
  id: row.id,
  entityType: row.entityType,
  entityId: row.entityId,
  action: row.action,
  actorId: row.actorId,
  actorName: row.actorName,
  actorEmail: row.actorEmail,
  beforeJson: row.beforeJson,
  afterJson: row.afterJson,
  createdAt: row.createdAt.toISOString(),
});

export const createActivityLog = async (input: CreateActivityInput) =>
  withActivityReadiness(async () => {
    await prisma.$executeRaw`
      INSERT INTO "ActivityLog" (
        "id",
        "entityType",
        "entityId",
        "action",
        "actorId",
        "beforeJson",
        "afterJson",
        "createdAt"
      )
      VALUES (
        ${randomUUID()},
        ${input.entityType},
        ${input.entityId},
        ${input.action},
        ${input.actorId ?? null},
        ${input.beforeJson === undefined ? null : JSON.stringify(input.beforeJson)}::jsonb,
        ${input.afterJson === undefined ? null : JSON.stringify(input.afterJson)}::jsonb,
        CURRENT_TIMESTAMP
      )
    `;
  });

export const listEntityActivity = async (
  entityType: string,
  entityId: string
): Promise<ActivityRecord[]> =>
  withActivityReadiness(async () => {
    const rows = await prisma.$queryRaw<ActivityRow[]>`
      SELECT
        a."id",
        a."entityType",
        a."entityId",
        a."action",
        a."actorId",
        u."name" AS "actorName",
        u."email" AS "actorEmail",
        a."beforeJson",
        a."afterJson",
        a."createdAt"
      FROM "ActivityLog" a
      LEFT JOIN "User" u ON u."id" = a."actorId"
      WHERE a."entityType" = ${entityType}
        AND a."entityId" = ${entityId}
      ORDER BY a."createdAt" DESC
    `;

    return rows.map(mapActivityRecord);
  });
