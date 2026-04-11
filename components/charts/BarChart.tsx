type BarChartDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type Props = {
  title: string;
  description?: string;
  data: BarChartDatum[];
  maxValue?: number;
  valueSuffix?: string;
};

export default function BarChart({
  title,
  description,
  data,
  maxValue,
  valueSuffix = "",
}: Props) {
  const resolvedMaxValue =
    maxValue ?? Math.max(...data.map((item) => item.value), 0);

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

      <div className="mt-5 space-y-4">
        {data.map((item) => {
          const percent =
            resolvedMaxValue <= 0 ? 0 : Math.round((item.value / resolvedMaxValue) * 100);

          return (
            <div key={item.key}>
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
                  {item.value}
                  {valueSuffix}
                </span>
              </div>

              <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(item.value > 0 ? 8 : 0, percent)}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
