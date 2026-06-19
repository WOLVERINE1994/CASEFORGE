CREATE TABLE "AutomationView" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "actionId" TEXT,
  "name" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL DEFAULT '',
  "title" TEXT NOT NULL DEFAULT '',
  "screenshotArtifactId" TEXT,
  "screenshotUri" TEXT NOT NULL DEFAULT '',
  "viewport" JSONB NOT NULL DEFAULT '{}',
  "domSnapshot" JSONB NOT NULL DEFAULT '{}',
  "accessibilityTree" JSONB NOT NULL DEFAULT '{}',
  "elementSnapshots" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationElement" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "viewId" TEXT,
  "name" TEXT NOT NULL,
  "businessName" TEXT NOT NULL DEFAULT '',
  "technicalName" TEXT NOT NULL DEFAULT '',
  "aliases" JSONB NOT NULL DEFAULT '[]',
  "description" TEXT NOT NULL DEFAULT '',
  "elementType" TEXT NOT NULL DEFAULT 'element',
  "status" TEXT NOT NULL DEFAULT 'active',
  "canonicalLocator" JSONB NOT NULL DEFAULT '{}',
  "locatorCandidates" JSONB NOT NULL DEFAULT '[]',
  "fallbackLocators" JSONB NOT NULL DEFAULT '[]',
  "boundingBox" JSONB NOT NULL DEFAULT '{}',
  "elementSnapshot" JSONB NOT NULL DEFAULT '{}',
  "lastVerifiedAt" TIMESTAMP(3),
  "stabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "preferredLocatorStrategy" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationElement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationElementUsage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "elementId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "actionId" TEXT,
  "stepId" TEXT,
  "usageType" TEXT NOT NULL DEFAULT 'command',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationElementUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationPlaybackJob" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "actionId" TEXT,
  "sessionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "scope" TEXT NOT NULL DEFAULT 'fullScenario',
  "configSnapshot" JSONB NOT NULL DEFAULT '{}',
  "logs" JSONB NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationPlaybackJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationPlaybackItem" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "stepId" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "command" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB NOT NULL DEFAULT '{}',
  "logs" JSONB NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationPlaybackItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationPlaybackConfig" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scenarioId" TEXT,
  "autoPlaybackEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pauseOnElementErrors" BOOLEAN NOT NULL DEFAULT true,
  "selfHealingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "environmentId" TEXT,
  "autoElementTimeoutMs" INTEGER NOT NULL DEFAULT 5000,
  "manualElementTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "manualPageTimeoutMs" INTEGER NOT NULL DEFAULT 60000,
  "executionParameters" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationPlaybackConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationView_projectId_capturedAt_idx" ON "AutomationView"("projectId", "capturedAt");
CREATE INDEX "AutomationView_projectId_scenarioId_capturedAt_idx" ON "AutomationView"("projectId", "scenarioId", "capturedAt");
CREATE INDEX "AutomationElement_projectId_name_idx" ON "AutomationElement"("projectId", "name");
CREATE INDEX "AutomationElement_projectId_viewId_idx" ON "AutomationElement"("projectId", "viewId");
CREATE INDEX "AutomationElementUsage_projectId_elementId_idx" ON "AutomationElementUsage"("projectId", "elementId");
CREATE INDEX "AutomationElementUsage_projectId_scenarioId_idx" ON "AutomationElementUsage"("projectId", "scenarioId");
CREATE INDEX "AutomationElementUsage_projectId_actionId_idx" ON "AutomationElementUsage"("projectId", "actionId");
CREATE INDEX "AutomationPlaybackJob_projectId_createdAt_idx" ON "AutomationPlaybackJob"("projectId", "createdAt");
CREATE INDEX "AutomationPlaybackJob_projectId_status_updatedAt_idx" ON "AutomationPlaybackJob"("projectId", "status", "updatedAt");
CREATE INDEX "AutomationPlaybackItem_jobId_orderIndex_idx" ON "AutomationPlaybackItem"("jobId", "orderIndex");
CREATE INDEX "AutomationPlaybackItem_jobId_status_idx" ON "AutomationPlaybackItem"("jobId", "status");
CREATE UNIQUE INDEX "AutomationPlaybackConfig_projectId_scenarioId_key" ON "AutomationPlaybackConfig"("projectId", "scenarioId");
CREATE INDEX "AutomationPlaybackConfig_projectId_idx" ON "AutomationPlaybackConfig"("projectId");

ALTER TABLE "AutomationView" ADD CONSTRAINT "AutomationView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationElement" ADD CONSTRAINT "AutomationElement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationElement" ADD CONSTRAINT "AutomationElement_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "AutomationView"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationElementUsage" ADD CONSTRAINT "AutomationElementUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationElementUsage" ADD CONSTRAINT "AutomationElementUsage_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "AutomationElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationPlaybackJob" ADD CONSTRAINT "AutomationPlaybackJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationPlaybackItem" ADD CONSTRAINT "AutomationPlaybackItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AutomationPlaybackJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationPlaybackConfig" ADD CONSTRAINT "AutomationPlaybackConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
