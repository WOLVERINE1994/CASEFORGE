import { refreshAutomationSession } from "../../../../../../utils/automation/orchestration";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function inspectUrlFor(liveViewUrl: string, requestUrl: string) {
  const url = new URL(liveViewUrl, requestUrl);
  url.pathname = url.pathname.replace(/\/live\/?$/, "/inspect");
  url.search = "";
  return url;
}

export async function POST(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await refreshAutomationSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  if (!session.liveViewUrl) {
    return Response.json(
      { error: "Live inspector is not available for this session." },
      { status: 404 },
    );
  }

  let inspectUrl: URL;
  try {
    inspectUrl = inspectUrlFor(session.liveViewUrl, request.url);
  } catch {
    return Response.json(
      { error: "Live inspector URL is invalid." },
      { status: 502 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  let workerResponse: Response;
  try {
    workerResponse = await fetch(inspectUrl, {
      body: JSON.stringify(payload),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? `Could not reach live inspector: ${error.message}`
            : "Could not reach live inspector.",
      },
      { status: 502 },
    );
  }

  const data = await workerResponse.json().catch(() => ({}));
  return Response.json(data, { status: workerResponse.status });
}
