"use client";

import { signoffStatusLabels, type SignoffStatus } from "../utils/workspace";

type Props = {
  reviewerName: string;
  reviewerNotes: string;
  signoffStatus: SignoffStatus;
  onReviewerNameChange: (value: string) => void;
  onReviewerNotesChange: (value: string) => void;
  onSignoffStatusChange: (value: SignoffStatus) => void;
  onDownloadReviewMarkdown: () => void;
};

export default function CollaborationPanel({
  reviewerName,
  reviewerNotes,
  signoffStatus,
  onReviewerNameChange,
  onReviewerNotesChange,
  onSignoffStatusChange,
  onDownloadReviewMarkdown,
}: Props) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          Collaboration Output
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          Capture signoff status and reviewer context with the suite
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Keep reviewer notes, signoff posture, and a shareable markdown review summary directly in the workspace.
        </p>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="space-y-4">
          <input
            value={reviewerName}
            onChange={(event) => onReviewerNameChange(event.target.value)}
            placeholder="Reviewer name"
            className="min-h-[48px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          />
          <textarea
            value={reviewerNotes}
            onChange={(event) => onReviewerNotesChange(event.target.value)}
            placeholder="Reviewer notes, signoff context, release caveats, or handoff details..."
            className="min-h-[160px] w-full rounded-[24px] border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          />
          <div className="flex flex-wrap gap-3">
            <select
              value={signoffStatus}
              onChange={(event) =>
                onSignoffStatusChange(event.target.value as SignoffStatus)
              }
              className="min-h-[48px] rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              {Object.entries(signoffStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <button
              onClick={onDownloadReviewMarkdown}
              className="rounded-2xl bg-[linear-gradient(135deg,_#0f172a_0%,_#334155_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(15,23,42,0.65)] transition hover:brightness-110"
            >
              Download Review Markdown
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Current Signoff
            </p>
            <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
              {signoffStatusLabels[signoffStatus]}
            </div>
            <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800">
              Reviewer: {reviewerName.trim() || "Unassigned"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
