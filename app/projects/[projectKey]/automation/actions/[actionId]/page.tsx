import AutomationStudioClient from "../../../../../../components/AutomationStudioClient";

export default async function ProjectAutomationActionDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; actionId: string }>;
}) {
  const { projectKey } = await params;
  return <AutomationStudioClient projectKey={projectKey} section="actions" />;
}


