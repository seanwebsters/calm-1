import { env } from "@/lib/env";
import { LoginForm } from "./form";
import { LogoMark } from "@/components/admin/logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default function LoginPage() {
  const mode = env.authProvider;
  const passcodeRequired = mode === "local" && (!!env.adminPasscode || env.isProduction);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-5 text-[22px] font-semibold tracking-display text-ink">Calm-1 Admin</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">Calm, just a message away.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <LoginForm mode={mode} passcodeRequired={passcodeRequired} />
        </div>
        <p className="mt-6 text-center text-[12px] text-ink-4">Restricted to the Calm product team. Access is logged.</p>
      </div>
    </div>
  );
}
