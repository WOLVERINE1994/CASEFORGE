import { resolveAutomationSessionAmbiguity } from "../../../../../../utils/automation/orchestration";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const selectedIndex = Number(body.selectedIndex);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
    return Response.json({ error: "Select a valid element instance." }, { status: 400 });
  }

  try {
    const result = await resolveAutomationSessionAmbiguity(sessionId, {
      resolutionMethod:
        typeof body.resolutionMethod === "string" ? body.resolutionMethod : "index",
      runId: typeof body.runId === "string" ? body.runId : null,
      selectedIndex,
      stepId: typeof body.stepId === "string" ? body.stepId : null,
    });
    if (!result) {
      return Response.json({ error: "Session not found." }, { status: 404 });
    }
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not resolve locator choice." },
      { status: 409 },
    );
  }
}
