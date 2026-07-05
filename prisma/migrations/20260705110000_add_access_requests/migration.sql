CREATE TYPE "AccessRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "AccessRequest" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "clerkUserId" TEXT,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'pending',
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "firstRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPath" TEXT NOT NULL DEFAULT '',
  "decisionTokenHash" TEXT NOT NULL,
  "notificationSentAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "decidedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessRequest_email_key" ON "AccessRequest"("email");
CREATE UNIQUE INDEX "AccessRequest_decisionTokenHash_key" ON "AccessRequest"("decisionTokenHash");
CREATE INDEX "AccessRequest_status_lastRequestedAt_idx" ON "AccessRequest"("status", "lastRequestedAt");
CREATE INDEX "AccessRequest_email_idx" ON "AccessRequest"("email");
