import type {
  CreateSessionInput,
  ProviderSessionArtifacts,
  ProviderSessionEvent,
  ProviderSessionMetadata,
  ProviderRunInput,
  ProviderRunResult,
  SessionProvider,
} from "./types";

function expiresInMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function endpoint() {
  return process.env.AUTOMATION_MANAGED_BROWSER_ENDPOINT?.replace(/\/$/, "");
}

function absoluteProviderUrl(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = endpoint();
  return baseUrl ? `${baseUrl}${value.startsWith("/") ? "" : "/"}${value}` : value;
}

async function providerJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = endpoint();
  if (!baseUrl) {
    throw new Error("Managed browser endpoint is not configured.");
  }
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = process.env.AUTOMATION_MANAGED_BROWSER_TOKEN;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Managed browser provider request failed.");
  }
  return data;
}

function normalizeSession(
  data: Partial<ProviderSessionMetadata> & { id?: string; sessionId?: string },
): ProviderSessionMetadata {
  return {
    capabilities: data.capabilities ?? {
      liveView: true,
      networkCapture: true,
      trace: true,
      video: true,
    },
    eventStreamUrl: absoluteProviderUrl(data.eventStreamUrl ?? data.streamUrl ?? null),
    expiresAt: data.expiresAt ?? expiresInMinutes(60),
    liveViewUrl: absoluteProviderUrl(data.liveViewUrl ?? null),
    metadata: data.metadata ?? {},
    provider: "managed_browser",
    providerSessionId:
      data.providerSessionId ?? data.sessionId ?? data.id ?? crypto.randomUUID(),
    status: data.status ?? "ready",
    streamUrl: absoluteProviderUrl(data.streamUrl ?? data.eventStreamUrl ?? null),
  };
}

export class ManagedBrowserProvider implements SessionProvider {
  readonly id = "managed_browser" as const;

  async createSession(input: CreateSessionInput): Promise<ProviderSessionMetadata> {
    if (!endpoint()) {
      const providerSessionId = `managed-${crypto.randomUUID()}`;
      return {
        capabilities: {
          liveView: true,
          networkCapture: true,
          trace: true,
          video: true,
        },
        eventStreamUrl: null,
        expiresAt: expiresInMinutes(60),
        liveViewUrl: null,
        metadata: {
          brokerOnly: true,
          message:
            "Managed browser endpoint is not configured; the broker persisted a recoverable session placeholder.",
          targetUrl: input.targetUrl ?? "",
        },
        provider: this.id,
        providerSessionId,
        status: "requested",
        streamUrl: null,
      };
    }

    const data = await providerJson<
      Partial<ProviderSessionMetadata> & { id?: string; sessionId?: string }
    >("/sessions", {
      body: JSON.stringify(input),
      method: "POST",
    });
    return normalizeSession(data);
  }

  async getSession(providerSessionId: string): Promise<ProviderSessionMetadata> {
    if (!endpoint()) {
      return {
        capabilities: {},
        eventStreamUrl: null,
        expiresAt: null,
        liveViewUrl: null,
        metadata: { brokerOnly: true },
        provider: this.id,
        providerSessionId,
        status: "requested",
        streamUrl: null,
      };
    }
    return normalizeSession(
      await providerJson(`/sessions/${encodeURIComponent(providerSessionId)}`),
    );
  }

  async stopSession(providerSessionId: string): Promise<ProviderSessionMetadata> {
    if (!endpoint()) {
      return {
        capabilities: {},
        eventStreamUrl: null,
        expiresAt: null,
        liveViewUrl: null,
        metadata: { brokerOnly: true },
        provider: this.id,
        providerSessionId,
        status: "closed",
        streamUrl: null,
      };
    }
    return normalizeSession(
      await providerJson(`/sessions/${encodeURIComponent(providerSessionId)}`, {
        method: "DELETE",
      }),
    );
  }

  async getLiveView(providerSessionId: string) {
    const session = await this.getSession(providerSessionId);
    return { liveViewUrl: session.liveViewUrl ?? null };
  }

  async getLogs(providerSessionId: string) {
    if (!endpoint()) {
      return [`Managed browser session ${providerSessionId} is waiting for provider wiring.`];
    }
    const data = await providerJson<{ logs?: string[] }>(
      `/sessions/${encodeURIComponent(providerSessionId)}/logs`,
    );
    return data.logs ?? [];
  }

  async getArtifacts(providerSessionId: string): Promise<ProviderSessionArtifacts> {
    if (!endpoint()) return [];
    const data = await providerJson<{ artifacts?: ProviderSessionArtifacts }>(
      `/sessions/${encodeURIComponent(providerSessionId)}/artifacts`,
    );
    return data.artifacts ?? [];
  }

  async getEvents(providerSessionId: string): Promise<ProviderSessionEvent[]> {
    if (!endpoint()) return [];
    const data = await providerJson<{ events?: ProviderSessionEvent[] }>(
      `/sessions/${encodeURIComponent(providerSessionId)}/events`,
    );
    return data.events ?? [];
  }

  async runSteps(
    providerSessionId: string,
    input: ProviderRunInput,
  ): Promise<ProviderRunResult> {
    if (!endpoint()) {
      return {
        eventStreamUrl: null,
        runId: input.runId ?? null,
        sessionId: providerSessionId,
        status: "queued",
      };
    }
    const data = await providerJson<Partial<ProviderRunResult>>(
      `/sessions/${encodeURIComponent(providerSessionId)}/run`,
      {
        body: JSON.stringify(input),
        method: "POST",
      },
    );
    return {
      eventStreamUrl: data.eventStreamUrl ?? null,
      runId: data.runId ?? input.runId ?? null,
      sessionId: data.sessionId ?? providerSessionId,
      status: data.status ?? "running",
    };
  }
}
