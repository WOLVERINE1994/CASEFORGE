"use client";

import { useMemo } from "react";
import { useProjectDataState } from "./ProjectDataStateContext";
import { useProjectIssueState } from "./ProjectIssueStateContext";
import ProjectReportsDashboard from "./ProjectReportsDashboard";
import { buildProjectReportsSummary } from "../utils/project-reports";

export default function ProjectReportsClient() {
  const projectState = useProjectDataState();
  const issueState = useProjectIssueState();

  const summary = useMemo(
    () =>
      buildProjectReportsSummary(
        projectState?.project ?? null,
        issueState?.issues ?? []
      ),
    [issueState?.issues, projectState?.project]
  );

  return <ProjectReportsDashboard summary={summary} />;
}
