import {
  importLegacyScenarios,
  resolveAutomationProjectId,
} from "../../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectKey } = await context.params;
  const projectId = await resolveAutomationProjectId(projectKey);
  if (!projectId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.source !== "legacy-local-storage") {
    return Response.json({ error: "Unsupported import source." }, { status: 400 });
  }
  if (!Array.isArray(body.scenarios)) {
    return Response.json({ error: "Scenarios array is required." }, { status: 400 });
  }

  const imported = await importLegacyScenarios(projectId, body.scenarios);
  return Response.json({ imported, count: imported.length }, { status: 201 });
}
