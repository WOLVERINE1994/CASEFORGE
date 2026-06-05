import {
  createRunWithArtifacts,
  listRuns,
  resolveAutomationProjectId,
} from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const run = await createRunWithArtifacts({
    artifacts: Array.isArray(body.artifacts) ? body.artifacts : [],
    environmentId:
      typeof body.environmentId === "string" ? body.environmentId : null,
    projectId,
    scenarioId: typeof body.scenarioId === "string" ? body.scenarioId : null,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    summary:
      body.summary && typeof body.summary === "object" && !Array.isArray(body.summary)
        ? body.summary
        : {},
    status: body.status,
  });

  return Response.json({ queued: true, run }, { status: 201 });
}

export async function GET(_: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  return Response.json({ runs: await listRuns(projectId) });
}
