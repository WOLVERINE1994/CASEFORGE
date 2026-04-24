"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import ProjectRouteHeader from "./ProjectRouteHeader";
import ProjectSidebar from "./ProjectSidebar";

const ResponsiveShell = dynamic(() => import("./ResponsiveShell"), {
  ssr: false,
  loading: () => (
    <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
      <div className="cf-panel hidden min-h-[420px] rounded-[24px] xl:block" />
      <div className="flex min-w-0 flex-col gap-6">
        <div className="cf-panel min-h-[160px] rounded-[28px]" />
        <div className="cf-panel min-h-[360px] rounded-[28px]" />
      </div>
    </div>
  ),
});

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
