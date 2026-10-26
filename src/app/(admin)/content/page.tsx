import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listContent } from "@/lib/content/service";
import { PageHeader } from "@/components/ui/misc";
import { ContentManager } from "./content-manager";

export const metadata = { title: "Content" };

export default async function ContentPage() {
  const admin = await requirePage("dashboard.view");
  const items = await listContent();
  return (
    <>
      <PageHeader title="Content" description="The approved Calm catalogue. Calm-1 can only recommend what's verified here – it never invents titles or links." />
      <ContentManager items={items} canEdit={can(admin.role, "content.manage")} />
    </>
  );
}
