import {
  CommentServiceNotReadyError,
  createIssueComment,
  listIssueComments,
} from "../../../../../services/comment-service";
import { readActiveReviewerSession } from "../../../../../utils/reviewer-session";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const comments = await listIssueComments(id);
    return Response.json({ comments });
  } catch (error) {
    if (error instanceof CommentServiceNotReadyError) {
      return Response.json(
        {
          error: error.message,
          status: "scaffolded",
        },
        { status: 501 }
      );
    }

    console.error("ISSUE COMMENTS GET ERROR:", error);
    return Response.json(
      { error: "Failed to load issue comments." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const activeReviewer = await readActiveReviewerSession();

    const authorId =
      typeof body?.authorId === "string"
        ? body.authorId.trim()
        : activeReviewer?.id?.trim() || "";
    const commentBody =
      typeof body?.body === "string" ? body.body : "";

    if (!authorId) {
      return Response.json(
        { error: "Comment author is required." },
        { status: 400 }
      );
    }

    if (!commentBody.trim()) {
      return Response.json(
        { error: "Comment body is required." },
        { status: 400 }
      );
    }

    const comment = await createIssueComment(id, {
      authorId,
      body: commentBody,
    });

    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof CommentServiceNotReadyError) {
      return Response.json(
        {
          error: error.message,
          status: "scaffolded",
        },
        { status: 501 }
      );
    }

    console.error("ISSUE COMMENTS POST ERROR:", error);
    return Response.json(
      { error: "Failed to create issue comment." },
      { status: 500 }
    );
  }
}
