import { describe, expect, it } from "vitest";
import { ToolCallRepair } from "../../src/repair/index.js";
import type { ToolCall } from "../../src/types.js";

function call(id: string, name: string, args: string): ToolCall {
  return { id, type: "function", function: { name, arguments: args } };
}

describe("ToolCallRepair pipeline", () => {
  it("merges scavenged calls with declared calls", () => {
    const repair = new ToolCallRepair({ allowedToolNames: new Set(["search"]) });
    const declared = [call("c1", "search", '{"q":"a"}')];
    const reasoning = `I should also run {"name": "search", "arguments": {"q": "b"}}`;
    const { calls, report } = repair.process(declared, reasoning);
    expect(calls.length).toBe(2);
    expect(report.scavenged).toBe(1);
  });

  it("repairs truncated arguments JSON", () => {
    const repair = new ToolCallRepair({ allowedToolNames: new Set(["search"]) });
    const declared = [call("c1", "search", '{"q":"abc')];
    const { calls, report } = repair.process(declared, null);
    expect(calls.length).toBe(1);
    expect(() => JSON.parse(calls[0]!.function.arguments)).not.toThrow();
    expect(report.truncationsFixed).toBe(1);
  });

  it("breaks call storms", () => {
    const repair = new ToolCallRepair({
      allowedToolNames: new Set(["x"]),
      stormWindow: 6,
      stormThreshold: 3,
    });
    for (let i = 0; i < 2; i++) {
      repair.process([call(`c${i}`, "x", "{}")], null);
    }
    const { calls, report } = repair.process([call("c3", "x", "{}")], null);
    expect(calls.length).toBe(0);
    expect(report.stormsBroken).toBe(1);
  });

  it("dedupes scavenge vs declared by signature", () => {
    const repair = new ToolCallRepair({ allowedToolNames: new Set(["search"]) });
    const declared = [call("c1", "search", '{"q":"a"}')];
    const reasoning = `noted: {"name":"search","arguments":{"q":"a"}}`;
    const { calls, report } = repair.process(declared, reasoning);
    expect(calls.length).toBe(1);
    expect(report.scavenged).toBe(0);
  });
});
