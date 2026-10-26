import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { searchContent } from "@/lib/content/service";

/** Preview exactly what the search_calm_content tool would return. */
export const POST = handle(async (req: Request) => {
  await requireApi("dashboard.view");
  const b = await parseBody(req, z.object({ query: z.string().max(200), category: z.enum(["any", "sleep", "meditation", "breathing", "music", "stories", "movement", "focus"]).default("any") }));
  return json({ items: await searchContent(b.query, { category: b.category === "any" ? undefined : b.category }) });
});
