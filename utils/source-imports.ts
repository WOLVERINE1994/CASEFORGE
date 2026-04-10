import {
  sourceArtifactLabels,
  type SourceArtifact,
  type SourceArtifactType,
} from "./workspace";

type ImportMode = "replace" | "append";

export type SourceImportResult = {
  artifact: SourceArtifact;
  requirementText: string;
  summary: string;
};

const cleanupLine = (line: string) => line.replace(/\s+/g, " ").trim();

const normalizeLines = (content: string) =>
  content
    .split(/\r?\n/)
    .map(cleanupLine)
    .filter(Boolean);

const extractBulletLines = (lines: string[]) =>
  lines
    .filter((line) => /^[-*•]/.test(line) || /^\d+\./.test(line))
    .map((line) => line.replace(/^([-*•]\s*|\d+\.\s*)+/, "").trim())
    .filter(Boolean);

const buildNormalizedContent = (type: SourceArtifactType, title: string, content: string) => {
  const lines = normalizeLines(content);
  const bulletLines = extractBulletLines(lines);
  const bodyLines =
    bulletLines.length > 0
      ? bulletLines
      : lines.filter((line) => !/^summary:|^description:|^title:/i.test(line));

  const heading = title.trim() || sourceArtifactLabels[type];

  if (type === "jira" || type === "user-story") {
    return [
      `${heading}`,
      ...bodyLines.slice(0, 8).map((line) => `- ${line}`),
    ].join("\n");
  }

  if (type === "prd") {
    return [
      `${heading}`,
      "Product expectations:",
      ...bodyLines.slice(0, 10).map((line) => `- ${line}`),
    ].join("\n");
  }

  if (type === "api-spec") {
    return [
      `${heading}`,
      "API expectations:",
      ...bodyLines.slice(0, 10).map((line) => `- ${line}`),
    ].join("\n");
  }

  return [
    `${heading}`,
    "Change summary:",
    ...bodyLines.slice(0, 10).map((line) => `- ${line}`),
  ].join("\n");
};

export const importSourceArtifact = ({
  type,
  title,
  content,
  existingRequirement,
  mode,
}: {
  type: SourceArtifactType;
  title: string;
  content: string;
  existingRequirement: string;
  mode: ImportMode;
}): SourceImportResult => {
  const normalizedContent = buildNormalizedContent(type, title, content);
  const artifact: SourceArtifact = {
    id: crypto.randomUUID(),
    type,
    title: title.trim() || sourceArtifactLabels[type],
    rawContent: content.trim(),
    normalizedContent,
    importedAt: Date.now(),
  };

  const requirementText =
    mode === "append" && existingRequirement.trim()
      ? `${existingRequirement.trim()}\n\nSource Import: ${artifact.title}\n${normalizedContent}`
      : normalizedContent;

  return {
    artifact,
    requirementText,
    summary: `${sourceArtifactLabels[type]} imported as structured QA input.`,
  };
};
