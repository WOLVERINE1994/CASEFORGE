import AutomationShell from "../../../../../../components/AutomationShell";
import AutomationScenarioWorkspace from "../../../../../../components/AutomationScenarioWorkspace";

type PageProps = {
  params: Promise<{ projectKey: string; scenarioId: string }>;
};

export default async function AutomationScenarioDetailPage({
  params,
}: PageProps) {
  const { projectKey, scenarioId } = await params;

  return (
    <AutomationShell
      projectKey={projectKey}
      activeSection="scenarios"
      title="Scenario Workspace"
      description="A lightweight automation IDE shell for scenario authoring."
      layout="workspace"
    >
      <AutomationScenarioWorkspace
        projectKey={projectKey}
        scenarioId={scenarioId}
      />
    </AutomationShell>
  );
}
