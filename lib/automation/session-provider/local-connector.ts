import { isLocalConnectorEnabled } from "./flags";
import type {
  CreateSessionInput,
  ProviderSessionArtifacts,
  ProviderSessionEvent,
  ProviderSessionMetadata,
  ProviderRunResult,
  SessionProvider,
} from "./types";

function expiresInMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export class OptionalLocalConnectorProvider implements SessionProvider {
  readonly id = "optional_local_connector" as const;

  async createSession(input: CreateSessionInput): Promise<ProviderSessionMetadata> {
    if (!isLocalConnectorEnabled()) {
      throw new Error("Private access connector is disabled for this environment.");
    }

    return {
      capabilities: {
        intranet: true,
        localhost: true,
        privateAccess: true,
        secureTunnel: true,
        vpn: true,
      },
      eventStreamUrl: null,
      expiresAt: expiresInMinutes(30),
      liveViewUrl: null,
      metadata: {
        optional: true,
        adapterMode: "private_access_connector",
        targetUrl: input.targetUrl ?? "",
        warning:
          "Private Access Connector is only for localhost, VPN, intranet, and other restricted targets. Public web apps should use managed cloud sessions.",
      },
      provider: this.id,
      providerSessionId: `local-${crypto.randomUUID()}`,
      status: "ready",
      streamUrl: null,
    };
  }

  async getSession(providerSessionId: string): Promise<ProviderSessionMetadata> {
    if (!isLocalConnectorEnabled()) {
      throw new Error("Private access connector is disabled for this environment.");
    }

    return {
      capabilities: {
        intranet: true,
        localhost: true,
        privateAccess: true,
        secureTunnel: true,
        vpn: true,
      },
      eventStreamUrl: null,
      expiresAt: null,
      liveViewUrl: null,
      metadata: { adapterMode: "private_access_connector", optional: true },
      provider: this.id,
      providerSessionId,
      status: "ready",
      streamUrl: null,
    };
  }

  async stopSession(providerSessionId: string): Promise<ProviderSessionMetadata> {
    return {
      ...(await this.getSession(providerSessionId)),
      status: "closed",
    };
  }

  async getLiveView() {
    return { liveViewUrl: null };
  }

  async getLogs() {
    return ["Private Access Connector sessions are controlled by the optional connector."];
  }

  async getArtifacts(): Promise<ProviderSessionArtifacts> {
    return [];
  }

  async getEvents(): Promise<ProviderSessionEvent[]> {
    return [];
  }

  async runSteps(
    providerSessionId: string,
    input: { runId?: string | null },
  ): Promise<ProviderRunResult> {
    return {
      eventStreamUrl: null,
      runId: input.runId ?? null,
      sessionId: providerSessionId,
      status: "queued",
    };
  }
}
