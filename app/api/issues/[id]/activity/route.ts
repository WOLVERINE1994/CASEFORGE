import {
  ActivityServiceNotReadyError,
  listEntityActivity,
} from "../../../../../services/activity-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const activity = await listEntityActivity("issue", id);
    return Response.json({ activity });
  } catch (error) {
    if (error instanceof ActivityServiceNotReadyError) {
      return Response.json(
        {
          error: error.message,
          status: "scaffolded",
        },
        { status: 501 }
      );
    }

    console.error("ISSUE ACTIVITY GET ERROR:", error);
    return Response.json(
      { error: "Failed to load issue activity." },
      { status: 500 }
    );
  }
}
