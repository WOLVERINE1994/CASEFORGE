import {
  insertActionStep,
  resolveAutomationProjectId,
} from "../../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; actionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectKey, actionId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (!body.step || typeof body.step !== "object" || Array.isArray(body.step)) {
    return Response.json({ error: "Command payload is required." }, { status: 400 });
  }

  const action = await insertActionStep(projectId, actionId, {
    afterStepId: typeof body.afterStepId === "string" ? body.afterStepId : null,
    step: body.step,
  });
  if (!action) {
    return Response.json({ error: "Action not found." }, { status: 404 });
  }

  return Response.json({ action }, { status: 201 });
}
