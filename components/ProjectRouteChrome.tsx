"use client";

import type { ReactNode } from "react";
import ProjectRouteHeader from "./ProjectRouteHeader";
import ProjectSidebar from "./ProjectSidebar";
import ResponsiveShell from "./ResponsiveShell";

type ProjectRouteChromeProps = {
  projectKey: string;
  projectName: string;
  sprintName: string;
  releaseName: string;
  teamName: string;
  caseCount: number;
  issueCount: number;
  releaseDecision?: "safe" | "caution" | "blocked";
  releaseDecisionRecordedAt?: number;
  children: ReactNode;
};

export default function ProjectRouteChrome({
  projectKey,
  projectName,
  sprintName,
  releaseName,
  teamName,
  caseCount,
  issueCount,
  releaseDecision,
  releaseDecisionRecordedAt,
  children,
}: ProjectRouteChromeProps) {
  return (
    <ResponsiveShell
      mobileTitle={projectName || "Project"}
      mobileSubtitle={projectKey.trim()}
      storageKey={`caseforge:drawer:project:${projectKey}`}
      desktopSidebar={
        <ProjectSidebar
          projectKey={projectKey}
          projectName={projectName}
          sprintName={sprintName}
          releaseName={releaseName}
          teamName={teamName}
          caseCount={caseCount}
          issueCount={issueCount}
        />
      }
      mobileSidebar={
        <ProjectSidebar
          projectKey={projectKey}
          projectName={projectName}
          sprintName={sprintName}
          releaseName={releaseName}
          teamName={teamName}
          caseCount={caseCount}
          issueCount={issueCount}
        />
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        <ProjectRouteHeader
          projectKey={projectKey}
          projectName={projectName}
          sprintName={sprintName}
          releaseName={releaseName}
          teamName={teamName}
          caseCount={caseCount}
          issueCount={issueCount}
          releaseDecision={releaseDecision}
          releaseDecisionRecordedAt={releaseDecisionRecordedAt}
          showNavigation={false}
        />
        {children}
      </div>
    </ResponsiveShell>
  );
}
