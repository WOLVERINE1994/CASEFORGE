import AutomationHomeClient from "../../../../components/AutomationHomeClient";

type ProjectAutomationPageProps = {
  params: Promise<{
    projectKey: string;
  }>;
};

export default async function ProjectAutomationPage({
  params,
}: ProjectAutomationPageProps) {
  const { projectKey } = await params;

  return <AutomationHomeClient projectKey={projectKey} />;
}


