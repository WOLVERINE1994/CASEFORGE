import { getCurrentOwnerEmail } from "../../../../../lib/access-owner";
import {
  AccessRequestServiceNotReadyError,
  decideAccessRequest,
} from "../../../../../services/access-request-service";

type DecisionRouteProps = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function POST(request: Request, { params }: DecisionRouteProps) {
  const ownerEmail = await getCurrentOwnerEmail();
  if (!ownerEmail) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await params;
  const body = (await request.json().catch(() => null)) as {
    decision?: string;
  } | null;
  const status = body?.decision === "rejected" ? "rejected" : "approved";

  try {
    const accessRequest = await decideAccessRequest({
      id: requestId,
      status,
      decidedByEmail: ownerEmail,
    });

    if (!accessRequest) {
      return Response.json({ error: "Request not found." }, { status: 404 });
    }

    return Response.json({ request: accessRequest });
  } catch (error) {
    if (error instanceof AccessRequestServiceNotReadyError) {
      return Response.json(
        { error: error.message, status: "scaffolded" },
        { status: 501 },
      );
    }

    console.error("ACCESS REQUEST DECISION ERROR:", error);
    return Response.json(
      { error: "Failed to update access request." },
      { status: 500 },
    );
  }
}
