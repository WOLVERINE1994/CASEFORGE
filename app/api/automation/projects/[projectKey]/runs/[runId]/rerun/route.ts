import {
  createRunWithArtifacts,
  getRun,
  resolveAutomationProjectId,
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
  const sourceRun = await getRun(projectId, runId);
  if (!sourceRun) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  const run = await createRunWithArtifacts({
    environmentId: sourceRun.environmentId,
    projectId,
    scenarioId: sourceRun.scenarioId,
    sessionId: sourceRun.sessionId,
    status: "queued",
    summary: {
      rerunOf: sourceRun.id,
      stepResults: sourceRun.summary.stepResults ?? [],
      worker: { state: "queued", type: "automation-execution-service" },
    },
  });

  return Response.json({ queued: true, run }, { status: 201 });
}
