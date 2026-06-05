import {
  resolveAutomationProjectId,
  updateRun,
} from "../../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; runId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { projectKey, runId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const run = await updateRun(projectId, runId, {
    status: "canceled",
    summary: {
      canceledAt: new Date().toISOString(),
      worker: { state: "canceled", type: "automation-execution-service" },
    },
  });
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }
  return Response.json({ run });
}
