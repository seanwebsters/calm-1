"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ mode, passcodeRequired }: { mode: "local" | "supabase"; passcodeRequired: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "supabase" ? { email, password } : { passcode: password }) });
    setLoading(false);
    if (res.ok) router.push("/overview");
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Sign-in failed");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "supabase" ? (
        <>
          <Field label="Work email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </>
      ) : passcodeRequired ? (
        <Field label="Admin passcode" hint="Set with ADMIN_PASSCODE. Use Supabase Auth for named team accounts.">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      ) : (
        <p className="text-[13px] text-ink-3">No passcode is set, so anyone with this link can open the dashboard. Set ADMIN_PASSCODE to lock it.</p>
      )}
      {error ? <p className="text-[13px] text-bad">{error}</p> : null}
      <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
        {passcodeRequired || mode === "supabase" ? "Sign in" : "Continue"}
      </Button>
    </form>
  );
}
