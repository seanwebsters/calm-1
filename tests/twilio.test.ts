import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { freshStore, lastUserText, useFakeLlm } from "./helpers";
import { splitForTwilio, verifyTwilioSignature } from "@/lib/twilio/client";
import { applyTwilioStatus, ingestTwilioMessage } from "@/lib/twilio/adapter";
import { processJobs } from "@/lib/jobs/queue";
import "@/lib/jobs/handlers";

const sign = (url: string, params: Record<string, string>, token: string) =>
  createHmac("sha1", token)
    .update(url + Object.keys(params).sort().map((k) => k + params[k]).join(""))
    .digest("base64");

let n = 0;
const inbound = (body: string) => ({ MessageSid: `SM${++n}`, From: "whatsapp:+447700900123", To: "whatsapp:+14155238886", Body: body, NumMedia: "0" });

describe("Twilio WhatsApp channel", () => {
  const sent: Record<string, string>[] = [];
  beforeEach(() => {
    freshStore();
    sent.length = 0;
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tw-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes("api.twilio.com") && String(url).endsWith("/Messages.json")) {
          sent.push(Object.fromEntries(new URLSearchParams(String(init?.body))));
          return new Response(JSON.stringify({ sid: `SMout${sent.length}` }), { status: 201 });
        }
        return new Response("no", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.TWILIO_ACCOUNT_SID = "";
    process.env.TWILIO_AUTH_TOKEN = "";
  });

  it("validates X-Twilio-Signature", () => {
    const url = "https://calm-1.vercel.app/api/twilio/webhook";
    const p = inbound("hi");
    expect(verifyTwilioSignature(url, p, sign(url, p, "tw-token"))).toBe(true);
    expect(verifyTwilioSignature(url, p, sign(url, p, "other"))).toBe(false);
    expect(verifyTwilioSignature(url, { ...p, Body: "changed" }, sign(url, p, "tw-token"))).toBe(false);
    expect(verifyTwilioSignature(url, p, null)).toBe(false);
  });

  it("answers through the same engine and sends via Twilio", async () => {
    useFakeLlm({ reply: (req) => `You said: ${lastUserText(req)}` });
    for (const b of ["hi", "1", "long day"]) {
      await ingestTwilioMessage(inbound(b));
      await processJobs("t", 10);
    }
    expect(sent[0]).toMatchObject({ From: "whatsapp:+14155238886", To: "whatsapp:+447700900123" });
    expect(sent[0]!.Body).toContain("I'm Calm-1");
    expect(sent.at(-1)!.Body).toMatch(/long day$/);
    const out = await db().find("messages", { where: { direction: "outbound" } });
    expect(out.every((m) => m.status === "sent" && m.wa_message_id?.startsWith("SMout"))).toBe(true);
    const raw = JSON.stringify(await db().find("users", {}));
    expect(raw).not.toContain("447700900123");
  });

  it("drops duplicate deliveries and applies statuses forward only", async () => {
    useFakeLlm();
    const p = inbound("hi");
    expect((await ingestTwilioMessage(p)).queued).toBe(true);
    expect((await ingestTwilioMessage(p)).duplicate).toBe(true);
    await processJobs("t", 10);
    const out = (await db().findOne("messages", { where: { direction: "outbound" } }))!;
    await applyTwilioStatus({ MessageSid: out.wa_message_id!, MessageStatus: "read" });
    await applyTwilioStatus({ MessageSid: out.wa_message_id!, MessageStatus: "delivered" });
    expect((await db().get("messages", out.id))!.status).toBe("read");
  });

  it("splits replies under Twilio's 1600-character limit", () => {
    const parts = splitForTwilio(`${"a".repeat(1200)}\n\n${"b".repeat(1200)}`);
    expect(parts).toHaveLength(2);
    expect(parts.every((x) => x.length <= 1600)).toBe(true);
  });
});
