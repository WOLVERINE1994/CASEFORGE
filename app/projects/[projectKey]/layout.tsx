import type { ReactNode } from "react";
import { ProjectDataStateProvider } from "../../../components/ProjectDataStateContext";
import { ProjectIssueStateProvider } from "../../../components/ProjectIssueStateContext";
import type { SharedIssueRecord } from "../../../components/ProjectIssueStateContext";
import ProjectRouteHeader from "../../../components/ProjectRouteHeader";
import ProjectSidebar from "../../../components/ProjectSidebar";
import ResponsiveShell from "../../../components/ResponsiveShell";
import { ProjectRouteMetricsProvider } from "../../../components/ProjectRouteMetricsContext";
import { readProjectByRef } from "../../../utils/project-store";
import {
  IssueServiceNotReadyError,
  listProjectIssues,
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
  const project = await readProjectByRef(projectKey);
  let initialIssues: SharedIssueRecord[] = [];
  let issueCount = 0;

  try {
    initialIssues = await listProjectIssues(projectKey);
    issueCount = initialIssues.length;
  } catch (error) {
    if (!(error instanceof IssueServiceNotReadyError)) {
      console.error("PROJECT LAYOUT ISSUE COUNT ERROR:", error);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.15),_transparent_24%),radial-gradient(circle_at_center,_rgba(14,165,233,0.08),_transparent_36%),linear-gradient(180deg,_#f6f8f7_0%,_#ecf2ef_48%,_#f8faf9_100%)] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:120px_120px] [mask-image:radial-gradient(circle_at_top,black,transparent_75%)] dark:hidden" />
      <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <ProjectRouteMetricsProvider
          initialCaseCount={project?.testCaseCount ?? project?.rows.length ?? 0}
          initialIssueCount={issueCount}
        >
          <ProjectDataStateProvider initialProject={project}>
            <ProjectIssueStateProvider initialIssues={initialIssues}>
              <ResponsiveShell
                mobileTitle={project?.name || "Project"}
                mobileSubtitle={(project?.projectKey?.trim() || projectKey).trim()}
                storageKey={`caseforge:drawer:project:${project?.projectKey?.trim() || projectKey}`}
                desktopSidebar={
                  <ProjectSidebar
                    projectKey={project?.projectKey?.trim() || projectKey}
                    projectName={project?.name || "Unsaved workspace"}
                    sprintName={project?.sprintName || ""}
                    releaseName={project?.releaseName || ""}
                    teamName={project?.teamName || ""}
                    caseCount={project?.testCaseCount ?? project?.rows.length ?? 0}
                    issueCount={issueCount}
                  />
                }
                mobileSidebar={
                  <ProjectSidebar
                    projectKey={project?.projectKey?.trim() || projectKey}
                    projectName={project?.name || "Unsaved workspace"}
                    sprintName={project?.sprintName || ""}
                    releaseName={project?.releaseName || ""}
                    teamName={project?.teamName || ""}
                    caseCount={project?.testCaseCount ?? project?.rows.length ?? 0}
                    issueCount={issueCount}
                  />
                }
              >
                <div className="flex min-w-0 flex-col gap-6">
                  <ProjectRouteHeader
                    projectKey={project?.projectKey?.trim() || projectKey}
                    projectName={project?.name || "Unsaved workspace"}
                    sprintName={project?.sprintName || ""}
                    releaseName={project?.releaseName || ""}
                    teamName={project?.teamName || ""}
                    caseCount={project?.testCaseCount ?? project?.rows.length ?? 0}
                    issueCount={issueCount}
                    releaseDecision={project?.releaseReview?.recordedDecision}
                    releaseDecisionRecordedAt={project?.releaseReview?.decisionRecordedAt}
                    showNavigation={false}
                  />
                  {children}
                </div>
              </ResponsiveShell>
            </ProjectIssueStateProvider>
          </ProjectDataStateProvider>
        </ProjectRouteMetricsProvider>
      </main>
    </div>
  );
}
