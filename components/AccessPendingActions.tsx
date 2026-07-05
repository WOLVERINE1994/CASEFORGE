"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

const secondaryButtonClassName =
  "rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-70";

const primaryButtonClassName =
  "rounded-xl bg-cyan-200 px-4 py-2 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-100";

export default function AccessPendingActions() {
  const { signOut } = useClerk();
  const [pendingTarget, setPendingTarget] = useState<"sign-in" | "sign-up" | null>(
    null,
  );

  async function switchAccount(target: "sign-in" | "sign-up") {
    setPendingTarget(target);
    await signOut({ redirectUrl: `/${target}` });
  }

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => switchAccount("sign-in")}
        disabled={pendingTarget !== null}
        className={secondaryButtonClassName}
      >
        {pendingTarget === "sign-in" ? "Opening..." : "Try another account"}
      </button>
      <button
        type="button"
        onClick={() => switchAccount("sign-up")}
        disabled={pendingTarget !== null}
        className={secondaryButtonClassName}
      >
        {pendingTarget === "sign-up" ? "Opening..." : "Create new account"}
      </button>
      <Link href="/" className={primaryButtonClassName}>
        Back home
      </Link>
    </div>
  );
}
