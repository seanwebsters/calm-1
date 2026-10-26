import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-sm text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-ink-4" strokeWidth={1.5} />
        <h1 className="mt-4 text-[18px] font-semibold text-ink">You don't have access to this page</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">Your role doesn't include {need ? <code className="text-ink-2">{need}</code> : "this permission"}. Ask an owner to change your role.</p>
        <Link href="/overview" className="mt-5 inline-block text-[13.5px] font-medium text-calm-600 hover:underline">Back to Overview</Link>
      </div>
    </div>
  );
}
