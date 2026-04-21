import { describe, expect, it } from "vitest";
import { scavengeToolCalls } from "../../src/repair/scavenge.js";

const allowed = new Set(["get_weather", "search"]);

describe("scavengeToolCalls", () => {
  it("returns nothing for null reasoning", () => {
    const r = scavengeToolCalls(null, { allowedNames: allowed });
    expect(r.calls).toEqual([]);
  });

  it('extracts pattern 1: {"name", "arguments"}', () => {
    const reasoning = `thinking... I should call {"name": "get_weather", "arguments": {"city": "SF"}}`;
    const r = scavengeToolCalls(reasoning, { allowedNames: allowed });
    expect(r.calls.length).toBe(1);
    expect(r.calls[0]!.function.name).toBe("get_weather");
    expect(JSON.parse(r.calls[0]!.function.arguments)).toEqual({ city: "SF" });
  });

  it("extracts OpenAI-style envelope", () => {
    const reasoning = `plan: {"type":"function","function":{"name":"search","arguments":"{\\"q\\":\\"ts\\"}"}}`;
    const r = scavengeToolCalls(reasoning, { allowedNames: allowed });
    expect(r.calls[0]!.function.name).toBe("search");
    expect(JSON.parse(r.calls[0]!.function.arguments)).toEqual({ q: "ts" });
  });

  it("extracts tool_name / tool_args variant", () => {
    const reasoning = `decide: {"tool_name": "search", "tool_args": {"q": "deepseek"}}`;
    const r = scavengeToolCalls(reasoning, { allowedNames: allowed });
    expect(r.calls[0]!.function.name).toBe("search");
    expect(JSON.parse(r.calls[0]!.function.arguments)).toEqual({ q: "deepseek" });
  });

  it("ignores tools not in the allowed set", () => {
    const reasoning = `{"name": "rm_rf_slash", "arguments": {}}`;
    const r = scavengeToolCalls(reasoning, { allowedNames: allowed });
    expect(r.calls).toEqual([]);
  });

  it("respects maxCalls", () => {
    const reasoning = Array.from({ length: 6 })
      .map(() => `{"name": "search", "arguments": {"q": "x"}}`)
      .join(" then ");
    const r = scavengeToolCalls(reasoning, { allowedNames: allowed, maxCalls: 2 });
    expect(r.calls.length).toBe(2);
  });
});
