"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Project } from "../utils/workspace";

type AutomationHomeClientProps = {
  projectKey: string;
};

type LoadState =
  | { status: "loading"; project: null; error: "" }
  | { status: "ready"; project: Project; error: "" }
  | { status: "error"; project: null; error: string };

const readJson = async <T,>(response: Response): Promise<T> => {
  const raw = await response.text();
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw new Error(
      /^<!doctype html>|^<html/i.test(raw.trim())
        ? "Project API returned a sign-in or error page instead of JSON."
        : "Project API returned an invalid response."
    );
  }
};

export default function AutomationHomeClient({
  projectKey,
}: AutomationHomeClientProps) {
  const encodedProjectKey = encodeURIComponent(projectKey);
  const [state, setState] = useState<LoadState>({
    status: "loading",
    project: null,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      try {
        const response = await fetch(`/api/projects/ref/${encodedProjectKey}`, {
          cache: "no-store",
        });
        const payload = await readJson<{ project?: Project; error?: string }>(
          response
        );

        if (!response.ok || !payload.project) {
          throw new Error(payload.error || "Failed to load project.");
        }

        if (!cancelled) {
          setState({ status: "ready", project: payload.project, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            project: null,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load automation workspace.",
          });
        }
      }
    };

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [encodedProjectKey]);

  const project = state.project;
  const rows = project?.rows ?? [];
  const scenarios = project?.automationScenarios ?? [];
  const suites = project?.automationSuites ?? [];
  const runs = project?.automationExecutions ?? [];
  const linkedCases = rows.filter((row) => row.automationStatus !== "manual");
  const latestRuns = [...runs]
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, 4);

  return (
    <main className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="cf-panel rounded-[28px] px-5 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Automation Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
              Build a few high-value automation flows first.
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Start with smoke scenarios from your generated cases, then add
              runs, playback, schedules, and reusable actions as the project
              grows.
            </p>
          </div>
          <Link
            href={`/projects/${encodedProjectKey}/automation/scenarios`}
            className="cf-primary-button inline-flex min-h-[44px] items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold"
          >
            Open Scenarios
          </Link>
        </div>
      </section>

      {state.status === "error" ? (
        <section className="cf-panel rounded-[24px] border-rose-500/30 px-5 py-4 text-sm text-rose-200">
          {state.error}
        </section>
      ) : null}

      {state.status === "loading" ? (
        <section className="cf-panel rounded-[24px] px-5 py-4 text-sm text-slate-300">
          Loading lightweight automation summary...
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Manual Cases", rows.length],
          ["Linked Cases", linkedCases.length],
          ["Scenarios", scenarios.length],
          ["Suites", suites.length],
          ["Runs", runs.length],
        ].map(([label, value]) => (
          <article key={String(label)} className="cf-card rounded-[22px] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="cf-panel rounded-[28px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Automation Paths
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              {
                label: "Scenarios",
                href: "scenarios",
                note: "Create and edit executable flows.",
              },
              {
                label: "Runs",
                href: "runs",
                note: "Review execution history and status.",
              },
              {
                label: "Actions",
                href: "actions",
                note: "Build reusable steps for repeat flows.",
              },
              {
                label: "Recorder",
                href: "recorder",
                note: "Capture browser actions into steps.",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={`/projects/${encodedProjectKey}/automation/${item.href}`}
                className="rounded-[20px] border border-slate-700/80 bg-slate-950/60 px-4 py-4 transition hover:border-sky-400/40 hover:bg-slate-900"
              >
                <p className="text-sm font-semibold text-slate-50">{item.label}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.note}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="cf-panel rounded-[28px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Recent Runs
          </p>
          <div className="mt-4 space-y-3">
            {latestRuns.length ? (
              latestRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/projects/${encodedProjectKey}/automation/runs/${run.id}`}
                  className="block rounded-[18px] border border-slate-700/80 bg-slate-950/60 px-4 py-3 transition hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {run.scenarioName || run.suiteName || "Automation run"}
                    </p>
                    <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                      {run.status}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-400">
                No automation runs yet. Create one scenario and run it before
                expanding the automation suite.
              </p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
