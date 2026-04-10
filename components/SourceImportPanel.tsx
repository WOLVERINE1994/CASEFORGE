"use client";

import { useState } from "react";
import {
  sourceArtifactLabels,
  type SourceArtifact,
  type SourceArtifactType,
} from "../utils/workspace";
import { formatUtcDateTime } from "../utils/date-format";

type Props = {
  sources: SourceArtifact[];
  onImportSource: (
    type: SourceArtifactType,
    title: string,
    content: string,
    mode: "replace" | "append"
  ) => void;
};

export default function SourceImportPanel({
  sources,
  onImportSource,
}: Props) {
  const [type, setType] = useState<SourceArtifactType>("jira");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleImport = (mode: "replace" | "append") => {
    if (!content.trim()) {
      alert("Paste a source artifact before importing it.");
      return;
    }

    onImportSource(type, title, content, mode);
    setTitle("");
    setContent("");
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white/90 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          Source-Of-Truth Imports
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          Bring Jira, PRD, API spec, user story, or changelog input into the workspace
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Import the source artifact, normalize it into QA-ready text, and use it as the requirement baseline for the rest of the workspace.
        </p>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.1fr)_320px]">
        <div>
          <div className="flex flex-wrap gap-3">
            <select
              value={type}
              onChange={(event) => setType(event.target.value as SourceArtifactType)}
              className="min-h-[48px] rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            >
              {Object.entries(sourceArtifactLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Optional source title"
              className="min-h-[48px] flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
            />
          </div>

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste the Jira story, PRD excerpt, API spec snippet, user story, or changelog text..."
            className="mt-4 min-h-[180px] w-full rounded-[24px] border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500/60 dark:focus:ring-emerald-500/10"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => handleImport("replace")}
              className="rounded-2xl bg-[linear-gradient(135deg,_#0f766e_0%,_#14532d_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(5,150,105,0.65)] transition hover:brightness-110"
            >
              Import As Requirement
            </button>
            <button
              onClick={() => handleImport("append")}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Append To Requirement
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Imported Sources
            </p>
            {sources.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                Imported artifacts will appear here after you bring them into the workspace.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {sources.slice(0, 6).map((source) => (
                  <div
                    key={source.id}
                    className="rounded-2xl bg-white px-3 py-3 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
                  >
                    <div className="font-semibold">{source.title}</div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {sourceArtifactLabels[source.type]} imported on{" "}
                      {formatUtcDateTime(source.importedAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
