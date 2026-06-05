import {
  deleteActionStep,
  resolveAutomationProjectId,
  updateActionStep,
} from "../../../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; actionId: string; stepId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const { projectKey, actionId, stepId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const action = await deleteActionStep(projectId, actionId, stepId);
  if (!action) {
    return Response.json({ error: "Command not found." }, { status: 404 });
  }

  return Response.json({ action });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey, actionId, stepId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = await updateActionStep(projectId, actionId, stepId, {
    action: typeof body.action === "string" ? body.action : undefined,
    assertionType: typeof body.assertionType === "string" ? body.assertionType : undefined,
    commandText: typeof body.commandText === "string" ? body.commandText : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    expectedValue: typeof body.expectedValue === "string" ? body.expectedValue : undefined,
    inputValue: typeof body.inputValue === "string" ? body.inputValue : undefined,
    locatorCandidates: Array.isArray(body.locatorCandidates)
      ? body.locatorCandidates
      : undefined,
    options:
      body.options && typeof body.options === "object" && !Array.isArray(body.options)
        ? body.options
        : undefined,
    target:
      body.target && typeof body.target === "object" && !Array.isArray(body.target)
        ? body.target
        : undefined,
  });
  if (!action) {
    return Response.json({ error: "Command not found." }, { status: 404 });
  }

  return Response.json({ action });
}
