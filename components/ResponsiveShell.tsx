"use client";

import { useEffect, useState, type ReactNode } from "react";

type ResponsiveShellProps = {
  mobileTitle: string;
  mobileSubtitle?: string;
  desktopSidebar: ReactNode;
  mobileSidebar: ReactNode;
  children: ReactNode;
  storageKey?: string;
};

export default function ResponsiveShell({
  mobileTitle,
  mobileSubtitle,
  desktopSidebar,
  mobileSidebar,
  children,
  storageKey,
}: ResponsiveShellProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined" || !storageKey) {
      return false;
    }

    try {
      return window.localStorage.getItem(storageKey) === "open";
    } catch {
      return false;
    }
  });

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

  return (
    <div className="mx-auto w-full max-w-[1520px]">
      <div className="xl:hidden">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[22px] border border-zinc-200/80 bg-white/94 px-4 py-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.22)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/92">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Navigation
            </p>
            <p className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {mobileTitle}
            </p>
            {mobileSubtitle ? (
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {mobileSubtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
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
              <div className="mb-3 rounded-[24px] border border-zinc-200/80 bg-white/96 p-4 shadow-[0_24px_55px_-36px_rgba(15,23,42,0.28)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/96">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                      Navigation
                    </p>
                    <p className="mt-1 truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      {mobileTitle}
                    </p>
                    {mobileSubtitle ? (
                      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {mobileSubtitle}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
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

      <div className="grid gap-5 xl:grid-cols-[288px_minmax(0,1fr)]">
        <div className="hidden xl:block">{desktopSidebar}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
