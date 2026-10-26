import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session-token";
import { can, PERMISSIONS } from "@/lib/auth/roles";

describe("admin sessions", () => {
  it("round-trips a signed session", async () => {
    const t = await signSession({ adminId: "a1", email: "a@calm.com", name: "A", role: "admin" });
    expect(await verifySession(t)).toMatchObject({ adminId: "a1", role: "admin" });
  });

  it("rejects tampered tokens", async () => {
    const t = await signSession({ adminId: "a1", email: "a@calm.com", name: "A", role: "analyst" });
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ adminId: "a1", email: "a@calm.com", name: "A", role: "owner", exp: 9e9 })).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`)).toBeNull();
    expect(await verifySession(`${body}.AAAA`)).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const t = await signSession({ adminId: "a1", email: "a@calm.com", name: "A", role: "admin" }, -10);
    expect(await verifySession(t)).toBeNull();
  });
});

describe("admin authorisation", () => {
  it("keeps raw conversations away from most roles", () => {
    expect(can("analyst", "transcripts.view")).toBe(false);
    expect(can("operator", "transcripts.view")).toBe(false);
    expect(can("safety_reviewer", "transcripts.view")).toBe(true);
    expect(can("admin", "transcripts.view")).toBe(true);
  });
  it("only owners manage the team; only admins+ publish and delete", () => {
    expect(can("admin", "team.manage")).toBe(false);
    expect(can("owner", "team.manage")).toBe(true);
    expect(can("operator", "personality.edit")).toBe(true);
    expect(can("operator", "personality.publish")).toBe(false);
    expect(can("operator", "users.delete")).toBe(false);
    expect(can("analyst", "simulator.use")).toBe(false);
  });
  it("every permission includes the owner", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can("owner", p)).toBe(true);
  });
});
