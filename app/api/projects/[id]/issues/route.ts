import {
  createProjectIssue,
  IssueServiceNotReadyError,
  listProjectIssues,
  type CreateIssueInput,
} from "../../../../../services/issue-service";
import { readActiveReviewerSession } from "../../../../../utils/reviewer-session";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const issues = await listProjectIssues(id);
    return Response.json({ issues });
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

    console.error("PROJECT ISSUES GET ERROR:", error);
    return Response.json(
      { error: "Failed to load issues." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as Partial<CreateIssueInput>;
    const activeReviewer = await readActiveReviewerSession();

    if (!body.summary?.trim() || !body.type) {
      return Response.json(
        { error: "Issue type and summary are required." },
        { status: 400 }
      );
    }

    const issue = await createProjectIssue(id, {
      type: body.type,
      summary: body.summary.trim(),
      description: body.description?.trim() || "",
      status: body.status ?? "backlog",
      priority: body.priority ?? "medium",
      reporterId: body.reporterId ?? activeReviewer?.id ?? null,
      assigneeId: body.assigneeId ?? null,
      sprintId: body.sprintId ?? null,
      dueDate: body.dueDate ?? null,
    });

    return Response.json({ issue }, { status: 201 });
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

    console.error("PROJECT ISSUES POST ERROR:", error);
    return Response.json(
      { error: "Failed to create issue." },
      { status: 500 }
    );
  }
}
