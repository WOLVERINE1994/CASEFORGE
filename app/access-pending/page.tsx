import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import AccessPendingActions from "../../components/AccessPendingActions";
import {
  evaluateCaseForgeAccess,
  normalizeAccessEmail,
} from "../../lib/access-control";
import {
  AccessRequestServiceNotReadyError,
  hasApprovedDatabaseAccess,
} from "../../services/access-request-service";
import {
  recordAndNotifyAccessRequest,
  type RecordAndNotifyAccessRequestResult,
} from "../../services/access-request-workflow-service";

type AccessPendingPageProps = {
  searchParams?: Promise<{
    email?: string;
  }>;
};

export const dynamic = "force-dynamic";

function getRequestOrigin(headerList: Headers) {
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "";
}

async function hasWorkspaceAccess(email: string | null) {
  if (evaluateCaseForgeAccess(email).allowed) return true;

  try {
    return await hasApprovedDatabaseAccess(email);
  } catch (error) {
    if (!(error instanceof AccessRequestServiceNotReadyError)) {
      console.warn("CASEFORGE_PENDING_ACCESS_CHECK_FAILED", {
        email: email || "unknown",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return false;
  }
}

function getRequestNotice(
  requestResult: RecordAndNotifyAccessRequestResult | null,
) {
  if (!requestResult) return null;

  if (requestResult.status === "notified") {
    return "Approval request sent to the owner.";
  }

  if (requestResult.status === "recorded") {
    return "Approval request saved. Email delivery is not configured or failed, so the owner can review it from CaseForge.";
  }

  if (requestResult.status === "not_ready") {
    return "Approval request storage is being prepared. Please try again shortly.";
  }

  if (requestResult.status === "failed") {
    return "We could not save the approval request yet. Please try again shortly.";
  }

  return null;
}

export default async function AccessPendingPage({
  searchParams,
}: AccessPendingPageProps) {
  const params = await searchParams;
  const queryEmail = normalizeAccessEmail(params?.email);
  const user = await currentUser();
  const signedInEmail = normalizeAccessEmail(
    user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses[0]?.emailAddress ||
      null,
  );
  const email = signedInEmail || queryEmail;

  if (signedInEmail && (await hasWorkspaceAccess(signedInEmail))) {
    redirect("/projects?open=workspace");
  }

  const headerList = await headers();
  const origin = getRequestOrigin(headerList);
  const requestResult =
    signedInEmail && origin
      ? await recordAndNotifyAccessRequest({
          email: signedInEmail,
          clerkUserId: user?.id,
          path: "/access-pending",
          origin,
        })
      : null;
  const requestNotice = getRequestNotice(requestResult);

  return (
    <main className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#08101d_0%,_#0b1220_54%,_#111827_100%)] px-4 py-12 text-white">
      <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_30px_90px_-45px_rgba(8,47,73,0.95)] backdrop-blur-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">
          Access review
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight">
          CaseForge access is private
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-200">
          You are signed in, but this account has not been approved for
          CaseForge yet. The workspace will open only after the owner approves
          this access request.
        </p>
        {email ? (
          <p className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-sm font-semibold text-cyan-50">
            Account waiting for approval: {email}
          </p>
        ) : null}
        {requestNotice ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-slate-100">
            {requestNotice}
          </p>
        ) : null}
        <AccessPendingActions />
        <p className="mt-5 text-xs leading-5 text-slate-300">
          Owner review page:{" "}
          <Link
            href="/access-requests"
            className="font-bold text-cyan-200 underline decoration-cyan-200/50 underline-offset-4"
          >
            Access requests
          </Link>
        </p>
      </section>
    </main>
  );
}
