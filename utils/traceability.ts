import { type Persona, toPersonaLabel } from "./workspace";

type TestCaseRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  gapSourceId?: string;
  gapSourceLabel?: string;
  gapSourceMethod?: "auto" | "manual";
};

type RequirementRisk = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  summary: string;
  question: string;
};

export type TraceabilityLink = {
  rowId: string;
  requirementSentence: string;
  riskArea: string;
  generationMode: string;
};

export type TraceabilitySentenceCoverage = {
  sentence: string;
  rowIds: string[];
  covered: boolean;
};

export type TraceabilityAnalysis = {
  links: Record<string, TraceabilityLink>;
  sentenceCoverage: TraceabilitySentenceCoverage[];
  uncoveredSentences: string[];
  coveredRiskAreas: string[];
};

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "when",
  "then",
  "than",
  "must",
  "should",
  "will",
  "user",
  "users",
  "able",
  "have",
  "has",
  "can",
  "not",
  "are",
  "was",
  "were",
  "but",
  "all",
  "any",
  "its",
  "their",
  "them",
  "your",
  "you",
  "each",
  "flow",
  "page",
  "screen",
  "system",
]);

const toKeywords = (content: string) =>
  Array.from(
    new Set(
      content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !stopWords.has(word))
    )
  );

const splitRequirementIntoSentences = (requirement: string) =>
  requirement
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const scoreSentenceMatch = (rowKeywords: string[], sentence: string) => {
  const sentenceKeywords = toKeywords(sentence);
  if (sentenceKeywords.length === 0 || rowKeywords.length === 0) {
    return 0;
  }

  const matches = sentenceKeywords.filter((word) => rowKeywords.includes(word));
  return matches.length;
};

const inferRiskArea = (row: TestCaseRow, risks: RequirementRisk[]) => {
  const content = [
    row.type,
    row.title,
    row.preconditions,
    row.steps,
    row.expectedResult,
  ]
    .join(" ")
    .toLowerCase();

  if (row.type === "API") {
    return "API and contract behavior";
  }

  if (row.type === "UI") {
    return "UI behavior and interaction";
  }

  if (row.type === "Regression") {
    return "Regression stability";
  }

  if (row.type === "Negative") {
    return "Validation and failure handling";
  }

  if (row.type === "Edge") {
    return "Boundary and edge conditions";
  }

  if (/\bpermission|unauthori[sz]ed|access|role|admin|guest\b/.test(content)) {
    return "Access and permission control";
  }

  if (/\btimeout|retry|unavailable|error|fail|fallback\b/.test(content)) {
    return "Failure and recovery paths";
  }

  if (/\bmin|max|limit|boundary|empty|overflow|large\b/.test(content)) {
    return "Boundary and edge conditions";
  }

  const matchingRisk = risks.find((risk) => {
    const riskKeywords = toKeywords(`${risk.title} ${risk.summary}`);
    return riskKeywords.some((keyword) => content.includes(keyword));
  });

  if (matchingRisk) {
    return matchingRisk.title;
  }

  return "Core functional behavior";
};

export const analyzeTraceability = (
  requirement: string,
  rows: TestCaseRow[],
  generationMode: string,
  risks: RequirementRisk[],
  persona: Persona = "all"
): TraceabilityAnalysis => {
  const sentences = splitRequirementIntoSentences(requirement);

  if (!requirement.trim() || rows.length === 0) {
    return {
      links: {},
      sentenceCoverage: sentences.map((sentence) => ({
        sentence,
        rowIds: [],
        covered: false,
      })),
      uncoveredSentences: sentences,
      coveredRiskAreas: [],
    };
  }

  const links: Record<string, TraceabilityLink> = {};
  const sentenceCoverageMap = new Map(
    sentences.map((sentence) => [
      sentence,
      { sentence, rowIds: [] as string[], covered: false },
    ])
  );
  const coveredRiskAreas = new Set<string>();

  rows.forEach((row) => {
    const rowKeywords = toKeywords(
      `${row.title} ${row.preconditions} ${row.steps} ${row.expectedResult}`
    );

    const bestSentence =
      sentences.reduce(
        (best, sentence) => {
          const score = scoreSentenceMatch(rowKeywords, sentence);
          if (score > best.score) {
            return { sentence, score };
          }

          return best;
        },
        { sentence: sentences[0] ?? "General requirement coverage", score: -1 }
      ).sentence || "General requirement coverage";

    const riskArea = inferRiskArea(row, risks);
    coveredRiskAreas.add(riskArea);

    links[row.id] = {
      rowId: row.id,
      requirementSentence: bestSentence,
      riskArea,
      generationMode:
        generationMode.charAt(0).toUpperCase() +
        generationMode.slice(1) +
        (persona === "all" ? "" : ` | ${toPersonaLabel(persona)}`),
    };

    const sentenceCoverage = sentenceCoverageMap.get(bestSentence);
    if (sentenceCoverage) {
      sentenceCoverage.rowIds.push(row.id);
      sentenceCoverage.covered = true;
    }
  });

  const sentenceCoverage = Array.from(sentenceCoverageMap.values());

  return {
    links,
    sentenceCoverage,
    uncoveredSentences: sentenceCoverage
      .filter((item) => !item.covered)
      .map((item) => item.sentence),
    coveredRiskAreas: Array.from(coveredRiskAreas),
  };
};
