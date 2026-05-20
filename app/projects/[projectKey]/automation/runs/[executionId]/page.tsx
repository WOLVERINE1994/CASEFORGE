import AutomationStudioClient from "../../../../../../components/AutomationStudioClient";

export default async function ProjectAutomationRunDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; executionId: string }>;
}) {
  const { projectKey } = await params;

  return <AutomationStudioClient projectKey={projectKey} section="runs" />;
}


