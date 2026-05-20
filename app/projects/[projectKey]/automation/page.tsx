import AutomationStudioClient from "../../../../components/AutomationStudioClient";

type ProjectAutomationPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationPage({
  params,
}: ProjectAutomationPageProps) {
  const { projectKey } = await params;

  return <AutomationStudioClient projectKey={projectKey} section="home" />;
}


