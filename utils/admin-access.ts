export type AdminAccessRole = "admin" | "manager" | "tester" | "reviewer";

export type AdminAccessCapability =
  | "manage_integrations"
  | "manage_project_mappings"
  | "view_admin_audit"
  | "manage_reviewer_defaults"
  | "export_reports";

export type AdminAccessPolicyState = {
  policies: Record<AdminAccessRole, Record<AdminAccessCapability, boolean>>;
  updatedAt: string;
};

const STORAGE_KEY = "caseforge:admin-access-policies";

export const capabilityLabels: Record<AdminAccessCapability, string> = {
  manage_integrations: "Manage integrations",
  manage_project_mappings: "Manage project mappings",
  view_admin_audit: "View admin audit",
  manage_reviewer_defaults: "Manage reviewer defaults",
  export_reports: "Export reports",
};

export const defaultAdminAccessPolicyState = (): AdminAccessPolicyState => ({
  policies: {
    admin: {
      manage_integrations: true,
      manage_project_mappings: true,
      view_admin_audit: true,
      manage_reviewer_defaults: true,
      export_reports: true,
    },
    manager: {
      manage_integrations: false,
      manage_project_mappings: true,
      view_admin_audit: true,
      manage_reviewer_defaults: false,
      export_reports: true,
    },
    tester: {
      manage_integrations: false,
      manage_project_mappings: false,
      view_admin_audit: false,
      manage_reviewer_defaults: false,
      export_reports: true,
    },
    reviewer: {
      manage_integrations: false,
      manage_project_mappings: false,
      view_admin_audit: false,
      manage_reviewer_defaults: false,
      export_reports: false,
    },
  },
  updatedAt: new Date().toISOString(),
});

export const loadAdminAccessPolicyState = (): AdminAccessPolicyState => {
  if (typeof window === "undefined") {
    return defaultAdminAccessPolicyState();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return defaultAdminAccessPolicyState();
    }

    const parsed = JSON.parse(rawValue) as AdminAccessPolicyState;
    const defaults = defaultAdminAccessPolicyState();
    return {
      updatedAt:
        typeof parsed?.updatedAt === "string"
          ? parsed.updatedAt
          : defaults.updatedAt,
      policies: {
        admin: {
          ...defaults.policies.admin,
          ...(parsed?.policies?.admin ?? {}),
        },
        manager: {
          ...defaults.policies.manager,
          ...(parsed?.policies?.manager ?? {}),
        },
        tester: {
          ...defaults.policies.tester,
          ...(parsed?.policies?.tester ?? {}),
        },
        reviewer: {
          ...defaults.policies.reviewer,
          ...(parsed?.policies?.reviewer ?? {}),
        },
      },
    };
  } catch {
    return defaultAdminAccessPolicyState();
  }
};

export const saveAdminAccessPolicyState = (state: AdminAccessPolicyState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

