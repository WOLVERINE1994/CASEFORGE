ALTER TYPE "AutomationSessionStatus" ADD VALUE IF NOT EXISTS 'creating';
ALTER TYPE "AutomationSessionStatus" ADD VALUE IF NOT EXISTS 'idle';
ALTER TYPE "AutomationSessionStatus" ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE "AutomationSessionStatus" ADD VALUE IF NOT EXISTS 'broken';
ALTER TYPE "AutomationSessionStatus" ADD VALUE IF NOT EXISTS 'terminating';
ALTER TYPE "AutomationSessionStatus" ADD VALUE IF NOT EXISTS 'terminated';
