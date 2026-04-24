import ProjectSalesforceClient from "../../../../../components/ProjectSalesforceClient";
import { readProjectByRef } from "../../../../../utils/project-store";

type ProjectSalesforceAutomationPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectSalesforceAutomationPage({
  params,
}: ProjectSalesforceAutomationPageProps) {
  const { projectKey } = await params;
  const project = await readProjectByRef(projectKey);

  return (
    <ProjectSalesforceClient
      projectKey={projectKey}
      initialProject={project}
      initialSection="automation"
    />
  );
}
