import {
  listRunArtifacts,
  resolveAutomationProjectId,
} from "../../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; runId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, runId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  return Response.json({
    artifacts: await listRunArtifacts(projectId, runId),
  });
}
