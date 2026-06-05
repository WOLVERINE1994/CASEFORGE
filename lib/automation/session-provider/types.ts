import type {
  AutomationArtifact,
  AutomationSessionProviderId,
  AutomationSessionStatus,
} from "../../../utils/automation/types";

export type CreateSessionInput = {
  projectId: string;
  scenarioId?: string | null;
  environmentId?: string | null;
  executionMode?: "interactive_persistent" | "ephemeral_ci";
  hardTimeoutMs?: number;
  headless?: boolean;
  httpCredentials?: {
    password: string;
    username: string;
  } | null;
  idleTimeoutMs?: number;
  targetUrl?: string;
  viewport?: {
    deviceScaleFactor?: number;
    height: number;
    isMobile?: boolean;
    width: number;
  } | null;
};

export type ProviderSessionMetadata = {
  provider: AutomationSessionProviderId;
  providerSessionId: string;
  status: AutomationSessionStatus;
  liveViewUrl?: string | null;
  streamUrl?: string | null;
  eventStreamUrl?: string | null;
  expiresAt?: string | null;
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type ProviderSessionArtifacts = Array<
  Pick<
    AutomationArtifact,
    "encrypted" | "label" | "metadata" | "mimeType" | "sizeBytes" | "type" | "uri"
  >
>;

export type ProviderSessionEvent = {
  id?: string;
  sessionId?: string;
  timestamp?: string;
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ProviderRunResult = {
  eventStreamUrl?: string | null;
  runId?: string | null;
  sessionId: string;
  status: string;
};

export type ProviderRunInput = {
  actionId?: string | null;
  closeOnComplete?: boolean;
  executionMode?: "interactive_persistent" | "ephemeral_ci";
  keepSessionOpen?: boolean;
  runId?: string | null;
  steps: unknown[];
  suppressRecording?: boolean;
};

export interface SessionProvider {
  readonly id: AutomationSessionProviderId;
  createSession(input: CreateSessionInput): Promise<ProviderSessionMetadata>;
  getSession(providerSessionId: string): Promise<ProviderSessionMetadata>;
  stopSession(providerSessionId: string): Promise<ProviderSessionMetadata>;
  keepAlive?(providerSessionId: string): Promise<ProviderSessionMetadata>;
  setRecorderMode?(
    providerSessionId: string,
    mode: "off" | "record" | "verify",
  ): Promise<ProviderSessionMetadata>;
  resolveAmbiguity?(
    providerSessionId: string,
    input: {
      runId?: string | null;
      stepId?: string | null;
      selectedIndex: number;
      resolutionMethod?: string;
    },
  ): Promise<{ ok: boolean; selectedIndex: number; sessionId: string; status?: string }>;
  testLocator?(
    providerSessionId: string,
    input: { locatorType?: string; value?: string },
  ): Promise<{
    count: number;
    locatorType: string;
    previews: Array<Record<string, unknown>>;
    sessionId: string;
    value: string;
  }>;
  getLiveView(providerSessionId: string): Promise<{ liveViewUrl: string | null }>;
  getLogs(providerSessionId: string): Promise<string[]>;
  getArtifacts(providerSessionId: string): Promise<ProviderSessionArtifacts>;
  getEvents(providerSessionId: string): Promise<ProviderSessionEvent[]>;
  runSteps(
    providerSessionId: string,
    input: ProviderRunInput,
  ): Promise<ProviderRunResult>;
}
