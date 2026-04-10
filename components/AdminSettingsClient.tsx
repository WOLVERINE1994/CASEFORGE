"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppSidebar from "./AppSidebar";
import ResponsiveShell from "./ResponsiveShell";
import type { UserRecord } from "../services/user-service";
import {
  capabilityLabels,
  loadAdminAccessPolicyState,
  saveAdminAccessPolicyState,
  type AdminAccessCapability,
  type AdminAccessPolicyState,
  type AdminAccessRole,
} from "../utils/admin-access";
import {
  createAdminAuditEntry,
  evaluateIntegrationRecord,
  getProviderById,
  integrationProviderCatalog,
  loadAdminIntegrationState,
  maskCredentialReference,
  saveAdminIntegrationState,
  type AdminIntegrationState,
  type IntegrationConfigRecord,
  type IntegrationHealthStatus,
} from "../utils/admin-integrations";
import { formatUtcDateTime } from "../utils/date-format";

const categoryTone = {
  ALM: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  "QA Management":
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  Automation:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  Communication:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
} as const;

const connectionTone = {
  connected:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  "not-connected":
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  "needs-check":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
} as const;

const healthTone: Record<IntegrationHealthStatus, string> = {
  unknown:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  healthy:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  error:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  disabled:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

const statusLabel = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const roleTone: Record<AdminAccessRole, string> = {
  admin:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  manager:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  tester:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  reviewer:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
};

export default function AdminSettingsClient() {
  const [adminState, setAdminState] = useState<AdminIntegrationState>(() =>
    loadAdminIntegrationState()
  );
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(() => {
    const loadedState = loadAdminIntegrationState();
    return Object.fromEntries(
      integrationProviderCatalog.map((provider) => [
        provider.id,
        loadedState.integrations[provider.id]?.values ?? {},
      ])
    );
  });
  const [notice, setNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [accessPolicyState, setAccessPolicyState] = useState<AdminAccessPolicyState>(() =>
    loadAdminAccessPolicyState()
  );
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userDirectoryState, setUserDirectoryState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        const payload = (await response.json()) as {
          users?: UserRecord[];
          status?: string;
        };

        if (cancelled) {
          return;
        }

        if (response.ok && Array.isArray(payload.users)) {
          setUsers(payload.users);
          setUserDirectoryState("ready");
          return;
        }

        setUserDirectoryState("unavailable");
      } catch {
        if (!cancelled) {
          setUserDirectoryState("unavailable");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistState = (
    nextState: AdminIntegrationState,
    nextNotice?: { tone: "info" | "success" | "error"; text: string }
  ) => {
    setAdminState(nextState);
    saveAdminIntegrationState(nextState);
    if (nextNotice) {
      setNotice(nextNotice);
    }
  };

  const updateAccessPolicy = (
    role: AdminAccessRole,
    capability: AdminAccessCapability,
    enabled: boolean
  ) => {
    const nextState: AdminAccessPolicyState = {
      updatedAt: new Date().toISOString(),
      policies: {
        ...accessPolicyState.policies,
        [role]: {
          ...accessPolicyState.policies[role],
          [capability]: enabled,
        },
      },
    };

    setAccessPolicyState(nextState);
    saveAdminAccessPolicyState(nextState);
    setNotice({
      tone: "info",
      text: `${role.charAt(0).toUpperCase() + role.slice(1)} access defaults updated.`,
    });
  };

  const updateDraft = (providerId: string, fieldKey: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? {}),
        [fieldKey]: value,
      },
    }));
  };

  const saveProviderDetails = (providerId: string) => {
    if (!adminState) {
      return;
    }

    const provider = getProviderById(providerId);
    if (!provider) {
      return;
    }

    const currentRecord = adminState.integrations[providerId];
    const nextValues = drafts[providerId] ?? {};
    const nextRecord: IntegrationConfigRecord = {
      ...currentRecord,
      values: nextValues,
      updatedAt: new Date().toISOString(),
      healthStatus: currentRecord.enabled ? "unknown" : "disabled",
      healthMessage: currentRecord.enabled
        ? "Configuration updated. Run a connection check when you are ready."
        : "Disabled by admin.",
    };

    const nextAuditEntry = createAdminAuditEntry(
      provider.id,
      provider.name,
      "Configuration updated",
      "Saved integration details and credential references."
    );

    persistState(
      {
        integrations: {
          ...adminState.integrations,
          [providerId]: nextRecord,
        },
        audit: [nextAuditEntry, ...adminState.audit].slice(0, 40),
      },
      {
        tone: "success",
        text: `${provider.name} configuration saved.`,
      }
    );
  };

  const toggleProviderEnabled = (providerId: string) => {
    if (!adminState) {
      return;
    }

    const provider = getProviderById(providerId);
    if (!provider) {
      return;
    }

    const currentRecord = adminState.integrations[providerId];
    const enabled = !currentRecord.enabled;
    const nextRecord: IntegrationConfigRecord = {
      ...currentRecord,
      enabled,
      updatedAt: new Date().toISOString(),
      healthStatus: enabled ? "unknown" : "disabled",
      healthMessage: enabled
        ? "Enabled. Run a connection check to validate the current setup."
        : "Disabled by admin.",
    };

    const nextAuditEntry = createAdminAuditEntry(
      provider.id,
      provider.name,
      enabled ? "Enabled" : "Disabled",
      enabled
        ? "Integration enabled for future project mapping and health checks."
        : "Integration disabled at the admin layer."
    );

    persistState(
      {
        integrations: {
          ...adminState.integrations,
          [providerId]: nextRecord,
        },
        audit: [nextAuditEntry, ...adminState.audit].slice(0, 40),
      },
      {
        tone: "info",
        text: `${provider.name} ${enabled ? "enabled" : "disabled"}.`,
      }
    );
  };

  const testProviderConnection = (providerId: string) => {
    if (!adminState) {
      return;
    }

    const provider = getProviderById(providerId);
    if (!provider) {
      return;
    }

    const baseRecord = adminState.integrations[providerId];
    const draftValues = drafts[providerId] ?? baseRecord.values;
    const draftRecord: IntegrationConfigRecord = {
      ...baseRecord,
      values: draftValues,
      updatedAt: new Date().toISOString(),
    };

    const evaluation = evaluateIntegrationRecord(provider, {
      ...draftRecord,
      enabled: draftRecord.enabled,
    });

    const nextRecord: IntegrationConfigRecord = {
      ...draftRecord,
      lastCheckedAt: new Date().toISOString(),
      healthStatus:
        evaluation.connectionState === "connected"
          ? "healthy"
          : evaluation.healthStatus === "disabled"
          ? "disabled"
          : "warning",
      healthMessage:
        evaluation.connectionState === "connected"
          ? "Configuration looks complete. Live provider ping can be wired in next."
          : evaluation.healthMessage,
    };

    const detail =
      evaluation.connectionState === "connected"
        ? "Configuration check passed with all required fields present."
        : `Configuration check found gaps: ${
            evaluation.missingFieldLabels.join(", ") || "integration disabled"
          }.`;

    const nextAuditEntry = createAdminAuditEntry(
      provider.id,
      provider.name,
      "Connection checked",
      detail
    );

    persistState(
      {
        integrations: {
          ...adminState.integrations,
          [providerId]: nextRecord,
        },
        audit: [nextAuditEntry, ...adminState.audit].slice(0, 40),
      },
      {
        tone: evaluation.connectionState === "connected" ? "success" : "error",
        text:
          evaluation.connectionState === "connected"
            ? `${provider.name} setup check passed.`
            : `${provider.name} needs attention before it is ready.`,
      }
    );
  };

  const resetProvider = (providerId: string) => {
    if (!adminState) {
      return;
    }

    const provider = getProviderById(providerId);
    if (!provider) {
      return;
    }

    const nextRecord: IntegrationConfigRecord = {
      providerId,
      enabled: false,
      values: {},
      lastCheckedAt: undefined,
      healthStatus: "unknown",
      healthMessage: "Not checked yet.",
      updatedAt: new Date().toISOString(),
    };

    setDrafts((current) => ({
      ...current,
      [providerId]: {},
    }));

    const nextAuditEntry = createAdminAuditEntry(
      provider.id,
      provider.name,
      "Reset",
      "Cleared the current integration setup references."
    );

    persistState(
      {
        integrations: {
          ...adminState.integrations,
          [providerId]: nextRecord,
        },
        audit: [nextAuditEntry, ...adminState.audit].slice(0, 40),
      },
      {
        tone: "info",
        text: `${provider.name} was reset to its default admin state.`,
      }
    );
  };

  const overview = useMemo(() => {
    const records = integrationProviderCatalog.map((provider) =>
      evaluateIntegrationRecord(provider, adminState.integrations[provider.id])
    );

    return {
      total: integrationProviderCatalog.length,
      enabled: Object.values(adminState.integrations).filter((record) => record.enabled)
        .length,
      connected: records.filter((record) => record.connectionState === "connected")
        .length,
      healthy: Object.values(adminState.integrations).filter(
        (record) => record.healthStatus === "healthy"
      ).length,
      attention: records.filter(
        (record) =>
          record.healthStatus === "warning" || record.healthStatus === "error"
      ).length,
    };
  }, [adminState]);

  const roleSummary = useMemo(() => {
    const counts = users.reduce<Record<AdminAccessRole, number>>(
      (accumulator, user) => {
        const role = user.role as AdminAccessRole;
        accumulator[role] = (accumulator[role] ?? 0) + 1;
        return accumulator;
      },
      {
        admin: 0,
        manager: 0,
        tester: 0,
        reviewer: 0,
      }
    );

    return counts;
  }, [users]);

  if (!overview) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
        <ResponsiveShell
          mobileTitle="Admin"
          mobileSubtitle="Integration controls"
          desktopSidebar={<AppSidebar />}
          mobileSidebar={<AppSidebar />}
          storageKey="caseforge:drawer:admin"
        >
          <div className="rounded-[24px] border border-dashed border-zinc-300 bg-white/80 px-6 py-10 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
            Loading admin integration settings...
          </div>
        </ResponsiveShell>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
      <ResponsiveShell
        mobileTitle="Admin"
        mobileSubtitle="Integrations and system controls"
        desktopSidebar={<AppSidebar />}
        mobileSidebar={<AppSidebar />}
        storageKey="caseforge:drawer:admin"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Settings
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Admin</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Centralize provider setup for Jira, QA tooling, and automation platforms without
              pushing that operational complexity into the core test-management workflow.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                Provider catalog: {overview.total}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                Enabled: {overview.enabled}
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                Connected: {overview.connected}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Needs attention: {overview.attention}
              </span>
            </div>

            {notice ? (
              <div
                className={`mt-4 rounded-[20px] border px-4 py-3 text-sm ${
                  notice.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : notice.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                    : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                }`}
              >
                {notice.text}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/settings/users"
                className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Open Users Settings
              </Link>
              <Link
                href="/projects"
                className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
              >
                Open Project Library
              </Link>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Providers", overview.total],
              ["Enabled", overview.enabled],
              ["Connected", overview.connected],
              ["Healthy", overview.healthy],
              ["Attention", overview.attention],
            ].map(([label, value]) => (
              <article
                key={label}
                className="rounded-[24px] border border-zinc-200/80 bg-white/92 px-5 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {value}
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Integrations
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Provider control center
              </h2>
              <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                Enable providers, keep credential references masked, and run a safe setup check
                before wiring deeper project-level mappings later.
              </p>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              {integrationProviderCatalog.map((provider) => {
                const record = adminState.integrations[provider.id];
                const evaluation = evaluateIntegrationRecord(provider, record);
                const draftValues = drafts[provider.id] ?? record.values;

                return (
                  <article
                    key={provider.id}
                    className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryTone[provider.category]}`}
                            >
                              {provider.category}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${connectionTone[evaluation.connectionState]}`}
                            >
                              {statusLabel(evaluation.connectionState)}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${healthTone[record.healthStatus]}`}
                            >
                              {statusLabel(record.healthStatus)}
                            </span>
                          </div>
                          <h3 className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                            {provider.name}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                            {provider.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleProviderEnabled(provider.id)}
                          className={`inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
                            record.enabled
                              ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                              : "bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] text-white hover:brightness-110"
                          }`}
                        >
                          {record.enabled ? "Disable" : "Enable"}
                        </button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-[18px] border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/80">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Credential Status
                          </p>
                          <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {maskCredentialReference(record.values.credentialReference)}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/80">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Last Checked
                          </p>
                          <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {record.lastCheckedAt
                              ? formatUtcDateTime(record.lastCheckedAt)
                              : "Not checked yet"}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/80">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Health
                          </p>
                          <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {statusLabel(record.healthStatus)}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-zinc-200/80 bg-white/90 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/80">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                            Scope
                          </p>
                          <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {record.values.scope?.trim() || "Not set"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {provider.capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                          >
                            {capability}
                          </span>
                        ))}
                      </div>

                      <div className="rounded-[18px] border border-zinc-200/80 bg-white/92 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/82 dark:text-zinc-300">
                        {record.healthMessage}
                      </div>

                      <details className="group rounded-[20px] border border-zinc-200/80 bg-white/88 p-4 dark:border-zinc-700 dark:bg-zinc-950/78">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                              Integration details
                            </p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              Save masked credential references, ownership notes, and scope defaults.
                            </p>
                          </div>
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-600 transition group-open:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:group-open:bg-zinc-800">
                            Expand
                          </span>
                        </summary>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          {provider.fields.map((field) => (
                            <label
                              key={field.key}
                              className={`flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-200 ${
                                field.key === "notes" ? "md:col-span-2" : ""
                              }`}
                            >
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {field.label}
                                {field.required ? (
                                  <span className="ml-1 text-rose-500">*</span>
                                ) : null}
                              </span>
                              <input
                                value={draftValues[field.key] ?? ""}
                                onChange={(event) =>
                                  updateDraft(provider.id, field.key, event.target.value)
                                }
                                placeholder={field.placeholder}
                                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                              />
                              {field.helperText ? (
                                <span className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                                  {field.helperText}
                                </span>
                              ) : null}
                            </label>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => saveProviderDetails(provider.id)}
                            className="rounded-xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
                          >
                            Save Details
                          </button>
                          <button
                            type="button"
                            onClick={() => testProviderConnection(provider.id)}
                            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            Test Connection
                          </button>
                          <button
                            type="button"
                            onClick={() => resetProvider(provider.id)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                          >
                            Reset
                          </button>
                        </div>
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Roles &amp; Access
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Default admin capability matrix
              </h2>
              <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                Set the default operational access model for each role before you wire hard
                enforcement later. This is a governance layer today, not a live permission gate yet.
              </p>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr>
                      <th className="px-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        Capability
                      </th>
                      {(
                        ["admin", "manager", "tester", "reviewer"] as AdminAccessRole[]
                      ).map((role) => (
                        <th
                          key={role}
                          className="px-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400"
                        >
                          {role}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(capabilityLabels) as AdminAccessCapability[]).map(
                      (capability) => (
                        <tr key={capability}>
                          <td className="rounded-l-[18px] border border-zinc-200/80 bg-zinc-50/80 px-3 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
                            {capabilityLabels[capability]}
                          </td>
                          {(
                            ["admin", "manager", "tester", "reviewer"] as AdminAccessRole[]
                          ).map((role, index, allRoles) => (
                            <td
                              key={`${capability}-${role}`}
                              className={`border border-zinc-200/80 bg-white px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/82 ${
                                index === allRoles.length - 1 ? "rounded-r-[18px]" : ""
                              }`}
                            >
                              <label className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                                <input
                                  type="checkbox"
                                  checked={accessPolicyState.policies[role][capability]}
                                  onChange={(event) =>
                                    updateAccessPolicy(role, capability, event.target.checked)
                                  }
                                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span>
                                  {accessPolicyState.policies[role][capability]
                                    ? "Allowed"
                                    : "Blocked"}
                                </span>
                              </label>
                            </td>
                          ))}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                Last updated: {formatUtcDateTime(accessPolicyState.updatedAt)}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Directory Snapshot
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Current role distribution
              </h2>
              <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                Use the existing user directory to see how the default access model maps to the
                current team mix.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {(["admin", "manager", "tester", "reviewer"] as AdminAccessRole[]).map(
                  (role) => (
                    <article
                      key={role}
                      className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${roleTone[role]}`}
                        >
                          {statusLabel(role)}
                        </span>
                        <span className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                          {roleSummary[role]}
                        </span>
                      </div>
                    </article>
                  )
                )}
              </div>

              <div className="mt-5 rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                {userDirectoryState === "loading"
                  ? "Loading user directory..."
                  : userDirectoryState === "unavailable"
                  ? "The user directory is not available yet. Apply the latest migration if you want live directory-backed role visibility."
                  : `${users.filter((user) => user.isActive).length} active team members loaded from the user directory.`}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/settings/users"
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Manage Users
                </Link>
              </div>
            </section>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Admin Activity
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Recent integration changes
              </h2>
              <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                Keep a lightweight audit trail of provider toggles, saved setup details, and
                connection checks while we grow the deeper admin system later.
              </p>

              <div className="mt-6 space-y-3">
                {adminState.audit.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-zinc-300 bg-zinc-50/70 px-5 py-8 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-300">
                    No admin activity yet. The first provider update or connection check will show up here.
                  </div>
                ) : (
                  adminState.audit.slice(0, 8).map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950/60"
                    >
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {entry.providerName}
                          </p>
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                            {entry.action}: {entry.detail}
                          </p>
                        </div>
                        <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          {formatUtcDateTime(entry.createdAt)}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                Next Layers
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                What this admin panel is ready for
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                <p>
                  This first admin surface is intentionally lightweight: provider enablement,
                  masked credential references, setup-health checks, and a recent activity trail.
                </p>
                <p>
                  It is ready to grow into deeper project mappings, role-based permissions,
                  secure secret storage, and live provider connection tests later.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                {[
                  "Project-level integration mappings",
                  "Role and access controls",
                  "Live provider ping checks",
                  "Secret store integration",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </section>
        </div>
      </ResponsiveShell>
    </main>
  );
}
