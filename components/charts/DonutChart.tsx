type DonutChartDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type Props = {
  title: string;
  description?: string;
  data: DonutChartDatum[];
  centerLabel: string;
  centerValue: string;
};

export default function DonutChart({
  title,
  description,
  data,
  centerLabel,
  centerValue,
}: Props) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const segments = data.reduce<
    Array<DonutChartDatum & { strokeDasharray: string; strokeDashoffset: number }>
  >((accumulator, item) => {
    const previousOffset =
      accumulator.length > 0
        ? accumulator[accumulator.length - 1].strokeDashoffset +
          Number(
            accumulator[accumulator.length - 1].strokeDasharray.split(" ")[0]
          )
        : 0;
    const value = total <= 0 ? 0 : item.value;
    const strokeLength = (value / Math.max(total, 1)) * circumference;

    accumulator.push({
      ...item,
      strokeDasharray: `${strokeLength} ${circumference}`,
      strokeDashoffset: -previousOffset,
    });

    return accumulator;
  }, []);

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

      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="relative mx-auto h-40 w-40 shrink-0">
          <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="rgb(228 228 231)"
              strokeWidth="18"
              className="dark:stroke-zinc-800"
            />
            {segments.map((segment) => (
              <circle
                key={segment.key}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="18"
                strokeDasharray={segment.strokeDasharray}
                strokeDashoffset={segment.strokeDashoffset}
                strokeLinecap="round"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              {centerLabel}
            </span>
            <span className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {centerValue}
            </span>
          </div>
        </div>

        <div className="grid flex-1 gap-3">
          {data.map((item) => {
            const percent = total <= 0 ? 0 : Math.round((item.value / total) * 100);

            return (
              <div
                key={item.key}
                className="rounded-[18px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="min-w-0 text-sm font-semibold leading-5 text-zinc-900 dark:text-zinc-100">
                      {item.label}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-zinc-600 dark:text-zinc-300 sm:text-right">
                    {percent}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {item.value} item{item.value === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
