import ProjectAutomationWorkspace from "../../../../../../components/ProjectAutomationWorkspace";

export default async function ProjectAutomationScenarioDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; scenarioId: string }>;
}) {
  const { projectKey, scenarioId } = await params;
  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="scenarios"
      initialScenarioId={scenarioId}
    />
  );
}


