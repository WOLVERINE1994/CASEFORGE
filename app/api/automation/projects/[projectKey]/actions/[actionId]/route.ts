import {
  deleteAction,
  getAction,
  reorderActionSteps,
  resolveAutomationProjectId,
  updateAction,
} from "../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; actionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, actionId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const action = await getAction(projectId, actionId);
  if (!action) {
    return Response.json({ error: "Action not found." }, { status: 404 });
  }

  return Response.json({ action });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectKey, actionId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (Array.isArray(body.stepIds)) {
    const action = await reorderActionSteps(
      projectId,
      actionId,
      body.stepIds.filter((id: unknown): id is string => typeof id === "string"),
    );
    if (!action) {
      return Response.json({ error: "Action not found." }, { status: 404 });
    }
    return Response.json({ action });
  }

  const action = await updateAction(projectId, actionId, {
    description:
      typeof body.description === "string" ? body.description.trim() : undefined,
    name: typeof body.name === "string" ? body.name.trim() : undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
      : undefined,
  });
  if (!action) {
    return Response.json({ error: "Action not found." }, { status: 404 });
  }

  return Response.json({ action });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { projectKey, actionId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const deleted = await deleteAction(projectId, actionId);
  if (!deleted) {
    return Response.json({ error: "Action not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
