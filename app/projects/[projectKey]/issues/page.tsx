import ProjectIssuesClient from "../../../../components/ProjectIssuesClient";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";

type ProjectIssuesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectIssuesPage({
  params,
}: ProjectIssuesPageProps) {
  const { projectKey } = await params;

  return (
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="Issues Module"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/issues`, label: "All Issues" },
          { href: `/projects/${encodeURIComponent(projectKey)}/issues/failures`, label: "Linked Failures" },
          { href: `/projects/${encodeURIComponent(projectKey)}/issues/drafts`, label: "Draft Bugs" },
          {
            href: `/projects/${encodeURIComponent(projectKey)}/issues/release-impact`,
            label: "Release Impact",
          },
        ]}
      />
      <ProjectIssuesClient projectKey={projectKey} embedded />
    </div>
  );
}
