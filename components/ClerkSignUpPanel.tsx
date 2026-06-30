"use client";

import { SignUp } from "@clerk/nextjs";

export default function ClerkSignUpPanel() {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      fallbackRedirectUrl="/projects"
    />
  );
}
