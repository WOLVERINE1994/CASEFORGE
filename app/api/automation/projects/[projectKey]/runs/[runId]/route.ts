import {
  getRun,
  resolveAutomationProjectId,
  updateRun,
} from "../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; runId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, runId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const run = await getRun(projectId, runId);
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }
  return Response.json({ run });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey, runId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const run = await updateRun(projectId, runId, {
    status:
      body.status === "queued" ||
      body.status === "running" ||
      body.status === "passed" ||
      body.status === "failed" ||
      body.status === "blocked" ||
      body.status === "canceled"
        ? body.status
        : undefined,
    summary:
      body.summary && typeof body.summary === "object" && !Array.isArray(body.summary)
        ? body.summary
        : undefined,
  });
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }
  return Response.json({ run });
}
