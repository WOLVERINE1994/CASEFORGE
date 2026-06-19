/*
  Warnings:

  - You are about to drop the column `aliases` on the `AutomationElement` table. All the data in the column will be lost.
  - You are about to drop the column `businessName` on the `AutomationElement` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `AutomationElement` table. All the data in the column will be lost.
  - You are about to drop the column `technicalName` on the `AutomationElement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AutomationArtifact" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AutomationElement" DROP COLUMN "aliases",
DROP COLUMN "businessName",
DROP COLUMN "description",
DROP COLUMN "technicalName";

-- AlterTable
ALTER TABLE "AutomationEnvironment" ADD COLUMN     "aliases" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "businessName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "technicalName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "AutomationLocatorCandidate" ALTER COLUMN "updatedAt" DROP DEFAULT;
