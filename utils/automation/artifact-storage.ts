import type { AutomationArtifact, AutomationArtifactType } from "./types";

export type AutomationArtifactInput = Omit<
  AutomationArtifact,
  "createdAt" | "downloadUrl" | "id" | "projectId" | "updatedAt" | "version"
>;

const defaultRetentionDays = 30;

function retainUntil(days = defaultRetentionDays) {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

function artifactMetadata(
  type: AutomationArtifactType,
  metadata?: Record<string, unknown>,
) {
  return {
    retention: {
      deleteAfter: retainUntil(),
      days: defaultRetentionDays,
      policy: type === "auth_state" ? "secret-reference" : "standard-run-evidence",
    },
    ...metadata,
  };
}

export function createRunArtifactManifest(runId: string): AutomationArtifactInput[] {
  return [
    {
      encrypted: false,
      label: "Trace",
      metadata: artifactMetadata("trace", { downloadable: true }),
      mimeType: "application/zip",
      runId,
      type: "trace",
      uri: `automation://runs/${runId}/trace.zip`,
    },
    {
      encrypted: false,
      label: "Screenshots",
      metadata: artifactMetadata("screenshot", { downloadable: true }),
      mimeType: "application/json",
      runId,
      type: "screenshot",
      uri: `automation://runs/${runId}/screenshots.json`,
    },
    {
      encrypted: false,
      label: "Session Recording",
      metadata: artifactMetadata("video", { downloadable: true }),
      mimeType: "video/webm",
      runId,
      type: "video",
      uri: `automation://runs/${runId}/recording.webm`,
    },
    {
      encrypted: false,
      label: "Console Logs",
      metadata: artifactMetadata("log", { downloadable: true }),
      mimeType: "text/plain",
      runId,
      type: "log",
      uri: `automation://runs/${runId}/console.log`,
    },
    {
      encrypted: false,
      label: "Network Logs",
      metadata: artifactMetadata("network", { downloadable: true }),
      mimeType: "application/json",
      runId,
      type: "network",
      uri: `automation://runs/${runId}/network.har`,
    },
  ];
}

export function createAuthStateArtifact(
  runId: string,
  secretReference: string,
): AutomationArtifactInput {
  return {
    encrypted: true,
    label: "Browser Auth State",
    metadata: artifactMetadata("auth_state", {
      secretReference: true,
    }),
    mimeType: "application/octet-stream",
    runId,
    type: "auth_state",
    uri: secretReference.startsWith("secret://")
      ? secretReference
      : `secret://automation-auth/${secretReference}`,
  };
}

export function normalizeArtifactInput(
  artifact: Partial<AutomationArtifactInput>,
): AutomationArtifactInput | null {
  if (
    artifact.type !== "trace" &&
    artifact.type !== "video" &&
    artifact.type !== "log" &&
    artifact.type !== "network" &&
    artifact.type !== "screenshot" &&
    artifact.type !== "auth_state"
  ) {
    return null;
  }
  if (artifact.type === "auth_state" && !artifact.encrypted) {
    throw new Error("Browser auth state artefacts must be encrypted secret references.");
  }
  const uri = typeof artifact.uri === "string" ? artifact.uri : "";
  if (artifact.type === "auth_state" && !uri.startsWith("secret://")) {
    throw new Error("Browser auth state must use a secret:// reference.");
  }
  if (!uri) return null;

  return {
    encrypted: Boolean(artifact.encrypted),
    label: artifact.label || artifact.type,
    metadata: artifactMetadata(artifact.type, artifact.metadata),
    mimeType: artifact.mimeType ?? null,
    runId: artifact.runId ?? null,
    sizeBytes: artifact.sizeBytes ?? null,
    type: artifact.type,
    uri,
  };
}

export function toDownloadUrl(artifact: Pick<AutomationArtifact, "id" | "uri">) {
  if (/^https?:\/\//i.test(artifact.uri)) return artifact.uri;
  if (artifact.uri.startsWith("automation://")) {
    return `/api/automation/artifacts/${encodeURIComponent(artifact.id)}/download`;
  }
  return null;
}
