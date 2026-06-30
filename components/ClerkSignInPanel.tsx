"use client";

import { SignIn } from "@clerk/nextjs";

export default function ClerkSignInPanel() {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/projects"
    />
  );
}
