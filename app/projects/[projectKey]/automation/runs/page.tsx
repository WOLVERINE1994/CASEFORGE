import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationRunsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationRunsPage({
  params,
}: ProjectAutomationRunsPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="runs"
    />
  );
}


