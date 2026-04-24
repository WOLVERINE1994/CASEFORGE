import ProjectSalesforceClient from "../../../../../components/ProjectSalesforceClient";
import { readProjectByRef } from "../../../../../utils/project-store";

type ProjectSalesforceRunsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSalesforceRunsPage({
  params,
}: ProjectSalesforceRunsPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <ProjectSalesforceClient
      projectKey={projectKey}
      initialProject={project}
      initialSection="runs"
    />
  );
}
