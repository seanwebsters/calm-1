import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { freshStore, useFakeLlm, lastUserText } from "./helpers";
import { signForTest, verifyChallenge, verifySignature, parsePayload } from "@/lib/whatsapp/webhook";
import { ingestWebhook } from "@/lib/whatsapp/adapter";
import { processJobs, enqueue, registerJob } from "@/lib/jobs/queue";
import { splitForWhatsapp } from "@/lib/whatsapp/client";
import { open } from "@/lib/crypto";
import "@/lib/jobs/handlers";

const PHONE = "447700900123";
let seq = 0;
function payload(texts: string[], from = PHONE) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "123" },
              contacts: [{ wa_id: from, profile: { name: "Should not be stored" } }],
              messages: texts.map((t, i) => ({ id: `wamid.${++seq}`, from, timestamp: String(1_800_000_000 + seq + i), type: "text", text: { body: t } })),
            },
          },
        ],
      },
    ],
  };
}

/** Mock of the Meta Graph API that records what we send. */
function mockGraph() {
  const sent: { to: string; body: unknown }[] = [];
  let n = 0;
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("graph.facebook.com") && u.endsWith("/messages")) {
      const body = JSON.parse(String(init?.body));
      sent.push({ to: body.to, body });
      return new Response(JSON.stringify(body.status === "read" ? { success: true } : { messages: [{ id: `wamid.out.${++n}` }] }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { sent, fetchMock };
}

describe("WhatsApp webhook", () => {
  beforeEach(() => {
    freshStore();
    process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.WHATSAPP_ACCESS_TOKEN = "";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "";
  });

  it("verifies the subscription handshake", () => {
    expect(verifyChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "42" }))).toBe("42");
    expect(verifyChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42" }))).toBeNull();
  });

  it("validates X-Hub-Signature-256", () => {
    const body = JSON.stringify(payload(["hi"]));
    expect(verifySignature(body, signForTest(body))).toBe(true);
    expect(verifySignature(body, signForTest(body, "other-secret"))).toBe(false);
    expect(verifySignature(body + " ", signForTest(body))).toBe(false);
    expect(verifySignature(body, null)).toBe(false);
    expect(verifySignature(body, "sha256=zz")).toBe(false);
  });

  it("ignores duplicate deliveries", async () => {
    const p = payload(["hello"]);
    expect((await ingestWebhook(p)).queued).toBe(1);
    const again = await ingestWebhook(p);
    expect(again).toMatchObject({ queued: 0, duplicates: 1 });
    expect(await db().count("jobs", { where: { type: "whatsapp.inbound" } })).toBe(1);
  });

  it("stores phone numbers only as hash + ciphertext, and no profile names", async () => {
    await ingestWebhook(payload(["hello"]));
    const users = await db().find("users", {});
    expect(users).toHaveLength(1);
    const raw = JSON.stringify(await db().find("users", {})) + JSON.stringify(await db().find("jobs", {}));
    expect(raw).not.toContain(PHONE);
    expect(raw).not.toContain("Should not be stored");
    expect(raw).not.toContain("hello");
    expect(users[0]!.phone_last4).toBe("0123");
  });

  it("runs the full pipeline and sends replies through the Cloud API", async () => {
    const graph = mockGraph();
    useFakeLlm({ reply: (req) => `You said: ${lastUserText(req)}` });
    await ingestWebhook(payload(["hey"]));
    await processJobs("t", 10);
    expect(graph.sent.find((s) => (s.body as { status?: string }).status === "read")).toBeTruthy();
    const welcome = graph.sent.filter((s) => (s.body as { type?: string }).type === "text");
    expect(welcome[0]!.to).toBe(PHONE);
    expect((welcome[0]!.body as { text: { body: string } }).text.body).toContain("I'm Calm-1");

    await ingestWebhook(payload(["1"]));
    await ingestWebhook(payload(["I had a long day"]));
    await processJobs("t", 10);
    await processJobs("t", 10);
    const texts = graph.sent.filter((s) => (s.body as { type?: string }).type === "text").map((s) => (s.body as { text: { body: string } }).text.body);
    expect(texts.at(-1)).toMatch(/^You said: .*I had a long day$/s);
    const out = await db().find("messages", { where: { direction: "outbound" } });
    expect(out.every((m) => m.status === "sent" && m.wa_message_id)).toBe(true);
  });

  it("processes one user's messages strictly in order", async () => {
    const order: string[] = [];
    registerJob("test.ordered", async (p) => {
      order.push(String(p.n));
    });
    for (let i = 0; i < 5; i++) await enqueue("test.ordered", { n: i }, { lockKey: "user:x" });
    for (let i = 0; i < 5; i++) await processJobs("t", 10);
    expect(order).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("a failing head job blocks later jobs for the same user until it succeeds", async () => {
    let fail = true;
    const order: string[] = [];
    registerJob("test.flaky", async (p) => {
      if (p.n === 0 && fail) throw new Error("transient");
      order.push(String(p.n));
    });
    await enqueue("test.flaky", { n: 0 }, { lockKey: "user:y" });
    await enqueue("test.flaky", { n: 1 }, { lockKey: "user:y" });
    await processJobs("t", 10);
    await processJobs("t", 10);
    expect(order).toEqual([]);
    fail = false;
    await db().updateWhere("jobs", { type: "test.flaky", status: "queued" }, { run_at: new Date(0).toISOString() });
    await processJobs("t", 10);
    await processJobs("t", 10);
    expect(order).toEqual(["0", "1"]);
  });

  it("applies delivery statuses without moving backwards", async () => {
    mockGraph();
    useFakeLlm();
    await ingestWebhook(payload(["hey"]));
    await processJobs("t", 10);
    const out = (await db().findOne("messages", { where: { direction: "outbound" } }))!;
    const status = (s: string) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: out.wa_message_id, status: s, timestamp: "1", recipient_id: PHONE }] } }] }] });
    await ingestWebhook(status("read"));
    await ingestWebhook(status("delivered"));
    expect((await db().get("messages", out.id))!.status).toBe("read");
  });

  it("opt-out via STOP stops replies and check-ins", async () => {
    const graph = mockGraph();
    useFakeLlm();
    for (const t of ["hey", "1", "STOP", "are you there?"]) {
      await ingestWebhook(payload([t]));
      await processJobs("t", 10);
    }
    const user = (await db().findOne("users", {}))!;
    expect(user.status).toBe("opted_out");
    const last = graph.sent.filter((s) => (s.body as { type?: string }).type === "text").at(-1)!;
    expect((last.body as { text: { body: string } }).text.body).toMatch(/Send START/);
  });

  it("splits long replies under the WhatsApp limit", () => {
    const parts = splitForWhatsapp(`${"a".repeat(3000)}\n\n${"b".repeat(3000)}`);
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
  });

  it("rejects payloads that aren't WhatsApp", () => {
    expect(parsePayload({ object: "page", entry: [] }).messages).toHaveLength(0);
    expect(() => parsePayload({ nope: true })).toThrow();
  });

  it("keeps message text encrypted in job payloads", async () => {
    await ingestWebhook(payload(["my private worry"]));
    const job = (await db().findOne("jobs", { where: { type: "whatsapp.inbound" } }))!;
    expect(JSON.stringify(job.payload)).not.toContain("private worry");
    expect(open(job.payload.textEnc as string)).toBe("my private worry");
  });
});
