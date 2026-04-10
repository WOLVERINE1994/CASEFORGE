"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getProviderById,
  integrationProviderCatalog,
  loadAdminIntegrationState,
} from "../utils/admin-integrations";
import {
  evaluateProjectIntegrationReadiness,
  getProjectIntegrationMapping,
  loadProjectIntegrationState,
  saveProjectIntegrationState,
  type ProjectIntegrationState,
} from "../utils/project-integrations";
import { formatUtcDateTime } from "../utils/date-format";

type Props = {
  projectKey: string;
  projectName: string;
};

const readinessTone = {
  ready:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  "needs-admin":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  disabled:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
} as const;

export default function ProjectIntegrationSettingsClient({
  projectKey,
  projectName,
}: Props) {
  const [state, setState] = useState<ProjectIntegrationState>(() =>
    loadProjectIntegrationState(projectKey)
  );
  const [notice, setNotice] = useState<string | null>(null);

  const adminState = useMemo(() => loadAdminIntegrationState(), []);
  const enabledProviders = useMemo(
    () =>
      integrationProviderCatalog.filter(
        (provider) => adminState.integrations[provider.id]?.enabled
      ),
    [adminState]
  );

  const persistState = (nextState: ProjectIntegrationState, nextNotice: string) => {
    setState(nextState);
    saveProjectIntegrationState(nextState);
    setNotice(nextNotice);
  };

  const updateMapping = (providerId: string, field: string, value: string | boolean) => {
    const currentMapping = getProjectIntegrationMapping(state, providerId);
    const nextState: ProjectIntegrationState = {
      ...state,
      mappings: {
        ...state.mappings,
        [providerId]: {
          ...currentMapping,
          [field]: value,
          updatedAt: new Date().toISOString(),
        },
      },
    };
    persistState(nextState, `${getProviderById(providerId)?.name || "Provider"} project mapping updated.`);
  };

  const overview = useMemo(() => {
    const mappedProviders = enabledProviders.filter((provider) => {
      const mapping = getProjectIntegrationMapping(state, provider.id);
      return mapping.enabled;
    });

    const readyProviders = enabledProviders.filter((provider) => {
      const mapping = getProjectIntegrationMapping(state, provider.id);
      return (
        evaluateProjectIntegrationReadiness(projectKey, provider.id, mapping).status ===
        "ready"
      );
    });

    return {
      available: enabledProviders.length,
      enabled: mappedProviders.length,
      ready: readyProviders.length,
      attention: Math.max(mappedProviders.length - readyProviders.length, 0),
    };
  }, [enabledProviders, projectKey, state]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
          Project Settings
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Integration mappings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          Choose which admin-enabled providers apply to {projectName.trim() || projectKey}, add
          project-specific mapping references, and see whether this project is ready for deeper
          integration work later.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
            Available: {overview.available}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            Enabled for project: {overview.enabled}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
            Ready: {overview.ready}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Needs attention: {overview.attention}
          </span>
        </div>

        {notice ? (
          <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
            {notice}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/settings/admin"
            className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Open Admin Integrations
          </Link>
          <Link
            href={`/projects/${encodeURIComponent(projectKey)}/workspace`}
            className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(5,150,105,0.7)] transition hover:brightness-110"
          >
            Back to Workspace
          </Link>
        </div>
      </section>

      {enabledProviders.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white/86 px-8 py-10 text-sm text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/78 dark:text-zinc-300">
          No admin-enabled providers are available yet. Enable Jira, QA tools, or automation tools
          in Settings &gt; Admin before mapping them to this project.
        </section>
      ) : (
        <section className="grid gap-5 xl:grid-cols-2">
          {enabledProviders.map((provider) => {
            const mapping = getProjectIntegrationMapping(state, provider.id);
            const readiness = evaluateProjectIntegrationReadiness(
              projectKey,
              provider.id,
              mapping
            );

            return (
              <article
                key={provider.id}
                className="rounded-[24px] border border-zinc-200/80 bg-white/92 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          {provider.category}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${readinessTone[readiness.status]}`}
                        >
                          {readiness.status === "needs-admin"
                            ? "Needs Attention"
                            : readiness.status === "ready"
                            ? "Ready"
                            : "Disabled"}
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                        {provider.name}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                        {provider.description}
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={mapping.enabled}
                        onChange={(event) =>
                          updateMapping(provider.id, "enabled", event.target.checked)
                        }
                        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Enable for project
                    </label>
                  </div>

                  <div className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                    {readiness.message}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Project Mapping
                      </span>
                      <input
                        value={mapping.projectScope}
                        onChange={(event) =>
                          updateMapping(provider.id, "projectScope", event.target.value)
                        }
                        placeholder="Project key, suite, board, or repo reference"
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Default Board / Workflow
                      </span>
                      <input
                        value={mapping.defaultBoard}
                        onChange={(event) =>
                          updateMapping(provider.id, "defaultBoard", event.target.value)
                        }
                        placeholder="Checkout QA board"
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Environment
                      </span>
                      <input
                        value={mapping.environment}
                        onChange={(event) =>
                          updateMapping(provider.id, "environment", event.target.value)
                        }
                        placeholder="staging / production / nightly"
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Owner
                      </span>
                      <input
                        value={mapping.owner}
                        onChange={(event) =>
                          updateMapping(provider.id, "owner", event.target.value)
                        }
                        placeholder="qa-platform@company.com"
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-200 md:col-span-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Mapping Notes
                      </span>
                      <textarea
                        value={mapping.notes}
                        onChange={(event) =>
                          updateMapping(provider.id, "notes", event.target.value)
                        }
                        placeholder="Optional project-specific notes for rollout, ownership, or workflow expectations"
                        rows={4}
                        className="min-h-[120px] rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      Admin status: {adminState.integrations[provider.id]?.enabled ? "enabled" : "disabled"}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      Last updated: {formatUtcDateTime(mapping.updatedAt)}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

