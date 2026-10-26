"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, toast } from "@/lib/client";
import { Button } from "@/components/ui/button";

export function DemoLoader({ hasData, canManage }: { hasData: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!canManage) return null;
  return (
    <Button
      size="sm"
      variant={hasData ? "ghost" : "primary"}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (hasData) await api("/api/demo", { method: "DELETE" });
          else await api("/api/demo", { body: {} });
          toast(hasData ? "Demo data removed" : "Demo data loaded", "good");
          router.refresh();
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), "bad");
        } finally {
          setBusy(false);
        }
      }}
    >
      {hasData ? "Remove demo data" : "Load demo data"}
    </Button>
  );
}
