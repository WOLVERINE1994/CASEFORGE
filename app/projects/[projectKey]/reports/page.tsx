import ProjectReportsClient from "../../../../components/ProjectReportsClient";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";

type ProjectReportsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectReportsPage({
  params,
}: ProjectReportsPageProps) {
  const { projectKey } = await params;

  return (
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="Reports Module"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/reports`, label: "Summary" },
          { href: `/projects/${encodeURIComponent(projectKey)}/reports/execution`, label: "Execution" },
          { href: `/projects/${encodeURIComponent(projectKey)}/reports/coverage`, label: "Coverage" },
          { href: `/projects/${encodeURIComponent(projectKey)}/reports/failures`, label: "Failures" },
          { href: `/projects/${encodeURIComponent(projectKey)}/reports/exports`, label: "Exports" },
        ]}
      />
      <ProjectReportsClient />
    </div>
  );
}
