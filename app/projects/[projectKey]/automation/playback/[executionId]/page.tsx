import ProjectAutomationWorkspace from "../../../../../../components/ProjectAutomationWorkspace";

export default async function ProjectAutomationPlaybackDetailPage({
  params,
}: {
  params: Promise<{ projectKey: string; executionId: string }>;
}) {
  const { projectKey, executionId } = await params;

  return (
    <ProjectAutomationWorkspace
      projectKey={projectKey}
      initialProject={null}
      initialSection="playback"
      initialExecutionId={executionId}
    />
  );
}


