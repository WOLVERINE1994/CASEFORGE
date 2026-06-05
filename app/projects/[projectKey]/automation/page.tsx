import AutomationShell from "../../../../components/AutomationShell";

type PageProps = {
  params: Promise<{ projectKey: string }>;
};

export default async function AutomationOverviewPage({ params }: PageProps) {
  const { projectKey } = await params;
  return <AutomationShell projectKey={projectKey} activeSection="overview" />;
}
