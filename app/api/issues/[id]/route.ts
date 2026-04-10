import {
  IssueServiceNotReadyError,
  updateIssue,
  type UpdateIssueInput,
} from "../../../../services/issue-service";
import { readActiveReviewerSession } from "../../../../utils/reviewer-session";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as UpdateIssueInput;
    const activeReviewer = await readActiveReviewerSession();
    const issue = await updateIssue(id, body, activeReviewer?.id ?? null);

    return Response.json({ issue });
  } catch (error) {
    if (error instanceof IssueServiceNotReadyError) {
      return Response.json(
        {
          error: error.message,
          status: "scaffolded",
        },
        { status: 501 }
      );
    }

    console.error("ISSUE PATCH ERROR:", error);
    return Response.json(
      { error: "Failed to update issue." },
      { status: 500 }
    );
  }
}
