"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ResponsiveToolbar } from "./SafeLayout";

export type ProjectModuleSubnavItem = {
  href: string;
  label: string;
  matchPrefixes?: string[];
};

type Props = {
  label: string;
  items: ProjectModuleSubnavItem[];
};

const isActiveItem = (pathname: string, item: ProjectModuleSubnavItem) =>
  [item.href, ...(item.matchPrefixes ?? [])].some(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`)
  );

export default function ProjectModuleSubnav({ label, items }: Props) {
  const pathname = usePathname();

  return (
    <section className="cf-panel rounded-[22px] px-4 py-4">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="cf-safe-wrap text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {label}
        </p>
        <ResponsiveToolbar className="lg:justify-end">
          {items.map((item) => {
            const active = isActiveItem(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`max-w-full rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-transparent bg-[linear-gradient(135deg,#2563EB_0%,#4F46E5_52%,#7C3AED_100%)] text-white shadow-[0_18px_38px_-24px_rgba(79,70,229,0.7)]"
                    : "border-slate-700/80 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                }`}
                title={item.label}
              >
                <span className="cf-safe-label block">{item.label}</span>
              </Link>
            );
          })}
        </ResponsiveToolbar>
      </div>
    </section>
  );
}
