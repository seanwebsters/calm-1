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
        <div className="mx-auto max-w-[1320px] px-10 pb-16 pt-10">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
