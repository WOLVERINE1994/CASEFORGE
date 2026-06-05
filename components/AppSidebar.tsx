"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CaseForgeBrand from "./CaseForgeBrand";
import { NavItem as SafeNavItem } from "./SafeLayout";
import { useActiveReviewerSession } from "./useActiveReviewerSession";

type AppSidebarProps = {
  projectCount?: number;
};

type AppNavKind =
  | "dashboard"
  | "library"
  | "automation"
  | "new-workspace"
  | "users"
  | "admin";

function NavIcon({ kind }: { kind: AppNavKind }) {
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
    case "dashboard":
      return (
        <svg {...commonProps}>
          <path d="M4.5 12 12 5.5 19.5 12" />
          <path d="M6.5 10.5V19h11v-8.5" />
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
    case "automation":
      return (
        <svg {...commonProps}>
          <path d="M12 4.5 8.2 11H12l-1 8.5 4.8-7H12l.9-8Z" />
        </svg>
      );
    case "new-workspace":
      return (
        <svg {...commonProps}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5.5 18c1.8-2.7 4-4 6.5-4s4.7 1.3 6.5 4" />
        </svg>
      );
    case "admin":
      return (
        <svg {...commonProps}>
          <path d="M12 4.5 14 7l3-.2.9 2.8 2.6 1.5-1.3 2.7 1.3 2.7-2.6 1.5-.9 2.8-3-.2-2 2.5-2-2.5-3 .2-.9-2.8-2.6-1.5 1.3-2.7-1.3-2.7 2.6-1.5.9-2.8 3 .2Z" />
          <circle cx="12" cy="13" r="2.5" />
        </svg>
      );
  }
}

const navItemClassName = (active: boolean) =>
  `relative ${
    active
      ? "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/10"
      : "border-transparent bg-transparent text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-950"
  }`;

const readAppSidebarState = () => {
  if (typeof window === "undefined") {
    return {
      appNavOpen: true,
      reviewerOpen: true,
    };
  }

  try {
    const rawValue = window.localStorage.getItem("caseforge:app-sidebar");
    if (!rawValue) {
      return {
        appNavOpen: true,
        reviewerOpen: true,
      };
    }

    const parsed = JSON.parse(rawValue) as {
      appNavOpen?: boolean;
      reviewerOpen?: boolean;
    };

    return {
      appNavOpen:
        typeof parsed.appNavOpen === "boolean" ? parsed.appNavOpen : true,
      reviewerOpen:
        typeof parsed.reviewerOpen === "boolean" ? parsed.reviewerOpen : true,
    };
  } catch {
    return {
      appNavOpen: true,
      reviewerOpen: true,
    };
  }
};

export default function AppSidebar({ projectCount = 0 }: AppSidebarProps) {
  const pathname = usePathname();
  const activeReviewerSession = useActiveReviewerSession();
  const [appNavOpen, setAppNavOpen] = useState(() => readAppSidebarState().appNavOpen);
  const [reviewerOpen, setReviewerOpen] = useState(
    () => readAppSidebarState().reviewerOpen
  );
  const storageKey = "caseforge:app-sidebar";

  const navItems = useMemo(
    () => [
      { href: "/", label: "Dashboard", kind: "dashboard" as const, active: pathname === "/" },
      {
        href: "/projects",
        label: "Project Library",
        kind: "library" as const,
        active: pathname === "/projects",
        count: projectCount,
      },
      {
        href: "/automation",
        label: "Automation",
        kind: "automation" as const,
        active: pathname === "/automation" || pathname.startsWith("/automation/"),
      },
      {
        href: "/projects/new",
        label: "New Workspace",
        kind: "new-workspace" as const,
        active: pathname === "/projects/new",
      },
      {
        href: "/settings/users",
        label: "Users",
        kind: "users" as const,
        active: pathname === "/settings/users",
      },
      {
        href: "/settings/admin",
        label: "Admin",
        kind: "admin" as const,
        active: pathname === "/settings/admin",
      },
    ],
    [pathname, projectCount]
  );
  const hasActiveNavItem = useMemo(
    () => navItems.some((item) => item.active),
    [navItems]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          appNavOpen,
          reviewerOpen,
        })
      );
    } catch {
      // Ignore persistence failures for non-critical UI state.
    }
  }, [appNavOpen, reviewerOpen]);

  const renderSectionToggle = (
    label: string,
    open: boolean,
    onToggle: () => void
  ) => (
    <button
      type="button"
      onClick={onToggle}
      className="cf-safe-row w-full justify-between rounded-xl px-1 py-1 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
    >
      <span className="cf-safe-label text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <svg
        className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );

  return (
    <aside className="sticky top-6 rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.28)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
      <div
        className="flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-y-auto p-5 pr-4 [mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)] [scrollbar-gutter:stable]"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            App Shell
          </p>
          <CaseForgeBrand size="md" className="mt-3 w-full" priority />
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Stable navigation for dashboard, library, workspace, and settings.
          </p>
        </div>

        <div className="rounded-[20px] border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
          {renderSectionToggle(
            "App Navigation",
            hasActiveNavItem ? true : appNavOpen,
            () => setAppNavOpen((current) => !current)
          )}
          {hasActiveNavItem || appNavOpen ? (
            <nav className="mt-3 space-y-1.5">
              {navItems.map((item) => (
                <SafeNavItem
                  key={item.href}
                  href={item.href}
                  active={item.active}
                  className={navItemClassName(item.active)}
                  icon={<NavIcon kind={item.kind} />}
                  label={item.label}
                  title={item.label}
                  badge={typeof item.count === "number" ? item.count : undefined}
                  badgeClassName={
                    item.active
                      ? "bg-white text-emerald-800 dark:bg-zinc-950 dark:text-emerald-200"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }
                >
                  {item.active ? (
                    <span className="absolute inset-y-2 left-1.5 w-1 rounded-full bg-emerald-500 dark:bg-emerald-300" />
                  ) : null}
                </SafeNavItem>
              ))}
            </nav>
          ) : null}
        </div>

        <div className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          {renderSectionToggle("Active Reviewer", reviewerOpen, () =>
            setReviewerOpen((current) => !current)
          )}
          {reviewerOpen ? (
            <>
              <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <span className="cf-safe-wrap">
                  {activeReviewerSession.reviewer?.name ||
                    activeReviewerSession.reviewer?.email ||
                    "No active reviewer"}
                </span>
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Browser-level reviewer context for release decisions and audit actions.
              </p>
              <div className="mt-3">
                <Link
                  href="/settings/users"
                  className="inline-flex rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Manage Reviewer
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
