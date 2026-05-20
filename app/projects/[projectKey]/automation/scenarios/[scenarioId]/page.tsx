import AutomationStudioClient from "../../../../../../components/AutomationStudioClient";

export default async function ProjectAutomationScenarioDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; scenarioId: string }>;
}) {
  const { projectKey, scenarioId } = await params;
  return (
    <AutomationStudioClient
      projectKey={projectKey}
      section="recorder"
      scenarioId={scenarioId}
    />
  );
}


