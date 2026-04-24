import { runDueAutomationSchedules } from "../../../../../utils/automation-scheduling";

const isAuthorized = (request: Request) => {
  const secret = process.env.AUTOMATION_SCHEDULE_SECRET?.trim();
  if (!secret) {
    return true;
  }

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  const directHeader =
    request.headers.get("x-automation-schedule-secret")?.trim() ?? "";

  return authHeader === `Bearer ${secret}` || directHeader === secret;
};

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return Response.json({ error: "Unauthorized schedule dispatch request." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
      projectRef?: string;
      scheduleId?: string;
      now?: number;
    };

    const result = await runDueAutomationSchedules({
      projectRef:
        typeof body.projectId === "string"
          ? body.projectId
          : typeof body.projectRef === "string"
            ? body.projectRef
            : undefined,
      scheduleId: typeof body.scheduleId === "string" ? body.scheduleId : undefined,
      now: typeof body.now === "number" ? body.now : Date.now(),
    });

    return Response.json(result);
  } catch (error) {
    console.error("AUTOMATION SCHEDULE DISPATCH ERROR:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Failed to dispatch automation schedules.";
    return Response.json({ error: message }, { status: 500 });
  }
}
