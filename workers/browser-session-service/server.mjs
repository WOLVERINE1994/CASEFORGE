import http from "node:http";

const port = Number(process.env.PORT || 4891);
const sessions = new Map();

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function sessionPayload(id) {
  const session = sessions.get(id);
  if (!session) return null;
  return {
    eventStreamUrl: session.streamUrl,
    liveViewUrl: session.liveViewUrl,
    metadata: session.metadata,
    provider: "managed_browser",
    sessionId: id,
    status: session.status,
    streamUrl: session.streamUrl,
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/sessions") {
    const body = await readBody(request).catch(() => ({}));
    const id = `managed-${crypto.randomUUID()}`;
    sessions.set(id, {
      events: [
        {
          data: {
            action: "navigate",
            locatorCandidates: [],
            pageUrl: body.targetUrl || "",
            value: body.targetUrl || "",
          },
          id: `event-${crypto.randomUUID()}`,
          timestamp: new Date().toISOString(),
          type: "record:command",
        },
      ],
      liveViewUrl: `/sessions/${encodeURIComponent(id)}/live`,
      metadata: { targetUrl: body.targetUrl || "" },
      status: "ready",
      streamUrl: `/sessions/${encodeURIComponent(id)}/events`,
    });
    json(response, 201, sessionPayload(id));
    return;
  }

  const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch && request.method === "GET") {
    const payload = sessionPayload(decodeURIComponent(sessionMatch[1]));
    json(response, payload ? 200 : 404, payload ?? { error: "Session not found." });
    return;
  }
  if (sessionMatch && request.method === "DELETE") {
    const id = decodeURIComponent(sessionMatch[1]);
    const payload = sessionPayload(id);
    sessions.delete(id);
    json(response, payload ? 200 : 404, payload ? { ...payload, status: "closed" } : { error: "Session not found." });
    return;
  }

  const logsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/logs$/);
  if (logsMatch && request.method === "GET") {
    json(response, 200, { logs: ["Managed browser service stub is alive."] });
    return;
  }

  const artifactsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/artifacts$/);
  if (artifactsMatch && request.method === "GET") {
    json(response, 200, { artifacts: [] });
    return;
  }

  const eventsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/events$/);
  if (eventsMatch && request.method === "GET") {
    const session = sessions.get(decodeURIComponent(eventsMatch[1]));
    json(
      response,
      session ? 200 : 404,
      session
        ? { events: session.events, sessionId: decodeURIComponent(eventsMatch[1]), status: session.status }
        : { error: "Session not found." },
    );
    return;
  }

  const runMatch = url.pathname.match(/^\/sessions\/([^/]+)\/run$/);
  if (runMatch && request.method === "POST") {
    const id = decodeURIComponent(runMatch[1]);
    const session = sessions.get(id);
    if (!session) {
      json(response, 404, { error: "Session not found." });
      return;
    }
    const body = await readBody(request).catch(() => ({}));
    session.status = "running";
    session.events.push({
      data: { runId: body.runId || "", stepCount: Array.isArray(body.steps) ? body.steps.length : 0 },
      id: `event-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      type: "run:start",
    });
    json(response, 202, {
      eventStreamUrl: session.streamUrl,
      runId: body.runId || null,
      sessionId: id,
      status: "running",
    });
    return;
  }

  json(response, 404, { error: "Not found." });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Browser session service stub listening on http://127.0.0.1:${port}`);
});
