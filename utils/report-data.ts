import type { ReportData } from "./report-export";
import type {
  AuditEntry,
  CoverageDepth,
  GenerationMode,
  Persona,
  SignoffStatus,
  SourceArtifact,
  TestCaseRow,
} from "./workspace";
import { buildTypeCounts, toDisplayLabel, toPersonaLabel } from "./workspace";

type HighlightItem = {
  title: string;
  summary: string;
};

type ScoreBlock = {
  score: number;
  strengths: string[];
};

type ReportAnalysisInput = {
  projectName: string;
  requirement: string;
  generationMode: GenerationMode;
  coverageDepth: CoverageDepth;
  persona: Persona;
  rows: TestCaseRow[];
  sourceArtifacts: SourceArtifact[];
  reviewerName: string;
  reviewerNotes: string;
  signoffStatus: SignoffStatus;
  auditTrail: AuditEntry[];
  requirementRiskAnalysis: ScoreBlock & { risks: HighlightItem[] };
  ambiguityQuestionAnalysis: {
    score: number;
    questions: Array<{ question: string }>;
  };
  coverageGapAnalysis: ScoreBlock & { gaps: HighlightItem[] };
  executionReadinessAnalysis: ScoreBlock & { findings: HighlightItem[] };
  caseQualityAnalysis: ScoreBlock & { findings: HighlightItem[] };
  changeImpactAnalysis: {
    score: number;
    changes: Array<{ summary: string }>;
    impactedRows: Array<unknown>;
  };
  traceabilityAnalysis: {
    coveredRiskAreas: string[];
    uncoveredSentences: string[];
  };
  reviewInsights: Record<
    string,
    {
      whyThisExists: string;
      coveredRisk: string;
      mappedRequirementSentence: string;
      reasoning: string;
    }
  >;
  trustCenterAnalysis: {
    deterministicRules: string[];
    riskReasoning: string[];
    gapReasoning: string[];
    auditTrail: AuditEntry[];
  };
};

const asHighlights = (items: HighlightItem[], fallback: string[]) =>
  items.length > 0
    ? items.map((item) => `${item.title}: ${item.summary}`)
    : fallback;

export const buildWorkspaceReportData = ({
  projectName,
  requirement,
  generationMode,
  coverageDepth,
  persona,
  rows,
  sourceArtifacts,
  reviewerName,
  reviewerNotes,
  signoffStatus,
  auditTrail,
  requirementRiskAnalysis,
  ambiguityQuestionAnalysis,
  coverageGapAnalysis,
  executionReadinessAnalysis,
  caseQualityAnalysis,
  changeImpactAnalysis,
  traceabilityAnalysis,
  reviewInsights,
  trustCenterAnalysis,
}: ReportAnalysisInput): ReportData => ({
  projectName: projectName.trim() || "Untitled Workspace",
  requirement,
  generationMode: toDisplayLabel(generationMode),
  coverageDepth: toDisplayLabel(coverageDepth),
  persona: toPersonaLabel(persona),
  rows: rows.map((row) => ({
    ...row,
    testDomain: row.testDomain,
    securityCategory: row.securityCategory,
    accessibilityCategory: row.accessibilityCategory,
    complianceReference: row.complianceReference,
    riskLevel: row.riskLevel,
  })),
  sourceArtifacts,
  reviewerName,
  reviewerNotes,
  signoffStatus,
  auditTrail,
  typeCounts: buildTypeCounts(rows),
  riskScore: requirementRiskAnalysis.score,
  readinessScore: executionReadinessAnalysis.score,
  coverageScore: coverageGapAnalysis.score,
  ambiguityScore: ambiguityQuestionAnalysis.score,
  changeImpactScore: changeImpactAnalysis.score,
  riskHighlights: asHighlights(
    requirementRiskAnalysis.risks,
    requirementRiskAnalysis.strengths
  ),
  ambiguityQuestions: ambiguityQuestionAnalysis.questions
    .slice(0, 6)
    .map((question) => question.question),
  coverageHighlights: asHighlights(
    coverageGapAnalysis.gaps,
    coverageGapAnalysis.strengths
  ),
  readinessHighlights: asHighlights(
    executionReadinessAnalysis.findings,
    executionReadinessAnalysis.strengths
  ),
  qualityHighlights: asHighlights(
    caseQualityAnalysis.findings,
    caseQualityAnalysis.strengths
  ),
  changeHighlights: changeImpactAnalysis.changes.map((change) => change.summary),
  coveredRiskAreas: traceabilityAnalysis.coveredRiskAreas,
  uncoveredRequirementCount: traceabilityAnalysis.uncoveredSentences.length,
  openGapCount: coverageGapAnalysis.gaps.length,
  impactedCaseCount: changeImpactAnalysis.impactedRows.length,
  deterministicRules: trustCenterAnalysis.deterministicRules,
  trustRiskReasoning: trustCenterAnalysis.riskReasoning,
  trustGapReasoning: trustCenterAnalysis.gapReasoning,
  reviewInsights: rows.map((row) => ({
    id: row.id,
    title: row.title,
    whyThisExists:
      reviewInsights[row.id]?.whyThisExists ?? "No review rationale available yet.",
    coveredRisk:
      reviewInsights[row.id]?.coveredRisk ?? "Core functional behavior",
    mappedRequirementSentence:
      reviewInsights[row.id]?.mappedRequirementSentence ??
      "No direct requirement sentence is linked yet.",
    reasoning:
      reviewInsights[row.id]?.reasoning ??
      "The test still needs clearer review intelligence.",
  })),
});
