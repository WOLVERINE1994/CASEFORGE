import ProjectAutomationWorkspace from "../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationPage({
  params,
}: ProjectAutomationPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="overview"
    />
  );
}


