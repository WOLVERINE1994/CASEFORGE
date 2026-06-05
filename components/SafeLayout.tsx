import Link from "next/link";
import type { ReactNode } from "react";

type SafeTextMode = "ellipsis" | "wrap" | "nowrap";

type SafeTextProps = {
  children: ReactNode;
  className?: string;
  mode?: SafeTextMode;
  title?: string;
};

type LabelWithBadgeProps = {
  badge?: ReactNode;
  badgeClassName?: string;
  children?: ReactNode;
  className?: string;
  icon?: ReactNode;
  label: ReactNode;
  labelClassName?: string;
  mode?: SafeTextMode;
  title?: string;
};

type ResponsiveToolbarProps = {
  children: ReactNode;
  className?: string;
  justify?: "start" | "between" | "end";
};

type CardHeaderProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
};

type NavItemProps = {
  active?: boolean;
  activeClassName?: string;
  badge?: ReactNode;
  badgeClassName?: string;
  baseClassName?: string;
  children?: ReactNode;
  className?: string;
  href: string;
  icon?: ReactNode;
  inactiveClassName?: string;
  label: ReactNode;
  labelClassName?: string;
  title?: string;
};

export const safeBadgeClassName =
  "cf-safe-chip inline-flex min-w-6 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function safeTextModeClass(mode: SafeTextMode) {
  if (mode === "wrap") return "cf-safe-wrap";
  if (mode === "nowrap") return "cf-safe-nowrap";
  return "cf-safe-label";
}

export function SafeText({ children, className, mode = "ellipsis", title }: SafeTextProps) {
  return (
    <span className={cx(safeTextModeClass(mode), className)} title={title}>
      {children}
    </span>
  );
}

export function LabelWithBadge({
  badge,
  badgeClassName,
  children,
  className,
  icon,
  label,
  labelClassName,
  mode = "ellipsis",
  title,
}: LabelWithBadgeProps) {
  return (
    <span className={cx("cf-safe-row w-full", className)}>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <SafeText className={cx("flex-1", labelClassName)} mode={mode} title={title}>
        {label}
      </SafeText>
      {children}
      {badge !== undefined && badge !== null ? (
        <span className={cx(safeBadgeClassName, badgeClassName)} title={title}>
          {badge}
        </span>
      ) : null}
    </span>
  );
}

export function ResponsiveToolbar({ children, className, justify = "start" }: ResponsiveToolbarProps) {
  return (
    <div
      className={cx(
        "cf-safe-toolbar",
        justify === "between" && "justify-between",
        justify === "end" && "justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ actions, className, description, eyebrow, title }: CardHeaderProps) {
  return (
    <header className={cx("cf-safe-header", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="cf-safe-label text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="cf-safe-wrap mt-1 text-lg font-semibold tracking-tight text-slate-50">
          {title}
        </h2>
        {description ? (
          <p className="cf-safe-wrap mt-1 text-sm leading-6 text-slate-300">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function NavItem({
  active = false,
  activeClassName,
  badge,
  badgeClassName,
  baseClassName,
  children,
  className,
  href,
  icon,
  inactiveClassName,
  label,
  labelClassName,
  title,
}: NavItemProps) {
  return (
    <Link
      href={href}
      className={cx(
        "cf-safe-nav-item",
        baseClassName,
        active ? activeClassName : inactiveClassName,
        className,
      )}
      title={title}
    >
      {children}
      <LabelWithBadge
        badge={badge}
        badgeClassName={badgeClassName}
        icon={icon}
        label={label}
        labelClassName={labelClassName}
        title={title}
      />
    </Link>
  );
}
