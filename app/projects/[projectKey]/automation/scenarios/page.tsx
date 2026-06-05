import AutomationShell from "../../../../../components/AutomationShell";
import AutomationScenariosClient from "../../../../../components/AutomationScenariosClient";
import AutomationScenarioWorkspace from "../../../../../components/AutomationScenarioWorkspace";

type PageProps = {
  params: Promise<{ projectKey: string }>;
  searchParams?: Promise<{ scenarioId?: string }>;
};

export default async function AutomationScenariosPage({
  params,
  searchParams,
}: PageProps) {
  const { projectKey } = await params;
  const { scenarioId = "" } = (await searchParams) ?? {};

  if (scenarioId) {
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

  return (
    <AutomationShell
      projectKey={projectKey}
      activeSection="scenarios"
      description="Create and manage lightweight automation scenario records."
    >
      <AutomationScenariosClient projectKey={projectKey} />
    </AutomationShell>
  );
}
