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

const hasClerkKeys =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

function missingClerkConfigProxy() {
  return NextResponse.next();
}

export default hasClerkKeys ? clerkProxy : missingClerkConfigProxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
