import { beforeEach, describe, expect, it } from "vitest";
import { freshStore, useFakeLlm } from "./helpers";
import { setLlm } from "@/lib/llm";
import { assessInput, assessOutput } from "@/lib/safety/service";
import { runSafetyEval } from "@/lib/safety/eval";
import { matchRules } from "@/lib/safety/rules";

describe("safety", () => {
  beforeEach(() => {
    freshStore();
    setLlm(undefined);
  });

  it("passes the full rules-only evaluation suite (recall and no over-flagging)", async () => {
    const r = await runSafetyEval({ createdBy: null, useModel: false, persist: false });
    const failed = r.results.filter((x) => !x.passed);
    expect(failed).toEqual([]);
  });

  it("does not treat ordinary sadness as an emergency", async () => {
    for (const t of ["I'm so sad today", "this week has been rubbish", "I feel lonely", "my boss is killing me with these emails"]) {
      const a = await assessInput(t, { countryCode: "44", channel: "simulator", modelReview: false });
      expect(a.severity).toBe("none");
      expect(a.allowedTools).toBe("all");
    }
  });

  it("restricts tools and requires resources for high risk", async () => {
    const a = await assessInput("I want to die", { countryCode: "44", channel: "simulator", modelReview: false });
    expect(a.severity).toBe("high");
    expect(a.requireResources).toBe(true);
    expect(a.allowedTools).not.toBe("all");
    expect(a.guidance).toContain("116 123");
  });

  it("localises crisis resources", async () => {
    const us = await assessInput("I want to die", { countryCode: "1", channel: "simulator", modelReview: false });
    expect(us.guidance).toContain("988");
    const other = await assessInput("I want to die", { countryCode: null, channel: "simulator", modelReview: false });
    expect(other.guidance).toContain("findahelpline.com");
  });

  it("appends resources when a high-risk reply omits them", async () => {
    const a = await assessInput("I want to die", { countryCode: "44", channel: "simulator", modelReview: false });
    const out = assessOutput("I'm really glad you told me. I'm here.", a);
    expect(out.action).toBe("resources");
    expect(out.text).toContain("116 123");
  });

  it("replaces replies containing doses, diagnoses or human claims", async () => {
    const a = await assessInput("should I stop taking my sertraline?", { countryCode: "44", channel: "simulator", modelReview: false });
    expect(assessOutput("You could take 50mg instead.", a).action).toBe("replaced");
    const none = await assessInput("hi", { countryCode: "44", channel: "simulator", modelReview: false });
    expect(assessOutput("It sounds like you have clinical depression.", none).action).toBe("replaced");
    expect(assessOutput("I'm a real therapist, trust me.", none).action).toBe("replaced");
    expect(assessOutput("I'm not a therapist, but I'm here to listen.", none).action).toBeNull();
  });

  it("model review can soften a rule hit but never clear a critical one", async () => {
    useFakeLlm({ review: () => ({ risk_level: "none", category: "none", about_someone_else_or_hypothetical: true }) });
    const crit = await assessInput("I'm going to kill myself tonight", { countryCode: "44", channel: "simulator" });
    expect(crit.severity).toBe("critical");
    const high = await assessInput("I've been feeling suicidal", { countryCode: "44", channel: "simulator" });
    expect(high.severity).toBe("moderate");
  });

  it("model review can escalate what rules missed", async () => {
    useFakeLlm({ review: () => ({ risk_level: "high", category: "suicidal_ideation", about_someone_else_or_hypothetical: false }) });
    const a = await assessInput("I feel like such a burden to everyone", { countryCode: "44", channel: "simulator" });
    expect(a.modelReviewed).toBe(true);
    expect(a.severity).toBe("high");
    expect(matchRules("I feel like such a burden to everyone")).toHaveLength(0);
  });
});
