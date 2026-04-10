import { cookies } from "next/headers";
import { type ReviewerSessionRecord } from "../../../../utils/reviewer-session";

const REVIEWER_COOKIE_NAME = "qa_active_reviewer";

const isReviewerSession = (value: unknown): value is ReviewerSessionRecord =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (typeof (value as ReviewerSessionRecord).id === "string" ||
        typeof (value as ReviewerSessionRecord).name === "string" ||
        typeof (value as ReviewerSessionRecord).email === "string")
  );

export async function GET() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(REVIEWER_COOKIE_NAME)?.value;

  if (!rawValue) {
    return Response.json({ reviewer: null });
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Response.json({
      reviewer: isReviewerSession(parsed) ? parsed : null,
    });
  } catch {
    return Response.json({ reviewer: null });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { reviewer?: ReviewerSessionRecord | null };
    const reviewer = payload.reviewer;

    if (reviewer !== null && reviewer !== undefined && !isReviewerSession(reviewer)) {
      return Response.json({ error: "Invalid reviewer payload." }, { status: 400 });
    }

    const cookieStore = await cookies();

    if (!reviewer) {
      cookieStore.delete(REVIEWER_COOKIE_NAME);
      return Response.json({ reviewer: null });
    }

    cookieStore.set(
      REVIEWER_COOKIE_NAME,
      JSON.stringify({
        id: reviewer.id,
        name: reviewer.name,
        email: reviewer.email,
      }),
      {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      }
    );

    return Response.json({ reviewer });
  } catch {
    return Response.json({ error: "Failed to update reviewer session." }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(REVIEWER_COOKIE_NAME);
  return Response.json({ reviewer: null });
}
