import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { freshStore, useFakeLlm } from "./helpers";
import { createSimulatorUser, deleteUserData, exportUserData } from "@/lib/users/service";
import { handleInbound } from "@/lib/engine/turn";

describe("data export and deletion", () => {
  beforeEach(() => freshStore());

  it("exports decrypted data and erases everything", async () => {
    useFakeLlm({ reply: () => "Here for you." });
    const u = await createSimulatorUser({ label: "t" });
    const say = async (t: string) => handleInbound({ user: (await db().get("users", u.id))!, channel: "simulator", text: t, kind: "text" });
    await say("hi");
    await say("1");
    await say("rough day");
    const exp = await say("export");
    expect(exp.replies[0]!.document?.filename).toMatch(/calm-1-export/);
    const data = (await exportUserData(u.id))!;
    expect(data.messages.some((m) => m.text === "rough day")).toBe(true);
    expect(data.consents[0]).toMatchObject({ kind: "privacy_notice", granted: true });

    await deleteUserData(u.id, "admin", "support@calm.com");
    for (const t of ["users", "messages", "conversations", "user_consents", "user_preferences"] as const) {
      const rows = await db().find(t, {});
      expect(rows.filter((r) => ("user_id" in r ? r.user_id : (r as { id: string }).id) === u.id)).toHaveLength(0);
    }
    const costs = await db().find("api_costs", {});
    expect(costs.length).toBeGreaterThan(0);
    expect(costs.every((c) => c.user_id === null)).toBe(true);
    expect((await db().findOne("deletion_requests", { where: { anon_id: u.anon_id } }))!.handled_by).toBe("support@calm.com");
  });
});
