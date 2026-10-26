import { requirePage } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { env } from "@/lib/env";
import { Sidebar } from "@/components/admin/sidebar";
import { Toaster } from "@/components/admin/toaster";
import { ensureBootstrapped } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePage();
  await ensureBootstrapped();
  return (
    <div className="flex min-h-screen">
      <Sidebar admin={{ name: admin.name, email: admin.email, roleLabel: ROLE_LABELS[admin.role] }} environment={env.deployment.environment} />
      <main className="min-w-0 flex-1">
        {env.openAccess || env.temporaryStorage ? (
          <div className="border-b border-warn/20 bg-warn-soft px-10 py-2 text-[12.5px] text-warn">
            {[env.openAccess ? "Open access: no passcode is set, so anyone with the link can use this dashboard" : null, env.temporaryStorage ? "Temporary storage: connect Supabase so data isn't lost when the server restarts" : null].filter(Boolean).join(" · ")}. See Settings → System.
          </div>
        ) : null}
        <div className="mx-auto max-w-[1320px] px-10 pb-16 pt-10">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
