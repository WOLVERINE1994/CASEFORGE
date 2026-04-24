import ProjectSalesforceClient from "../../../../../components/ProjectSalesforceClient";
import { readProjectByRef } from "../../../../../utils/project-store";

type ProjectSalesforceObjectsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSalesforceObjectsPage({
  params,
}: ProjectSalesforceObjectsPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <ProjectSalesforceClient
      projectKey={projectKey}
      initialProject={project}
      initialSection="objects"
    />
  );
}
