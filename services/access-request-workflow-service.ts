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
  status: "skipped" | "recorded" | "notified" | "not_ready" | "failed";
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

    const sent = await sendAccessRequestNotification({
      request: result.request,
      decisionToken: result.decisionToken,
      origin,
    });

    if (sent) {
      await markAccessRequestNotificationSent(result.request.id);
      return { status: "notified", request: result.request };
    }

    return { status: "recorded", request: result.request };
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
