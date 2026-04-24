import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationCasesPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationCasesPage({
  params,
}: ProjectAutomationCasesPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="cases"
    />
  );
}


