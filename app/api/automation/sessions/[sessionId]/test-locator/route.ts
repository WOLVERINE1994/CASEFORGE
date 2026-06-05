import { testAutomationSessionLocator } from "../../../../../../utils/automation/orchestration";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!value) {
    return Response.json({ error: "Locator value is required." }, { status: 400 });
  }

  try {
    const result = await testAutomationSessionLocator(sessionId, {
      locatorType: typeof body.locatorType === "string" ? body.locatorType : "css",
      value,
    });
    if (!result) {
      return Response.json({ error: "Session not found." }, { status: 404 });
    }
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not test locator." },
      { status: 409 },
    );
  }
}
