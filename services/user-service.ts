import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "admin" | "manager" | "tester" | "reviewer";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const isUserDirectoryNotReadyError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('relation "User" does not exist') ||
    error.message.includes("column User.avatarUrl does not exist") ||
    error.message.includes("column User.isActive does not exist") ||
    error.message.includes("column User.role does not exist") ||
    error.message.includes("column User.updatedAt does not exist") ||
    error.message.includes('type "UserRole" does not exist')
  );
};

export class UserServiceNotReadyError extends Error {
  constructor() {
    super(
      "User directory is not ready yet. Apply the latest Prisma migration before loading account-linked assignees."
    );
    this.name = "UserServiceNotReadyError";
  }
}

const withUserReadiness = <T,>(operation: () => Promise<T>) =>
  operation().catch((error) => {
    if (isUserDirectoryNotReadyError(error)) {
      throw new UserServiceNotReadyError();
    }

    throw error;
  });

const mapUserRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  name: row.name,
  email: row.email,
  avatarUrl: row.avatarUrl,
  role: row.role as UserRecord["role"],
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const listUsers = async (): Promise<UserRecord[]> =>
  withUserReadiness(async () => {
    const rows = await prisma.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT
        "id",
        "name",
        "email",
        "avatarUrl",
        "role",
        "isActive",
        "createdAt",
        "updatedAt"
      FROM "User"
      ORDER BY "name" ASC
    `);

    return rows.map(mapUserRecord);
  });
