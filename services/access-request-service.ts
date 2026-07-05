import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeAccessEmail } from "../lib/access-control";
import { prisma } from "../utils/prisma";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type AccessRequestRecord = {
  id: string;
  email: string;
  clerkUserId: string | null;
  status: AccessRequestStatus;
  requestCount: number;
  firstRequestedAt: string;
  lastRequestedAt: string;
  lastPath: string;
  notificationSentAt: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccessRequestRow = {
  id: string;
  email: string;
  clerkUserId: string | null;
  status: AccessRequestStatus;
  requestCount: number;
  firstRequestedAt: Date;
  lastRequestedAt: Date;
  lastPath: string;
  decisionTokenHash: string;
  notificationSentAt: Date | null;
  decidedAt: Date | null;
  decidedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RecordAccessRequestResult = {
  request: AccessRequestRecord;
  decisionToken: string | null;
  shouldNotify: boolean;
};

const ACCESS_REQUEST_COLUMNS = Prisma.sql`
  "id",
  "email",
  "clerkUserId",
  "status",
  "requestCount",
  "firstRequestedAt",
  "lastRequestedAt",
  "lastPath",
  "decisionTokenHash",
  "notificationSentAt",
  "decidedAt",
  "decidedByEmail",
  "createdAt",
  "updatedAt"
`;

const hashDecisionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const createDecisionToken = () => randomBytes(32).toString("base64url");

const isAccessRequestNotReadyError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes('relation "AccessRequest" does not exist') ||
    error.message.includes('type "AccessRequestStatus" does not exist'));

export class AccessRequestServiceNotReadyError extends Error {
  constructor() {
    super("Access request storage is not ready yet. Apply the latest migration.");
    this.name = "AccessRequestServiceNotReadyError";
  }
}

const withAccessRequestReadiness = <T,>(operation: () => Promise<T>) =>
  operation().catch((error) => {
    if (isAccessRequestNotReadyError(error)) {
      throw new AccessRequestServiceNotReadyError();
    }

    throw error;
  });

const mapAccessRequest = (row: AccessRequestRow): AccessRequestRecord => ({
  id: row.id,
  email: row.email,
  clerkUserId: row.clerkUserId,
  status: row.status,
  requestCount: row.requestCount,
  firstRequestedAt: row.firstRequestedAt.toISOString(),
  lastRequestedAt: row.lastRequestedAt.toISOString(),
  lastPath: row.lastPath,
  notificationSentAt: row.notificationSentAt?.toISOString() ?? null,
  decidedAt: row.decidedAt?.toISOString() ?? null,
  decidedByEmail: row.decidedByEmail,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const hasApprovedDatabaseAccess = async (email: string | null | undefined) =>
  withAccessRequestReadiness(async () => {
    const normalizedEmail = normalizeAccessEmail(email);
    if (!normalizedEmail) return false;

    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "AccessRequest"
      WHERE "email" = ${normalizedEmail}
        AND "status" = 'approved'::"AccessRequestStatus"
      LIMIT 1
    `);

    return rows.length > 0;
  });

export const recordAccessRequest = async (input: {
  email: string | null | undefined;
  clerkUserId?: string | null;
  path: string;
}): Promise<RecordAccessRequestResult | null> =>
  withAccessRequestReadiness(async () => {
    const normalizedEmail = normalizeAccessEmail(input.email);
    if (!normalizedEmail) return null;

    const existingRows = await prisma.$queryRaw<AccessRequestRow[]>(Prisma.sql`
      SELECT ${ACCESS_REQUEST_COLUMNS}
      FROM "AccessRequest"
      WHERE "email" = ${normalizedEmail}
      LIMIT 1
    `);
    const existing = existingRows[0] ?? null;

    if (existing) {
      const shouldRefreshDecisionToken =
        existing.status === "pending" && existing.notificationSentAt === null;
      const decisionToken = shouldRefreshDecisionToken ? createDecisionToken() : null;
      const rows = await prisma.$queryRaw<AccessRequestRow[]>(Prisma.sql`
        UPDATE "AccessRequest"
        SET
          "clerkUserId" = COALESCE(${input.clerkUserId ?? null}, "clerkUserId"),
          "requestCount" = "requestCount" + 1,
          "lastRequestedAt" = CURRENT_TIMESTAMP,
          "lastPath" = ${input.path},
          "decisionTokenHash" = ${
            decisionToken ? hashDecisionToken(decisionToken) : existing.decisionTokenHash
          },
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "email" = ${normalizedEmail}
        RETURNING ${ACCESS_REQUEST_COLUMNS}
      `);
      const updated = rows[0];

      return {
        request: mapAccessRequest(updated),
        decisionToken,
        shouldNotify:
          updated.status === "pending" && updated.notificationSentAt === null,
      };
    }

    const decisionToken = createDecisionToken();
    const rows = await prisma.$queryRaw<AccessRequestRow[]>(Prisma.sql`
      INSERT INTO "AccessRequest" (
        "id",
        "email",
        "clerkUserId",
        "status",
        "requestCount",
        "firstRequestedAt",
        "lastRequestedAt",
        "lastPath",
        "decisionTokenHash",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${normalizedEmail},
        ${input.clerkUserId ?? null},
        'pending'::"AccessRequestStatus",
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        ${input.path},
        ${hashDecisionToken(decisionToken)},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING ${ACCESS_REQUEST_COLUMNS}
    `);

    return {
      request: mapAccessRequest(rows[0]),
      decisionToken,
      shouldNotify: true,
    };
  });

export const markAccessRequestNotificationSent = async (id: string) =>
  withAccessRequestReadiness(async () => {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "AccessRequest"
      SET "notificationSentAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `);
  });

export const listAccessRequests = async (): Promise<AccessRequestRecord[]> =>
  withAccessRequestReadiness(async () => {
    const rows = await prisma.$queryRaw<AccessRequestRow[]>(Prisma.sql`
      SELECT ${ACCESS_REQUEST_COLUMNS}
      FROM "AccessRequest"
      ORDER BY
        CASE "status"
          WHEN 'pending' THEN 0
          WHEN 'approved' THEN 1
          ELSE 2
        END ASC,
        "lastRequestedAt" DESC
    `);

    return rows.map(mapAccessRequest);
  });

export const decideAccessRequest = async (input: {
  id: string;
  status: Exclude<AccessRequestStatus, "pending">;
  decidedByEmail: string;
}) =>
  withAccessRequestReadiness(async () => {
    const rows = await prisma.$queryRaw<AccessRequestRow[]>(Prisma.sql`
      UPDATE "AccessRequest"
      SET
        "status" = ${input.status}::"AccessRequestStatus",
        "decidedAt" = CURRENT_TIMESTAMP,
        "decidedByEmail" = ${input.decidedByEmail},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id}
      RETURNING ${ACCESS_REQUEST_COLUMNS}
    `);

    return rows[0] ? mapAccessRequest(rows[0]) : null;
  });

export const decideAccessRequestByToken = async (input: {
  token: string;
  status: Exclude<AccessRequestStatus, "pending">;
  decidedByEmail?: string | null;
}) =>
  withAccessRequestReadiness(async () => {
    const tokenHash = hashDecisionToken(input.token);
    const rows = await prisma.$queryRaw<AccessRequestRow[]>(Prisma.sql`
      UPDATE "AccessRequest"
      SET
        "status" = ${input.status}::"AccessRequestStatus",
        "decidedAt" = CURRENT_TIMESTAMP,
        "decidedByEmail" = ${input.decidedByEmail ?? "email-link"},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "decisionTokenHash" = ${tokenHash}
      RETURNING ${ACCESS_REQUEST_COLUMNS}
    `);

    return rows[0] ? mapAccessRequest(rows[0]) : null;
  });
