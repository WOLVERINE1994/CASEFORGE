import ProjectSalesforceClient from "../../../../components/ProjectSalesforceClient";
import { readProjectByRef } from "../../../../utils/project-store";

type ProjectSalesforcePageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSalesforcePage({
  params,
}: ProjectSalesforcePageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <ProjectSalesforceClient
      projectKey={projectKey}
      initialProject={project}
      initialSection="overview"
    />
  );
}
