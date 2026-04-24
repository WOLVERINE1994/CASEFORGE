import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationEnvironmentsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationEnvironmentsPage({
  params,
}: ProjectAutomationEnvironmentsPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="environments"
    />
  );
}


