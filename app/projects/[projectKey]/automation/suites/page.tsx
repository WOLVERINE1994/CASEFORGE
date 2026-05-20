import AutomationStudioClient from "../../../../../components/AutomationStudioClient";

export default async function ProjectAutomationSuitesPage({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}) {
  const { projectKey } = await params;
  return <AutomationStudioClient projectKey={projectKey} section="suites" />;
}


