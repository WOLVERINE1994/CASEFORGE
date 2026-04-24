"use client";

import type { ReactNode } from "react";

type SectionShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const compactEyebrowClassName =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400";

export const compactMetricCardClassName =
  "cf-card min-w-[11rem] rounded-2xl px-3 py-3";

export const compactMetricLabelClassName =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400";

export const compactMetricValueClassName =
  "mt-1 break-words text-sm font-semibold leading-5 text-slate-100";

export const compactBadgeClassName =
  "inline-flex max-w-full items-center justify-center rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-tight whitespace-normal break-words";

type CompactMetricCardProps = {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
};

export function CompactMetricCard({
  label,
  value,
  className,
  valueClassName,
}: CompactMetricCardProps) {
  return (
    <div className={joinClasses(compactMetricCardClassName, className)}>
      <p className={compactMetricLabelClassName}>{label}</p>
      <div className={joinClasses(compactMetricValueClassName, valueClassName)}>
        {value}
      </div>
    </div>
  );
}

type CompactMetricGridProps = {
  children: ReactNode;
  className?: string;
};

export function CompactMetricGrid({
  children,
  className,
}: CompactMetricGridProps) {
  return (
    <div
      className={joinClasses(
        "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: SectionShellProps) {
  return (
    <section
      className={joinClasses(
        "cf-panel rounded-[24px] px-5 py-5",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className={compactEyebrowClassName}>
              {eyebrow}
            </p>
          ) : null}
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
            {title}
          </h3>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export function PrimaryToolbar({
  title,
  description,
  actions,
  children,
  className,
}: Omit<SectionShellProps, "eyebrow">) {
  return (
    <section
      className={joinClasses(
        "rounded-[24px] border border-slate-700/80 bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.16),_transparent_34%),linear-gradient(180deg,_rgba(17,24,39,0.98)_0%,_rgba(15,23,42,0.98)_100%)] px-5 py-5 shadow-[0_28px_80px_-52px_rgba(37,99,235,0.45)]",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className={compactEyebrowClassName}>
            {title}
          </p>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

type QuickFiltersProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function QuickFilters({
  title = "Quick Filters",
  description,
  actions,
  children,
  className,
}: QuickFiltersProps) {
  return (
    <div
      className={joinClasses(
        "cf-card rounded-[20px] p-4",
        className
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className={compactEyebrowClassName}>
            {title}
          </p>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-300">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function WorkflowShortcutsSection(props: SectionShellProps) {
  return <SectionHeader eyebrow="Workflow Shortcuts" {...props} />;
}

export function SavedViewsSection(props: SectionShellProps) {
  return <SectionHeader eyebrow="Saved Views & Presets" {...props} />;
}

export function SecondaryMetadataPanel(props: SectionShellProps) {
  return <SectionHeader eyebrow="Secondary Metadata" {...props} />;
}

type CollapsibleSecondarySectionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export function CollapsibleSecondarySection({
  eyebrow = "Secondary Section",
  title,
  description,
  summary,
  children,
  defaultOpen = false,
  className,
}: CollapsibleSecondarySectionProps) {
  return (
    <details
      className={joinClasses(
        "group rounded-[24px] border border-zinc-200/80 bg-white/92 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90",
        className
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className={compactEyebrowClassName}>
            {eyebrow}
          </p>
          <p className="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {title}
          </p>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary}
          <span className={joinClasses(compactBadgeClassName, "border border-zinc-200 bg-white px-3 py-1.5 uppercase tracking-[0.12em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400")}>
            Expand
          </span>
        </div>
      </summary>
      <div className="border-t border-zinc-200/80 px-5 py-5 dark:border-zinc-800">
        {children}
      </div>
    </details>
  );
}

type OverlayFormShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

export function OverlayFormShell({
  eyebrow,
  title,
  description,
  open,
  onClose,
  actions,
  children,
}: OverlayFormShellProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close overlay"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[2px]"
      />
      <div className="absolute inset-y-0 right-0 w-full max-w-[min(100vw,560px)] overflow-y-auto p-4">
        <div className="min-h-full rounded-[28px] border border-zinc-200/80 bg-white/96 p-5 shadow-[0_28px_75px_-38px_rgba(15,23,42,0.32)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/96">
          <div className="flex flex-col gap-4 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <div className="max-w-3xl">
                {eyebrow ? (
                  <p className={compactEyebrowClassName}>
                    {eyebrow}
                  </p>
                ) : null}
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {title}
                </h3>
                {description ? (
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Close
              </button>
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
          <div className="pt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

type AdvancedFiltersPanelProps = {
  title: string;
  description?: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function AdvancedFiltersPanel({
  title,
  description,
  summary,
  children,
  defaultOpen = false,
}: AdvancedFiltersPanelProps) {
  return (
    <details
      className="group rounded-[24px] border border-zinc-200/80 bg-white/92 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className={compactEyebrowClassName}>
            Advanced Filters
          </p>
          <p className="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {title}
          </p>
          {description ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary}
          <span className={joinClasses(compactBadgeClassName, "border border-zinc-200 bg-white px-3 py-1.5 uppercase tracking-[0.12em] text-zinc-500 transition group-open:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400")}>
            More Filters
          </span>
        </div>
      </summary>
      <div className="border-t border-zinc-200/80 px-5 py-5 dark:border-zinc-800">
        {children}
      </div>
    </details>
  );
}
