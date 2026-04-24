import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

type ProjectAutomationMappingsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationMappingsPage({
  params,
}: ProjectAutomationMappingsPageProps) {
  const { projectKey } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="mappings"
    />
  );
}


