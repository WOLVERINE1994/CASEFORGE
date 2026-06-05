import type { AutomationSessionProviderId } from "./types";
import {
  assertProviderAllowed,
  getSessionProvider,
} from "./session-providers";
import {
  createSessionRecord,
  getSessionRecord,
  updateSessionRecord,
} from "./store";

export async function requestAutomationSession(input: {
  projectId: string;
  scenarioId?: string | null;
  environmentId?: string | null;
  headless?: boolean;
  httpCredentials?: {
    password: string;
    username: string;
  } | null;
  targetUrl?: string;
  providerId?: string;
  viewport?: {
    deviceScaleFactor?: number;
    height: number;
    isMobile?: boolean;
    width: number;
  } | null;
}) {
  const providerId = normalizeProviderId(input.providerId);
  assertTargetReachableFromProvider(input.targetUrl, providerId);
  assertProviderAllowed(providerId);
  const provider = getSessionProvider(providerId);
  const providerSession = await provider.createSession(input);

  return createSessionRecord({
    capabilities: providerSession.capabilities,
    environmentId: input.environmentId,
    expiresAt: providerSession.expiresAt,
    liveViewUrl: providerSession.liveViewUrl,
    metadata: {
      ...providerSession.metadata,
      eventStreamUrl:
        providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
      headless: input.headless ?? null,
      providerStatus: providerSession.status,
      streamUrl: providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
    },
    projectId: input.projectId,
    provider: providerSession.provider,
    providerSessionId: providerSession.providerSessionId,
    scenarioId: input.scenarioId,
    status: providerSession.status,
  });
}

export async function refreshAutomationSession(sessionId: string) {
  const session = await getSessionRecord(sessionId);
  if (!session) return null;
  if (!session.providerSessionId) return session;

  const provider = getSessionProvider(session.provider);
  const providerSession = await provider.getSession(session.providerSessionId);
  return updateSessionRecord(session.id, {
    capabilities: providerSession.capabilities,
    expiresAt: providerSession.expiresAt,
    liveViewUrl: providerSession.liveViewUrl,
    metadata: {
      ...session.metadata,
      ...providerSession.metadata,
      eventStreamUrl:
        providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
      providerStatus: providerSession.status,
      streamUrl: providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
    },
    status: providerSession.status,
  });
}

export async function stopAutomationSession(sessionId: string) {
  const session = await getSessionRecord(sessionId);
  if (!session) return null;
  if (!session.providerSessionId) {
    return updateSessionRecord(session.id, { status: "terminated" });
  }
  const provider = getSessionProvider(session.provider);
  const providerSession = await provider.stopSession(session.providerSessionId);
  return updateSessionRecord(session.id, {
    liveViewUrl: providerSession.liveViewUrl,
    metadata: {
      ...session.metadata,
      ...providerSession.metadata,
      eventStreamUrl:
        providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
      providerStatus: providerSession.status,
      streamUrl: providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
    },
    status: providerSession.status,
  });
}

export async function keepAliveAutomationSession(sessionId: string) {
  const session = await getSessionRecord(sessionId);
  if (!session) return null;
  if (!session.providerSessionId) {
    return updateSessionRecord(session.id, {
      metadata: { ...session.metadata, lastActivityAt: new Date().toISOString() },
    });
  }
  const provider = getSessionProvider(session.provider);
  const providerSession = provider.keepAlive
    ? await provider.keepAlive(session.providerSessionId)
    : await provider.getSession(session.providerSessionId);
  return updateSessionRecord(session.id, {
    capabilities: providerSession.capabilities,
    expiresAt: providerSession.expiresAt,
    liveViewUrl: providerSession.liveViewUrl,
    metadata: {
      ...session.metadata,
      ...providerSession.metadata,
      eventStreamUrl:
        providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
      providerStatus: providerSession.status,
      streamUrl: providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
    },
    status: providerSession.status,
  });
}

export async function setAutomationSessionRecorderMode(
  sessionId: string,
  mode: "off" | "record" | "verify",
) {
  const session = await getSessionRecord(sessionId);
  if (!session) return null;
  if (!session.providerSessionId) {
    return updateSessionRecord(session.id, {
      metadata: { ...session.metadata, recorderMode: mode },
    });
  }
  const provider = getSessionProvider(session.provider);
  const providerSession = provider.setRecorderMode
    ? await provider.setRecorderMode(session.providerSessionId, mode)
    : await provider.getSession(session.providerSessionId);
  return updateSessionRecord(session.id, {
    capabilities: providerSession.capabilities,
    expiresAt: providerSession.expiresAt,
    liveViewUrl: providerSession.liveViewUrl,
    metadata: {
      ...session.metadata,
      ...providerSession.metadata,
      eventStreamUrl:
        providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
      providerStatus: providerSession.status,
      recorderMode: mode,
      streamUrl: providerSession.streamUrl ?? providerSession.eventStreamUrl ?? null,
    },
    status: providerSession.status,
  });
}

export async function resolveAutomationSessionAmbiguity(
  sessionId: string,
  input: {
    runId?: string | null;
    stepId?: string | null;
    selectedIndex: number;
    resolutionMethod?: string;
  },
) {
  const session = await getSessionRecord(sessionId);
  if (!session?.providerSessionId) return null;
  const provider = getSessionProvider(session.provider);
  if (!provider.resolveAmbiguity) {
    throw new Error("This browser provider cannot resume ambiguous commands.");
  }
  return provider.resolveAmbiguity(session.providerSessionId, input);
}

export async function testAutomationSessionLocator(
  sessionId: string,
  input: { locatorType?: string; value?: string },
) {
  const session = await getSessionRecord(sessionId);
  if (!session?.providerSessionId) return null;
  const provider = getSessionProvider(session.provider);
  if (!provider.testLocator) {
    throw new Error("This browser provider cannot test locators.");
  }
  return provider.testLocator(session.providerSessionId, input);
}

export async function getAutomationSessionLogs(sessionId: string) {
  const session = await getSessionRecord(sessionId);
  if (!session?.providerSessionId) return [];
  return getSessionProvider(session.provider).getLogs(session.providerSessionId);
}

export async function getAutomationSessionArtifacts(sessionId: string) {
  const session = await getSessionRecord(sessionId);
  if (!session?.providerSessionId) return [];
  return getSessionProvider(session.provider).getArtifacts(session.providerSessionId);
}

export async function getAutomationSessionEvents(sessionId: string) {
  const session = await getSessionRecord(sessionId);
  if (!session?.providerSessionId) return [];
  return getSessionProvider(session.provider).getEvents(session.providerSessionId);
}

export async function runAutomationSessionSteps(
  sessionId: string,
  input: {
    actionId?: string | null;
    closeOnComplete?: boolean;
    executionMode?: "interactive_persistent" | "ephemeral_ci";
    keepSessionOpen?: boolean;
    runId?: string | null;
    steps: unknown[];
    suppressRecording?: boolean;
  },
) {
  let session = await getSessionRecord(sessionId);
  if (!session?.providerSessionId) return null;
  if (session.status === "running" || session.status === "recording") {
    const refreshed = await refreshAutomationSession(session.id).catch(() => null);
    if (refreshed) session = refreshed;
  }
  if (session.status === "running" || session.status === "recording") {
    const error = new Error("SESSION_BUSY");
    (error as Error & { code?: string }).code = "SESSION_BUSY";
    throw error;
  }
  const providerSessionId = session.providerSessionId;
  if (!providerSessionId) return null;
  await updateSessionRecord(session.id, {
    metadata: {
      ...session.metadata,
      providerStatus: "running",
      lastActivityAt: new Date().toISOString(),
      lastRunId: input.runId ?? null,
    },
    status: "running",
  });
  try {
    const result = await getSessionProvider(session.provider).runSteps(providerSessionId, input);
    return result;
  } catch (error) {
    await updateSessionRecord(session.id, {
      metadata: {
        ...session.metadata,
        providerStatus: (error as Error & { code?: string }).code === "SESSION_BUSY" ? "running" : "broken",
        lastActivityAt: new Date().toISOString(),
        lastRunId: input.runId ?? null,
      },
      status: (error as Error & { code?: string }).code === "SESSION_BUSY" ? "running" : "broken",
    });
    throw error;
  }
}

function assertTargetReachableFromProvider(
  targetUrl: string | undefined,
  providerId: AutomationSessionProviderId,
) {
  if (
    providerId === "optional_local_connector" ||
    process.env.VERCEL !== "1" ||
    !targetUrl
  ) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");
  const isPrivateIp =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  if (isLocalhost || isPrivateIp) {
    throw new Error(
      "Vercel automation cannot open localhost or private-network URLs. Use a publicly reachable URL, or run the flow with the CaseForge desktop/local connector.",
    );
  }
}

function normalizeProviderId(value?: string): AutomationSessionProviderId {
  if (
    value === "managed_browser" ||
    value === "self_hosted_playwright" ||
    value === "optional_local_connector"
  ) {
    return value;
  }
  return getSessionProvider().id;
}
