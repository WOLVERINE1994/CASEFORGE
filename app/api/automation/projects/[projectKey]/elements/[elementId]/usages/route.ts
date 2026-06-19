import {
  listElementUsages,
  resolveAutomationProjectId,
  upsertElementUsage,
} from "../../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; elementId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, elementId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const usages = await listElementUsages(projectId, elementId);
  return Response.json({ usages });
}

export async function POST(request: Request, context: RouteContext) {
  const { projectKey, elementId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const usage = await upsertElementUsage({
    actionId: typeof body.actionId === "string" ? body.actionId : null,
    elementId,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    projectId,
    scenarioId: typeof body.scenarioId === "string" ? body.scenarioId : null,
    stepId: typeof body.stepId === "string" ? body.stepId : null,
    usageType: typeof body.usageType === "string" ? body.usageType : "command",
  });
  return Response.json({ usage }, { status: 201 });
}
