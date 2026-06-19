import { SignIn } from "@clerk/nextjs";
import AuthSetupNotice from "../../../components/AuthSetupNotice";
import { isClerkAuthActive } from "../../../lib/auth-mode";

export default function SignInPage() {
  if (!isClerkAuthActive()) {
    return <AuthSetupNotice action="sign in" />;
  }

  return (
    <main className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_30%),linear-gradient(180deg,_#08101d_0%,_#0b1220_54%,_#111827_100%)] px-4 py-12">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/projects"
      />
    </main>
  );
}
