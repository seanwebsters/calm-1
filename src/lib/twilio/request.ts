import { env } from "../env";

/** URLs Twilio may have signed (it signs the exact URL configured in the console). */
export function candidateUrls(req: Request): string[] {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const path = `${u.pathname}${u.search}`;
  const urls = [publicUrl(req), `https://${host}${path}`, req.url];
  return [...new Set(urls.flatMap((x) => [x, x.endsWith("/") ? x.slice(0, -1) : `${x}/`]))];
}

/** The public URL Twilio signed: APP_URL + path when set, else the forwarded host. */
export function publicUrl(req: Request): string {
  const u = new URL(req.url);
  if (env.appUrl && !env.appUrl.includes("localhost")) return `${env.appUrl.replace(/\/$/, "")}${u.pathname}${u.search}`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}${u.pathname}${u.search}`;
}

export async function formParams(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}
