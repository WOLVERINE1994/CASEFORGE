CREATE TABLE IF NOT EXISTS "AutomationSuite" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "AutomationScenarioStatus" NOT NULL DEFAULT 'draft',
  "tags" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationSuite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationSuiteScenario" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "suiteId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationSuiteScenario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationSuite_projectId_updatedAt_idx"
  ON "AutomationSuite"("projectId", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationSuiteScenario_suiteId_scenarioId_key"
  ON "AutomationSuiteScenario"("suiteId", "scenarioId");

CREATE INDEX IF NOT EXISTS "AutomationSuiteScenario_projectId_suiteId_idx"
  ON "AutomationSuiteScenario"("projectId", "suiteId");

CREATE INDEX IF NOT EXISTS "AutomationSuiteScenario_projectId_scenarioId_idx"
  ON "AutomationSuiteScenario"("projectId", "scenarioId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationSuite_projectId_fkey'
  ) THEN
    ALTER TABLE "AutomationSuite"
      ADD CONSTRAINT "AutomationSuite_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationSuiteScenario_suiteId_fkey'
  ) THEN
    ALTER TABLE "AutomationSuiteScenario"
      ADD CONSTRAINT "AutomationSuiteScenario_suiteId_fkey"
      FOREIGN KEY ("suiteId") REFERENCES "AutomationSuite"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationSuiteScenario_scenarioId_fkey'
  ) THEN
    ALTER TABLE "AutomationSuiteScenario"
      ADD CONSTRAINT "AutomationSuiteScenario_scenarioId_fkey"
      FOREIGN KEY ("scenarioId") REFERENCES "AutomationScenario"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
