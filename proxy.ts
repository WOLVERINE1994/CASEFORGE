import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
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

const allowPublicWorkspace =
  process.env.CASEFORGE_PUBLIC_WORKSPACE === "true" ||
  (process.env.VERCEL === "1" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const isPublicWorkspaceRoute =
    pathname.startsWith("/projects") ||
    pathname.startsWith("/api/projects") ||
    pathname.startsWith("/api/generate") ||
    pathname.startsWith("/api/generate-change-impact-cases") ||
    pathname.startsWith("/api/fill-coverage-gap") ||
    pathname.startsWith("/api/fill-bug-prediction") ||
    pathname.startsWith("/api/automation/browser");

  if (allowPublicWorkspace && isPublicWorkspaceRoute) {
    return;
  }

  if (isProtectedRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
      unauthorizedUrl: new URL("/sign-in", request.url).toString(),
    });
  }
});

export default hasClerkServerConfig
  ? clerkProxy
  : function missingClerkServerConfigProxy() {
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
