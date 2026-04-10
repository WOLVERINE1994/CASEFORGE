import ReleaseRiskDashboard from "../../../../components/ReleaseRiskDashboard";
import { readProjectByRef } from "../../../../utils/project-store";
import {
  buildReleaseRiskSummary,
} from "../../../../utils/release-risk";
import {
  type IssueRecord,
  IssueServiceNotReadyError,
  listProjectIssues,
} from "../../../../services/issue-service";

type ProjectReleasePageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectReleasePage({
  params,
}: ProjectReleasePageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);
  let issues: IssueRecord[] = [];

  try {
    issues = await listProjectIssues(projectKey);
  } catch (error) {
    if (!(error instanceof IssueServiceNotReadyError)) {
      console.error("PROJECT RELEASE ISSUE LOAD ERROR:", error);
    }
  }

  const { summary, context } = buildReleaseRiskSummary(project, issues);

  return (
    <ReleaseRiskDashboard
      projectKey={project?.projectKey?.trim() || projectKey}
      project={project}
      summary={summary}
      context={context}
    />
  );
}
