import { getCurrentOwnerEmail } from "../../../lib/access-owner";
import {
  AccessRequestServiceNotReadyError,
  listAccessRequests,
} from "../../../services/access-request-service";

export async function GET() {
  const ownerEmail = await getCurrentOwnerEmail();
  if (!ownerEmail) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const requests = await listAccessRequests();
    return Response.json({ requests });
  } catch (error) {
    if (error instanceof AccessRequestServiceNotReadyError) {
      return Response.json(
        { error: error.message, status: "scaffolded" },
        { status: 501 },
      );
    }

    console.error("ACCESS REQUESTS GET ERROR:", error);
    return Response.json(
      { error: "Failed to load access requests." },
      { status: 500 },
    );
  }
}
