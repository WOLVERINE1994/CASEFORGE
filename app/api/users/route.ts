import {
  listUsers,
  UserServiceNotReadyError,
} from "../../../services/user-service";

export async function GET() {
  try {
    const users = await listUsers();
    return Response.json({ users });
  } catch (error) {
    if (error instanceof UserServiceNotReadyError) {
      return Response.json(
        {
          error: error.message,
          status: "scaffolded",
        },
        { status: 501 }
      );
    }

    console.error("USERS GET ERROR:", error);
    return Response.json(
      { error: "Failed to load users." },
      { status: 500 }
    );
  }
}
