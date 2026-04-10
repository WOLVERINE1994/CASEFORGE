-- CreateTable
CREATE TABLE "ChangeComparison" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "oldRequirement" TEXT NOT NULL,
    "newRequirement" TEXT NOT NULL,
    "signature" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeComparison_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChangeComparison" ADD CONSTRAINT "ChangeComparison_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
