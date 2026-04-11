type TrendPoint = {
  key: string;
  label: string;
  value: number;
  secondaryValue?: number;
};

type Props = {
  title: string;
  description?: string;
  points: TrendPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  valueSuffix?: string;
};

export default function TrendChart({
  title,
  description,
  points,
  primaryLabel,
  secondaryLabel,
  primaryColor = "#0ea5e9",
  secondaryColor = "#22c55e",
  valueSuffix = "%",
}: Props) {
  const width = 640;
  const height = 220;
  const padding = 28;
  const hasSecondary = points.some((point) => typeof point.secondaryValue === "number");
  const values = points.flatMap((point) =>
    typeof point.secondaryValue === "number"
      ? [point.value, point.secondaryValue]
      : [point.value]
  );
  const maxValue = Math.max(...values, 100);
  const minValue = 0;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const mapX = (index: number) =>
    points.length <= 1 ? width / 2 : padding + (index / (points.length - 1)) * chartWidth;
  const mapY = (value: number) =>
    padding + chartHeight - ((value - minValue) / Math.max(maxValue - minValue, 1)) * chartHeight;

  const primaryPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(index)} ${mapY(point.value)}`)
    .join(" ");
  const secondaryPath = hasSecondary
    ? points
        .map((point, index) =>
          `${index === 0 ? "M" : "L"} ${mapX(index)} ${mapY(point.secondaryValue ?? 0)}`
        )
        .join(" ")
    : "";

  return (
    <article className="rounded-[28px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-900/88">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      {description ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {description}
        </p>
      ) : null}

      {points.length === 0 ? (
        <div className="mt-5 rounded-[24px] border border-dashed border-zinc-200 px-5 py-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No trend points available yet.
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = padding + tick * chartHeight;
                return (
                  <line
                    key={tick}
                    x1={padding}
                    y1={y}
                    x2={width - padding}
                    y2={y}
                    stroke="rgb(212 212 216)"
                    strokeDasharray="4 4"
                    className="dark:stroke-zinc-700"
                  />
                );
              })}

              <path d={primaryPath} fill="none" stroke={primaryColor} strokeWidth="4" />
              {hasSecondary ? (
                <path d={secondaryPath} fill="none" stroke={secondaryColor} strokeWidth="4" />
              ) : null}

              {points.map((point, index) => (
                <g key={point.key}>
                  <circle cx={mapX(index)} cy={mapY(point.value)} r="5" fill={primaryColor} />
                  {hasSecondary && typeof point.secondaryValue === "number" ? (
                    <circle
                      cx={mapX(index)}
                      cy={mapY(point.secondaryValue)}
                      r="5"
                      fill={secondaryColor}
                    />
                  ) : null}
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
              {primaryLabel}
            </span>
            {hasSecondary && secondaryLabel ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: secondaryColor }}
                />
                {secondaryLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {points.map((point) => (
              <div
                key={point.key}
                className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
              >
                <p className="text-sm font-semibold leading-5 text-zinc-900 dark:text-zinc-100">
                  {point.label}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {primaryLabel}: {point.value}
                  {valueSuffix}
                  {typeof point.secondaryValue === "number" && secondaryLabel
                    ? ` | ${secondaryLabel}: ${point.secondaryValue}${valueSuffix}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
