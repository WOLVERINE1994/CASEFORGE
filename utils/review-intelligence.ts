type TestCaseRow = {
  id: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
};

type TraceabilityLink = {
  requirementSentence: string;
  riskArea: string;
  generationMode: string;
};

type RequirementRisk = {
  title: string;
  summary: string;
};

export type ReviewInsight = {
  rowId: string;
  whyThisExists: string;
  coveredRisk: string;
  mappedRequirementSentence: string;
  reasoning: string;
};

export const buildReviewInsights = (
  rows: TestCaseRow[],
  traceabilityLinks: Record<string, TraceabilityLink>,
  risks: RequirementRisk[]
) =>
  rows.reduce<Record<string, ReviewInsight>>((accumulator, row) => {
    const traceability = traceabilityLinks[row.id];
    const matchedRisk =
      risks.find((risk) =>
        `${risk.title} ${risk.summary}`.toLowerCase().includes(
          (traceability?.riskArea ?? "").toLowerCase()
        )
      ) ?? null;

    accumulator[row.id] = {
      rowId: row.id,
      whyThisExists: traceability
        ? `This test exists to verify "${traceability.requirementSentence}" under the ${traceability.generationMode.toLowerCase()} workflow.`
        : "This test exists to protect a core requirement path that still needs clearer traceability.",
      coveredRisk: traceability?.riskArea ?? matchedRisk?.title ?? "Core functional behavior",
      mappedRequirementSentence:
        traceability?.requirementSentence ?? "No direct requirement sentence is linked yet.",
      reasoning: traceability
        ? `The case title and steps align to ${traceability.riskArea.toLowerCase()} and give reviewers a clear reason to keep this scenario in the suite.`
        : "The row content suggests likely coverage, but the exact requirement mapping still needs review.",
    };

    return accumulator;
  }, {});
