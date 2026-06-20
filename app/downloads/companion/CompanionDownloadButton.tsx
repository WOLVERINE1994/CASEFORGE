"use client";

import { useState } from "react";

type CompanionDownloadButtonProps = {
  className?: string;
  href: string;
  label: string;
};

function filenameFromDisposition(value: string | null) {
  const match = String(value || "").match(/filename="?([^";]+)"?/i);
  return match?.[1] || "CaseForge-Companion-Setup.exe";
}

async function responseErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return data.error || "Installer is not available yet.";
  }
  const text = await response.text().catch(() => "");
  return text.trim() || "Installer is not available yet.";
}

export function CompanionDownloadButton({
  className,
  href,
  label,
}: CompanionDownloadButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startDownload = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        throw new Error(await responseErrorMessage(response));
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("Installer download was empty.");
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filenameFromDisposition(response.headers.get("content-disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Installer is not available yet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void startDownload()}
        disabled={busy}
        className={className}
      >
        {busy ? "Preparing download..." : label}
      </button>
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold leading-5 text-rose-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
