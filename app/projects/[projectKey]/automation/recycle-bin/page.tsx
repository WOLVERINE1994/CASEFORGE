import AutomationRecycleBinClient from "../../../../../components/AutomationRecycleBinClient";
import AutomationShell from "../../../../../components/AutomationShell";

type PageProps = {
  params: Promise<{ projectKey: string }>;
};

export default async function AutomationRecycleBinPage({ params }: PageProps) {
  const { projectKey } = await params;

  return (
    <AutomationShell
      activeSection="recycle-bin"
      description="Restore deleted automation assets or permanently purge them when you are certain."
      projectKey={projectKey}
      title="Recycle Bin"
    >
      <AutomationRecycleBinClient projectKey={projectKey} />
    </AutomationShell>
  );
}
