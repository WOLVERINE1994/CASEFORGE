-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'tester', 'reviewer', 'manager');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('manual', 'jira', 'prd', 'api_spec', 'user_story', 'changelog');

-- CreateEnum
CREATE TYPE "GenerationMode" AS ENUM ('functional', 'negative', 'edge', 'ui', 'api', 'regression');

-- CreateEnum
CREATE TYPE "CoverageDepth" AS ENUM ('basic', 'standard', 'thorough');

-- CreateEnum
CREATE TYPE "Persona" AS ENUM ('all', 'admin', 'guest', 'first_time_user', 'returning_user', 'blocked_user');

-- CreateEnum
CREATE TYPE "SignoffStatus" AS ENUM ('draft', 'in_review', 'approved', 'changes_requested');

-- CreateEnum
CREATE TYPE "TestCaseType" AS ENUM ('functional', 'regression', 'api', 'ui', 'negative', 'edge');

-- CreateEnum
CREATE TYPE "TestCaseStatus" AS ENUM ('draft', 'ready', 'review', 'approved', 'obsolete');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input" TEXT NOT NULL DEFAULT '',
    "generationMode" "GenerationMode" NOT NULL DEFAULT 'functional',
    "coverageDepth" "CoverageDepth" NOT NULL DEFAULT 'standard',
    "persona" "Persona" NOT NULL DEFAULT 'all',
    "autosaveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reviewerName" TEXT NOT NULL DEFAULT '',
    "reviewerNotes" TEXT NOT NULL DEFAULT '',
    "signoffStatus" "SignoffStatus" NOT NULL DEFAULT 'draft',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "sourceArtifacts" JSONB NOT NULL DEFAULT '[]',
    "auditTrail" JSONB NOT NULL DEFAULT '[]',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT,
    "rawContent" TEXT NOT NULL,
    "normalizedContent" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT,
    "caseKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "TestCaseType" NOT NULL,
    "preconditions" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "testData" TEXT,
    "priority" TEXT,
    "status" "TestCaseStatus" NOT NULL DEFAULT 'draft',
    "ownerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_caseKey_key" ON "TestCase"("caseKey");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
