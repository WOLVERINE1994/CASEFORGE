import ProjectAutomationWorkspace from "../../../../../components/ProjectAutomationWorkspace";

export default async function ProjectAutomationLinksPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="links"
    />
  );
}


