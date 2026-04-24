import ProjectCaseActivityClient from "../../../../components/ProjectCaseActivityClient";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";

type ProjectActivityPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectActivityPage({
  params,
}: ProjectActivityPageProps) {
  const { projectKey } = await params;

  return (
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="Activity Module"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/activity`, label: "All Activity" },
          { href: `/projects/${encodeURIComponent(projectKey)}/activity/audit`, label: "Audit" },
          { href: `/projects/${encodeURIComponent(projectKey)}/activity/reviews`, label: "Reviews" },
          { href: `/projects/${encodeURIComponent(projectKey)}/activity/approvals`, label: "Approvals" },
          { href: `/projects/${encodeURIComponent(projectKey)}/activity/changes`, label: "Changes" },
        ]}
      />
      <ProjectCaseActivityClient projectKey={projectKey} />
    </div>
  );
}
