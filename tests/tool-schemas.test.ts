import { describe, expect, it } from "vitest";
import { TOOLS } from "@/lib/tools/registry";

/** Claude's strict tool schemas reject an enum combined with a multi-type ("string" | "null"). */
describe("tool schemas", () => {
  it("never combine enum with a type array", () => {
    const bad: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (Array.isArray(n.type) && Array.isArray(n.enum)) bad.push(path);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    for (const t of TOOLS) walk(t.def.input_schema, t.def.name);
    expect(bad).toEqual([]);
  });

  it("are strict with every property required", () => {
    for (const t of TOOLS) {
      const s = t.def.input_schema as { properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
      expect(s.additionalProperties).toBe(false);
      expect([...(s.required ?? [])].sort()).toEqual(Object.keys(s.properties).sort());
    }
  });
});
