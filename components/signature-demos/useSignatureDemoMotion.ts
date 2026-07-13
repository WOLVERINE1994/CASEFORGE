"use client";

import useMarketingMotion from "../useMarketingMotion";

const signatureDemosEnabled =
  process.env.NEXT_PUBLIC_SIGNATURE_DEMOS_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_SIGNATURE_DEMOS_ENABLED === "1";

export default function useSignatureDemoMotion() {
  const marketingMotion = useMarketingMotion();

  return {
    ...marketingMotion,
    enabled: marketingMotion.enabled && signatureDemosEnabled,
    signatureDemosEnabled,
  };
}
