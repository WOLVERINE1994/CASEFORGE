import ProjectRunsClient from "../../../../components/ProjectRunsClient";
import ProjectModuleSubnav from "../../../../components/ProjectModuleSubnav";
import { readProjectByRef } from "../../../../utils/project-store";

type ProjectRunsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectRunsPage({
  params,
}: ProjectRunsPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <div className="flex flex-col gap-6">
      <ProjectModuleSubnav
        label="Runs Module"
        items={[
          { href: `/projects/${encodeURIComponent(projectKey)}/runs`, label: "All Runs" },
          { href: `/projects/${encodeURIComponent(projectKey)}/runs/active`, label: "Active" },
          { href: `/projects/${encodeURIComponent(projectKey)}/runs/results`, label: "Results" },
          { href: `/projects/${encodeURIComponent(projectKey)}/runs/failures`, label: "Failures" },
        ]}
      />
      <ProjectRunsClient projectKey={projectKey} initialProject={project} />
    </div>
  );
}
