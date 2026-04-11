import path from "path";
import { mkdir, writeFile } from "fs/promises";

const ARTIFACT_ROOT = path.join(process.cwd(), ".artifacts", "automation");

export const getAutomationExecutionOutputDir = (
  projectId: string,
  runId: string,
  executionId: string
) => path.join(ARTIFACT_ROOT, projectId, runId, executionId);

export const ensureAutomationOutputDir = async (
  projectId: string,
  runId: string,
  executionId: string
) => {
  const outputDir = getAutomationExecutionOutputDir(projectId, runId, executionId);
  await mkdir(outputDir, { recursive: true });
  return outputDir;
};

export const writeAutomationLogArtifact = async (
  outputDir: string,
  fileName: string,
  contents: string
) => {
  const filePath = path.join(outputDir, fileName);
  await writeFile(filePath, contents, "utf8");
  return filePath;
};
