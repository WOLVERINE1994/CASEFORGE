import { getAutomationSessionEvents } from "../../../../../../utils/automation/orchestration";
import { getSessionRecord } from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await getSessionRecord(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({
    events: await getAutomationSessionEvents(sessionId),
    sessionId,
    status: session.status,
  });
}
