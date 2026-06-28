"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { NavItem as SafeNavItem } from "./SafeLayout";

type ProjectSidebarProps = {
  projectKey: string;
  projectName: string;
  sprintName: string;
  releaseName: string;
  teamName: string;
  caseCount: number;
  issueCount: number;
};

type NavKind = "workspace" | "automation" | "library";

type NavItem = {
  href: string;
  label: string;
  kind: NavKind;
  matchPrefixes?: string[];
};

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );

function NavIcon({ kind }: { kind: NavKind }) {
  const commonProps = {
    className: "h-4 w-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  switch (kind) {
    case "workspace":
      return (
        <svg {...commonProps}>
          <path d="M5 6.5h14" />
          <path d="M5 12h14" />
          <path d="M5 17.5h8" />
        </svg>
      );
    case "automation":
      return (
        <svg {...commonProps}>
          <path d="M12 4.5 8.2 11H12l-1 8.5 4.8-7H12l.9-8Z" />
        </svg>
      );
    case "library":
      return (
        <svg {...commonProps}>
          <path d="M5.5 6.5h4v11h-4Z" />
          <path d="M10 6.5h4v11h-4Z" />
          <path d="M14.5 6.5H18v11h-3.5Z" />
        </svg>
      );
  }
}

const isActiveNavItem = (pathname: string, item: NavItem) =>
  [item.href, ...(item.matchPrefixes ?? [])].some(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`),
  );

export default function ProjectSidebar({
  projectKey,
  projectName,
  sprintName,
  releaseName,
  teamName,
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cameFromRelease = searchParams.get("from") === "release";
  const encodedProjectKey = encodeURIComponent(projectKey);

  const buildProjectHref = useCallback((basePath: string) => {
    const nextParams = new URLSearchParams();

    if (cameFromRelease) {
      nextParams.set("from", "release");
    }

    const query = nextParams.toString();
    return query ? `${basePath}?${query}` : basePath;
  }, [cameFromRelease]);

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/workspace`),
        label: "AI Test Case Generation",
        kind: "workspace",
        matchPrefixes: [`/projects/${encodedProjectKey}/workspace`],
      },
      {
        href: buildProjectHref(`/projects/${encodedProjectKey}/automation`),
        label: "Automation",
        kind: "automation",
        matchPrefixes: [`/projects/${encodedProjectKey}/automation`],
      },
    ],
    [buildProjectHref, encodedProjectKey],
  );

  const shellMeta = [
    sprintName.trim() || null,
    releaseName.trim() || null,
    teamName.trim() || null,
  ].filter(Boolean) as string[];
  const displayProjectKey =
    projectKey.trim() && !isUuidLike(projectKey) ? projectKey.trim() : null;

  return (
    <aside className="cf-panel sticky top-6 rounded-[24px]">
      <div
        className="flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-y-auto p-5 pr-4 [mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)] [scrollbar-gutter:stable]"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="rounded-[20px] border border-slate-700/80 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.18),_transparent_46%),linear-gradient(180deg,_rgba(17,24,39,0.98)_0%,_rgba(15,23,42,0.98)_100%)] p-4 shadow-[0_24px_60px_-42px_rgba(37,99,235,0.65)]">
          <h2 className="cf-safe-wrap text-xl font-semibold tracking-tight text-slate-50">
            {projectName.trim() || "Unsaved workspace"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Generate AI test cases, then build and run browser automation.
          </p>
          <div className="cf-safe-toolbar mt-4 text-xs">
            {displayProjectKey ? (
              <span className="cf-safe-chip cf-safe-wrap rounded-full border border-slate-600/80 bg-slate-900/85 px-2.5 py-1 font-semibold text-slate-200">
                {displayProjectKey}
              </span>
            ) : null}
            {shellMeta.length ? (
              shellMeta.map((item) => (
                <span
                  key={item}
                  className="cf-safe-chip cf-safe-wrap rounded-full border border-slate-700/80 bg-slate-900/75 px-2.5 py-1 font-semibold text-slate-300"
                >
                  {item}
                </span>
              ))
            ) : (
              <span className="cf-safe-chip rounded-full border border-slate-700/80 bg-slate-900/75 px-2.5 py-1 font-semibold text-slate-300">
                Focus mode
              </span>
            )}
          </div>
        </div>

        <div className="cf-card rounded-[20px] p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Core Workspace
          </p>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const active = isActiveNavItem(pathname, item);

              return (
                <SafeNavItem
                  key={item.href}
                  href={item.href}
                  active={active}
                  className={`${
                    active
                      ? "border-sky-400/20 bg-[linear-gradient(135deg,rgba(37,99,235,0.2),rgba(79,70,229,0.18),rgba(124,58,237,0.2))] text-slate-50 shadow-[0_18px_34px_-28px_rgba(79,70,229,0.85)]"
                      : "border-transparent bg-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800/70"
                  }`}
                  icon={<NavIcon kind={item.kind} />}
                  label={item.label}
                  title={item.label}
                >
                  {active ? (
                    <span className="absolute inset-y-2 left-1.5 w-1 rounded-full bg-cyan-300" />
                  ) : null}
                </SafeNavItem>
              );
            })}
          </nav>
        </div>

        <Link
          href="/projects"
          className="inline-flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/85 px-3.5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          <NavIcon kind="library" />
          Project Library
        </Link>
      </div>
    </aside>
  );
}
