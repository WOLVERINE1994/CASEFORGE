import ReleaseRiskDashboard from "../../../../components/ReleaseRiskDashboard";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";
import { readProjectByRef } from "../../../../utils/project-store";
import {
  buildReleaseRiskSummary,
} from "../../../../utils/release-risk";
import {
  type IssueRecord,
  listProjectIssuesForUi,
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
    issues = await listProjectIssuesForUi(projectKey);
  } catch (error) {
    console.error("PROJECT RELEASE ISSUE LOAD ERROR:", error);
  }

  const { summary, context } = buildReleaseRiskSummary(project, issues);

  return (
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="Releases Module"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/releases`, label: "Readiness" },
          {
            href: `/projects/${encodeURIComponent(projectKey)}/releases/blockers`,
            label: "Blockers",
          },
          { href: `/projects/${encodeURIComponent(projectKey)}/releases/risk`, label: "Risk" },
          {
            href: `/projects/${encodeURIComponent(projectKey)}/releases/history`,
            label: "History",
          },
        ]}
      />
      <ReleaseRiskDashboard
        projectKey={project?.projectKey?.trim() || projectKey}
        project={project}
        summary={summary}
        context={context}
      />
    </div>
  );
}
