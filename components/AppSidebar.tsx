"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CaseForgeBrand from "./CaseForgeBrand";
import { NavItem as SafeNavItem } from "./SafeLayout";

type AppSidebarProps = {
  projectCount?: number;
};

type AppNavKind = "dashboard" | "automation" | "new-workspace" | "access";

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
    case "access":
      return (
        <svg {...commonProps}>
          <path d="M12 3.5 19 7v5.5c0 4.2-2.8 6.8-7 8-4.2-1.2-7-3.8-7-8V7l7-3.5Z" />
          <path d="m9.5 12.2 1.7 1.7 3.4-3.8" />
        </svg>
      );
  }
}

const navItemClassName = (active: boolean) =>
  `relative ${
    active
      ? "!border-slate-950 !bg-slate-950 !text-white shadow-sm ring-1 ring-emerald-300/50 dark:!border-slate-100 dark:!bg-slate-100 dark:!text-slate-950"
      : "!border-zinc-200 !bg-white !text-zinc-950 hover:!border-slate-950 hover:!bg-zinc-50 dark:!border-zinc-700 dark:!bg-zinc-950 dark:!text-zinc-50 dark:hover:!border-zinc-200 dark:hover:!bg-zinc-900"
  }`;

const readAppSidebarState = () => {
  if (typeof window === "undefined") return { appNavOpen: true };

  try {
    const rawValue = window.localStorage.getItem("caseforge:app-sidebar");
    if (!rawValue) return { appNavOpen: true };
    const parsed = JSON.parse(rawValue) as { appNavOpen?: boolean };
    return {
      appNavOpen:
        typeof parsed.appNavOpen === "boolean" ? parsed.appNavOpen : true,
    };
  } catch {
    return { appNavOpen: true };
  }
};

export default function AppSidebar({ projectCount = 0 }: AppSidebarProps) {
  const pathname = usePathname();
  const [appNavOpen, setAppNavOpen] = useState(() => readAppSidebarState().appNavOpen);
  const storageKey = "caseforge:app-sidebar";

  const navItems = useMemo(
    () => [
      {
        href: "/projects",
        label: "AI Workspaces",
        kind: "dashboard" as const,
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
        href: "/access-requests",
        label: "Access Requests",
        kind: "access" as const,
        active: pathname === "/access-requests",
      },
    ],
    [pathname, projectCount],
  );
  const hasActiveNavItem = useMemo(
    () => navItems.some((item) => item.active),
    [navItems],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ appNavOpen }));
    } catch {
      // Ignore persistence failures for non-critical UI state.
    }
  }, [appNavOpen, storageKey]);

  return (
    <aside className="sticky top-6 rounded-[24px] border border-zinc-200/80 bg-white/96 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.28)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/94">
      <div
        className="flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-y-auto p-5 pr-4 [mask-image:linear-gradient(to_bottom,transparent_0,black_20px,black_calc(100%-20px),transparent_100%)] [scrollbar-gutter:stable]"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="px-1">
          <CaseForgeBrand size="md" priority />
        </div>

        <div className="rounded-[20px] border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
          <button
            type="button"
            onClick={() => setAppNavOpen((current) => !current)}
            className="cf-safe-row w-full justify-between rounded-xl px-1 py-1 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
          >
            <span className="cf-safe-label text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Core Navigation
            </span>
            <svg
              className={`h-4 w-4 text-zinc-400 transition-transform ${hasActiveNavItem || appNavOpen ? "rotate-180" : ""}`}
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
                      ? "!bg-white !text-slate-950 dark:!bg-slate-950 dark:!text-white"
                      : "!bg-zinc-100 !text-zinc-700 dark:!bg-zinc-800 dark:!text-zinc-200"
                  }
                >
                  {item.active ? (
                    <span className="absolute inset-y-2 left-1.5 w-1 rounded-full bg-emerald-400 dark:bg-emerald-500" />
                  ) : null}
                </SafeNavItem>
              ))}
            </nav>
          ) : null}
        </div>

        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/80 p-4 text-sm leading-6 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          Generate structured QA coverage with AI, then promote the flow into browser automation.
        </div>
      </div>
    </aside>
  );
}
