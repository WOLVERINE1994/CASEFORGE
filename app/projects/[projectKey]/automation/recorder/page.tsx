import AutomationStudioClient from "../../../../../components/AutomationStudioClient";

export default async function ProjectAutomationRecorderPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  return <AutomationStudioClient projectKey={projectKey} section="recorder" />;
}


