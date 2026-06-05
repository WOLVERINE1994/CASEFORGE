import {
  createScenario,
  listScenarios,
  resolveAutomationProjectId,
} from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

function automationApiError(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ECONNREFUSED"
  ) {
    return "Database connection failed. Check DATABASE_URL/DIRECT_URL and make sure the database is reachable before creating scenarios.";
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { projectKey } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    return Response.json({ scenarios: await listScenarios(projectId) });
  } catch (error) {
    console.error("AUTOMATION SCENARIOS GET ERROR:", error);
    return Response.json(
      { error: automationApiError(error, "Could not load scenarios.") },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectKey } = await context.params;
    const projectId = await resolveAutomationProjectId(projectKey);
    if (!projectId) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const scenario = await createScenario({
      description: typeof body.description === "string" ? body.description : "",
      name: typeof body.name === "string" ? body.name : undefined,
      projectId,
      tags: Array.isArray(body.tags)
        ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
        : [],
    });

    return Response.json({ scenario }, { status: 201 });
  } catch (error) {
    console.error("AUTOMATION SCENARIOS POST ERROR:", error);
    return Response.json(
      { error: automationApiError(error, "Could not create scenario.") },
      { status: 500 },
    );
  }
}
