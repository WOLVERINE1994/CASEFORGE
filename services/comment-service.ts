import { randomUUID } from "node:crypto";
import { prisma } from "../utils/prisma";
import { createActivityLog } from "./activity-service";

export type CommentRecord = {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCommentInput = {
  authorId: string;
  body: string;
};

type CommentRow = {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

const isMissingCommentTablesError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('relation "Comment" does not exist') ||
    error.message.includes('relation "Issue" does not exist') ||
    error.message.includes('relation "User" does not exist') ||
    error.message.includes("column Comment.updatedAt does not exist") ||
    error.message.includes("column User.email does not exist")
  );
};

export class CommentServiceNotReadyError extends Error {
  constructor() {
    super(
      "Issue comments are not ready yet. Apply the latest Prisma migration before using issue comments."
    );
    this.name = "CommentServiceNotReadyError";
  }
}

const withCommentReadiness = <T,>(operation: () => Promise<T>) =>
  operation().catch((error) => {
    if (isMissingCommentTablesError(error)) {
      throw new CommentServiceNotReadyError();
    }

    throw error;
  });

const mapCommentRecord = (row: CommentRow): CommentRecord => ({
  id: row.id,
  issueId: row.issueId,
  authorId: row.authorId,
  authorName: row.authorName,
  authorEmail: row.authorEmail,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const listIssueComments = async (issueId: string): Promise<CommentRecord[]> =>
  withCommentReadiness(async () => {
    const rows = await prisma.$queryRaw<CommentRow[]>`
      SELECT
        c."id",
        c."issueId",
        c."authorId",
        u."name" AS "authorName",
        u."email" AS "authorEmail",
        c."body",
        c."createdAt",
        c."updatedAt"
      FROM "Comment" c
      INNER JOIN "User" u ON u."id" = c."authorId"
      WHERE c."issueId" = ${issueId}
      ORDER BY c."createdAt" DESC
    `;

    return rows.map(mapCommentRecord);
  });

export const createIssueComment = async (
  issueId: string,
  input: CreateCommentInput
): Promise<CommentRecord> =>
  withCommentReadiness(async () => {
    const trimmedBody = input.body.trim();
    if (!trimmedBody) {
      throw new Error("Comment body is required.");
    }

    const issueRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Issue"
      WHERE "id" = ${issueId}
      LIMIT 1
    `;

    if (!issueRows[0]) {
      throw new Error("Issue not found.");
    }

    const authorRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${input.authorId}
      LIMIT 1
    `;

    if (!authorRows[0]) {
      throw new Error("Comment author not found.");
    }

    const createdRows = await prisma.$queryRaw<CommentRow[]>`
      INSERT INTO "Comment" (
        "id",
        "issueId",
        "authorId",
        "body",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${issueId},
        ${input.authorId},
        ${trimmedBody},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING
        "id",
        "issueId",
        "authorId",
        (
          SELECT "name"
          FROM "User"
          WHERE "id" = "authorId"
        )::text AS "authorName",
        (
          SELECT "email"
          FROM "User"
          WHERE "id" = "authorId"
        )::text AS "authorEmail",
        "body",
        "createdAt",
        "updatedAt"
    `;

    const createdComment = mapCommentRecord(createdRows[0]);
    await createActivityLog({
      entityType: "issue",
      entityId: issueId,
      action: "comment.created",
      actorId: createdComment.authorId,
      afterJson: {
        commentId: createdComment.id,
        body: createdComment.body,
      },
    }).catch(() => undefined);

    return createdComment;
  });
