import http from "node:http";

const port = Number(process.env.PORT || 4892);

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      ok: true,
      service: "automation-execution-service",
      responsibilities: [
        "claim queued runs",
        "update step timing/status",
        "upload trace/video/log/network/screenshot artefacts",
        "preserve encrypted auth state references",
      ],
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/runs/claim") {
    json(response, 202, {
      message:
        "Stub only. A production worker should claim queued AutomationRun records from the database.",
    });
    return;
  }

  json(response, 404, { error: "Not found." });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Automation execution service stub listening on http://127.0.0.1:${port}`);
});
