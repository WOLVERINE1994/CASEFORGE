"use client";

type CaseForgeBrandProps = {
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
  tone?: "default" | "onDark";
  className?: string;
  priority?: boolean;
};

const markSizeClassName = {
  sm: "h-7 w-7 rounded-lg",
  md: "h-8 w-8 rounded-[10px]",
  lg: "h-9 w-9 rounded-xl",
} as const;

const brandSizeClassName = {
  sm: "gap-2 rounded-xl px-2.5 py-2",
  md: "gap-2.5 rounded-[14px] px-3 py-2.5",
  lg: "gap-3 rounded-2xl px-3.5 py-3",
} as const;

const textSizeClassName = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
} as const;

function BrandMark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-amber-300/30 bg-slate-950 shadow-[0_12px_26px_-18px_rgba(245,158,11,0.72)] ${markSizeClassName[size]} ${className}`.trim()}
      aria-hidden="true"
    >
      <svg
        className="h-[78%] w-[78%]"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 2.75 27.7 9.38v13.24L16 29.25 4.3 22.62V9.38L16 2.75Z"
          fill="#D8B75C"
        />
        <path
          d="M16 7.7 23.35 11.88v8.24L16 24.3l-7.35-4.18v-8.24L16 7.7Z"
          fill="#0A1020"
        />
        <path
          d="M16 10.2 20.88 12.98v5.04L16 20.8l-4.88-2.78v-5.04L16 10.2Z"
          fill="#F0D37A"
        />
        <path d="M16 10.2v5.55l-4.88 2.27v-5.04L16 10.2Z" fill="#C99B38" />
      </svg>
    </div>
  );
}

export default function CaseForgeBrand({
  variant = "full",
  size = "md",
  tone = "default",
  className = "",
}: CaseForgeBrandProps) {
  if (variant === "mark") {
    return <BrandMark size={size} className={className} />;
  }

  const shellTone =
    tone === "onDark"
      ? "border-amber-300/20 bg-[#070B16] shadow-[0_18px_38px_-28px_rgba(245,158,11,0.65)]"
      : "border-slate-900/10 bg-[#070B16] shadow-[0_18px_34px_-30px_rgba(15,23,42,0.7)]";

  return (
    <div
      className={`pointer-events-none relative inline-flex max-w-full select-none items-center overflow-hidden border ${shellTone} ${brandSizeClassName[size]} ${className}`.trim()}
      aria-label="CaseForge"
    >
      <span className="pointer-events-none absolute left-0 top-0 h-5 w-5 border-l border-t border-amber-300/35" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-5 w-5 border-b border-r border-amber-300/25" />
      <BrandMark size={size} />
      <span
        className={`truncate font-extrabold tracking-normal ${textSizeClassName[size]}`}
      >
        <span className="text-white">Case</span>
        <span className="text-[#4F7DFF]"> Forge</span>
      </span>
    </div>
  );
}
