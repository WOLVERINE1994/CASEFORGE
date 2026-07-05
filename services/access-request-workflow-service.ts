import {
  AccessRequestServiceNotReadyError,
  markAccessRequestNotificationSent,
  recordAccessRequest,
  type AccessRequestRecord,
} from "./access-request-service";
import { sendAccessRequestNotification } from "./access-notification-service";

type RecordAndNotifyAccessRequestInput = {
  email: string | null | undefined;
  clerkUserId?: string | null;
  path: string;
  origin: string;
};

export type RecordAndNotifyAccessRequestResult = {
  status:
    | "skipped"
    | "recorded"
    | "notified"
    | "email_not_configured"
    | "email_rejected"
    | "email_network_error"
    | "not_ready"
    | "failed";
  detail?: string;
  request?: AccessRequestRecord;
};

export async function recordAndNotifyAccessRequest({
  email,
  clerkUserId,
  path,
  origin,
}: RecordAndNotifyAccessRequestInput): Promise<RecordAndNotifyAccessRequestResult> {
  if (!email) return { status: "skipped" };

  try {
    const result = await recordAccessRequest({
      email,
      clerkUserId,
      path,
    });

    if (!result) return { status: "skipped" };

    if (!result.shouldNotify || !result.decisionToken) {
      return { status: "recorded", request: result.request };
    }

    const emailResult = await sendAccessRequestNotification({
      request: result.request,
      decisionToken: result.decisionToken,
      origin,
    });

    if (emailResult.sent) {
      await markAccessRequestNotificationSent(result.request.id);
      return { status: "notified", request: result.request };
    }

    if (emailResult.reason === "missing_api_key") {
      return { status: "email_not_configured", request: result.request };
    }

    if (emailResult.reason === "provider_rejected") {
      return {
        status: "email_rejected",
        detail: emailResult.detail,
        request: result.request,
      };
    }

    return { status: "email_network_error", request: result.request };
  } catch (error) {
    if (error instanceof AccessRequestServiceNotReadyError) {
      console.warn("CASEFORGE_ACCESS_REQUEST_STORAGE_NOT_READY", {
        email,
        path,
      });
      return { status: "not_ready" };
    }

    console.warn("CASEFORGE_ACCESS_REQUEST_RECORD_FAILED", {
      email,
      path,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { status: "failed" };
  }
}
