import {
  deleteSuite,
  getSuite,
  resolveAutomationProjectId,
  updateSuite,
} from "../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; suiteId: string }>;
};

const isValidStatus = (value: unknown) =>
  value === "draft" ||
  value === "active" ||
  value === "paused" ||
  value === "completed" ||
  value === "archived";

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

function suiteErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not update automation suite.";

  console.error("AUTOMATION SUITE ROUTE ERROR:", error);

  return Response.json({ error: message }, { status: 500 });
}

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, suiteId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const suite = await getSuite(projectId, suiteId);
  if (!suite) {
    return Response.json({ error: "Suite not found." }, { status: 404 });
  }

  return Response.json({ suite });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectKey, suiteId } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const hasUpdate =
      typeof body.name === "string" ||
      typeof body.description === "string" ||
      typeof body.status === "string" ||
      Array.isArray(body.tags) ||
      Array.isArray(body.scenarioIds) ||
      (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata));
    if (!hasUpdate) {
      return Response.json(
        { error: "Suite update requires at least one field." },
        { status: 400 },
      );
    }

    const suite = await updateSuite(projectId, suiteId, {
      description:
        typeof body.description === "string" ? body.description : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      scenarioIds: Array.isArray(body.scenarioIds)
        ? stringArray(body.scenarioIds)
        : undefined,
      status: isValidStatus(body.status) ? body.status : undefined,
      tags: Array.isArray(body.tags) ? stringArray(body.tags) : undefined,
    });
    if (!suite) {
      return Response.json({ error: "Suite not found." }, { status: 404 });
    }

    return Response.json({ suite });
  } catch (error) {
    return suiteErrorResponse(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const { projectKey, suiteId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const deleted = await deleteSuite(projectId, suiteId);
  if (!deleted) {
    return Response.json({ error: "Suite not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
