import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationReportsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationReportsPage({
  params,
}: ProjectAutomationReportsPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="reports"
    />
  );
}


