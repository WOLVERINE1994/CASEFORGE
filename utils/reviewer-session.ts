import { cookies } from "next/headers";

const REVIEWER_COOKIE_NAME = "qa_active_reviewer";

export type ReviewerSessionRecord = {
  id?: string;
  name?: string;
  email?: string;
};

const isReviewerSession = (value: unknown): value is ReviewerSessionRecord =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (typeof (value as ReviewerSessionRecord).id === "string" ||
        typeof (value as ReviewerSessionRecord).name === "string" ||
        typeof (value as ReviewerSessionRecord).email === "string")
  );

export async function readActiveReviewerSession(): Promise<ReviewerSessionRecord | null> {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(REVIEWER_COOKIE_NAME)?.value;

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return isReviewerSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
