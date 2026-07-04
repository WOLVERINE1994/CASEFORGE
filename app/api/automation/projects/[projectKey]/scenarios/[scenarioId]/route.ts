import {
  deleteScenario,
  getScenario,
  replaceScenarioSteps,
  resolveAutomationProjectId,
  updateScenario,
} from "../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string; scenarioId: string }>;
};

function scenarioErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not update automation scenario.";

  console.error("AUTOMATION SCENARIO ROUTE ERROR:", error);

  return Response.json({ error: message }, { status: 500 });
}

export async function GET(_: Request, context: RouteContext) {
  const { projectKey, scenarioId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const scenario = await getScenario(projectId, scenarioId);
  if (!scenario) {
    return Response.json({ error: "Scenario not found." }, { status: 404 });
  }

  return Response.json({ scenario });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectKey, scenarioId } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const hasMetadataUpdate =
      typeof body.name === "string" ||
      typeof body.description === "string" ||
      typeof body.status === "string" ||
      Array.isArray(body.tags) ||
      (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata));
    const steps = Array.isArray(body.steps) ? body.steps : undefined;

    if (!hasMetadataUpdate && !steps) {
      return Response.json(
        { error: "Scenario update requires fields or a steps array." },
        { status: 400 },
      );
    }

    const scenario = hasMetadataUpdate
      ? await updateScenario(projectId, scenarioId, {
          description:
            typeof body.description === "string" ? body.description : undefined,
          name: typeof body.name === "string" ? body.name : undefined,
          status:
            body.status === "draft" ||
            body.status === "active" ||
            body.status === "paused" ||
            body.status === "completed" ||
            body.status === "archived"
              ? body.status
              : undefined,
          metadata:
            body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
              ? body.metadata
              : undefined,
          steps,
          tags: Array.isArray(body.tags)
            ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
            : undefined,
        })
      : await replaceScenarioSteps(projectId, scenarioId, steps ?? []);
    if (!scenario) {
      return Response.json({ error: "Scenario not found." }, { status: 404 });
    }

    return Response.json({ scenario });
  } catch (error) {
    return scenarioErrorResponse(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const { projectKey, scenarioId } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const deleted = await deleteScenario(projectId, scenarioId);
  if (!deleted) {
    return Response.json({ error: "Scenario not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
