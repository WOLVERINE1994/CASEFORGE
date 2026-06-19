import { getAutomationSessionEvents } from "../../../../../../utils/automation/orchestration";
import { getSessionRecord } from "../../../../../../utils/automation/store";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
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
  } catch (error) {
    return Response.json(
      {
        events: [],
        error:
          error instanceof Error
            ? error.message
            : "Could not read recorded automation events.",
      },
      { status: 500 },
    );
  }
}
