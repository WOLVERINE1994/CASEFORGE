CREATE TYPE "AutomationScenarioStatus" AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE "AutomationRunStatus" AS ENUM ('queued', 'running', 'passed', 'failed', 'blocked', 'canceled');
CREATE TYPE "AutomationSessionStatus" AS ENUM ('requested', 'starting', 'ready', 'recording', 'closed', 'failed');
CREATE TYPE "AutomationSessionProvider" AS ENUM ('managed_browser', 'self_hosted_playwright', 'optional_local_connector');
CREATE TYPE "AutomationArtifactType" AS ENUM ('trace', 'video', 'log', 'network', 'screenshot', 'auth_state');

CREATE TABLE "AutomationScenario" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "AutomationScenarioStatus" NOT NULL DEFAULT 'draft',
  "tags" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationScenario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationAction" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdFromScenarioId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "tags" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationStep" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "actionId" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "target" JSONB NOT NULL DEFAULT '{}',
  "inputValue" TEXT NOT NULL DEFAULT '',
  "expectedValue" TEXT NOT NULL DEFAULT '',
  "assertionType" TEXT NOT NULL DEFAULT '',
  "options" JSONB NOT NULL DEFAULT '{}',
  "commandText" TEXT NOT NULL DEFAULT '',
  "elementSnapshot" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationLocatorCandidate" (
  "id" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "isUnique" BOOLEAN NOT NULL DEFAULT false,
  "rank" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'recorded',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationLocatorCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationEnvironment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL DEFAULT '',
  "variables" JSONB NOT NULL DEFAULT '{}',
  "authStateArtifactId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationEnvironment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationSession" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "environmentId" TEXT,
  "provider" "AutomationSessionProvider" NOT NULL,
  "providerSessionId" TEXT,
  "status" "AutomationSessionStatus" NOT NULL DEFAULT 'requested',
  "liveViewUrl" TEXT,
  "expiresAt" TIMESTAMP(3),
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "sessionId" TEXT,
  "environmentId" TEXT,
  "status" "AutomationRunStatus" NOT NULL DEFAULT 'queued',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "summary" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationArtifact" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runId" TEXT,
  "type" "AutomationArtifactType" NOT NULL,
  "label" TEXT NOT NULL,
  "uri" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "encrypted" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationScenario_projectId_updatedAt_idx" ON "AutomationScenario"("projectId", "updatedAt");
CREATE INDEX "AutomationAction_projectId_updatedAt_idx" ON "AutomationAction"("projectId", "updatedAt");
CREATE INDEX "AutomationStep_projectId_scenarioId_orderIndex_idx" ON "AutomationStep"("projectId", "scenarioId", "orderIndex");
CREATE INDEX "AutomationStep_projectId_actionId_orderIndex_idx" ON "AutomationStep"("projectId", "actionId", "orderIndex");
CREATE INDEX "AutomationLocatorCandidate_stepId_rank_idx" ON "AutomationLocatorCandidate"("stepId", "rank");
CREATE INDEX "AutomationEnvironment_projectId_isDefault_idx" ON "AutomationEnvironment"("projectId", "isDefault");
CREATE INDEX "AutomationSession_projectId_status_updatedAt_idx" ON "AutomationSession"("projectId", "status", "updatedAt");
CREATE INDEX "AutomationRun_projectId_createdAt_idx" ON "AutomationRun"("projectId", "createdAt");
CREATE INDEX "AutomationRun_scenarioId_createdAt_idx" ON "AutomationRun"("scenarioId", "createdAt");
CREATE INDEX "AutomationArtifact_projectId_runId_type_idx" ON "AutomationArtifact"("projectId", "runId", "type");

ALTER TABLE "AutomationScenario" ADD CONSTRAINT "AutomationScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AutomationScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AutomationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationLocatorCandidate" ADD CONSTRAINT "AutomationLocatorCandidate_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AutomationStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationEnvironment" ADD CONSTRAINT "AutomationEnvironment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AutomationScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationSession" ADD CONSTRAINT "AutomationSession_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "AutomationEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AutomationScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutomationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "AutomationEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationArtifact" ADD CONSTRAINT "AutomationArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
