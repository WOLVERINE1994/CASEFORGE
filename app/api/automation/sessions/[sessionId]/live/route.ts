import { refreshAutomationSession } from "../../../../../../utils/automation/orchestration";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await refreshAutomationSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ liveViewUrl: session.liveViewUrl ?? null });
}
