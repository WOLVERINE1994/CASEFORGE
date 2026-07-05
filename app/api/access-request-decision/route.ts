import { decideAccessRequestByToken } from "../../../services/access-request-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const decision = url.searchParams.get("decision") === "rejected" ? "rejected" : "approved";

  if (!token) {
    return new Response("Missing access request token.", { status: 400 });
  }

  const accessRequest = await decideAccessRequestByToken({
    token,
    status: decision,
  });

  if (!accessRequest) {
    return new Response("Access request link is invalid or expired.", {
      status: 404,
    });
  }

  return new Response(
    `<!doctype html>
    <html>
      <head>
        <title>CaseForge access ${decision}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { margin: 0; font-family: Arial, sans-serif; background: #08101d; color: #f8fafc; display: grid; min-height: 100vh; place-items: center; }
          main { max-width: 560px; padding: 32px; border: 1px solid rgba(255,255,255,.14); border-radius: 20px; background: rgba(255,255,255,.07); }
          a { color: #a5f3fc; }
        </style>
      </head>
      <body>
        <main>
          <h1>Access ${decision}</h1>
          <p>${accessRequest.email} has been ${decision} for CaseForge.</p>
          <p><a href="/access-requests">Open access requests</a></p>
        </main>
      </body>
    </html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}
