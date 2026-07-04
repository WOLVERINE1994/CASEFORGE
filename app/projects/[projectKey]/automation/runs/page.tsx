import AutomationShell from "../../../../../components/AutomationShell";
import AutomationRunsClient from "../../../../../components/AutomationRunsClient";

type PageProps = {
  params: Promise<{ projectKey: string }>;
};

export default async function AutomationRunsPage({ params }: PageProps) {
  const { projectKey } = await params;
  return (
    <AutomationShell
      projectKey={projectKey}
      activeSection="runs"
    >
      <AutomationRunsClient projectKey={projectKey} />
    </AutomationShell>
  );
}
