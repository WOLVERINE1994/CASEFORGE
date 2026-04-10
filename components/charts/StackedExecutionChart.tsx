type ExecutionSlice = {
  key: string;
  label: string;
  count: number;
  percent: number;
  color: string;
};

type Props = {
  title: string;
  description?: string;
  slices: ExecutionSlice[];
};

export default function StackedExecutionChart({
  title,
  description,
  slices,
}: Props) {
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

      <div className="mt-5 h-4 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {slices.map((slice) =>
          slice.percent > 0 ? (
            <div
              key={slice.key}
              className="h-full"
              style={{ width: `${slice.percent}%`, float: "left", backgroundColor: slice.color }}
            />
          ) : null
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {slices.map((slice) => (
          <div
            key={slice.key}
            className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/70"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {slice.label}
                </span>
              </div>
              <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                {slice.percent}%
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {slice.count} item{slice.count === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
