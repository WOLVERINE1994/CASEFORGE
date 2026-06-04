export type AutomationScenarioStatus = "draft" | "active" | "paused" | "archived";
export type AutomationRunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "canceled";
export type AutomationSessionStatus =
  | "creating"
  | "idle"
  | "running"
  | "broken"
  | "terminating"
  | "terminated"
  | "requested"
  | "starting"
  | "ready"
  | "recording"
  | "closed"
  | "failed";
export type AutomationSessionProviderId =
  | "managed_browser"
  | "self_hosted_playwright"
  | "optional_local_connector";
export type AutomationArtifactType =
  | "trace"
  | "video"
  | "log"
  | "network"
  | "screenshot"
  | "auth_state";

export type AutomationLocatorStrategy =
  | "role"
  | "label"
  | "text"
  | "alt"
  | "title"
  | "testid"
  | "placeholder"
  | "css"
  | "xpath";

export type AutomationLocatorCandidate = {
  id?: string;
  strategy: AutomationLocatorStrategy;
  value: string;
  score: number;
  isUnique?: boolean;
  rank?: number;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type AutomationHealingStatus = "not_reviewed" | "accepted" | "discarded";

export type AutomationHealingEvent = {
  id: string;
  runId: string;
  sessionId?: string | null;
  actionId?: string | null;
  stepId?: string | null;
  commandId?: string | null;
  originalLocator?: Record<string, unknown> | null;
  healedLocator?: Record<string, unknown> | null;
  confidenceScore?: number | null;
  healReason?: string;
  suggestedCandidates?: Array<Record<string, unknown>>;
  status: AutomationHealingStatus;
  userAccepted?: boolean;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  discardedAt?: string | null;
  timestamp: string;
};

export type AutomationTarget = {
  type: "smart" | "manual";
  value: string;
  locatorType?: string;
  elementKind?: string;
  displayName?: string;
  operator?: string;
};

export type AutomationStep = {
  id?: string;
  action: string;
  description: string;
  target: AutomationTarget;
  options?: Record<string, unknown>;
  inputValue?: string;
  expectedValue?: string;
  assertionType?: string;
  commandText?: string;
  element?: Record<string, unknown>;
  locatorCandidates?: AutomationLocatorCandidate[];
};

export type AutomationScenario = {
  id: string;
  projectId: string;
  version: number;
  name: string;
  description: string;
  status: AutomationScenarioStatus;
  tags: string[];
  metadata?: Record<string, unknown>;
  steps: AutomationStep[];
  updatedAt: string;
};

export type AutomationAction = {
  id: string;
  projectId: string;
  version: number;
  createdFromScenarioId?: string | null;
  name: string;
  description: string;
  tags: string[];
  steps: AutomationStep[];
  updatedAt: string;
};

export type AutomationRecycleBinItemType = "scenario" | "action" | "suite" | "report";

export type AutomationRecycleBinItem = {
  id: string;
  type: AutomationRecycleBinItemType;
  projectId: string;
  name: string;
  description: string;
  deletedAt: string;
  deletedBy?: string | null;
  previousStatus?: string | null;
  updatedAt: string;
};

export type AutomationSession = {
  id: string;
  projectId: string;
  version?: number;
  scenarioId?: string | null;
  environmentId?: string | null;
  provider: AutomationSessionProviderId;
  providerSessionId?: string | null;
  status: AutomationSessionStatus;
  liveViewUrl?: string | null;
  eventStreamUrl?: string | null;
  expiresAt?: string | null;
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type AutomationRun = {
  id: string;
  projectId: string;
  version?: number;
  scenarioId?: string | null;
  sessionId?: string | null;
  environmentId?: string | null;
  status: AutomationRunStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  summary: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type AutomationArtifact = {
  id: string;
  projectId: string;
  version: number;
  runId?: string | null;
  type: AutomationArtifactType;
  label: string;
  uri: string;
  downloadUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  encrypted: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
