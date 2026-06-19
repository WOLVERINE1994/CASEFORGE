import {
  getPlaybackConfig,
  resolveAutomationProjectId,
  updatePlaybackConfig,
} from "../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const config = await getPlaybackConfig(projectId, searchParams.get("scenarioId"));
  return Response.json({ config });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId : null;
  const config = await updatePlaybackConfig(projectId, scenarioId, {
    autoElementTimeoutMs:
      typeof body.autoElementTimeoutMs === "number" ? body.autoElementTimeoutMs : undefined,
    autoPlaybackEnabled:
      typeof body.autoPlaybackEnabled === "boolean" ? body.autoPlaybackEnabled : undefined,
    environmentId:
      body.environmentId === null || typeof body.environmentId === "string"
        ? body.environmentId
        : undefined,
    executionParameters:
      body.executionParameters && typeof body.executionParameters === "object"
        ? body.executionParameters
        : undefined,
    manualElementTimeoutMs:
      typeof body.manualElementTimeoutMs === "number" ? body.manualElementTimeoutMs : undefined,
    manualPageTimeoutMs:
      typeof body.manualPageTimeoutMs === "number" ? body.manualPageTimeoutMs : undefined,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    pauseOnElementErrors:
      typeof body.pauseOnElementErrors === "boolean" ? body.pauseOnElementErrors : undefined,
    selfHealingEnabled:
      typeof body.selfHealingEnabled === "boolean" ? body.selfHealingEnabled : undefined,
  });
  return Response.json({ config });
}
