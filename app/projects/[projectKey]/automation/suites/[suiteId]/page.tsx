import ProjectAutomationWorkspace from "../../../../../../components/ProjectAutomationWorkspace";

export default async function ProjectAutomationSuiteDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; suiteId: string }>;
}) {
  const { projectKey, suiteId } = await params;
  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="suites"
      initialSuiteId={suiteId}
    />
  );
}


