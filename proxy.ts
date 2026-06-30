import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/projects(.*)",
  "/settings(.*)",
  "/api/automation(.*)",
  "/api/fill-bug-prediction(.*)",
  "/api/fill-coverage-gap(.*)",
  "/api/generate(.*)",
  "/api/generate-change-impact-cases(.*)",
  "/api/issues(.*)",
  "/api/merge-similar-cases(.*)",
  "/api/projects(.*)",
  "/api/regenerate-row(.*)",
  "/api/reports(.*)",
  "/api/session(.*)",
]);

const hasClerkServerConfig =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);

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

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const redirect = focusedWorkspaceRedirect(request);
  if (redirect) return redirect;

  if (isProtectedRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
      unauthorizedUrl: new URL("/sign-in", request.url).toString(),
    });
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
