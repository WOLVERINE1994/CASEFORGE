import { currentUser } from "@clerk/nextjs/server";
import {
  getCaseForgeOwnerEmails,
  normalizeAccessEmail,
} from "./access-control";

export async function getCurrentOwnerEmail() {
  const user = await currentUser();
  const email = normalizeAccessEmail(
    user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses[0]?.emailAddress ||
      null,
  );

  if (!email || !getCaseForgeOwnerEmails().has(email)) {
    return null;
  }

  return email;
}

export async function isCurrentUserCaseForgeOwner() {
  return (await getCurrentOwnerEmail()) !== null;
}
