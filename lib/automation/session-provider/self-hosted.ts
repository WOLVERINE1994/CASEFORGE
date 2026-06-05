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
  return process.env.AUTOMATION_SELF_HOSTED_WORKER_ENDPOINT?.replace(/\/$/, "");
}

function absoluteWorkerUrl(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = endpoint();
  return baseUrl ? `${baseUrl}${value.startsWith("/") ? "" : "/"}${value}` : value;
}

async function workerJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = endpoint();
  if (!baseUrl) {
    throw new Error("Self-hosted worker endpoint is not configured.");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(data.error || "Self-hosted worker request failed.");
    (error as Error & { code?: string }).code = data.error;
    throw error;
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
    eventStreamUrl: absoluteWorkerUrl(data.eventStreamUrl ?? data.streamUrl ?? null),
    expiresAt: data.expiresAt ?? expiresInMinutes(45),
    liveViewUrl: absoluteWorkerUrl(data.liveViewUrl ?? null),
    metadata: {
      ...(data.metadata ?? {}),
      eventStreamUrl: absoluteWorkerUrl(data.eventStreamUrl ?? data.streamUrl ?? null),
    },
    provider: "self_hosted_playwright",
    providerSessionId:
      data.providerSessionId ?? data.sessionId ?? data.id ?? crypto.randomUUID(),
    status: data.status ?? "starting",
    streamUrl: absoluteWorkerUrl(data.streamUrl ?? data.eventStreamUrl ?? null),
  };
}

export class SelfHostedPlaywrightProvider implements SessionProvider {
  readonly id = "self_hosted_playwright" as const;

  async createSession(input: CreateSessionInput): Promise<ProviderSessionMetadata> {
    if (!endpoint()) {
      const providerSessionId = `worker-${crypto.randomUUID()}`;
      return {
        capabilities: { liveView: true, networkCapture: true, trace: true, video: true },
        eventStreamUrl: null,
        expiresAt: expiresInMinutes(45),
        liveViewUrl: null,
        metadata: {
          brokerOnly: true,
          message:
            "Self-hosted worker endpoint is not configured; no browser was launched by the broker.",
          targetUrl: input.targetUrl ?? "",
        },
        provider: this.id,
        providerSessionId,
        status: "requested",
        streamUrl: null,
      };
    }

    return normalizeSession(
      await workerJson("/sessions", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    );
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
      await workerJson(`/sessions/${encodeURIComponent(providerSessionId)}`),
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
      await workerJson(`/sessions/${encodeURIComponent(providerSessionId)}`, {
        method: "DELETE",
      }),
    );
  }

  async keepAlive(providerSessionId: string): Promise<ProviderSessionMetadata> {
    if (!endpoint()) return this.getSession(providerSessionId);
    return normalizeSession(
      await workerJson(`/sessions/${encodeURIComponent(providerSessionId)}/keepalive`, {
        method: "POST",
      }),
    );
  }

  async setRecorderMode(
    providerSessionId: string,
    mode: "off" | "record" | "verify",
  ): Promise<ProviderSessionMetadata> {
    if (!endpoint()) return this.getSession(providerSessionId);
    return normalizeSession(
      await workerJson(`/sessions/${encodeURIComponent(providerSessionId)}/recorder-mode`, {
        body: JSON.stringify({ mode }),
        method: "POST",
      }),
    );
  }

  async resolveAmbiguity(
    providerSessionId: string,
    input: {
      runId?: string | null;
      stepId?: string | null;
      selectedIndex: number;
      resolutionMethod?: string;
    },
  ) {
    if (!endpoint()) {
      return {
        ok: true,
        selectedIndex: input.selectedIndex,
        sessionId: providerSessionId,
        status: "running",
      };
    }
    return workerJson<{
      ok: boolean;
      selectedIndex: number;
      sessionId: string;
      status?: string;
    }>(`/sessions/${encodeURIComponent(providerSessionId)}/resolve-ambiguity`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  }

  async testLocator(
    providerSessionId: string,
    input: { locatorType?: string; value?: string },
  ) {
    if (!endpoint()) {
      return {
        count: 0,
        locatorType: input.locatorType || "css",
        previews: [],
        sessionId: providerSessionId,
        value: input.value || "",
      };
    }
    return workerJson<{
      count: number;
      locatorType: string;
      previews: Array<Record<string, unknown>>;
      sessionId: string;
      value: string;
    }>(`/sessions/${encodeURIComponent(providerSessionId)}/test-locator`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  }

  async getLiveView(providerSessionId: string) {
    const session = await this.getSession(providerSessionId);
    return { liveViewUrl: session.liveViewUrl ?? null };
  }

  async getLogs(providerSessionId: string) {
    const session = await this.getSession(providerSessionId);
    const rawLogs = session.metadata.logs;
    return Array.isArray(rawLogs)
      ? rawLogs.filter((item): item is string => typeof item === "string")
      : [];
  }

  async getArtifacts(): Promise<ProviderSessionArtifacts> {
    return [];
  }

  async getEvents(providerSessionId: string): Promise<ProviderSessionEvent[]> {
    if (!endpoint()) return [];
    const data = await workerJson<{ events?: ProviderSessionEvent[] }>(
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
    const data = await workerJson<Partial<ProviderRunResult>>(
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
