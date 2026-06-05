import AutomationShell from "../../../../../components/AutomationShell";
import AutomationActionsClient from "../../../../../components/AutomationActionsClient";

type PageProps = {
  params: Promise<{ projectKey: string }>;
};

export default async function AutomationActionsPage({ params }: PageProps) {
  const { projectKey } = await params;
  return (
    <AutomationShell
      projectKey={projectKey}
      activeSection="actions"
      description="Reusable no-code command groups created from scenario timelines."
    >
      <AutomationActionsClient projectKey={projectKey} />
    </AutomationShell>
  );
}
