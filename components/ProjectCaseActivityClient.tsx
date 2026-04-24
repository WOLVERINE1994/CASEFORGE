"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectDataState } from "./ProjectDataStateContext";
import { formatUtcDate } from "../utils/date-format";
import type { Project, TestCaseRow } from "../utils/workspace";

type Props = {
  projectKey: string;
};

const cardClassName =
  "rounded-[24px] border border-zinc-200/80 bg-white/96 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/94";

export default function ProjectCaseActivityClient({ projectKey }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectState = useProjectDataState();
  const [localProject, setLocalProject] = useState<Project | null>(null);
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const project = projectState?.project ?? localProject;
  const rows = useMemo(() => project?.rows ?? [], [project]);
  const encodedProjectKey = encodeURIComponent(projectKey);
  const requestedRowId = searchParams.get("rowId");
  const requestedView = searchParams.get("view") ?? "";
  const selectedRow = useMemo(
    () => rows.find((row) => row.id === requestedRowId) ?? rows[0] ?? null,
    [requestedRowId, rows]
  );
  const rowId = selectedRow?.id ?? null;
  const auditSectionRef = useRef<HTMLDivElement | null>(null);
  const reviewsSectionRef = useRef<HTMLDivElement | null>(null);
  const changesSectionRef = useRef<HTMLDivElement | null>(null);
  const reviewHistory = useMemo(
    () => (rowId ? project?.caseReviewHistory?.[rowId] ?? [] : []),
    [project, rowId]
  );
  const versionHistory = useMemo(
    () => (rowId ? project?.caseVersionHistory?.[rowId] ?? [] : []),
    [project, rowId]
  );

  const persistProject = async (nextProject: Project) => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const payload = (await response.json()) as { projects?: Project[]; error?: string };
    if (!response.ok || !Array.isArray(payload.projects)) {
      throw new Error(payload.error || "Failed to load projects.");
    }
    const nextProjects = payload.projects.map((entry) =>
      entry.id === nextProject.id ||
      entry.projectKey?.trim().toLowerCase() === projectKey.trim().toLowerCase()
        ? nextProject
        : entry
    );
    const saveResponse = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: nextProjects }),
    });
    const savePayload = (await saveResponse.json()) as { projects?: Project[]; error?: string };
    if (!saveResponse.ok || !Array.isArray(savePayload.projects)) {
      throw new Error(savePayload.error || "Failed to save project.");
    }
    const savedProject =
      savePayload.projects.find((entry) => entry.id === nextProject.id) ?? nextProject;
    setLocalProject(savedProject);
    projectState?.setProject(savedProject);
    router.refresh();
    return savedProject;
  };

  const restoreCaseVersion = async (row: TestCaseRow, versionId: string) => {
    if (!project || !rowId) {
      return;
    }

    const version = versionHistory.find((entry) => entry.id === versionId);
    if (!version) {
      return;
    }

    const restoredAt =
      Math.max(
        project.updatedAt ?? 0,
        row.updatedAt ?? 0,
        version.createdAt ?? 0
      ) + 1;
    const nextProject: Project = {
      ...project,
      rows: rows.map((entry) =>
        entry.id !== rowId
          ? entry
          : {
              ...version.rowSnapshot,
              id: row.id,
              createdAt:
                row.createdAt ?? version.rowSnapshot.createdAt ?? restoredAt,
              updatedAt: restoredAt,
            }
      ),
      caseVersionHistory: {
        ...(project.caseVersionHistory ?? {}),
        [rowId]: [
          {
            id: `case-version-restore-${rowId}-${version.id}-${restoredAt}`,
            createdAt: restoredAt,
            reason: "Case restored from version history",
            rowSnapshot: row,
          },
          ...(project.caseVersionHistory?.[rowId] ?? []),
        ],
      },
      caseReviewHistory: {
        ...(project.caseReviewHistory ?? {}),
        [rowId]: [
          {
            id: `case-review-restore-${rowId}-${version.id}-${restoredAt}`,
            createdAt: restoredAt,
            action: "Version restored",
            detail: `Restored case content from snapshot "${version.reason}".`,
          },
          ...(project.caseReviewHistory?.[rowId] ?? []),
        ],
      },
      auditTrail: [
        {
          id: `audit-case-version-restored-${rowId}-${version.id}-${restoredAt}`,
          action: "Case version restored",
          detail: `${rowId} was restored from version history.`,
          createdAt: restoredAt,
        },
        ...(project.auditTrail ?? []),
      ],
      updatedAt: restoredAt,
    };

    await persistProject(nextProject);
  };

  const comparisonVersions = useMemo(
    () =>
      versionHistory.filter((entry) => selectedVersionIds.includes(entry.id)).slice(0, 2),
    [selectedVersionIds, versionHistory]
  );

  useEffect(() => {
    if (!requestedView) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (requestedView === "audit" || requestedView === "approvals") {
        auditSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (requestedView === "reviews") {
        reviewsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (requestedView === "changes") {
        changesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [requestedView]);

  if (!project || !selectedRow || !rowId) {
    return (
      <section className={cardClassName}>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No case activity is available yet.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={cardClassName}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Activity
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Workflow audit and case history
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Case detail stays shorter now. Full workflow audit, review events, and version restore
              tools live here for deeper inspection.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/projects/${encodedProjectKey}/cases?rowId=${encodeURIComponent(rowId)}`}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Back To Case
            </Link>
            <Link
              href={`/projects/${encodedProjectKey}/automation/environments?rowId=${encodeURIComponent(
                rowId
              )}`}
              className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
            >
              Open Environments
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <article className={cardClassName}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Cases
          </p>
          <div className="mt-5 space-y-3">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/projects/${encodedProjectKey}/activity?rowId=${encodeURIComponent(row.id)}`}
                className={`block rounded-[18px] border px-4 py-4 transition ${
                  row.id === rowId
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-zinc-200/80 bg-zinc-50/80 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:bg-zinc-900"
                }`}
              >
                <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {row.id} | {row.title || "Untitled case"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {row.reviewStatus ?? "draft"} | updated{" "}
                  {row.updatedAt ? formatUtcDate(row.updatedAt) : "not recorded"}
                </p>
              </Link>
            ))}
          </div>
        </article>

        <article className="space-y-4">
          <div ref={auditSectionRef} className={cardClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Workflow Audit
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              {selectedRow.title || selectedRow.id}
            </h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                { label: "Generated", actor: selectedRow.generatedBy },
                { label: "Edited", actor: selectedRow.editedBy },
                { label: "Approved", actor: selectedRow.approvedBy },
                { label: "Rejected", actor: selectedRow.rejectedBy },
                { label: "Release Reviewed", actor: selectedRow.releaseReviewedBy },
              ].map(({ label, actor }) => (
                <div
                  key={`${rowId}-${label}`}
                  className="rounded-2xl border border-zinc-200/80 bg-zinc-50/90 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    {label}
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                    {actor?.name?.trim() || actor?.email?.trim() || "Not recorded yet"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {actor?.at ? formatUtcDate(actor.at) : "No timestamp yet"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div ref={reviewsSectionRef} className={cardClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Review History
            </p>
            <div className="mt-5 space-y-3">
              {reviewHistory.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No review history captured yet.
                </p>
              ) : (
                reviewHistory.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                        {entry.action}
                      </p>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatUtcDate(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {entry.detail}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div ref={changesSectionRef} className={cardClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Version History
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Restore a previous case snapshot or compare two saved versions.
                </p>
              </div>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {versionHistory.length} snapshot{versionHistory.length === 1 ? "" : "s"}
              </span>
            </div>

            {comparisonVersions.length === 2 ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-4 dark:border-sky-500/20 dark:bg-sky-500/10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                  Compare Selection
                </p>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {comparisonVersions.map((version) => (
                    <div
                      key={version.id}
                      className="rounded-2xl border border-sky-200/70 bg-white px-4 py-3 dark:border-sky-500/20 dark:bg-zinc-950"
                    >
                      <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                        {version.reason}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatUtcDate(version.createdAt)}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
                        {version.rowSnapshot.title || version.rowSnapshot.expectedResult || "Snapshot stored"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {versionHistory.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No versions captured yet.
                </p>
              ) : (
                versionHistory.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                          {version.reason}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {version.actorName || version.actorEmail || "Reviewer"} |{" "}
                          {formatUtcDate(version.createdAt)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {version.rowSnapshot.title || version.rowSnapshot.expectedResult || "Snapshot stored"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedVersionIds((current) =>
                            current.includes(version.id)
                              ? current.filter((entry) => entry !== version.id)
                              : [...current.slice(-1), version.id]
                          )
                        }
                        className="rounded-2xl border border-sky-200 bg-white px-3 py-2 text-[11px] font-semibold text-sky-800 transition hover:bg-sky-50 dark:border-sky-500/20 dark:bg-zinc-900 dark:text-sky-200 dark:hover:bg-zinc-800"
                      >
                        {selectedVersionIds.includes(version.id)
                          ? "Selected"
                          : "Select To Compare"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void restoreCaseVersion(selectedRow, version.id)}
                        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                      >
                        Restore This Version
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
