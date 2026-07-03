import Link from "next/link";
import type { ReactNode } from "react";
import { ResponsiveToolbar } from "./SafeLayout";

type AutomationSection = "overview" | "suites" | "scenarios" | "actions" | "runs" | "recycle-bin";

type Props = {
  projectKey: string;
  activeSection: AutomationSection;
  children?: ReactNode;
  description?: string;
  layout?: "default" | "workspace";
  title?: string;
};

const sections: Array<{
  key: AutomationSection;
  label: string;
  href: string;
  description: string;
}> = [
  {
    key: "overview",
    label: "Overview",
    href: "",
    description: "A clean starting point for the new automation module.",
  },
  {
    key: "suites",
    label: "Suites",
    href: "/suites",
    description: "Group automation scenarios into tagged suites with lifecycle status.",
  },
  {
    key: "scenarios",
    label: "Scenarios",
    href: "/scenarios",
    description: "Create and manage lightweight automation scenario records.",
  },
  {
    key: "actions",
    label: "Actions",
    href: "/actions",
    description: "Placeholder for reusable automation actions.",
  },
  {
    key: "runs",
    label: "Runs",
    href: "/runs",
    description: "Placeholder for automation run history.",
  },
  {
    key: "recycle-bin",
    label: "Recycle Bin",
    href: "/recycle-bin",
    description: "Restore or permanently purge deleted automation assets.",
  },
];

export default function AutomationShell({
  projectKey,
  activeSection,
  children,
  description,
  layout = "default",
  title,
}: Props) {
  const encodedProjectKey = encodeURIComponent(projectKey);
  const activeItem =
    sections.find((section) => section.key === activeSection) ?? sections[0];
  const pageTitle = title ?? activeItem.label;
  const pageDescription = description ?? activeItem.description;

  if (layout === "workspace") {
    return (
      <section className="min-w-0">
        <nav className="mb-3 flex min-w-0 gap-2 overflow-x-auto border-b border-zinc-200 pb-3 dark:border-zinc-800">
          {sections.map((section) => {
            const active = section.key === activeSection;
            return (
              <Link
                key={section.key}
                href={`/projects/${encodedProjectKey}/automation${section.href}`}
                className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-emerald-400 bg-emerald-50 !text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:!text-emerald-100"
                    : "border-transparent !text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 hover:!text-zinc-950 dark:!text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:!text-white"
                }`}
                title={section.label}
              >
                <span className="cf-safe-label block">{section.label}</span>
              </Link>
            );
          })}
        </nav>
        {children}
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-[20px] border border-zinc-200/80 bg-white/95 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90 sm:p-5">
      <div
        className={
          "grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"
        }
      >
        <nav
          className="min-w-0 rounded-[16px] border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90"
        >
          <p className="cf-safe-label px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 dark:text-zinc-300">
            Automation
          </p>
          <ResponsiveToolbar className="mt-3 overflow-x-auto lg:flex-col lg:flex-nowrap lg:items-stretch lg:overflow-visible">
            {sections.map((section) => {
              const active = section.key === activeSection;
              return (
                <Link
                  key={section.key}
                  href={`/projects/${encodedProjectKey}/automation${section.href}`}
                  className={`whitespace-nowrap rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-emerald-400 bg-emerald-50 !text-emerald-950 shadow-sm dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:!text-emerald-100"
                      : "border-transparent !text-slate-800 hover:border-zinc-300 hover:bg-zinc-50 hover:!text-slate-950 dark:!text-zinc-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-950 dark:hover:!text-white"
                  }`}
                  title={section.label}
                >
                  <span className="cf-safe-label block">{section.label}</span>
                </Link>
              );
            })}
          </ResponsiveToolbar>
        </nav>

        <article
          className="min-h-[360px] min-w-0 rounded-[18px] border border-zinc-200 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/50 sm:p-6"
        >
          <p className="cf-safe-label text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
            Automation Module
          </p>
          <h1 className="cf-safe-wrap mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {pageTitle}
          </h1>
          <p className="cf-safe-wrap mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {pageDescription}
          </p>
          {children ?? (
            <div className="mt-6 rounded-[20px] border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              This page is intentionally empty. Build the new automation experience here from scratch.
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
