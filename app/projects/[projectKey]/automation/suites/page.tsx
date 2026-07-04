import AutomationShell from "../../../../../components/AutomationShell";
import AutomationSuitesClient from "../../../../../components/AutomationSuitesClient";

type PageProps = {
  params: Promise<{ projectKey: string }>;
};

export default async function AutomationSuitesPage({ params }: PageProps) {
  const { projectKey } = await params;
  return (
    <AutomationShell
      projectKey={projectKey}
      activeSection="suites"
    >
      <AutomationSuitesClient projectKey={projectKey} />
    </AutomationShell>
  );
}
