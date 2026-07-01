"use client";

import { type Project, toPersonaLabel } from "../utils/workspace";
import { formatUtcDateTime } from "../utils/date-format";

type Props = {
  currentProjectId: string | null;
  projectName: string;
  projectKey: string;
  setProjectKey: (v: string) => void;
  sprintName: string;
  setSprintName: (v: string) => void;
  releaseName: string;
  setReleaseName: (v: string) => void;
  teamName: string;
  setTeamName: (v: string) => void;
  setProjectName: (v: string) => void;
  saveProjectNow: () => void;
  saveStatus: "idle" | "saving" | "saved" | "local" | "error";
  lastSavedText: string;
  autosaveEnabled: boolean;
  setAutosaveEnabled: (value: boolean) => void;
  hasMounted: boolean;

  projects: Project[];
  loadProject: (id: string) => void;
  deleteProject: (id: string) => void;
};

export default function ProjectManager({
  currentProjectId,
  projectName,
  projectKey,
  setProjectKey,
  sprintName,
  setSprintName,
  releaseName,
  setReleaseName,
  teamName,
  setTeamName,
  setProjectName,
  saveProjectNow,
  saveStatus,
  lastSavedText,
  autosaveEnabled,
  setAutosaveEnabled,
  hasMounted,
  projects,
  loadProject,
  deleteProject,
}: Props) {
  const sortedProjects = [...projects].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
  const isSaveDisabled = !projectName.trim() || saveStatus === "saving";
  const statusTone =
    saveStatus === "saving"
      ? "text-amber-700 dark:text-amber-300"
      : saveStatus === "saved"
      ? "text-emerald-700 dark:text-emerald-300"
      : saveStatus === "local"
      ? "text-sky-700 dark:text-sky-300"
      : saveStatus === "error"
      ? "text-rose-700 dark:text-rose-300"
      : "text-zinc-500 dark:text-zinc-400";

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.36)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Project Control
            </p>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Save your current workspace
            </h2>
            <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Keep one named workspace per feature, flow, or release cycle.
            </p>
          </div>

          <div className="rounded-[26px] border border-zinc-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.9)_0%,_rgba(247,249,248,0.95)_100%)] p-4 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.28)] dark:border-zinc-800 dark:bg-zinc-950/60">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Project Name
            </label>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Checkout flow regression"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />

              <button
                type="button"
                onClick={saveProjectNow}
                disabled={isSaveDisabled}
                className="rounded-2xl bg-[linear-gradient(135deg,_#059669_0%,_#0f766e_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
              >
                {saveStatus === "saving" ? "Saving..." : "Save Project"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className={`text-xs font-medium ${statusTone}`}>
                {saveStatus === "saving"
                  ? "Saving project..."
                  : saveStatus === "saved"
                  ? "All changes saved"
                  : saveStatus === "local"
                  ? "Saved locally. Sync runs in the background."
                  : saveStatus === "error"
                  ? "Save failed. Try again."
                  : autosaveEnabled
                  ? "Autosave is armed when a project name exists."
                  : "Autosave is off. Save manually when ready."}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Last saved: {lastSavedText}
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                placeholder="Project Key: QA"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <input
                type="text"
                value={sprintName}
                onChange={(e) => setSprintName(e.target.value)}
                placeholder="Sprint 14"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <input
                type="text"
                value={releaseName}
                onChange={(e) => setReleaseName(e.target.value)}
                placeholder="Release 2026.04"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team Mercury"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[24px] border border-zinc-200/80 bg-zinc-50/85 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Autosave
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Toggle automatic saving for this workspace.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autosaveEnabled}
              onClick={() => setAutosaveEnabled(!autosaveEnabled)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full border shadow-inner transition ${
                autosaveEnabled
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-zinc-300 bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition ${
                  autosaveEnabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/75 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Projects
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {projects.length}
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/75 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Autosave
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {autosaveEnabled ? "On" : "Off"}
              </p>
            </div>
            <div className="rounded-[22px] border border-zinc-200/80 bg-white/75 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Current
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {projectName.trim() || "Untitled"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.36)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Library
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Saved Projects
            </h2>
          </div>
          <span className="rounded-full border border-zinc-200/80 bg-zinc-50/80 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {projects.length} total
          </span>
        </div>

        {sortedProjects.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No saved projects yet.
          </p>
        ) : (
          <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
            {sortedProjects.map((project) => (
              <div
                key={project.id}
                className={`rounded-[24px] border bg-[linear-gradient(180deg,_rgba(255,255,255,0.88)_0%,_rgba(246,248,247,0.96)_100%)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(15,23,42,0.28)] dark:bg-zinc-950/70 dark:hover:bg-zinc-950 ${
                  currentProjectId === project.id
                    ? "border-emerald-300 shadow-[0_18px_40px_-28px_rgba(5,150,105,0.28)] dark:border-emerald-500/40"
                    : "border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {project.name}
                  </p>
                  <div className="flex items-center gap-2">
                    {currentProjectId === project.id && (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                        Open
                      </span>
                    )}
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      {project.autosaveEnabled ? "Auto" : "Manual"}
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {project.generationMode} mode | {project.coverageDepth} coverage |{" "}
                  {toPersonaLabel(project.persona ?? "all")}
                </p>

                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {(project.projectKey || "NO-KEY").trim()} |{" "}
                    {(project.sprintName || "No sprint").trim()} |{" "}
                  {(project.releaseName || "No release").trim()}
                </p>

                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Team: {(project.teamName || "Unassigned team").trim()}
                </p>

                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {project.requirementCount ?? 0} requirements /{" "}
                  {project.testCaseCount ?? project.rows.length} test cases
                </p>

                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Updated:{" "}
                  {hasMounted
                    ? formatUtcDateTime(project.updatedAt)
                    : "Saved recently"}
                </p>

                {project.activeRequirementId && (
                  <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                    Active requirement link: {project.activeRequirementId}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadProject(project.id)}
                    className="rounded-xl bg-[linear-gradient(135deg,_#2563eb_0%,_#1d4ed8_100%)] px-3 py-2 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(37,99,235,0.55)] transition hover:brightness-110"
                  >
                    Load
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteProject(project.id)}
                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/30 dark:bg-zinc-950 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
