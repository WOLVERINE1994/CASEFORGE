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

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
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
