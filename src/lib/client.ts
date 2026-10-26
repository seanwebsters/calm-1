"use client";
/** Browser-side JSON helper for dashboard actions. */
export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
  if (!res.ok) throw new Error(data.issues?.length ? `${data.error}: ${data.issues.join("; ")}` : (data.error ?? `Request failed (${res.status})`));
  return data as T;
}

type ToastTone = "good" | "bad" | "neutral";
export function toast(message: string, tone: ToastTone = "neutral") {
  window.dispatchEvent(new CustomEvent("calm1-toast", { detail: { message, tone } }));
}
