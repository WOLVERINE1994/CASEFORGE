import type { ReactNode } from "react";
import { ProjectDataStateProvider } from "../../../components/ProjectDataStateContext";
import { ProjectIssueStateProvider } from "../../../components/ProjectIssueStateContext";
import type { SharedIssueRecord } from "../../../components/ProjectIssueStateContext";
import ProjectRouteChrome from "../../../components/ProjectRouteChrome";
import { ProjectRouteMetricsProvider } from "../../../components/ProjectRouteMetricsContext";
import { readProjectShellByRef } from "../../../utils/project-store";
import {
  listProjectIssuesForUi,
} from "../../../services/issue-service";

export const dynamic = "force-dynamic";

type ProjectRouteLayoutProps = {
  children: ReactNode;
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectRouteLayout({
  children,
  params,
}: ProjectRouteLayoutProps) {
  const { projectKey } = await params;
  const project = await readProjectShellByRef(projectKey);
  let initialIssues: SharedIssueRecord[] = [];

  try {
    initialIssues = await listProjectIssuesForUi(projectKey);
  } catch (error) {
    console.error("PROJECT LAYOUT ISSUE COUNT ERROR:", error);
  }
  const issueCount = initialIssues.length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.14),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(124,58,237,0.14),_transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(6,182,212,0.08),_transparent_26%),linear-gradient(180deg,_#08101d_0%,_#0b1220_48%,_#0f172a_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:120px_120px] [mask-image:radial-gradient(circle_at_top,black,transparent_78%)]" />
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <ProjectRouteMetricsProvider
          initialCaseCount={project?.testCaseCount ?? 0}
          initialIssueCount={issueCount}
        >
          <ProjectDataStateProvider initialProject={null}>
            <ProjectIssueStateProvider initialIssues={initialIssues}>
              <ProjectRouteChrome
                projectKey={project?.projectKey?.trim() || projectKey}
                projectName={project?.name || "Unsaved workspace"}
                sprintName={project?.sprintName || ""}
                releaseName={project?.releaseName || ""}
                teamName={project?.teamName || ""}
                caseCount={project?.testCaseCount ?? 0}
                issueCount={issueCount}
                releaseDecision={project?.releaseDecision}
                releaseDecisionRecordedAt={project?.releaseDecisionRecordedAt}
              >
                {children}
              </ProjectRouteChrome>
            </ProjectIssueStateProvider>
          </ProjectDataStateProvider>
        </ProjectRouteMetricsProvider>
      </main>
    </div>
  );
}
