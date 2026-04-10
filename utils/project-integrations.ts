import {
  evaluateIntegrationRecord,
  getProviderById,
  loadAdminIntegrationState,
  type IntegrationHealthStatus,
} from "./admin-integrations";

export type ProjectIntegrationMappingRecord = {
  providerId: string;
  enabled: boolean;
  projectScope: string;
  defaultBoard: string;
  environment: string;
  owner: string;
  notes: string;
  updatedAt: string;
};

export type ProjectIntegrationState = {
  projectKey: string;
  mappings: Record<string, ProjectIntegrationMappingRecord>;
};

export type ProjectIntegrationReadiness = {
  status: "ready" | "needs-admin" | "disabled";
  healthStatus: IntegrationHealthStatus;
  message: string;
};

const storageKey = (projectKey: string) =>
  `caseforge:project-integrations:${projectKey.toLowerCase()}`;

const defaultMapping = (providerId: string): ProjectIntegrationMappingRecord => ({
  providerId,
  enabled: false,
  projectScope: "",
  defaultBoard: "",
  environment: "",
  owner: "",
  notes: "",
  updatedAt: new Date().toISOString(),
});

const defaultState = (projectKey: string): ProjectIntegrationState => ({
  projectKey,
  mappings: {},
});

export const loadProjectIntegrationState = (
  projectKey: string
): ProjectIntegrationState => {
  if (typeof window === "undefined") {
    return defaultState(projectKey);
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey(projectKey));
    if (!rawValue) {
      return defaultState(projectKey);
    }

    const parsed = JSON.parse(rawValue) as ProjectIntegrationState;
    return {
      projectKey,
      mappings:
        parsed && parsed.mappings && typeof parsed.mappings === "object"
          ? parsed.mappings
          : {},
    };
  } catch {
    return defaultState(projectKey);
  }
};

export const saveProjectIntegrationState = (state: ProjectIntegrationState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey(state.projectKey), JSON.stringify(state));
};

export const getProjectIntegrationMapping = (
  state: ProjectIntegrationState,
  providerId: string
) => state.mappings[providerId] ?? defaultMapping(providerId);

export const evaluateProjectIntegrationReadiness = (
  projectKey: string,
  providerId: string,
  mapping: ProjectIntegrationMappingRecord
): ProjectIntegrationReadiness => {
  if (!mapping.enabled) {
    return {
      status: "disabled",
      healthStatus: "disabled",
      message: "Disabled for this project.",
    };
  }

  const provider = getProviderById(providerId);
  if (!provider) {
    return {
      status: "needs-admin",
      healthStatus: "error",
      message: "Provider is not available in the admin catalog.",
    };
  }

  const adminState = loadAdminIntegrationState();
  const adminRecord = adminState.integrations[providerId];
  const adminEvaluation = evaluateIntegrationRecord(provider, adminRecord);

  if (!adminRecord?.enabled) {
    return {
      status: "needs-admin",
      healthStatus: "warning",
      message: "Enable this provider in Settings > Admin before using it here.",
    };
  }

  if (adminEvaluation.connectionState !== "connected") {
    return {
      status: "needs-admin",
      healthStatus: "warning",
      message: "The admin setup still needs a successful provider check.",
    };
  }

  if (!mapping.projectScope.trim()) {
    return {
      status: "needs-admin",
      healthStatus: "warning",
      message: `Add a ${provider.name} project mapping for ${projectKey}.`,
    };
  }

  return {
    status: "ready",
    healthStatus: "healthy",
    message: "Admin setup and project mapping are ready.",
  };
};

export const listAdminEnabledProviderIds = () => {
  const adminState = loadAdminIntegrationState();
  return Object.values(adminState.integrations)
    .filter((record) => record.enabled)
    .map((record) => record.providerId);
};

