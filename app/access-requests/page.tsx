import { redirect } from "next/navigation";
import AccessRequestsClient from "../../components/AccessRequestsClient";
import { getCurrentOwnerEmail } from "../../lib/access-owner";

export const dynamic = "force-dynamic";

export default async function AccessRequestsPage() {
  const ownerEmail = await getCurrentOwnerEmail();

  if (!ownerEmail) {
    redirect("/projects?open=workspace");
  }

  return <AccessRequestsClient ownerEmail={ownerEmail} />;
}
