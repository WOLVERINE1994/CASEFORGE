import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import type { SessionAuthObject } from "@clerk/backend";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ACCESS_PENDING_PATH,
  evaluateCaseForgeAccess,
  extractEmailFromSessionClaims,
} from "./lib/access-control";
import { isClerkAuthActive } from "./lib/auth-mode";

const isProtectedRoute = createRouteMatcher([
  "/projects(.*)",
  "/settings(.*)",
  "/api/automation(.*)",
  "/api/fill-bug-prediction(.*)",
  "/api/fill-coverage-gap(.*)",
  "/api/generate(.*)",
  "/api/generate-change-impact-cases(.*)",
  "/api/generate-from-website(.*)",
  "/api/issues(.*)",
  "/api/merge-similar-cases(.*)",
  "/api/projects(.*)",
  "/api/regenerate-row(.*)",
  "/api/reports(.*)",
  "/api/session(.*)",
]);

const hasClerkServerConfig = isClerkAuthActive();

const legacyProjectSections = new Set([
  "activity",
  "board",
  "cases",
  "issues",
  "notifications",
  "release",
  "releases",
  "reports",
  "salesforce",
  "settings",
]);

function focusedWorkspaceRedirect(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return NextResponse.redirect(new URL("/projects", request.url));
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)\/([^/]+)/);
  if (!projectMatch) return null;

  const [, projectKey, section] = projectMatch;
  if (section === "runs") {
    return NextResponse.redirect(
      new URL(`/projects/${projectKey}/automation/runs`, request.url),
    );
  }
  if (legacyProjectSections.has(section)) {
    return NextResponse.redirect(
      new URL(`/projects/${projectKey}/workspace`, request.url),
    );
  }

  return null;
}

async function resolveSignedInEmail(authObject: SessionAuthObject) {
  const claimedEmail = extractEmailFromSessionClaims(authObject.sessionClaims);
  if (claimedEmail) return claimedEmail;
  if (!authObject.userId) return null;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(authObject.userId);
    return (
      user.primaryEmailAddress?.emailAddress ||
      user.emailAddresses[0]?.emailAddress ||
      null
    );
  } catch (error) {
    console.warn("CASEFORGE_ACCESS_EMAIL_LOOKUP_FAILED", {
      userId: authObject.userId,
      message: error instanceof Error ? error.message : "Unknown Clerk error",
    });
    return null;
  }
}

function deniedAccessResponse(
  request: NextRequest,
  email: string | null,
  reason: string,
) {
  console.warn("CASEFORGE_ACCESS_DENIED", {
    email: email || "unknown",
    path: request.nextUrl.pathname,
    reason,
    at: new Date().toISOString(),
  });

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Access pending approval" },
      { status: 403 },
    );
  }

  const url = new URL(ACCESS_PENDING_PATH, request.url);
  if (email) url.searchParams.set("email", email);
  return NextResponse.redirect(url);
}

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const redirect = focusedWorkspaceRedirect(request);
  if (redirect) return redirect;

  if (isProtectedRoute(request)) {
    const authObject = await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
      unauthorizedUrl: new URL("/sign-in", request.url).toString(),
    });

    const email = await resolveSignedInEmail(authObject);
    const decision = evaluateCaseForgeAccess(email);
    if (!decision.allowed) {
      return deniedAccessResponse(request, email, decision.reason);
    }
  }
});

export default hasClerkServerConfig
  ? clerkProxy
  : function missingClerkServerConfigProxy(request: NextRequest) {
      const redirect = focusedWorkspaceRedirect(request);
      if (redirect) return redirect;
      if (isProtectedRoute(request)) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/projects(.*)",
    "/settings(.*)",
    "/api/:path*",
    "/trpc/:path*",
  ],
};
