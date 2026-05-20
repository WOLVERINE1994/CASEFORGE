import AutomationStudioClient from "../../../../../components/AutomationStudioClient";

export default async function ProjectAutomationActionsPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  return <AutomationStudioClient projectKey={projectKey} section="actions" />;
}


