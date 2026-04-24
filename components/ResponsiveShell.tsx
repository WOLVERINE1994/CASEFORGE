"use client";

import { useEffect, useState, type ReactNode } from "react";
import CaseForgeBrand from "./CaseForgeBrand";

type ResponsiveShellProps = {
  mobileTitle: string;
  mobileSubtitle?: string;
  desktopSidebar: ReactNode;
  mobileSidebar: ReactNode;
  children: ReactNode;
  storageKey?: string;
};

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );

export default function ResponsiveShell({
  mobileTitle,
  mobileSubtitle,
  desktopSidebar,
  mobileSidebar,
  children,
  storageKey,
}: ResponsiveShellProps) {
  const desktopStorageKey = storageKey ? `${storageKey}:desktop` : undefined;
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const nextIsOpen = storageKey
        ? window.localStorage.getItem(storageKey) === "open"
        : false;
      const nextIsDesktopCollapsed = desktopStorageKey
        ? window.localStorage.getItem(desktopStorageKey) === "collapsed"
        : false;

      queueMicrotask(() => {
        if (storageKey) {
          setIsOpen(nextIsOpen);
        }
        if (desktopStorageKey) {
          setIsDesktopCollapsed(nextIsDesktopCollapsed);
        }
      });
    } catch {
      // Ignore persistence failures for non-critical UI state.
    }
  }, [desktopStorageKey, storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, isOpen ? "open" : "closed");
    } catch {
      // Ignore persistence failures for non-critical UI state.
    }
  }, [isOpen, storageKey]);

  useEffect(() => {
    if (!desktopStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(
        desktopStorageKey,
        isDesktopCollapsed ? "collapsed" : "expanded"
      );
    } catch {
      // Ignore persistence failures for non-critical UI state.
    }
  }, [desktopStorageKey, isDesktopCollapsed]);

  const cleanedSubtitle =
    mobileSubtitle && !isUuidLike(mobileSubtitle) ? mobileSubtitle : undefined;

  return (
    <div className="mx-auto w-full max-w-[1520px]">
      <div className="xl:hidden">
        <div className="cf-panel mb-4 flex items-center justify-between gap-3 rounded-[22px] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Navigation
            </p>
            <CaseForgeBrand size="sm" className="mt-2 w-full max-w-[190px]" priority />
            <p className="truncate text-base font-semibold text-slate-50">
              {mobileTitle}
            </p>
            {cleanedSubtitle ? (
              <p className="truncate text-xs text-slate-400">
                {cleanedSubtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="cf-secondary-button inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
            Open
          </button>
        </div>

        {isOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[2px]"
            />
            <div className="absolute inset-y-0 left-0 w-[min(92vw,344px)] overflow-y-auto p-4">
              <div className="cf-panel mb-3 rounded-[24px] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Navigation
                    </p>
                    <CaseForgeBrand size="sm" className="mt-2 w-full max-w-[190px]" />
                    <p className="mt-1 truncate text-base font-semibold text-slate-50">
                      {mobileTitle}
                    </p>
                    {cleanedSubtitle ? (
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {cleanedSubtitle}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="cf-secondary-button inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div onClick={() => setIsOpen(false)}>{mobileSidebar}</div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`grid gap-5 ${
          isDesktopCollapsed
            ? "xl:grid-cols-[88px_minmax(0,1fr)]"
            : "xl:grid-cols-[240px_minmax(0,1fr)]"
        }`}
      >
        <div className="hidden xl:block">
          {isDesktopCollapsed ? (
            <aside className="cf-panel sticky top-6 flex min-h-[260px] flex-col items-center gap-4 rounded-[24px] px-3 py-4">
              <button
                type="button"
                onClick={() => setIsDesktopCollapsed(false)}
                className="cf-secondary-button inline-flex h-10 w-10 items-center justify-center rounded-2xl transition"
                aria-label="Expand project shell"
                title="Expand project shell"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
              <div
                className="flex items-center justify-center"
                title={mobileTitle}
                aria-label={mobileTitle}
              >
                <CaseForgeBrand variant="mark" size="sm" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/80" />
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Shell
                </p>
              </div>
            </aside>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDesktopCollapsed(true)}
                className="cf-secondary-button absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-2xl transition"
                aria-label="Collapse project shell"
                title="Collapse project shell"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </button>
              {desktopSidebar}
            </div>
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
