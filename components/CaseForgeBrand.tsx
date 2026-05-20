"use client";

import Image from "next/image";

type CaseForgeBrandProps = {
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
  tone?: "default" | "onDark";
  className?: string;
  priority?: boolean;
};

const markSizeClassName = {
  sm: "h-11 w-11 rounded-2xl",
  md: "h-12 w-12 rounded-[18px]",
  lg: "h-14 w-14 rounded-[20px]",
} as const;

const wordmarkClassName = {
  sm: {
    wrap: "gap-2.5",
    title: "text-base",
    subtext: "text-[10px]",
    showSubtext: false,
  },
  md: {
    wrap: "gap-3",
    title: "text-lg",
    subtext: "text-[10px]",
    showSubtext: true,
  },
  lg: {
    wrap: "gap-3.5",
    title: "text-[22px]",
    subtext: "text-[11px]",
    showSubtext: true,
  },
} as const;

function BrandMark({
  size = "md",
  className = "",
  priority = false,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none relative shrink-0 select-none overflow-hidden border border-slate-200/80 bg-white shadow-[0_18px_36px_-26px_rgba(37,99,235,0.42)] ${markSizeClassName[size]} ${className}`.trim()}
      aria-hidden="true"
    >
      <Image
        src="/branding/caseforge-logo.png"
        alt="caseForge logo mark"
        fill
        priority={priority}
        sizes="64px"
        className="object-cover"
        draggable={false}
        style={{
          objectPosition: "16% 20%",
        }}
      />
    </div>
  );
}

export default function CaseForgeBrand({
  variant = "full",
  size = "md",
  tone = "default",
  className = "",
  priority = false,
}: CaseForgeBrandProps) {
  if (variant === "mark") {
    return <BrandMark size={size} className={className} priority={priority} />;
  }

  const config = wordmarkClassName[size];
  const titleColor =
    tone === "onDark" ? "text-white" : "text-slate-950 dark:text-slate-50";
  const forgeGradient =
    tone === "onDark"
      ? "bg-[linear-gradient(135deg,#67E8F9_0%,#60A5FA_48%,#A78BFA_100%)]"
      : "bg-[linear-gradient(135deg,#2563EB_0%,#4F46E5_52%,#7C3AED_100%)]";
  const subtextColor =
    tone === "onDark" ? "text-slate-300" : "text-slate-500 dark:text-slate-400";

  return (
    <div
      className={`pointer-events-none flex select-none items-center ${config.wrap} ${className}`.trim()}
      aria-label="caseForge"
    >
      <BrandMark size={size} priority={priority} />
      <div className="min-w-0">
        <div
          className={`truncate font-semibold tracking-tight ${titleColor} ${config.title}`}
        >
          <span>case</span>
          <span className={`${forgeGradient} bg-clip-text text-transparent`}>
            Forge
          </span>
        </div>
        {config.showSubtext ? (
          <p className={`mt-0.5 truncate font-semibold uppercase tracking-[0.18em] ${subtextColor} ${config.subtext}`}>
            AI-powered QA workspace
          </p>
        ) : null}
      </div>
    </div>
  );
}
