import { getAccessRequestNotificationEmails } from "../lib/access-control";
import type { AccessRequestRecord } from "./access-request-service";

type AccessNotificationInput = {
  request: AccessRequestRecord;
  decisionToken: string;
  origin: string;
};

type AccessNotificationResult =
  | { sent: true }
  | { sent: false; reason: "missing_api_key" | "provider_rejected" | "network_error"; detail?: string };

const getNotificationRecipients = () => getAccessRequestNotificationEmails();

const getEmailFromAddress = () =>
  process.env.CASEFORGE_EMAIL_FROM ||
  process.env.RESEND_FROM_EMAIL ||
  "CaseForge <onboarding@resend.dev>";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function sendAccessRequestNotification({
  request,
  decisionToken,
  origin,
}: AccessNotificationInput): Promise<AccessNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipients = getNotificationRecipients();
  const approveUrl = new URL("/api/access-request-decision", origin);
  approveUrl.searchParams.set("token", decisionToken);
  approveUrl.searchParams.set("decision", "approved");

  const rejectUrl = new URL("/api/access-request-decision", origin);
  rejectUrl.searchParams.set("token", decisionToken);
  rejectUrl.searchParams.set("decision", "rejected");

  const adminUrl = new URL("/access-requests", origin);

  if (!apiKey) {
    console.warn("CASEFORGE_ACCESS_REQUEST_EMAIL_SKIPPED", {
      reason: "missing_RESEND_API_KEY",
      to: recipients,
      email: request.email,
    });
    return { sent: false, reason: "missing_api_key" };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2>CaseForge access request</h2>
      <p><strong>${escapeHtml(request.email)}</strong> requested access to CaseForge.</p>
      <p>Last requested path: ${escapeHtml(request.lastPath || "/")}</p>
      <p>
        <a href="${approveUrl.toString()}" style="display:inline-block;background:#047857;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;margin-right:8px">Approve</a>
        <a href="${rejectUrl.toString()}" style="display:inline-block;background:#991b1b;color:white;padding:10px 14px;border-radius:8px;text-decoration:none">Reject</a>
      </p>
      <p><a href="${adminUrl.toString()}">Open access requests in CaseForge</a></p>
    </div>
  `;

  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getEmailFromAddress(),
        to: recipients,
        subject: `CaseForge access request: ${request.email}`,
        html,
      }),
    });
  } catch (error) {
    console.warn("CASEFORGE_ACCESS_REQUEST_EMAIL_NETWORK_ERROR", {
      email: request.email,
      message: error instanceof Error ? error.message : "Unknown network error",
    });
    return { sent: false, reason: "network_error" };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn("CASEFORGE_ACCESS_REQUEST_EMAIL_FAILED", {
      status: response.status,
      body,
      email: request.email,
    });
    return {
      sent: false,
      reason: "provider_rejected",
      detail:
        response.status === 401
          ? "Resend returned HTTP 401. Check that RESEND_API_KEY contains only the full re_ token, then redeploy."
          : `Resend returned HTTP ${response.status}.`,
    };
  }

  return { sent: true };
}
