"use client";

import { useEffect, useMemo, useState } from "react";
import AppSidebar from "./AppSidebar";
import ResponsiveShell from "./ResponsiveShell";

type AccessRequestStatus = "pending" | "approved" | "rejected";

type AccessRequestRecord = {
  id: string;
  email: string;
  clerkUserId: string | null;
  status: AccessRequestStatus;
  requestCount: number;
  firstRequestedAt: string;
  lastRequestedAt: string;
  lastPath: string;
  notificationSentAt: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
};

const statusClassName: Record<AccessRequestStatus, string> = {
  pending:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  rejected:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
};

const formatDateTime = (value: string | null) => {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
};

export default function AccessRequestsClient({
  ownerEmail,
}: {
  ownerEmail: string;
}) {
  const [requests, setRequests] = useState<AccessRequestRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests],
  );

  const loadRequests = async () => {
    setState("loading");
    setNotice(null);

    try {
      const response = await fetch("/api/access-requests", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        requests?: AccessRequestRecord[];
        error?: string;
      };

      if (!response.ok || !Array.isArray(payload.requests)) {
        throw new Error(payload.error || "Failed to load access requests.");
      }

      setRequests(payload.requests);
      setState("ready");
    } catch (error) {
      setState("unavailable");
      setNotice(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to load access requests.",
      );
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const decideRequest = async (
    requestId: string,
    decision: Exclude<AccessRequestStatus, "pending">,
  ) => {
    setBusyId(requestId);
    setNotice(null);

    try {
      const response = await fetch(`/api/access-requests/${requestId}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json()) as {
        request?: AccessRequestRecord;
        error?: string;
      };

      if (!response.ok || !payload.request) {
        throw new Error(payload.error || "Failed to update access request.");
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === payload.request?.id ? payload.request : request,
        ),
      );
      setNotice(`${payload.request.email} was ${decision}.`);
    } catch (error) {
      setNotice(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to update access request.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
      <ResponsiveShell
        mobileTitle="Access Requests"
        mobileSubtitle={`${pendingCount} pending`}
        desktopSidebar={<AppSidebar />}
        mobileSidebar={<AppSidebar />}
        storageKey="caseforge:drawer:access-requests"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-[32px] border border-white/80 bg-white/92 px-8 py-8 shadow-[0_24px_65px_-36px_rgba(15,23,42,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/88">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              Private Beta Gate
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Access requests
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              Review users who tried to enter CaseForge. Approving a request
              lets that email open the workspace without editing Vercel env
              variables.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                Owner: {ownerEmail}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Pending: {pendingCount}
              </span>
            </div>

            {notice ? (
              <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                {notice}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void loadRequests()}
              disabled={state === "loading"}
              className="mt-6 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {state === "loading" ? "Refreshing..." : "Refresh requests"}
            </button>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {state === "loading" ? (
              <div className="p-6 text-sm text-zinc-600 dark:text-zinc-300">
                Loading access requests...
              </div>
            ) : null}

            {state === "unavailable" ? (
              <div className="p-6 text-sm text-rose-700 dark:text-rose-200">
                Access request storage is unavailable. Apply the latest
                migration and refresh.
              </div>
            ) : null}

            {state === "ready" && requests.length === 0 ? (
              <div className="p-8 text-center">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  No access requests yet
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  When someone signs in without approval, their email will
                  appear here.
                </p>
              </div>
            ) : null}

            {state === "ready" && requests.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-zinc-50 text-left text-xs font-bold uppercase tracking-[0.14em] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="px-5 py-4">Email</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Last Attempt</th>
                      <th className="px-5 py-4">Attempts</th>
                      <th className="px-5 py-4">Decision</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {requests.map((request) => (
                      <tr key={request.id}>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                            {request.email}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {request.lastPath || "/"}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusClassName[request.status]}`}
                          >
                            {request.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300">
                          {formatDateTime(request.lastRequestedAt)}
                        </td>
                        <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300">
                          {request.requestCount}
                        </td>
                        <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300">
                          {request.decidedAt
                            ? `${formatDateTime(request.decidedAt)} by ${
                                request.decidedByEmail || "owner"
                              }`
                            : "Not decided"}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void decideRequest(request.id, "approved")
                              }
                              disabled={busyId === request.id}
                              className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void decideRequest(request.id, "rejected")
                              }
                              disabled={busyId === request.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </ResponsiveShell>
    </main>
  );
}
