import {
  createActionFromSteps,
  listActions,
  resolveAutomationProjectId,
} from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { projectKey } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    return Response.json({ actions: await listActions(projectId) });
  } catch (error) {
    console.error("AUTOMATION ACTIONS GET ERROR:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load actions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId : "";
  const stepIds = Array.isArray(body.stepIds)
    ? body.stepIds.filter((id: unknown): id is string => typeof id === "string")
    : [];

  if (!name) {
    return Response.json({ error: "Action name is required." }, { status: 400 });
  }
  if (!scenarioId) {
    return Response.json({ error: "Scenario id is required." }, { status: 400 });
  }
  if (!stepIds.length) {
    return Response.json({ error: "Select at least one command." }, { status: 400 });
  }

  const action = await createActionFromSteps({
    description:
      typeof body.description === "string" ? body.description.trim() : "",
    name,
    projectId,
    scenarioId,
    stepIds,
  });

  return Response.json({ action }, { status: 201 });
}
