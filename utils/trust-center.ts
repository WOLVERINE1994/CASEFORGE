import type { AuditEntry } from "./workspace";

type RiskAnalysis = {
  score: number;
  risks: Array<{ title: string; summary: string }>;
  strengths: string[];
};

type GapAnalysis = {
  score: number;
  gaps: Array<{ title: string; summary: string }>;
  strengths: string[];
};

export type TrustCenterAnalysis = {
  deterministicRules: string[];
  riskReasoning: string[];
  gapReasoning: string[];
  auditTrail: AuditEntry[];
};

export const buildTrustCenterAnalysis = (
  riskAnalysis: RiskAnalysis,
  gapAnalysis: GapAnalysis,
  auditTrail: AuditEntry[]
): TrustCenterAnalysis => ({
  deterministicRules: [
    "Rows are normalized into a fixed TC### sequence whenever the workspace merges or reorders cases.",
    "Acceptance criteria imports replace previous Acceptance Criteria blocks instead of nesting duplicates.",
    "Source imports are transformed into stable structured text before generation so repeated imports stay predictable.",
  ],
  riskReasoning:
    riskAnalysis.risks.length > 0
      ? riskAnalysis.risks.map(
          (risk) => `${risk.title}: ${risk.summary}`
        )
      : riskAnalysis.strengths,
  gapReasoning:
    gapAnalysis.gaps.length > 0
      ? gapAnalysis.gaps.map((gap) => `${gap.title}: ${gap.summary}`)
      : gapAnalysis.strengths,
  auditTrail: [...auditTrail]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 12),
});
