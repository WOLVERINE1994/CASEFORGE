"use client";

type Props = {
  projectKey: string;
  projectName: string;
  sprintName: string;
  releaseName: string;
  teamName: string;
  caseCount: number;
  issueCount: number;
  releaseDecision?: "safe" | "caution" | "blocked";
  releaseDecisionRecordedAt?: number;
  showNavigation?: boolean;
};

export default function ProjectRouteHeader({
  projectKey,
  projectName,
  sprintName,
  releaseName,
  teamName,
}: Props) {
  const planningSummary = [
    projectKey.trim() || "NO-KEY",
    sprintName.trim() || null,
    releaseName.trim() || null,
    teamName.trim() || null,
  ].filter(Boolean).join(" | ");

  return (
    <section className="cf-panel flex flex-col gap-3 rounded-[28px] px-5 py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        Focused QA Workspace
      </p>
      <h1 className="cf-safe-wrap text-3xl font-semibold tracking-tight text-slate-50">
        {projectName.trim() || "Unsaved workspace"}
      </h1>
      <p className="cf-safe-wrap text-sm text-slate-300">{planningSummary}</p>
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-cyan-200">
          AI test case generation
        </span>
        <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
          Browser automation
        </span>
      </div>
    </section>
  );
}
