import ProjectSalesforceClient from "../../../../../components/ProjectSalesforceClient";
import { readProjectByRef } from "../../../../../utils/project-store";

type ProjectSalesforceEnvironmentsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSalesforceEnvironmentsPage({
  params,
}: ProjectSalesforceEnvironmentsPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <ProjectSalesforceClient
      projectKey={projectKey}
      initialProject={project}
      initialSection="environments"
    />
  );
}
