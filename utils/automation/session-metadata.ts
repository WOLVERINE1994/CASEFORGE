import type { AutomationSession } from "./types";

function stringMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

export function toAutomationSessionMetadata(session: AutomationSession) {
  const metadata = session.metadata ?? {};
  const eventStreamUrl =
    session.eventStreamUrl ??
    stringMetadata(metadata, "eventStreamUrl") ??
    stringMetadata(metadata, "streamUrl");

  return {
    currentUrl: stringMetadata(metadata, "currentUrl"),
    eventStreamUrl,
    id: session.id,
    idleExpiresAt: stringMetadata(metadata, "idleExpiresAt"),
    lastActivityAt: stringMetadata(metadata, "lastActivityAt"),
    lastRunId: stringMetadata(metadata, "lastRunId"),
    liveViewUrl: session.liveViewUrl ?? null,
    metadata,
    provider: session.provider,
    providerSessionId: session.providerSessionId ?? null,
    sessionId: session.id,
    status: session.status,
    streamUrl: eventStreamUrl,
  };
}
