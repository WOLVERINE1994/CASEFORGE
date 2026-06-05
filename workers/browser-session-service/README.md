# Browser Session Service Stub

This directory is the deployment boundary for managed browser session services.
Next.js API routes broker requests and persist metadata; this service owns browser
lifetime, live view, logs, and artefact production.

Expected provider contract:

- `POST /sessions`
- `GET /sessions/:id`
- `DELETE /sessions/:id`
- `GET /sessions/:id/logs`
- `GET /sessions/:id/artifacts`

Return session metadata as:

```json
{
  "sessionId": "provider-session-id",
  "status": "ready",
  "provider": "managed_browser",
  "liveViewUrl": "https://browser.example/live/session",
  "streamUrl": "https://browser.example/events/session"
}
```

The service can be implemented by a managed browser vendor adapter or by an
owned worker fleet. It should not run inside Vercel route handlers.
