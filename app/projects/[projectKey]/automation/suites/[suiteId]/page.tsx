import AutomationStudioClient from "../../../../../../components/AutomationStudioClient";

export default async function ProjectAutomationSuiteDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; suiteId: string }>;
}) {
  const { projectKey } = await params;
  return <AutomationStudioClient projectKey={projectKey} section="suites" />;
}


