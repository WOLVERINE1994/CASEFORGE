import AutomationStudioClient from "../../../../../components/AutomationStudioClient";

type ProjectAutomationRunsPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationRunsPage({
  params,
}: ProjectAutomationRunsPageProps) {
  const { projectKey } = await params;

  return <AutomationStudioClient projectKey={projectKey} section="runs" />;
}


