import ProjectSalesforceClient from "../../../../../components/ProjectSalesforceClient";
import { readProjectByRef } from "../../../../../utils/project-store";

type ProjectSalesforceCasesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSalesforceCasesPage({
  params,
}: ProjectSalesforceCasesPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <ProjectSalesforceClient
      projectKey={projectKey}
      initialProject={project}
      initialSection="cases"
    />
  );
}
