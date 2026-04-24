import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationFlowsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationFlowsPage({
  params,
}: ProjectAutomationFlowsPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="flows"
    />
  );
}


