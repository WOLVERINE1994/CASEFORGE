import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationFailuresPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationFailuresPage({
  params,
}: ProjectAutomationFailuresPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="failures"
    />
  );
}


