import { keepAliveAutomationSession } from "../../../../../../utils/automation/orchestration";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await keepAliveAutomationSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
  return Response.json({ session });
}
