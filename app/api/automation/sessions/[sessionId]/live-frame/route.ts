import { refreshAutomationSession } from "../../../../../../utils/automation/orchestration";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function previewSvg(message: string) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <rect width="1280" height="720" fill="#050816"/>
      <rect x="360" y="286" width="560" height="148" rx="24" fill="#111827" stroke="#334155"/>
      <text x="640" y="344" text-anchor="middle" fill="#e5e7eb" font-family="system-ui,Segoe UI,sans-serif" font-size="28" font-weight="700">Live preview reconnecting</text>
      <text x="640" y="386" text-anchor="middle" fill="#94a3b8" font-family="system-ui,Segoe UI,sans-serif" font-size="18">${escaped}</text>
    </svg>`,
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Content-Type": "image/svg+xml",
      },
    },
  );
}

function liveFrameUrlFor(liveViewUrl: string, requestUrl: string) {
  const url = new URL(liveViewUrl, requestUrl);
  url.pathname = url.pathname.replace(/\/live\/?$/, "/live-frame");
  url.search = "";
  return url;
}

export async function GET(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await refreshAutomationSession(sessionId);
  if (!session) {
    return previewSvg("Session not found.");
  }

  if (!session.liveViewUrl) {
    return previewSvg("This session does not expose a live preview URL.");
  }

  let frameUrl: URL;
  try {
    frameUrl = liveFrameUrlFor(session.liveViewUrl, request.url);
  } catch {
    return previewSvg("Live preview URL is invalid.");
  }

  const tick = new URL(request.url).searchParams.get("t");
  if (tick) frameUrl.searchParams.set("t", tick);
  frameUrl.searchParams.set("at", Date.now().toString());

  let workerResponse: Response;
  try {
    workerResponse = await fetch(frameUrl, { cache: "no-store" });
  } catch (error) {
    return previewSvg(
      error instanceof Error
        ? `Worker unreachable: ${error.message}`
        : "Worker unreachable.",
    );
  }

  if (!workerResponse.ok) {
    const error = await workerResponse.text().catch(() => "");
    const normalizedError = error.trim();
    if (workerResponse.status === 404 || /not found/i.test(normalizedError)) {
      return previewSvg(
        "Preview session is not available yet. Keep the playback browser open or restart playback.",
      );
    }
    return previewSvg(
      normalizedError || `Worker returned ${workerResponse.status}.`,
    );
  }

  return new Response(await workerResponse.arrayBuffer(), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Type":
        workerResponse.headers.get("Content-Type") || "image/png",
    },
  });
}
