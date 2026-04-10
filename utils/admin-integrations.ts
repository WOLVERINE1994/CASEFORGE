export type IntegrationCategory =
  | "ALM"
  | "QA Management"
  | "Automation"
  | "Communication";

export type IntegrationHealthStatus =
  | "unknown"
  | "healthy"
  | "warning"
  | "error"
  | "disabled";

export type IntegrationConnectionState =
  | "connected"
  | "not-connected"
  | "needs-check";

export type IntegrationFieldDefinition = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  helperText?: string;
};

export type IntegrationProviderDefinition = {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  capabilities: string[];
  fields: IntegrationFieldDefinition[];
};

export type IntegrationConfigRecord = {
  providerId: string;
  enabled: boolean;
  values: Record<string, string>;
  lastCheckedAt?: string;
  healthStatus: IntegrationHealthStatus;
  healthMessage: string;
  updatedAt: string;
};

export type AdminIntegrationAuditEntry = {
  id: string;
  createdAt: string;
  providerId: string;
  providerName: string;
  action: string;
  detail: string;
};

export type AdminIntegrationState = {
  integrations: Record<string, IntegrationConfigRecord>;
  audit: AdminIntegrationAuditEntry[];
};

const STORAGE_KEY = "caseforge:admin-integrations";

export const integrationProviderCatalog: IntegrationProviderDefinition[] = [
  {
    id: "jira",
    name: "Jira",
    category: "ALM",
    description:
      "Issue tracking, project mapping, and release coordination for product and QA teams.",
    capabilities: ["Issue sync", "Project mapping", "Release handoff"],
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://your-domain.atlassian.net",
        required: true,
      },
      {
        key: "scope",
        label: "Project Key",
        placeholder: "WEBQA",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "qa-bot@company.com",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://jira/qa-bot-token",
        required: true,
        helperText:
          "Store a secret reference or token label here for now instead of raw credentials.",
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional ownership or rotation notes",
      },
    ],
  },
  {
    id: "azure-devops",
    name: "Azure DevOps",
    category: "ALM",
    description:
      "Backlog, work items, and release visibility for teams operating inside Azure DevOps.",
    capabilities: ["Work item sync", "Project mapping", "Release coordination"],
    fields: [
      {
        key: "baseUrl",
        label: "Organization URL",
        placeholder: "https://dev.azure.com/your-org",
        required: true,
      },
      {
        key: "scope",
        label: "Project Name",
        placeholder: "QA Platform",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "qa-bot@company.com",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://ado/qa-bot-pat",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional ownership or rotation notes",
      },
    ],
  },
  {
    id: "testrail",
    name: "TestRail",
    category: "QA Management",
    description:
      "Centralize suite ownership, test run sync, and execution reporting for QA teams.",
    capabilities: ["Suite mapping", "Run sync", "Execution reporting"],
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://your-company.testrail.io",
        required: true,
      },
      {
        key: "scope",
        label: "Project or Suite",
        placeholder: "Checkout Reliability",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "qa-ops@company.com",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://testrail/api-token",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional ownership or run-sync notes",
      },
    ],
  },
  {
    id: "xray",
    name: "Xray",
    category: "QA Management",
    description:
      "Connect Jira-native test management for traceability, coverage, and execution flows.",
    capabilities: ["Test issue mapping", "Execution import", "Coverage traceability"],
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://your-domain.atlassian.net",
        required: true,
      },
      {
        key: "scope",
        label: "Project Key",
        placeholder: "QAOPS",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "xray-bot@company.com",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://xray/client-secret",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional ownership or API notes",
      },
    ],
  },
  {
    id: "zephyr",
    name: "Zephyr",
    category: "QA Management",
    description:
      "Manage test repository sync and execution handoff for Jira-connected QA operations.",
    capabilities: ["Repository sync", "Execution import", "Project mapping"],
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://your-domain.atlassian.net",
        required: true,
      },
      {
        key: "scope",
        label: "Project Key",
        placeholder: "MOBILEQA",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "zephyr-bot@company.com",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://zephyr/api-key",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional plugin or rotation notes",
      },
    ],
  },
  {
    id: "qtest",
    name: "qTest",
    category: "QA Management",
    description:
      "Track enterprise QA repository structure and synchronize execution ownership.",
    capabilities: ["Repository sync", "Execution import", "Project mapping"],
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://company.qtestnet.com",
        required: true,
      },
      {
        key: "scope",
        label: "Project Name",
        placeholder: "Platform QA",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "qtest-bot@company.com",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://qtest/api-token",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional ownership or environment notes",
      },
    ],
  },
  {
    id: "github-actions",
    name: "GitHub Actions",
    category: "Automation",
    description:
      "Automation and CI pipeline context for execution evidence and workflow health.",
    capabilities: ["Run import", "Workflow mapping", "Evidence links"],
    fields: [
      {
        key: "baseUrl",
        label: "Repository URL",
        placeholder: "https://github.com/company/repo",
        required: true,
      },
      {
        key: "scope",
        label: "Workflow or Environment",
        placeholder: "smoke-tests / production",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "github-app:qa-ops",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://github/app-key",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional repo or branch notes",
      },
    ],
  },
  {
    id: "jenkins",
    name: "Jenkins",
    category: "Automation",
    description:
      "Legacy and enterprise CI automation visibility for job health and execution evidence.",
    capabilities: ["Job mapping", "Run import", "Artifact links"],
    fields: [
      {
        key: "baseUrl",
        label: "Jenkins URL",
        placeholder: "https://jenkins.company.com",
        required: true,
      },
      {
        key: "scope",
        label: "Job or Folder",
        placeholder: "qa/checkout-smoke",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "svc-qa-jenkins",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://jenkins/api-token",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional node or ownership notes",
      },
    ],
  },
  {
    id: "gitlab-ci",
    name: "GitLab CI",
    category: "Automation",
    description:
      "Pipeline visibility, execution import, and repository workflow context for QA automation.",
    capabilities: ["Pipeline import", "Workflow mapping", "Evidence links"],
    fields: [
      {
        key: "baseUrl",
        label: "GitLab URL",
        placeholder: "https://gitlab.com/company/group/project",
        required: true,
      },
      {
        key: "scope",
        label: "Pipeline or Environment",
        placeholder: "nightly-regression",
        required: true,
      },
      {
        key: "account",
        label: "Service Account",
        placeholder: "qa-bot@gitlab",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://gitlab/pipeline-token",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional branch or environment notes",
      },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    category: "Communication",
    description:
      "Operational alerts and reviewer notification routing for release and execution signals.",
    capabilities: ["Alert routing", "Channel notifications", "Ops visibility"],
    fields: [
      {
        key: "baseUrl",
        label: "Workspace URL",
        placeholder: "https://company.slack.com",
        required: true,
      },
      {
        key: "scope",
        label: "Default Channel",
        placeholder: "#qa-operations",
        required: true,
      },
      {
        key: "account",
        label: "App Identity",
        placeholder: "CaseForge QA Bot",
        required: true,
      },
      {
        key: "credentialReference",
        label: "Credential Reference",
        placeholder: "vault://slack/bot-token",
        required: true,
      },
      {
        key: "notes",
        label: "Admin Notes",
        placeholder: "Optional routing notes",
      },
    ],
  },
];

const nowIso = () => new Date().toISOString();

const buildDefaultRecord = (providerId: string): IntegrationConfigRecord => ({
  providerId,
  enabled: false,
  values: {},
  healthStatus: "unknown",
  healthMessage: "Not checked yet.",
  updatedAt: nowIso(),
});

export const defaultAdminIntegrationState = (): AdminIntegrationState => ({
  integrations: Object.fromEntries(
    integrationProviderCatalog.map((provider) => [
      provider.id,
      buildDefaultRecord(provider.id),
    ])
  ),
  audit: [],
});

const isValidState = (value: unknown): value is AdminIntegrationState =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "integrations" in value &&
      "audit" in value
  );

export const loadAdminIntegrationState = (): AdminIntegrationState => {
  if (typeof window === "undefined") {
    return defaultAdminIntegrationState();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return defaultAdminIntegrationState();
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (!isValidState(parsed)) {
      return defaultAdminIntegrationState();
    }

    const defaultState = defaultAdminIntegrationState();
    return {
      integrations: {
        ...defaultState.integrations,
        ...parsed.integrations,
      },
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    };
  } catch {
    return defaultAdminIntegrationState();
  }
};

export const saveAdminIntegrationState = (state: AdminIntegrationState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const maskCredentialReference = (value?: string) => {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "Missing";
  }

  if (trimmed.length <= 6) {
    return `${trimmed.slice(0, 2)}**`;
  }

  return `${trimmed.slice(0, 4)}****${trimmed.slice(-2)}`;
};

export const getProviderById = (providerId: string) =>
  integrationProviderCatalog.find((provider) => provider.id === providerId) ?? null;

export const evaluateIntegrationRecord = (
  provider: IntegrationProviderDefinition,
  record: IntegrationConfigRecord
): {
  connectionState: IntegrationConnectionState;
  healthStatus: IntegrationHealthStatus;
  healthMessage: string;
  missingFieldLabels: string[];
} => {
  if (!record.enabled) {
    return {
      connectionState: "not-connected",
      healthStatus: "disabled",
      healthMessage: "Disabled by admin.",
      missingFieldLabels: [],
    };
  }

  const missingFieldLabels = provider.fields
    .filter((field) => field.required)
    .filter((field) => !record.values[field.key]?.trim())
    .map((field) => field.label);

  if (missingFieldLabels.length > 0) {
    return {
      connectionState: "not-connected",
      healthStatus: "warning",
      healthMessage: `Missing: ${missingFieldLabels.join(", ")}.`,
      missingFieldLabels,
    };
  }

  if (!record.lastCheckedAt) {
    return {
      connectionState: "needs-check",
      healthStatus: "unknown",
      healthMessage: "Ready to test when you want to validate the setup.",
      missingFieldLabels: [],
    };
  }

  return {
    connectionState: "connected",
    healthStatus: record.healthStatus === "unknown" ? "healthy" : record.healthStatus,
    healthMessage: record.healthMessage || "Configuration looks ready.",
    missingFieldLabels: [],
  };
};

export const createAdminAuditEntry = (
  providerId: string,
  providerName: string,
  action: string,
  detail: string
): AdminIntegrationAuditEntry => ({
  id:
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${providerId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  createdAt: nowIso(),
  providerId,
  providerName,
  action,
  detail,
});

