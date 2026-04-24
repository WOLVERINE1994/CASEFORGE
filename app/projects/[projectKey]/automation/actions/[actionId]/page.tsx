import ProjectAutomationWorkspace from "../../../../../../components/ProjectAutomationWorkspace";

export default async function ProjectAutomationActionDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; actionId: string }>;
}) {
  const { projectKey, actionId } = await params;
  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="actions"
      initialActionId={actionId}
    />
  );
}


