import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { listVersions } from "@/lib/personality/service";
import { CORE_PROMPT } from "@/lib/personality/prompt";
import { llm } from "@/lib/llm";
import { PageHeader } from "@/components/ui/misc";
import { PersonalityEditor } from "./editor";

export const metadata = { title: "Personality" };

export default async function PersonalityPage() {
  const admin = await requirePage("dashboard.view");
  const versions = await listVersions();
  return (
    <>
      <PageHeader title="Personality" description="Shape how Calm-1 sounds. Draft, preview against the live version, then publish – no redeploy. Every version can be rolled back." />
      <PersonalityEditor versions={versions} core={CORE_PROMPT} perms={{ edit: can(admin.role, "personality.edit"), publish: can(admin.role, "personality.publish") }} llmConfigured={llm().configured()} />
    </>
  );
}
